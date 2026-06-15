import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { Gym } from "@/server/db/models/Gym";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await Gym.findOneAndDelete({ _id: id, userId: (session.user as any).id });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body: any = await req.json();
    const { name, customEquipment, selectedPreSeeded } = body;

    const gym = await Gym.findOneAndUpdate(
      { _id: id, userId: (session.user as any).id },
      { $set: { name, customEquipment, selectedPreSeeded } },
      { new: true }
    );
    return NextResponse.json(gym);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
