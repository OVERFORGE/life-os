import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { DayTemplate } from "@/server/db/models/DayTemplate";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await connectDB();
    const deleted = await DayTemplate.findOneAndDelete({ _id: id, userId: session.user.id });
    if (!deleted) return Response.json({ error: "Template not found" }, { status: 404 });

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    await connectDB();

    const updated = await DayTemplate.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      { $set: body },
      { new: true }
    );
    if (!updated) return Response.json({ error: "Template not found" }, { status: 404 });

    return Response.json({ success: true, template: updated });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
