import { NextRequest } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/apiResponse";
import { UserProviderConnection } from "@/server/db/models/UserProviderConnection";
import { CredentialVault } from "@life-os/execution-kernel";

type RouteParams = { params: Promise<{ providerId: string }> };

export async function DELETE(req: NextRequest, props: RouteParams) {
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

    const { providerId } = await props.params;

    // Set connection status to REVOKED or remove it
    await UserProviderConnection.deleteOne({ userId, providerId });

    return apiSuccess({
      success: true,
      providerId,
      disconnected: true,
    });
  } catch (err: any) {
    console.error("DELETE /api/connections/[providerId] error:", err);
    return apiError(err.message || "Failed to disconnect provider", "INTERNAL_ERROR", 500);
  }
}

export async function PATCH(req: NextRequest, props: RouteParams) {
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

    const { providerId } = await props.params;
    const body = await req.json().catch(() => ({}));

    const updateFields: any = { updatedAt: new Date() };

    if (body.preferences) {
      const existing = await UserProviderConnection.findOne({ userId, providerId }).lean();
      const existingPrefs = existing?.preferences instanceof Map
        ? Object.fromEntries(existing.preferences)
        : (existing?.preferences as any) || {};

      const incomingPrefs = { ...body.preferences };
      // If user kept the masked placeholder for clientSecret, preserve existing DB secret
      if (incomingPrefs.clientSecret === "••••••••••••••••") {
        if (existingPrefs.clientSecret) {
          incomingPrefs.clientSecret = existingPrefs.clientSecret;
        } else {
          delete incomingPrefs.clientSecret;
        }
      }

      // Merge incoming with existing so we NEVER wipe out refreshToken or other credentials
      const mergedPrefs = { ...existingPrefs, ...incomingPrefs };
      updateFields.preferences = CredentialVault.encryptPreferences(mergedPrefs);
    }

    if (body.accessToken !== undefined) {
      updateFields.encryptedTokenPayload = body.accessToken
        ? CredentialVault.encrypt(body.accessToken)
        : "";
      updateFields.lastSuccessfulSync = new Date();
    }

    if (body.status) {
      updateFields.status = body.status;
    }

    const setOnInsert: any = {
      userId,
      providerId,
      status: "ACTIVE",
      createdAt: new Date(),
    };

    const connection = await UserProviderConnection.findOneAndUpdate(
      { userId, providerId },
      { 
        $set: updateFields,
        $setOnInsert: setOnInsert,
      },
      { returnDocument: "after", upsert: true }
    );

    const rawPrefs = connection.preferences instanceof Map
      ? Object.fromEntries(connection.preferences)
      : (connection.preferences ? { ...connection.preferences } : {});

    return apiSuccess({
      success: true,
      providerId,
      preferences: CredentialVault.sanitizePreferencesForClient(rawPrefs),
    });
  } catch (err: any) {
    console.error("PATCH /api/connections/[providerId] error:", err);
    return apiError(err.message || "Failed to update connection", "INTERNAL_ERROR", 500);
  }
}
