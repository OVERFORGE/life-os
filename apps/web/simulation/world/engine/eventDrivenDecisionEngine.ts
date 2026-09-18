/**
 * EventDrivenDecisionEngine — Gated LLM & Kernel Decision Orchestrator
 *
 * Consults LLM and production Kernel ONLY when DecisionGatingEvaluator determines
 * an intervention is required (activity session end, threshold breach, urgent event).
 * Spawns and mutates the next ActivitySession on the SimulatedWorldState.
 */

import { RuntimeSnapshot, SimulationPersonaDTO } from "../../types";
import { SimulatedWorldState } from "../contracts/worldStateContracts";
import { SimulationEvent } from "../../events/contracts/eventContracts";
import { DecisionGatingEvaluator } from "./decisionGatingEvaluator";
import { DecisionEngine } from "../../decision/engine/decisionEngine";
import { LLMProvider } from "../../decision/providers/llmProvider";
import { SimulationKernelAdapter } from "../../integration/adapter/simulationKernelAdapter";
import { KernelGateway } from "../../integration/gateways/kernelGateway";
import { createActivitySession } from "../contracts/activitySession";
import { ActivityDefinitionId } from "../contracts/activityDefinitionRegistry";
import { DecisionDTO } from "../../decision/schema/decisionSchema";
import { PromptDocument, LLMResponse } from "../../decision/contracts/decisionContracts";
import { SimulationKernelResult } from "../../integration/contracts/kernelResultContracts";
import { HandleInput } from "@life-os/execution-kernel";

export interface DecisionProcessResult {
  decisionExecuted: boolean;
  gatingReason?: string;
  decision: DecisionDTO | null;
  kernelResult: SimulationKernelResult | null;
  promptDocument: PromptDocument | null;
  llmResponse: LLMResponse | null;
  virtualUserRequest: string | null;
  handleInput: HandleInput | null;
  worldState: SimulatedWorldState;
}

export class EventDrivenDecisionEngine {
  private decisionEngine: DecisionEngine;
  private kernelAdapter: SimulationKernelAdapter;

  constructor(llmProvider?: LLMProvider, kernelGateway?: KernelGateway) {
    this.decisionEngine = new DecisionEngine(llmProvider);
    this.kernelAdapter = new SimulationKernelAdapter(kernelGateway);
  }

  /**
   * Processes decision gating and conditionally executes LLM -> Kernel pipeline.
   */
  public async processStep(
    snapshot: RuntimeSnapshot,
    persona: SimulationPersonaDTO,
    worldState: SimulatedWorldState,
    emittedEvents: SimulationEvent[]
  ): Promise<DecisionProcessResult> {
    // 1. Decision Gating Evaluation
    const gating = DecisionGatingEvaluator.evaluate(emittedEvents, worldState);

    if (!gating.required) {
      return {
        decisionExecuted: false,
        gatingReason: "No decision trigger fired. World evolved autonomously.",
        decision: null,
        kernelResult: null,
        promptDocument: null,
        llmResponse: null,
        virtualUserRequest: null,
        handleInput: null,
        worldState,
      };
    }

    // 2. Decision Engine -> LLM completion
    const decisionResult = await this.decisionEngine.evaluate(snapshot, persona);
    if (!decisionResult.success || !decisionResult.decision) {
      throw new Error(`Decision generation failed: ${decisionResult.error?.message ?? "Unknown decision error"}`);
    }

    const decision = decisionResult.decision;

    // 3. Map Decision Intent to Next ActivitySession Definition
    const intentUpper = decision.intent.toUpperCase();
    let definitionId: ActivityDefinitionId = "DEEP_WORK";
    let durationMins = 60;
    let title = "Focus Block";

    if (intentUpper.includes("BREAK") || intentUpper.includes("REST")) {
      definitionId = "BREAK";
      durationMins = 20;
      title = "Rest & Recovery Break";
    } else if (intentUpper.includes("MEAL") || intentUpper.includes("EAT") || intentUpper.includes("LUNCH")) {
      definitionId = "MEAL";
      durationMins = 30;
      title = "Nourishment Block";
    } else if (intentUpper.includes("SLEEP") || intentUpper.includes("BED")) {
      definitionId = "SLEEP";
      durationMins = 420;
      title = "Night Sleep Window";
    } else if (intentUpper.includes("EXERCISE") || intentUpper.includes("GYM") || intentUpper.includes("WORKOUT")) {
      definitionId = "EXERCISE";
      durationMins = 45;
      title = "Physical Exercise";
    } else if (intentUpper.includes("MEETING")) {
      definitionId = "MEETING";
      durationMins = 30;
      title = "Sync & Meeting";
    }

    const newSession = createActivitySession({
      definitionId,
      title: decision.reasoning ? `${title}: ${decision.reasoning.slice(0, 30)}` : title,
      currentVirtualMinute: worldState.virtualMinute,
      durationMins,
      currentObjective: decision.intent,
      targetTaskId: decision.target,
    });

    const updatedWorldState: SimulatedWorldState = {
      ...worldState,
      activeSession: newSession,
      activeTaskId: decision.target ?? null,
      activeTaskProgress: 0,
    };

    // 4. Prepare Kernel Input & Invoke Production Kernel
    const preparedInput = this.kernelAdapter.prepareKernelInput({
      snapshot,
      persona,
      decision,
    });

    const kernelResult = await this.kernelAdapter.invokeKernel({
      snapshot,
      persona,
      decision,
    });

    return {
      decisionExecuted: true,
      gatingReason: gating.reason,
      decision,
      kernelResult,
      promptDocument: decisionResult.prompt,
      llmResponse: decisionResult.response,
      virtualUserRequest: preparedInput.requestText,
      handleInput: preparedInput.handleInput,
      worldState: updatedWorldState,
    };
  }
}
