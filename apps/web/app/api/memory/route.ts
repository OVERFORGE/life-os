import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { apiSuccess, apiError } from "@/lib/apiResponse";
import {
  MemoryRepository,
  MemoryDomain,
  MemoryType,
  MemoryFormationPipeline,
} from "@life-os/execution-kernel";

export async function GET(req: Request) {
  try {
    const session = await getAuthSession();
    if (!(session?.user as any)?.id) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const userId = (session!.user as any).id;
    await connectDB();

    const url = new URL(req.url);
    const domain = url.searchParams.get("domain") as MemoryDomain | null;
    const memoryType = url.searchParams.get("type") as MemoryType | null;
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const searchQuery = url.searchParams.get("search");

    const repo = MemoryRepository.getInstance();

    if (searchQuery) {
      const searchResults = await repo.search({
        userId,
        queryText: searchQuery,
        domain: domain || undefined,
        memoryType: memoryType || undefined,
        includeArchived,
        limit: 20,
      });
      return apiSuccess({
        count: searchResults.length,
        memories: searchResults.map((r) => ({
          ...r.memory,
          searchScore: r.finalScore,
          explanation: r.explanation,
        })),
      });
    }

    // Default listing via hybrid search with empty text to fetch candidates
    const results = await repo.search({
      userId,
      domain: domain || undefined,
      memoryType: memoryType || undefined,
      includeArchived,
      limit: 50,
    });

    return apiSuccess({
      count: results.length,
      memories: results.map((r) => r.memory),
    });
  } catch (err: any) {
    console.error("GET /api/memory error:", err);
    return apiError(err.message || "Failed to retrieve memories", "INTERNAL_ERROR", 500);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAuthSession();
    if (!(session?.user as any)?.id) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const userId = (session!.user as any).id;
    await connectDB();

    const body = await req.json();
    const { content, summary, domain, memoryType } = body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return apiError("Memory content is required", "BAD_REQUEST", 400);
    }

    // User explicitly adding/correcting memory (epistemic source = explicit_user_statement)
    const pipeline = MemoryFormationPipeline.getInstance();
    const result = await pipeline.processConversationTurn({
      userId,
      userMessage: content.trim(),
      domainHint: domain,
    });

    return apiSuccess(result, 201);
  } catch (err: any) {
    console.error("POST /api/memory error:", err);
    return apiError(err.message || "Failed to create memory", "INTERNAL_ERROR", 500);
  }
}
