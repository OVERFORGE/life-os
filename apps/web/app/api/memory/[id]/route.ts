import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { apiSuccess, apiError } from "@/lib/apiResponse";
import { MemoryRepository } from "@life-os/execution-kernel";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const session = await getAuthSession();
    if (!(session?.user as any)?.id) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const userId = (session!.user as any).id;
    const { id } = await context.params;
    await connectDB();

    const repo = MemoryRepository.getInstance();
    const memory = await repo.getById(id, userId);

    if (!memory) {
      return apiError("Memory not found or access denied", "NOT_FOUND", 404);
    }

    return apiSuccess(memory);
  } catch (err: any) {
    console.error("GET /api/memory/[id] error:", err);
    return apiError(err.message || "Failed to fetch memory", "INTERNAL_ERROR", 500);
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const session = await getAuthSession();
    if (!(session?.user as any)?.id) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const userId = (session!.user as any).id;
    const { id } = await context.params;
    await connectDB();

    const body = await req.json();
    const repo = MemoryRepository.getInstance();

    const updated = await repo.update(id, userId, body);
    if (!updated) {
      return apiError("Memory not found or update unauthorized", "NOT_FOUND", 404);
    }

    return apiSuccess(updated);
  } catch (err: any) {
    console.error("PATCH /api/memory/[id] error:", err);
    return apiError(err.message || "Failed to update memory", "INTERNAL_ERROR", 500);
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  try {
    const session = await getAuthSession();
    if (!(session?.user as any)?.id) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const userId = (session!.user as any).id;
    const { id } = await context.params;
    await connectDB();

    const repo = MemoryRepository.getInstance();
    const success = await repo.archive(id, userId);

    if (!success) {
      return apiError("Memory not found or delete unauthorized", "NOT_FOUND", 404);
    }

    return apiSuccess({
      archived: true,
      id,
      message: "Memory successfully archived and excluded from future retrieval.",
    });
  } catch (err: any) {
    console.error("DELETE /api/memory/[id] error:", err);
    return apiError(err.message || "Failed to archive memory", "INTERNAL_ERROR", 500);
  }
}
