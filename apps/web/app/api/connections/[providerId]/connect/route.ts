import { NextRequest } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/apiResponse";
import { UserProviderConnection } from "@/server/db/models/UserProviderConnection";
import { ProviderRegistry } from "@life-os/execution-kernel";

type RouteParams = { params: Promise<{ providerId: string }> };

export async function POST(req: NextRequest, props: RouteParams) {
  try {
    const session = await getAuthSession();
    const userId = (session?.user as any)?.id;
    const userEmail = (session?.user as any)?.email;

    if (!userId) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }

    await connectDB();

    const { providerId } = await props.params;
    const provider = ProviderRegistry.getInstance().get(providerId as any);

    if (!provider) {
      return apiError(`Provider "${providerId}" is not recognized`, "NOT_FOUND", 404);
    }

    const body = await req.json().catch(() => ({}));
    const connectedAccount =
      body.connectedAccount || userEmail || `${providerId}_user@lifeos.internal`;

    // Upsert the connection document
    const connection = await UserProviderConnection.findOneAndUpdate(
      { userId, providerId },
      {
        $set: {
          providerDisplayName: provider.displayName,
          status: "ACTIVE",
          authType: provider.authType,
          connectedAccount,
          grantedScopes: provider.requiredScopes,
          ...(body.accessToken ? { encryptedTokenPayload: body.accessToken } : {}),
          lastSuccessfulSync: new Date(),
          consecutiveFailures: 0,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    return apiSuccess({
      success: true,
      providerId: provider.providerId,
      displayName: provider.displayName,
      status: connection.status,
      connectedAccount: connection.connectedAccount,
      lastSuccessfulSync: connection.lastSuccessfulSync,
    });
  } catch (err: any) {
    console.error("POST /api/connections/[providerId]/connect error:", err);
    return apiError(err.message || "Failed to establish connection", "INTERNAL_ERROR", 500);
  }
}
