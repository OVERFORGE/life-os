/**
 * sseStreamParser.ts
 *
 * Framework-free incremental SSE parser and transcript reducer for Stage 3 Web Chat
 * and post-activation SSE consumers.
 * Handles arbitrary TCP chunk splits, CRLF boundaries, keepalive comments, EOF flush,
 * and authoritative assistant_final / cancelled / error reconciliation.
 */

export type TurnStatus =
  | "streaming"
  | "completed"
  | "cancelled"
  | "failed"
  | "waiting_for_confirmation";

export interface ParsedToolActivityItem {
  id: string;
  providerId: string;
  providerDisplayName: string;
  capabilityURN: string;
  iconName: string;
  humanMessage: string;
  state: "started" | "completed" | "failed";
  error?: string;
  details?: Record<string, unknown>;
}

export interface ParsedConfirmationItem {
  actionId: string;
  title: string;
  message: string;
  details?: Record<string, string>;
  confirmLabel: string;
  cancelLabel: string;
}

export interface ParsedMissingConnectionItem {
  providerId: string;
  providerDisplayName: string;
  iconName: string;
  message: string;
  connectUrl: string;
}

export interface ChatStreamState {
  content: string;
  statusPhase: string;
  statusMessage?: string;
  turnStatus: TurnStatus;
  errorMessage?: string;
  toolActivities: ParsedToolActivityItem[];
  confirmation?: ParsedConfirmationItem;
  missingConnection?: ParsedMissingConnectionItem;
  lastSeq: number;
}

export const STATUS_PHASE_LABELS: Record<string, string> = {
  understanding: "Understanding your request…",
  checking_context: "Checking your context…",
  planning: "Planning next steps…",
  reasoning: "Thinking through your request…",
  executing: "Working on that…",
  executing_step: "Handling a step…",
  adapting: "Adjusting approach…",
  waiting_for_confirmation: "Waiting for your confirmation…",
  verifying: "Double-checking details…",
  synthesizing: "Putting your answer together…",
  completed: "Completed",
  cancelled: "Stopped",
  failed: "Failed",
};

export function formatStatusPhaseLabel(phase?: string): string {
  if (!phase) return STATUS_PHASE_LABELS.checking_context;
  return STATUS_PHASE_LABELS[phase] || STATUS_PHASE_LABELS.checking_context;
}

export function createInitialChatStreamState(): ChatStreamState {
  return {
    content: "",
    statusPhase: "understanding",
    turnStatus: "streaming",
    toolActivities: [],
    lastSeq: 0,
  };
}

export type ParsedSseEvent = Record<string, unknown> & {
  type?: string;
  seq?: number;
};

export class SseStreamParser {
  private buffer = "";
  private seenSseFrame = false;

  push(chunk: string): ParsedSseEvent[] {
    if (!chunk) return [];
    // Normalize CRLF to LF for consistent SSE boundary detection
    this.buffer += chunk.replace(/\r\n/g, "\n");
    const events: ParsedSseEvent[] = [];

    let boundaryIdx = this.buffer.indexOf("\n\n");
    while (boundaryIdx !== -1) {
      const block = this.buffer.slice(0, boundaryIdx);
      this.buffer = this.buffer.slice(boundaryIdx + 2);
      const parsed = this.parseBlock(block);
      if (parsed) events.push(parsed);
      boundaryIdx = this.buffer.indexOf("\n\n");
    }

    return events;
  }

  flush(): ParsedSseEvent[] {
    const events: ParsedSseEvent[] = [];
    const remaining = this.buffer;
    this.buffer = "";

    if (remaining.trim().length > 0) {
      const parsed = this.parseBlock(remaining);
      if (parsed) {
        events.push(parsed);
      } else if (!this.seenSseFrame && !remaining.trimStart().startsWith("data:") && !remaining.trimStart().startsWith(":")) {
        // Explicit plain-text fallback only when endpoint responded in raw mode
        events.push({ type: "assistant_delta", text: remaining });
      }
    }
    return events;
  }

  private parseBlock(block: string): ParsedSseEvent | null {
    const lines = block.split("\n");
    const dataLines: string[] = [];
    let eventId: string | undefined;

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line) continue;
      if (line.startsWith(":")) {
        // SSE keepalive / comment
        this.seenSseFrame = true;
        continue;
      }
      if (line.startsWith("id:")) {
        this.seenSseFrame = true;
        eventId = line.slice(3).trim();
        continue;
      }
      if (line.startsWith("event:")) {
        this.seenSseFrame = true;
        continue;
      }
      if (line.startsWith("data:")) {
        this.seenSseFrame = true;
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (dataLines.length === 0) {
      return null;
    }

    const payloadText = dataLines.join("\n").trim();
    if (!payloadText || payloadText === "[DONE]") {
      return null;
    }

    try {
      const parsed = JSON.parse(payloadText);
      if (eventId && parsed && typeof parsed === "object" && parsed.seq === undefined) {
        const numericId = Number(eventId);
        if (Number.isFinite(numericId)) parsed.seq = numericId;
      }
      return parsed;
    } catch {
      // Never inject malformed JSON fragments into assistant prose
      return null;
    }
  }
}

