// app/api/categories/route.ts

import { connectDB } from "@/server/db/connect";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { LifeCategory } from "@/features/schema/models/LifeCategory";

/* ======================= */
/* GET Categories          */
/* ======================= */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const categories = await LifeCategory.find({
    userId: session.user.id,
  })
    .sort({ order: 1 })
    .lean();

  return Response.json({ categories });
}

/* ======================= */
/* CREATE Category         */
/* ======================= */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  await connectDB();

  const created = await LifeCategory.create({
    userId: session.user.id,
    key: body.key,
    label: body.label,
    order: body.order ?? 0,
  });

  return Response.json({ ok: true, category: created });
}

/* ======================= */
/* DELETE Category         */
/* ======================= */
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");

  if (!key) {
    return Response.json({ error: "Key required" }, { status: 400 });
  }

  await connectDB();

  await LifeCategory.deleteOne({
    userId: session.user.id,
    key,
  });

  return Response.json({ ok: true });
}
