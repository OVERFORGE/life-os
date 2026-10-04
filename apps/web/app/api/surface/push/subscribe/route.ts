import { NextRequest } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { apiSuccess, apiError } from "@/lib/apiResponse";
import { DeviceRegistration } from "@/server/db/models/DeviceRegistrationModel";

export const dynamic = "force-dynamic";

interface WebPushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  deviceId?: string;
  userAgent?: string;
}

interface SessionUser {
  id?: string;
  name?: string | null;
  email?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    let userId = (session?.user as SessionUser | undefined)?.id;

    await connectDB();

    if (!userId && process.env.NODE_ENV !== "production") {
      const { User } = await import("@/server/db/models/User");
      const firstUser = await User.findOne().lean();
      if (firstUser) {
        userId = (firstUser as { _id: { toString: () => string } })._id.toString();
      }
    }

    if (!userId) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const body = (await req.json()) as WebPushSubscriptionPayload;

    if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
      return apiError("Valid web push subscription (endpoint, keys) is required", "VALIDATION_ERROR", 400);
    }

    const deviceId = body.deviceId || `web_${Buffer.from(body.endpoint).toString("base64").slice(0, 16)}`;

    const doc = await DeviceRegistration.findOneAndUpdate(
      { userId, deviceId },
      {
        $set: {
          userId,
          deviceId,
          platform: "WEB",
          webPushSubscription: {
            endpoint: body.endpoint,
            keys: {
              p256dh: body.keys.p256dh,
              auth: body.keys.auth,
            },
          },
          deviceName: body.userAgent || "Web Browser",
          isActive: true,
          lastSeenAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    return apiSuccess({
      subscribed: true,
      deviceId: doc.deviceId,
      platform: "WEB",
      endpoint: doc.webPushSubscription?.endpoint,
    });
  } catch (err: unknown) {
    console.error("POST /api/surface/push/subscribe Error:", err);
    const message = err instanceof Error ? err.message : "Failed to save web push subscription";
    return apiError(message, "INTERNAL_ERROR", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getAuthSession();
    let userId = (session?.user as SessionUser | undefined)?.id;

    await connectDB();

    if (!userId && process.env.NODE_ENV !== "production") {
      const { User } = await import("@/server/db/models/User");
      const firstUser = await User.findOne().lean();
      if (firstUser) {
        userId = (firstUser as { _id: { toString: () => string } })._id.toString();
      }
    }

    if (!userId) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const body = (await req.json().catch(() => ({}))) as { deviceId?: string; endpoint?: string };

    if (body.deviceId) {
      await DeviceRegistration.updateOne(
        { userId, deviceId: body.deviceId },
        { $set: { isActive: false, webPushSubscription: undefined } }
      );
    } else if (body.endpoint) {
      await DeviceRegistration.updateOne(
        { userId, "webPushSubscription.endpoint": body.endpoint },
        { $set: { isActive: false, webPushSubscription: undefined } }
      );
    }

    return apiSuccess({ unsubscribed: true });
  } catch (err: unknown) {
    console.error("DELETE /api/surface/push/subscribe Error:", err);
    const message = err instanceof Error ? err.message : "Failed to unsubscribe web push";
    return apiError(message, "INTERNAL_ERROR", 500);
  }
}
