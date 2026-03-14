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

  const habitSignals = [
    { key: "gymHabit", label: "Gym", inputType: "checkbox" },
    { key: "reading", label: "Reading", inputType: "checkbox" },
    { key: "meditationHabit", label: "Meditation", inputType: "checkbox" },
    { key: "codingHabit", label: "Coding Practice", inputType: "checkbox" },
    { key: "content", label: "Content Creation", inputType: "checkbox" },
    { key: "learning", label: "Learning / Study", inputType: "checkbox" },
    { key: "noFap", label: "NoFap", inputType: "checkbox" },
    {
      key: "socialMediaOveruse",
      label: "Social Media Overuse",
      inputType: "checkbox",
      direction: "lower_better",
    },
    {
      key: "junkFood",
      label: "Ate Junk Food",
      inputType: "checkbox",
      direction: "lower_better",
    },
  ];

  for (const s of habitSignals) {
    await LifeSignal.updateOne(
      { userId: session.user.id, key: s.key },
      {
        $setOnInsert: {
          userId: session.user.id,
          key: s.key,
          label: s.label,
          categoryKey: "habits",
          inputType: s.inputType,
          direction: s.direction ?? "higher_better",
          enabled: true,
          isCore: false,
        },
      },
      { upsert: true }
    );
  }

  return Response.json({ ok: true });
}
