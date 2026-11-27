import { registerOutboxInngestHook } from "@/server/inngest/outboxHook";
import { registerMemoryInngestHook } from "@/server/inngest/memoryHook";

let hooksBootstrapped = false;

/**
 * Idempotently registers both outbox and memory post-commit Inngest hooks.
 * Invoked from `connectDB()` and `/api/inngest/route.ts` so mutations executed
 * outside the Inngest route handler still trigger post-commit dispatch.
 */
export function bootstrapInngestHooks(): void {
  if (hooksBootstrapped) return;
  registerOutboxInngestHook();
  registerMemoryInngestHook();
  hooksBootstrapped = true;
}
