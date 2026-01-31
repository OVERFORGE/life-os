import { connectDB } from "@/server/db/connect";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { LifeSystemSettings } from "@/features/settings/models/LifeSystemSettings";
import { getEffectiveSettings } from "@/features/settings/getEffectiveSettings";
import { DEFAULT_SYSTEM_SETTINGS } from "@/features/settings/defaultSystemSettings";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const doc =
    (await LifeSystemSettings.findOne({
      userId: session.user.id,
    }).lean()) || null;

  const effective = getEffectiveSettings({
    learned: doc?.learned,
    overrides: doc?.overrides,
  });

  return Response.json({
    defaults: DEFAULT_SYSTEM_SETTINGS,
    learned: doc?.learned || {},
    overrides: doc?.overrides || {},
    effective,
  });
}


export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  await connectDB();

  await LifeSystemSettings.findOneAndUpdate(
    { userId: session.user.id },
    { overrides: body },
    { upsert: true }
  );

  return Response.json({ ok: true });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  await LifeSystemSettings.findOneAndUpdate(
    { userId: session.user.id },
    { overrides: {} }
  );

  return Response.json({ ok: true });
}
