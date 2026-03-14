import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { loadSystemContext } from "@/features/systemContext/loadSystemContext";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await loadSystemContext(session.user.id);

  return Response.json({
    ok: true,
    context,
  });
}