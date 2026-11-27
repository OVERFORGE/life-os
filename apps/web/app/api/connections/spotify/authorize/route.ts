import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  const userId = (session?.user as any)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawHost = req.headers.get("host") || "127.0.0.1:3456";
  // Spotify requires explicit 127.0.0.1 loopback address instead of localhost for insecure HTTP
  const host = rawHost.replace(/localhost/g, "127.0.0.1");
  const protocol = host.includes("127.0.0.1") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  let clientId = process.env.SPOTIFY_CLIENT_ID;

  if (!clientId && userId) {
    try {
      const { connectDB } = await import("@/server/db/connect");
      await connectDB();
      const { UserProviderConnection } = await import("@/server/db/models/UserProviderConnection");
      const conn = await UserProviderConnection.findOne({ userId, providerId: "spotify" }).lean();
      if (conn?.preferences) {
        const prefs = conn.preferences instanceof Map ? Object.fromEntries(conn.preferences) : conn.preferences;
        if (prefs.clientId) clientId = prefs.clientId;
      }
    } catch (_) {}
  }

  if (!clientId) {
    return NextResponse.redirect(
      `${baseUrl}/settings/connections?error=${encodeURIComponent(
        "Please provide your Spotify Client ID in Settings > Connections to authenticate."
      )}`
    );
  }

  const redirectUri = `${baseUrl}/api/connections/spotify/callback`;

  const scopes = [
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-library-read",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scopes,
    state: userId || "lifeos_session",
    show_dialog: "true",
  });

  return NextResponse.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
}
