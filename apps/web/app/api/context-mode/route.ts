import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { ContextModeService } from "@life-os/execution-kernel";

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  try {
    const service = ContextModeService.getInstance();
    const activeMode = await service.getActiveMode(session.user.id);
    const history = await service.getHistory(session.user.id);

    return NextResponse.json({
      success: true,
      activeMode,
      history,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to retrieve context mode" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  try {
    const body = await req.json();
    const service = ContextModeService.getInstance();

    if (body.action === "clear" || body.mode === "standard") {
      const cleared = await service.clearMode(
        session.user.id,
        body.reason || "User returned to standard operational mode"
      );
      return NextResponse.json({
        success: true,
        mode: cleared,
        message: "Returned to Standard operational mode.",
      });
    }

    const {
      mode,
      title,
      reason,
      durationDays,
      targetGoalIds,
      pausedGoalIds,
      minSleepProtectionHours,
      customConfig,
    } = body;

    if (!mode || !["sprint", "sanctuary", "sabbatical"].includes(mode)) {
      return NextResponse.json(
        { error: "Invalid mode. Must be sprint, sanctuary, or sabbatical." },
        { status: 400 }
      );
    }

    const activated = await service.setMode({
      userId: session.user.id,
      mode,
      title,
      reason,
      durationDays: typeof durationDays === "number" ? durationDays : undefined,
      targetGoalIds: Array.isArray(targetGoalIds) ? targetGoalIds : undefined,
      pausedGoalIds: Array.isArray(pausedGoalIds) ? pausedGoalIds : undefined,
      minSleepProtectionHours: typeof minSleepProtectionHours === "number" ? minSleepProtectionHours : undefined,
      customConfig,
    });

    return NextResponse.json({
      success: true,
      mode: activated,
      message: `Activated ${mode.toUpperCase()} Season successfully.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to set context mode" },
      { status: 500 }
    );
  }
}
