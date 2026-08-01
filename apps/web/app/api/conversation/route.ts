import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { Kernel } from "@life-os/execution-kernel";

export async function POST(req: Request) {
  const session = await getAuthSession();

  if (!(session?.user as any)?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session!.user as any).id;
  const { message, model, mode = "general" } = await req.json();

  if (!message) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  await connectDB();

  // Delegate processing to the execution kernel
  return await Kernel.handle({
    userId,
    message,
    model,
    mode,
  });
}