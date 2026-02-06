// app/api/signals/log/route.ts

import { connectDB } from "@/server/db/connect";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { DailyLog } from "@/server/db/models/DailyLog";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  await connectDB();

  const log = await DailyLog.findOneAndUpdate(
    {
      userId: session.user.id,
      date: body.date,
    },
    {
      $set: {
        [`signals.${body.key}`]: body.value,
      },
    },
    { upsert: true, new: true }
  );

  return Response.json({ ok: true, log });
}
