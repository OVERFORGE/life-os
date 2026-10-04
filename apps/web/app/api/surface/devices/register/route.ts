import { NextRequest } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { apiSuccess, apiError } from "@/lib/apiResponse";
import { DeviceRegistration, DevicePlatformType } from "@/server/db/models/DeviceRegistrationModel";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    let userId = (session?.user as any)?.id;

    await connectDB();

    if (!userId && process.env.NODE_ENV !== "production") {
      const { User } = await import("@/server/db/models/User");
      const firstUser = await User.findOne().lean();
      if (firstUser) {
        userId = (firstUser as any)._id.toString();
      }
    }

    if (!userId) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const body = await req.json();

    if (!body?.deviceId || !body?.platform) {
      return apiError("deviceId and platform are required", "VALIDATION_ERROR", 400);
    }

    const validPlatforms: DevicePlatformType[] = ["ANDROID", "IOS", "DESKTOP", "WEB"];
    if (!validPlatforms.includes(body.platform)) {
      return apiError(`Invalid platform. Must be one of ${validPlatforms.join(", ")}`, "VALIDATION_ERROR", 400);
    }

    const updateFields: Record<string, any> = {
      userId,
      deviceId: body.deviceId,
      platform: body.platform,
      isActive: true,
      lastSeenAt: new Date(),
    };

    if (body.pushToken) {
      updateFields.pushToken = body.pushToken;
    }
    if (body.webPushSubscription) {
      updateFields.webPushSubscription = body.webPushSubscription;
    }
    if (body.deviceName) {
      updateFields.deviceName = body.deviceName;
    }
    if (body.appVersion) {
      updateFields.appVersion = body.appVersion;
    }

    const doc = await DeviceRegistration.findOneAndUpdate(
      { userId, deviceId: body.deviceId },
      { $set: updateFields },
      { upsert: true, new: true }
    );

    return apiSuccess({
      registered: true,
      deviceId: doc.deviceId,
      platform: doc.platform,
      lastSeenAt: doc.lastSeenAt,
    });
  } catch (err: any) {
    console.error("POST /api/surface/devices/register Error:", err);
    return apiError(err.message || "Failed to register surface device", "INTERNAL_ERROR", 500);
  }
}
