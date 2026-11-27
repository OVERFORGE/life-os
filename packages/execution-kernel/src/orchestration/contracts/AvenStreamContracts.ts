/**
 * AvenStreamContracts.ts
 *
 * Canonical Real-Time Execution Stream Event Model.
 * Serves Web and post-activation client runtimes identically.
 * Exposes clean human execution progress without leaking private chain-of-thought or raw JSON.
 */

import { CapabilityURN, ProviderId } from "./ExternalCapabilityContracts";

export type AvenExecutionStatusPhase =
  | "understanding"
  | "checking_context"
  | "planning"
  | "reasoning"
  | "executing"
  | "executing_step"
  | "adapting"
  | "waiting_for_confirmation"
  | "verifying"
  | "synthesizing"
  | "completed"
  | "cancelled"
  | "failed";

export interface AvenStreamEnvelopeMeta {
  requestId?: string;
  executionId?: string;
  seq?: number;
  timestamp?: number;
}

export type AvenStreamEventPayload =
  | {
      type: "assistant_delta";
      text: string;
    }
  | {
      type: "assistant_final";
      text: string;
      truncated?: boolean;
      persisted: boolean;
    }
  | {
      type: "status";
      status: AvenExecutionStatusPhase;
      message: string;
      stepIndex?: number;
      totalSteps?: number;
    }
  | {
      type: "step_progress";
      stepId: string;
      capabilityURN: CapabilityURN | string;
      phase: "started" | "completed" | "failed" | "replanning";
      humanMessage: string;
    }
  | {
      type: "tool_activity";
      providerId: ProviderId | string;
      providerDisplayName: string;
      capabilityURN: CapabilityURN | string;
      iconName: string; // Lucide icon name, e.g. "Calendar", "Mail", "Music"
      humanMessage: string;
      state: "started" | "completed" | "failed";
      error?: string;
      details?: Record<string, any>;
    }
  | {
      type: "confirmation_required";
      actionId: string;
      capabilityURN: CapabilityURN | string;
      providerDisplayName: string;
      title: string;
      message: string;
      details?: Record<string, string>;
      confirmLabel: string;
      cancelLabel: string;
    }
  | {
      type: "missing_connection";
      providerId: ProviderId | string;
      providerDisplayName: string;
      capabilityURN: CapabilityURN | string;
      message: string;
      connectUrl: string;
    }
  | {
      type: "cancelled";
      reason: "user_aborted" | "client_disconnected" | "superseded";
      partialText?: string;
      persisted: boolean;
    }
  | {
      type: "error";
      message: string;
      code?: string;
      recoverable?: boolean;
      persisted?: boolean;
      partialText?: string;
    };

export type AvenStreamEvent = AvenStreamEventPayload & AvenStreamEnvelopeMeta;

export {
  StreamingThinkSanitizer,
  createStreamTerminalGuard,
  type StreamTerminalOutcome,
  type StreamTerminalGuard,
} from "./StreamLifecycleUtils";
