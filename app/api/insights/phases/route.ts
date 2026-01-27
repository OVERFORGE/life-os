import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { connectDB } from "@/server/db/connect";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const phases = await PhaseHistory.find({
    userId: session.user.id,
  })
    .sort({ startDate: 1 })
    .lean();

  return NextResponse.json(phases);
}
