/**
 * StreamLifecycleUtils.ts
 *
 * Pure deterministic utilities for Stage 3 stream hygiene:
 * - StreamingThinkSanitizer: strips <think>...</think> and <planning>...</planning>
 *   blocks incrementally across arbitrary chunk boundaries without leaking chain-of-thought.
 * - createStreamTerminalGuard: enforces at-most-one terminal event per SSE stream.
 */

export type StreamTerminalOutcome =
  | "completed"
  | "waiting_for_confirmation"
  | "cancelled"
  | "failed";

export interface StreamTerminalGuard {
  readonly terminated: boolean;
  readonly outcome: StreamTerminalOutcome | undefined;
  tryFinalize(outcome: StreamTerminalOutcome): boolean;
}

export function createStreamTerminalGuard(): StreamTerminalGuard {
  let terminated = false;
  let finalOutcome: StreamTerminalOutcome | undefined = undefined;

  return {
    get terminated() {
      return terminated;
    },
    get outcome() {
      return finalOutcome;
    },
    tryFinalize(outcome: StreamTerminalOutcome): boolean {
      if (terminated) return false;
      terminated = true;
      finalOutcome = outcome;
      return true;
    },
  };
}

const OPEN_TAGS = ["<think>", "<planning>"] as const;
const CLOSE_TAGS: Record<string, string> = {
  "<think>": "</think>",
  "<planning>": "</planning>",
};

/**
 * Incrementally strips private reasoning blocks (<think>...</think>, <planning>...</planning>)
 * across arbitrarily fragmented token deltas.
 */
export class StreamingThinkSanitizer {
  private buffer = "";
  private activeCloseTag: string | null = null;
  private hasEmittedNonWhitespace = false;

  push(chunk: string): string {
    if (!chunk) return "";
    this.buffer += chunk;
    return this.drain(false);
  }

  flush(): string {
    return this.drain(true);
  }

  private drain(isEof: boolean): string {
    let out = "";

    while (this.buffer.length > 0) {
      if (this.activeCloseTag) {
        const lower = this.buffer.toLowerCase();
        const closeIdx = lower.indexOf(this.activeCloseTag);
        if (closeIdx !== -1) {
          this.buffer = this.buffer.slice(closeIdx + this.activeCloseTag.length);
          this.activeCloseTag = null;
          continue;
        }

        if (isEof) {
          // Discard unclosed reasoning block on EOF so private thoughts never leak
          this.buffer = "";
          break;
        }

        // Keep at most closeTag.length - 1 trailing chars in case closing tag spans chunks
        const keep = this.activeCloseTag.length - 1;
        if (this.buffer.length > keep) {
          this.buffer = this.buffer.slice(this.buffer.length - keep);
        }
        break;
      }

      // Not inside a reasoning block: look for earliest open tag
      const lower = this.buffer.toLowerCase();
      let earliestIdx = -1;
      let matchedOpenTag = "";
      for (const tag of OPEN_TAGS) {
        const idx = lower.indexOf(tag);
        if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
          earliestIdx = idx;
          matchedOpenTag = tag;
        }
      }

      if (earliestIdx !== -1) {
        out += this.emitVisible(this.buffer.slice(0, earliestIdx));
        this.buffer = this.buffer.slice(earliestIdx + matchedOpenTag.length);
        this.activeCloseTag = CLOSE_TAGS[matchedOpenTag];
        continue;
      }

      if (isEof) {
        out += this.emitVisible(this.buffer);
        this.buffer = "";
        break;
      }

      // Hold back any trailing partial '<...' prefix that could be the start of <think> / <planning>
      const lastLt = this.buffer.lastIndexOf("<");
      if (lastLt !== -1) {
        const tail = lower.slice(lastLt);
        const couldBeOpenTag = OPEN_TAGS.some((tag) => tag.startsWith(tail));
        if (couldBeOpenTag) {
          out += this.emitVisible(this.buffer.slice(0, lastLt));
          this.buffer = this.buffer.slice(lastLt);
          break;
        }
      }

      out += this.emitVisible(this.buffer);
      this.buffer = "";
    }

    return out;
  }

  private emitVisible(text: string): string {
    if (!text) return "";
    if (!this.hasEmittedNonWhitespace) {
      const trimmedStart = text.replace(/^\s+/, "");
      if (!trimmedStart) return "";
      this.hasEmittedNonWhitespace = true;
      return trimmedStart;
    }
    return text;
  }
}
