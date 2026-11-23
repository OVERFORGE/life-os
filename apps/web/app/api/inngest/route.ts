import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { goalDecompositionFunction } from "@/lib/inngest/functions/goalDecomposition";
import { outboxSweeperFunction } from "@/lib/inngest/functions/outboxSweeper";
import { registerOutboxInngestHook } from "@/server/inngest/outboxHook";

// Ensure outbox post-commit hook is registered
registerOutboxInngestHook();

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    goalDecompositionFunction,
    outboxSweeperFunction,
  ],
});

