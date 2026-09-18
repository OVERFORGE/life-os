import { HandleInput, WorldModelV2 } from "@life-os/execution-kernel";
import { KernelAdapterInput, SimulationExecutionRequest } from "../contracts/kernelAdapterContracts";
import { SimulationKernelResult, KernelFailureCategory, KernelFailureDetail } from "../contracts/kernelResultContracts";
import { KernelGateway, ProductionKernelGateway } from "../gateways/kernelGateway";
import { mapDecisionToPayload } from "../mapper/decisionMapper";
import { extractExecutionMetadata } from "../mapper/runtimeMapper";
import { mapPersonaToUserContext } from "../mapper/personaMapper";
import { KernelContractValidator } from "../validation/kernelContractValidator";
import { KERNEL_PIPELINE_VERSION, DEFAULT_SIMULATION_MODE } from "../constants";

export interface PreparedKernelInput {
  handleInput: HandleInput;
  requestText: string;
}

export function categorizeKernelError(err: unknown, latencyMs?: number): KernelFailureDetail {
  const errMsg = err instanceof Error ? err.message : String(err ?? "Production Kernel handle invocation error");
  const errObj = typeof err === "object" && err !== null ? (err as Record<string, unknown>) : {};

  const provider = (errObj.provider as string) ?? "groq";
  const providerModel = (errObj.model as string) ?? (errObj.providerModel as string) ?? undefined;
  const providerRequestId = (errObj.requestId as string) ?? (errObj.providerRequestId as string) ?? undefined;
  const httpStatus = typeof errObj.status === "number" ? errObj.status : typeof errObj.statusCode === "number" ? errObj.statusCode : undefined;

  const lowerMsg = errMsg.toLowerCase();

  let category = KernelFailureCategory.UNKNOWN;
  let retryable = false;

  if (lowerMsg.includes("404") || lowerMsg.includes("model_not_found") || lowerMsg.includes("model not found")) {
    category = KernelFailureCategory.MODEL_NOT_FOUND;
    retryable = false;
  } else if (lowerMsg.includes("timeout") || lowerMsg.includes("etimedout") || lowerMsg.includes("deadline") || lowerMsg.includes("abort")) {
    category = KernelFailureCategory.TIMEOUT;
    retryable = true;
  } else if (lowerMsg.includes("rate") || lowerMsg.includes("429") || lowerMsg.includes("quota") || lowerMsg.includes("too many requests")) {
    category = KernelFailureCategory.RATE_LIMIT;
    retryable = true;
  } else if (lowerMsg.includes("invalid_handle_input") || lowerMsg.includes("handleinput")) {
    category = KernelFailureCategory.INVALID_HANDLE_INPUT;
    retryable = false;
  } else if (lowerMsg.includes("worldmodel") || lowerMsg.includes("world model")) {
    category = KernelFailureCategory.WORLDMODEL_EXCEPTION;
    retryable = false;
  }

  return {
    category,
    retryable,
    provider,
    providerModel,
    providerRequestId,
    latencyMs,
    httpStatus: httpStatus ?? (category === KernelFailureCategory.MODEL_NOT_FOUND ? 404 : category === KernelFailureCategory.RATE_LIMIT ? 429 : category === KernelFailureCategory.TIMEOUT ? 408 : undefined),
    message: errMsg,
    rawError: err instanceof Error ? { message: err.message, name: err.name } : err,
  };
}

export class SimulationKernelAdapter {
  constructor(private gateway: KernelGateway = new ProductionKernelGateway()) {}

  /**
   * Prepares canonical HandleInput + requestText from (snapshot, persona, decision).
   * Pure mapping — zero side effects.
   * Note: Model selection is delegated entirely to production kernel configuration.
   */
  public prepareKernelInput(input: KernelAdapterInput): PreparedKernelInput {
    const { snapshot, persona, decision } = input;
    const personaUserCtx = mapPersonaToUserContext(persona);
    const decisionPayload = mapDecisionToPayload(decision);
    const metadata = extractExecutionMetadata(snapshot);

    const handleInput: HandleInput = {
      userId: personaUserCtx.userId,
      conversationId: `sim_conv_${metadata.runUid}`,
      message: decisionPayload.requestText,
      mode: DEFAULT_SIMULATION_MODE,
    };

    return {
      handleInput,
      requestText: decisionPayload.requestText,
    };
  }

