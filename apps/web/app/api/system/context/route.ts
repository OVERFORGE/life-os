import { getAuthSession } from "@/lib/auth";
import { loadSystemContext } from "@/features/systemContext/loadSystemContext";

export async function GET() {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await loadSystemContext(session.user.id);

  return Response.json({
    ok: true,
    context,
  });
}