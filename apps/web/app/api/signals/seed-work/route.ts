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

  const workSignals = [
    {
      key: "coded",
      label: "Did Coding",
      categoryKey: "work",
      inputType: "checkbox",
    },
    {
      key: "executioners",
      label: "Worked on Executioners",
      categoryKey: "work",
      inputType: "checkbox",
    },
    {
      key: "studied",
      label: "Studied / Learning",
      categoryKey: "work",
      inputType: "checkbox",
    },
    {
      key: "mainWork",
      label: "Main Work Focus",
      categoryKey: "work",
      inputType: "textarea",
    },
  ];

  for (const s of workSignals) {
    await LifeSignal.updateOne(
      { userId: session.user.id, key: s.key },
      {
        $setOnInsert: {
          userId: session.user.id,
          ...s,
          enabled: true,
          isCore: false,
        },
      },
      { upsert: true }
    );
  }

  return Response.json({ ok: true });
}
