import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { User } from "@/server/db/models/User";
import { getAuthSession } from "@/lib/auth";
import { upsertWeightLogWithOutbox } from "@/features/health/services/weightLogEngine";
import { updateUserProfileWithOutbox } from "@/features/user/services/userProfileEngine";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getAuthSession();
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const user = await User.findById(userId).select("+password");

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    return NextResponse.json({
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      gender: user.gender,
      age: user.age,
      weight: user.weight ?? null,
      height: user.height ?? null,
      heightUnit: user.heightUnit ?? null,
      hasPassword: !!user.password,
      targetCalories: (user as any).targetCalories ?? null,
      maintenanceCalories: (user as any).maintenanceCalories ?? null,
      dietMode: (user as any).dietMode ?? null,
      dietModeCalorieOffset: (user as any).dietModeCalorieOffset ?? null,
      preferences: (user as any).preferences || {},
    });
  } catch (error: any) {
    console.error("User fetch error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getAuthSession();
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    await connectDB();

    // We explicitly exclude email modification here natively for safety without complex verification flows
    const updatePayload: any = {};
    if (body.name !== undefined) updatePayload.name = body.name;
    if (body.avatar !== undefined) updatePayload.avatar = body.avatar;
    if (body.gender !== undefined) updatePayload.gender = body.gender;
    if (body.age !== undefined) updatePayload.age = Number(body.age);
    if (body.weight !== undefined) {
      const numericWeight = Number(body.weight);
      updatePayload.weight = numericWeight;
      const dateStr = new Date().toISOString().split("T")[0];
      const weightRes = await upsertWeightLogWithOutbox(userId, dateStr, numericWeight, {
        clientMutationId: typeof body.clientMutationId === "string" ? `${body.clientMutationId}:weight` : undefined,
        source: "web.user.patch",
      });
      if (!weightRes.success) {
        return NextResponse.json({ error: weightRes.error || "Failed to update weight log" }, { status: weightRes.statusCode || 500 });
      }
    }
    if (body.height !== undefined) updatePayload.height = Number(body.height);
    if (body.heightUnit !== undefined) updatePayload.heightUnit = body.heightUnit;
    if (body.targetCalories !== undefined) updatePayload.targetCalories = Number(body.targetCalories);
    if (body.maintenanceCalories !== undefined) updatePayload.maintenanceCalories = Number(body.maintenanceCalories);
    if (body.dietMode !== undefined) updatePayload.dietMode = body.dietMode;
    if (body.dietModeCalorieOffset !== undefined) updatePayload.dietModeCalorieOffset = Number(body.dietModeCalorieOffset);
    // Preferences
    if (body.preferences !== undefined) {
      const p = body.preferences;
      if (p.weightReminderEnabled !== undefined) updatePayload['preferences.weightReminderEnabled'] = Boolean(p.weightReminderEnabled);
      if (p.weightReminderDay !== undefined) updatePayload['preferences.weightReminderDay'] = Number(p.weightReminderDay);
      if (p.weightReminderHour !== undefined) updatePayload['preferences.weightReminderHour'] = Number(p.weightReminderHour);
      if (p.dayRolloverHour !== undefined) updatePayload['preferences.dayRolloverHour'] = Number(p.dayRolloverHour);
      if (p.ambientFocusEnabled !== undefined) updatePayload['preferences.ambientFocusEnabled'] = Boolean(p.ambientFocusEnabled);
      if (p.savedLocations !== undefined && Array.isArray(p.savedLocations)) {
        updatePayload['preferences.savedLocations'] = p.savedLocations.map((loc: any) => ({
          name: loc.name,
          lat: Number(loc.lat),
          lng: Number(loc.lng),
          radius: Number(loc.radius),
          voiceAssistantEnabled: Boolean(loc.voiceAssistantEnabled),
        }));
      }
    }
    
    // Settings
    if (body.settings !== undefined) {
      if (body.settings.timezone !== undefined) updatePayload['settings.timezone'] = body.settings.timezone;
    }
    
    if (Object.keys(updatePayload).length > 0) {
      const profileRes = await updateUserProfileWithOutbox(userId, updatePayload, {
        clientMutationId: typeof body.clientMutationId === "string" ? body.clientMutationId : undefined,
        source: "web.user.patch",
      });
      if (!profileRes.success) {
        return NextResponse.json(
          { error: profileRes.error || "User not found" },
          { status: profileRes.statusCode || 404 }
        );
      }
    }

    // Handle password updating separately (requires fetching with password)
    if (body.password && body.password.length >= 6) {
      const userWithPw = await User.findById(userId).select('+password');
      if (!userWithPw) return NextResponse.json({ error: "User not found" }, { status: 404 });
      if (userWithPw.password) {
        if (!body.oldPassword) return NextResponse.json({ error: "Missing old password for validation" }, { status: 400 });
        const isMatch = await bcrypt.compare(body.oldPassword, userWithPw.password);
        if (!isMatch) return NextResponse.json({ error: "Incorrect old password" }, { status: 401 });
      }
      userWithPw.password = body.password;
      await userWithPw.save();
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("User update error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

// PATCH is an alias for PUT so mobile PATCH /user works identically
export { PUT as PATCH };
