/**
 * AvenStreamContracts.ts
 *
 * Canonical Real-Time Execution Stream Event Model.
 * Serves Web, Mobile, Desktop, and Voice runtimes identically.
 * Exposes clean human execution progress without leaking private chain-of-thought or raw JSON.
 */

import { CapabilityURN, ProviderId } from "./ExternalCapabilityContracts";

export type AvenExecutionStatusPhase =
  | "understanding"
  | "checking_context"
  | "planning"
  | "executing"
  | "waiting_for_confirmation"
  | "verifying"
  | "completed";

export type AvenStreamEvent =
  | {
      type: "assistant_delta";
      text: string;
    }
  | {
      type: "status";
      status: AvenExecutionStatusPhase;
      message: string;
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
      type: "error";
      message: string;
      code?: string;
    };
