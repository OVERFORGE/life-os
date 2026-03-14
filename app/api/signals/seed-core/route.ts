import { connectDB } from "@/server/db/connect";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { LifeSignal } from "@/features/signals/models/LifeSignal";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const coreSignals = [
    {
      key: "mood",
      label: "Mood",
      categoryKey: "mental-health",
      inputType: "slider",
      min: 1,
      max: 10,
      isCore: true,
    },
    {
      key: "energy",
      label: "Energy",
      categoryKey: "mental-health",
      inputType: "slider",
      min: 1,
      max: 10,
      isCore: true,
    },
    {
      key: "stress",
      label: "Stress",
      categoryKey: "mental-health",
      inputType: "slider",
      min: 1,
      max: 10,
      direction: "lower_better",
      isCore: true,
    },
    {
      key: "sleepHours",
      label: "Sleep Hours",
      categoryKey: "sleep",
      inputType: "number",
      unit: "hrs",
      target: 8,
      isCore: true,
    },
    {
      key: "deepWorkHours",
      label: "Deep Work Hours",
      categoryKey: "work",
      inputType: "number",
      unit: "hrs",
      isCore: true,
    },
  ];

  for (const s of coreSignals) {
    await LifeSignal.updateOne(
      { userId: session.user.id, key: s.key },
      { $setOnInsert: { userId: session.user.id, ...s } },
      { upsert: true }
    );
  }

  return Response.json({ ok: true });
}
