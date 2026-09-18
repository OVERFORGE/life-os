import { RuntimeSnapshot, SimulationPersonaDTO } from "../../types";
import { DecisionDTO } from "../../decision";

export interface SimulationExecutionMetadata {
  runUid: string;
  tick: number;
  virtualDay: number;
  virtualMinute: number;
  kernelVersion: string;
  personaCode: string;
}

export interface SimulationExecutionRequest {
  requestText: string;
  userId: string;
  metadata: SimulationExecutionMetadata;
}

export interface KernelAdapterInput {
  snapshot: RuntimeSnapshot;
  persona: SimulationPersonaDTO;
  decision: DecisionDTO;
}
