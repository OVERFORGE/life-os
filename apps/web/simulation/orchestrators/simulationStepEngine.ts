import { RuntimeSnapshot, SimulationPersonaDTO } from "../types";
import { ProductionLLMGateway } from "../decision/providers/productionLLMGateway";
import { LLMProvider } from "../decision/providers/llmProvider";
import { KernelGateway } from "../integration/gateways/kernelGateway";
import { deriveTimeFromTicks } from "../engine/clock";
import { PromptDocument, LLMResponse } from "../decision/contracts/decisionContracts";
import { DecisionDTO } from "../decision/schema/decisionSchema";
import { SimulationKernelResult } from "../integration/contracts/kernelResultContracts";
import { HandleInput } from "@life-os/execution-kernel";
import { WorldSimulator } from "../world/engine/worldSimulator";
import { SimulatedWorldState, createInitialWorldState } from "../world/contracts/worldStateContracts";
import { EventDrivenDecisionEngine } from "../world/engine/eventDrivenDecisionEngine";
import { SimulationEvent } from "../events/contracts/eventContracts";

export interface SimulationStepInput {
  snapshot: RuntimeSnapshot;
  persona: SimulationPersonaDTO;
  targetMinutes?: number;
}

export interface SimulationStepExecutionResult {
  runUid: string;
  tick: number;
  virtualDay: number;
  virtualMinute: number;
  personaId: string;
  decisionExecuted: boolean;
  gatingReason?: string;
  decision: DecisionDTO;
  kernelResult: SimulationKernelResult;
  promptDocument: PromptDocument | null;
  llmResponse: LLMResponse | null;
  virtualUserRequest: string;
  handleInput: HandleInput;
  worldState: SimulatedWorldState;
  eventsSummary: string[];
  publishedEvents: SimulationEvent[];
}

export class SimulationStepEngine {
  private eventDrivenEngine: EventDrivenDecisionEngine;

  constructor(
    llmProvider?: LLMProvider,
    kernelGateway?: KernelGateway
  ) {
    const provider = llmProvider ?? new ProductionLLMGateway();
    this.eventDrivenEngine = new EventDrivenDecisionEngine(provider, kernelGateway);
  }

  /**
   * Executes step using Phase 3 Event-Driven Gated Decision Engine.
   */
  public async executeStep(input: SimulationStepInput): Promise<SimulationStepExecutionResult> {
    const { snapshot, persona, targetMinutes = 1 } = input;

    // Step 1: Derive Virtual Time Metadata
    const derivedTime = deriveTimeFromTicks(
      snapshot.tick,
      snapshot.configuration.startDay,
      snapshot.configuration.startMinute,
      snapshot.configuration.tickIntervalMinutes
    );

    // Step 2: Phase 1 & 2 World Evolution + Event System
    const seed = snapshot.seed ?? 42;
    const worldSimulator = new WorldSimulator(seed);
    const currentWorldState: SimulatedWorldState =
      (snapshot as any).worldState ??
      createInitialWorldState(snapshot.context.runUid, derivedTime.currentDay, derivedTime.currentMinute);

    const advanceResult = worldSimulator.advanceTime(currentWorldState, targetMinutes);
    const evolvedWorldState = advanceResult.state;

    // Attach evolved world state to runtime snapshot for prompt context formatting
    (snapshot as any).worldState = evolvedWorldState;

    // Step 3: Phase 3 Gated Decision Engine Processing
    const decisionProcessResult = await this.eventDrivenEngine.processStep(
      snapshot,
      persona,
      evolvedWorldState,
      advanceResult.publishedEvents
    );

    const finalWorldState = decisionProcessResult.worldState;

    const fallbackIntent = finalWorldState.activeSession?.definitionId === "BREAK" || finalWorldState.activeSession?.definitionId === "MEAL"
      ? "TAKE_BREAK"
      : finalWorldState.activeSession?.definitionId === "SLEEP"
      ? "REST_AND_RECOVER"
      : finalWorldState.activeSession?.definitionId === "EXERCISE"
      ? "EXERCISE"
      : "WORK_ON_TASK";

    const decision: DecisionDTO = decisionProcessResult.decision ?? {
      decisionId: `DEC_AUTONOMOUS_${snapshot.context.runUid}_${snapshot.tick}`,
      intent: fallbackIntent,
      target: finalWorldState.activeTaskId ?? "autonomous_flow",
      parameters: {},
      reasoning: decisionProcessResult.gatingReason ?? "Autonomous world simulation flow",
      confidence: 1.0,
      metadata: {
        provider: "AutonomousSimulator",
        model: "world-evolution-v1",
        promptVersion: "1.0.0",
        schemaVersion: "1.0.0",
        engineVersion: "1.0.0",
        validatorVersion: "1.0.0",
        promptHash: "autonomous",
      },
    };

    const kernelResult: SimulationKernelResult = decisionProcessResult.kernelResult ?? {
      success: true,
      runUid: snapshot.context.runUid,
      tick: snapshot.tick,
      decisionId: decision.decisionId,
      intent: decision.intent,
      kernelVersion: snapshot.context.kernelVersion ?? "v2.4.0-deterministic",
      pipelineVersion: "v2.4.0-23-stage",
      worldSnapshot: { simulatedWorld: finalWorldState as unknown as Record<string, unknown> },
      executionOutcome: {
        status: "COMPLETED",
        summary: decisionProcessResult.gatingReason ?? "Autonomous simulation tick completed without LLM invocation.",
      },
      response: "Autonomous evolution tick.",
      error: null,
    };

    if (kernelResult.success) {
      kernelResult.worldSnapshot = {
        ...(kernelResult.worldSnapshot ?? {}),
        simulatedWorld: finalWorldState as unknown as Record<string, unknown>,
      };
    }

    const handleInput: HandleInput = decisionProcessResult.handleInput ?? {
      userId: persona.id || persona.personaUid,
      conversationId: `sim_conv_${snapshot.context.runUid}`,
      message: `Autonomous execution: ${decision.intent}`,
      mode: "simulation",
    };

    return {
      runUid: snapshot.context.runUid,
      tick: snapshot.tick,
      virtualDay: finalWorldState.virtualDay,
      virtualMinute: finalWorldState.virtualMinute,
      personaId: persona.id || persona.personaUid,
      decisionExecuted: decisionProcessResult.decisionExecuted,
      gatingReason: decisionProcessResult.gatingReason,
      decision,
      kernelResult,
      promptDocument: decisionProcessResult.promptDocument,
      llmResponse: decisionProcessResult.llmResponse,
      virtualUserRequest: decisionProcessResult.virtualUserRequest ?? `Autonomous execution: ${decision.intent}`,
      handleInput,
      worldState: finalWorldState,
      eventsSummary: advanceResult.eventsSummary,
      publishedEvents: advanceResult.publishedEvents,
    };
  }
}
