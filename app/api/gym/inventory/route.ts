import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { Gym } from "@/server/db/models/Gym";
import { PRE_SEEDED_EQUIPMENT, EQUIPMENT_BY_CATEGORY } from "@/server/constants/gymEquipment";

export async function GET(req: Request) {
  try {
    await connectDB();
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const gyms = await Gym.find({ userId: session.user.id });
    return NextResponse.json({ seeds: PRE_SEEDED_EQUIPMENT, categories: EQUIPMENT_BY_CATEGORY, userGyms: gyms });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const gym = await Gym.create({
      userId: session.user.id,
      name: body.name,
      customEquipment: body.customEquipment || [],
      selectedPreSeeded: body.selectedPreSeeded || []
    });

    return NextResponse.json(gym);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