export function reduceChatStreamEvent(state: ChatStreamState, rawEvent: ParsedSseEvent): ChatStreamState {
  if (!rawEvent || typeof rawEvent !== "object") return state;
  const eventData = rawEvent as Record<string, unknown>;

  if (typeof eventData.seq === "number") {
    if (eventData.seq <= state.lastSeq) {
      return state;
    }
  }

  const nextSeq = typeof eventData.seq === "number" ? eventData.seq : state.lastSeq;
  const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

  switch (eventData.type) {
    case "assistant_delta": {
      return {
        ...state,
        lastSeq: nextSeq,
        content: state.content + str(eventData.text),
      };
    }
    case "assistant_final": {
      const finalText = typeof eventData.text === "string" ? eventData.text : state.content;
      return {
        ...state,
        lastSeq: nextSeq,
        content: finalText || state.content,
      };
    }
    case "status": {
      const status = str(eventData.status, state.statusPhase);
      let turnStatus = state.turnStatus;
      if (status === "completed") turnStatus = "completed";
      else if (status === "cancelled") turnStatus = "cancelled";
      else if (status === "failed") turnStatus = "failed";
      else if (status === "waiting_for_confirmation") turnStatus = "waiting_for_confirmation";
      return {
        ...state,
        lastSeq: nextSeq,
        statusPhase: status,
        statusMessage: str(eventData.message) || state.statusMessage,
        turnStatus,
      };
    }
    case "step_progress": {
      return {
        ...state,
        lastSeq: nextSeq,
        statusPhase: eventData.phase === "replanning" ? "adapting" : "executing_step",
        statusMessage: str(eventData.humanMessage) || state.statusMessage,
      };
    }
    case "tool_activity": {
      const activities = [...state.toolActivities];
      const capabilityURN = str(eventData.capabilityURN);
      const providerId = str(eventData.providerId);
      const existingIdx = activities.findIndex(
        (a) => a.capabilityURN === capabilityURN && a.providerId === providerId
      );
      const rawState = str(eventData.state, "started");
      const actState: "started" | "completed" | "failed" =
        rawState === "completed" || rawState === "failed" ? rawState : "started";
      const activityObj: ParsedToolActivityItem = {
        id: `${providerId}_${capabilityURN}`,
        providerId,
        providerDisplayName: str(eventData.providerDisplayName),
        capabilityURN,
        iconName: str(eventData.iconName),
        humanMessage: str(eventData.humanMessage),
        state: actState,
        error: typeof eventData.error === "string" ? eventData.error : undefined,
        details:
          eventData.details && typeof eventData.details === "object"
            ? (eventData.details as Record<string, unknown>)
            : undefined,
      };
      if (existingIdx !== -1) activities[existingIdx] = activityObj;
      else activities.push(activityObj);
      return {
        ...state,
        lastSeq: nextSeq,
        toolActivities: activities,
      };
    }
    case "confirmation_required": {
      return {
        ...state,
        lastSeq: nextSeq,
        turnStatus: "waiting_for_confirmation",
        confirmation: {
          actionId: str(eventData.actionId),
          title: str(eventData.title),
          message: str(eventData.message),
          details:
            eventData.details && typeof eventData.details === "object"
              ? (eventData.details as Record<string, string>)
              : undefined,
          confirmLabel: str(eventData.confirmLabel, "Allow"),
          cancelLabel: str(eventData.cancelLabel, "Deny"),
        },
      };
    }
    case "missing_connection": {
      return {
        ...state,
        lastSeq: nextSeq,
        missingConnection: {
          providerId: str(eventData.providerId),
          providerDisplayName: str(eventData.providerDisplayName),
          iconName: str(eventData.iconName),
          message: str(eventData.message),
          connectUrl: str(eventData.connectUrl, "/settings/connections"),
        },
      };
    }
    case "cancelled": {
      const partial = str(eventData.partialText);
      return {
        ...state,
        lastSeq: nextSeq,
        statusPhase: "cancelled",
        turnStatus: "cancelled",
        content: partial && !state.content ? partial : state.content,
      };
    }
    case "error": {
      const partial = str(eventData.partialText);
      return {
        ...state,
        lastSeq: nextSeq,
        statusPhase: "failed",
        turnStatus: "failed",
        errorMessage: str(eventData.message, "Something went wrong — please try again"),
        content: partial && !state.content ? partial : state.content,
      };
    }
    default:
      return { ...state, lastSeq: nextSeq };
  }
}
