// app/api/signals/route.ts

import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { LifeSignal } from "@/features/signals/models/LifeSignal";

/* ======================= */
/* GET Signals             */
/* ======================= */
export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const signals = await LifeSignal.find({
    userId: session.user.id,
    enabled: true,
  })
    .sort({ isCore: -1, createdAt: 1 })
    .lean();

  return Response.json({ signals });
}


/* ======================= */
/* CREATE Signal           */
/* ======================= */
export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: any = await req.json();

  // 🔥 Debug log (temporary)
  console.log("SIGNAL CREATE BODY:", body);

  await connectDB();

  // ✅ CategoryKey must come from frontend
  if (!body.categoryKey) {
    return Response.json(
      { error: "categoryKey is required" },
      { status: 400 }
    );
  }

  const created = await LifeSignal.create({
    userId: session.user.id,

    key: body.key,
    label: body.label,

    // ✅ FIX: Store correct categoryKey
    categoryKey: body.categoryKey,

    inputType: body.inputType ?? "number",

    unit: body.unit ?? "",
    target: body.target ?? null,

    min: body.min ?? null,
    max: body.max ?? null,
    step: body.step ?? null,

    direction: body.direction ?? "higher_better",
    weight: body.weight ?? 1,

    enabled: true,

    dependsOn: body.dependsOn ?? null,
    showIf: body.showIf ?? null,
  });

  return Response.json({ ok: true, signal: created });
}

/* ======================= */
/* DELETE Signal           */
/* ======================= */
export async function DELETE(req: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");

  if (!key) {
    return Response.json({ error: "Key required" }, { status: 400 });
  }

  await connectDB();

  const signal = await LifeSignal.findOne({
    userId: session.user.id,
    key,
  });

  if (signal?.isCore) {
    return Response.json(
      { error: "Core signals cannot be deleted" },
      { status: 400 }
    );
  }

  await LifeSignal.deleteOne({
    userId: session.user.id,
    key,
  });

  return Response.json({ ok: true });
}

