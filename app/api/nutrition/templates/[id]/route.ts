import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { DayTemplate } from "@/server/db/models/DayTemplate";

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const deleted = await DayTemplate.findOneAndDelete({ _id: params.id, userId: session.user.id });
    if (!deleted) return Response.json({ error: "Not found" }, { status: 404 });

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    await connectDB();
    const updated = await DayTemplate.findOneAndUpdate(
      { _id: params.id, userId: session.user.id },
      body,
      { new: true }
    );
    if (!updated) return Response.json({ error: "Not found" }, { status: 404 });

    return Response.json({ success: true, template: updated });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