  /**
   * Invokes production LifeOS Kernel via KernelGateway.
   * Pure translation boundary — 100% stateless.
   * Captures post-execution WorldModelV2 snapshot.
   */
  public async invokeKernel(input: KernelAdapterInput): Promise<SimulationKernelResult> {
    const { snapshot, persona, decision } = input;

    // Step 1: Extract Mappings & Build SimulationExecutionRequest
    const personaUserCtx = mapPersonaToUserContext(persona);
    const decisionPayload = mapDecisionToPayload(decision);
    const metadata = extractExecutionMetadata(snapshot);

    const execRequest: SimulationExecutionRequest = {
      requestText: decisionPayload.requestText,
      userId: personaUserCtx.userId,
      metadata,
    };

    // Step 2: Contract Validation
    const validation = KernelContractValidator.validate(execRequest);
    if (!validation.valid) {
      const validationFailure: KernelFailureDetail = {
        category: KernelFailureCategory.CONTRACT_VALIDATION_FAILED,
        retryable: false,
        message: validation.error ?? "Contract validation failed",
      };

      return {
        success: false,
        runUid: snapshot.context.runUid,
        tick: snapshot.tick,
        decisionId: decision.decisionId,
        intent: decision.intent,
        kernelVersion: metadata.kernelVersion,
        pipelineVersion: KERNEL_PIPELINE_VERSION,
        executionOutcome: {
          status: "FAILED",
          summary: validation.error ?? "Contract validation failed",
        },
        response: "",
        error: validationFailure,
      };
    }

    // Step 3: Map SimulationExecutionRequest to Production HandleInput (delegate model selection)
    const handleInput: HandleInput = {
      userId: execRequest.userId,
      conversationId: `sim_conv_${metadata.runUid}`,
      message: execRequest.requestText,
      mode: DEFAULT_SIMULATION_MODE,
    };

    // Step 4: Invoke Kernel Gateway (Production Kernel.handle())
    const invokeStart = Date.now();
    try {
      const responseStream = await this.gateway.handle(handleInput);
      const responseText = await responseStream.text();

      // Step 5: Capture post-execution sovereign WorldModelV2 snapshot
      let worldSnapshot: Record<string, unknown> | undefined;
      try {
        const worldData = WorldModelV2.getInstance().computeSnapshot({ userId: personaUserCtx.userId });
        worldSnapshot = worldData as unknown as Record<string, unknown>;
      } catch (_worldErr) {
        worldSnapshot = undefined;
      }

      return {
        success: true,
        runUid: snapshot.context.runUid,
        tick: snapshot.tick,
        decisionId: decision.decisionId,
        intent: decision.intent,
        kernelVersion: metadata.kernelVersion,
        pipelineVersion: KERNEL_PIPELINE_VERSION,
        worldSnapshot,
        executionOutcome: {
          status: "COMPLETED",
          summary: `Kernel execution pipeline completed for intent ${decision.intent}`,
          rawResponseText: responseText,
        },
        response: responseText,
        error: null,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - invokeStart;
      const failureDetail = categorizeKernelError(err, latencyMs);
      return {
        success: false,
        runUid: snapshot.context.runUid,
        tick: snapshot.tick,
        decisionId: decision.decisionId,
        intent: decision.intent,
        kernelVersion: metadata.kernelVersion,
        pipelineVersion: KERNEL_PIPELINE_VERSION,
        executionOutcome: {
          status: "FAILED",
          summary: `Kernel execution failed: ${failureDetail.message}`,
        },
        response: "",
        error: failureDetail,
      };
    }
  }
}

