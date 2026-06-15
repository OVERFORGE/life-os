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

  const physicalSignals = [
    {
      key: "gymSession",
      label: "Went to Gym",
      inputType: "checkbox",
    },
    {
      key: "steps",
      label: "Steps Walked",
      inputType: "number",
      unit: "steps",
      target: 8000,
    },
    {
      key: "calories",
      label: "Calories Intake",
      inputType: "number",
      unit: "kcal",
      target: null,
    },
    {
      key: "meals",
      label: "Meals Eaten",
      inputType: "number",
      unit: "meals",
      target: null,
    },
    {
      key: "dietNote",
      label: "Diet Note",
      inputType: "textarea",
    },
    {
      key: "painNote",
      label: "Pain / Sickness Note",
      inputType: "textarea",
    },
  ];

  for (const s of physicalSignals) {
    await LifeSignal.updateOne(
      { userId: session.user.id, key: s.key },
      {
        $setOnInsert: {
          userId: session.user.id,
          key: s.key,
          label: s.label,
          categoryKey: "physical",
          inputType: s.inputType,
          unit: s.unit ?? "",
          target: s.target ?? null,
          enabled: true,
          isCore: false,
        },
      },
      { upsert: true }
    );
  }

  return Response.json({ ok: true });
}
