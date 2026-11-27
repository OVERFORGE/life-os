import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { goalDecompositionFunction } from "@/lib/inngest/functions/goalDecomposition";
import { outboxDispatcherFunction } from "@/lib/inngest/functions/outboxDispatcher";
import { outboxSweeperFunction } from "@/lib/inngest/functions/outboxSweeper";
import {
  memoryExtractionFunction,
  memorySweeperFunction,
} from "@/lib/inngest/functions/memoryExtractionWorker";
import { bootstrapInngestHooks } from "@/server/inngest/bootstrapHooks";

// Ensure outbox and memory post-commit hooks are registered
bootstrapInngestHooks();

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    goalDecompositionFunction,
    outboxDispatcherFunction,
    outboxSweeperFunction,
    memoryExtractionFunction,
    memorySweeperFunction,
  ],
});
