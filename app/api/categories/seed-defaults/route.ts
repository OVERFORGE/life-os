import { connectDB } from "@/server/db/connect";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { LifeCategory } from "@/features/schema/models/LifeCategory";

export async function POST() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const defaults = [
    { key: "mental-health", label: "Mental Health", order: 0 },
    { key: "sleep", label: "Sleep & Recovery", order: 1 },
    { key: "work", label: "Work & Execution", order: 2 },
    { key: "habits", label: "Habits & Discipline", order: 3 },
    { key: "physical", label: "Physical Health", order: 4 },
  ];

  for (const c of defaults) {
    await LifeCategory.updateOne(
      { userId: session.user.id, key: c.key },
      {
        $setOnInsert: {
          userId: session.user.id,
          ...c,
        },
      },
      { upsert: true }
    );
  }

  return Response.json({ ok: true });
}
