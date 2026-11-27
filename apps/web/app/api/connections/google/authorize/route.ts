import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  const userId = (session?.user as any)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawHost = req.headers.get("host") || "localhost:3456";
  const protocol = rawHost.includes("localhost") || rawHost.includes("127.0.0.1") ? "http" : "https";
  const baseUrl = `${protocol}://${rawHost}`;

  let clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId && userId) {
    try {
      const { connectDB } = await import("@/server/db/connect");
      await connectDB();
      const { UserProviderConnection } = await import("@/server/db/models/UserProviderConnection");
      const conn = await UserProviderConnection.findOne({
        userId,
        providerId: { $in: ["google_calendar", "google_drive", "google_tasks", "google_contacts", "gmail", "google_fit"] },
      }).lean();
      if (conn?.preferences) {
        const prefs = conn.preferences instanceof Map ? Object.fromEntries(conn.preferences) : conn.preferences;
        if (prefs.clientId) clientId = prefs.clientId;
      }
    } catch (_) {}
  }

  if (!clientId) {
    return NextResponse.redirect(
      `${baseUrl}/settings/connections?error=${encodeURIComponent(
        "Google Client ID is not configured. Please add GOOGLE_CLIENT_ID in .env or enter it in Settings > Connections."
      )}`
    );
  }

  const customRedirectUri = req.nextUrl.searchParams.get("redirect_uri");
  const redirectUri = customRedirectUri || process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/connections/google/callback`;

  const scopes = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/contacts",
    "https://www.googleapis.com/auth/fitness.activity.read",
    "https://www.googleapis.com/auth/fitness.body.read",
    "https://www.googleapis.com/auth/fitness.sleep.read",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "openid",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent",
    state: userId || "lifeos_session",
    include_granted_scopes: "true",
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
