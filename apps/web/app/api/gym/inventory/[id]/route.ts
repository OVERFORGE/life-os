import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { Gym } from "@/server/db/models/Gym";
import {
  deleteCatalogDocWithOutbox,
  upsertCatalogDocWithOutbox,
} from "@/features/catalog/services/catalogMutationEngine";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await deleteCatalogDocWithOutbox({
      userId: (session.user as any).id,
      model: Gym,
      filter: { _id: id, userId: (session.user as any).id },
      aggregateType: "gym",
      eventType: "domain.catalog.updated",
      domain: "gym",
      options: { source: "web.gym.inventory.delete" },
    });
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

    const res = await upsertCatalogDocWithOutbox({
      userId: (session.user as any).id,
      model: Gym,
      filter: { _id: id, userId: (session.user as any).id },
      aggregateType: "gym",
      eventType: "domain.catalog.updated",
      domain: "gym",
      updateFields: { name, customEquipment, selectedPreSeeded },
      options: { source: "web.gym.inventory.update" },
    });
    return NextResponse.json(res.doc || null);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
