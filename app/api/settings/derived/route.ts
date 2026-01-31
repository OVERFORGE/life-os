import { connectDB } from "@/server/db/connect";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { LifeSettings } from "@/features/insights/models/LifeSettings";

function direction(before?: number, after?: number) {
  if (before == null || after == null) return "stable";
  if (after > before) return "up";
  if (after < before) return "down";
  return "stable";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const userId = session.user.id;

  const settings = await LifeSettings.findOne({ userId }).lean();
  if (!settings?.learnedSensitivity) {
    return Response.json({ derived: {} });
  }

  const history = settings.sensitivityHistory || [];

  function buildMetric(key: keyof typeof settings.learnedSensitivity) {
    const lastChange = [...history]
      .reverse()
      .find(h => h.before?.[key] !== h.after?.[key]);

    return {
      value: settings.learnedSensitivity[key],
      direction: direction(lastChange?.before?.[key], lastChange?.after?.[key]),
      lastChanged: lastChange?.date ?? null,
      reason: lastChange?.reason ?? "System default",
      confidence: Math.min(1, history.length / 10), // simple V2 heuristic
    };
  }

  return Response.json({
    derived: {
      sleepImpact: buildMetric("sleepImpact"),
      stressImpact: buildMetric("stressImpact"),
      energyImpact: buildMetric("energyImpact"),
      moodImpact: buildMetric("moodImpact"),
    },
  });
}
