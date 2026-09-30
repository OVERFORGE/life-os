import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { UserProviderConnection } from "@/server/db/models/UserProviderConnection";
import { CredentialVault } from "@life-os/execution-kernel";

export async function GET(req: NextRequest) {
  const rawHost = req.headers.get("host") || "127.0.0.1:3000";
  // Spotify requires explicit 127.0.0.1 loopback address instead of localhost
  const host = rawHost.replace(/localhost/g, "127.0.0.1");
  const protocol = host.includes("127.0.0.1") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const state = searchParams.get("state");

    if (error || !code) {
      return NextResponse.redirect(`${baseUrl}/settings/connections?error=${encodeURIComponent(error || "Access denied")}`);
    }

    await connectDB();

    const session = await getAuthSession();
    let userId = (session?.user as any)?.id || state;

    if (!userId && process.env.NODE_ENV !== "production") {
      const { User } = await import("@/server/db/models/User");
      const firstUser = await User.findOne().lean();
      if (firstUser) {
        userId = (firstUser as any)._id.toString();
      }
    }

    if (!userId) {
      return NextResponse.redirect(`${baseUrl}/settings/connections?error=unauthorized`);
    }

    let clientId = process.env.SPOTIFY_CLIENT_ID;
    let clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    const existingConn = await UserProviderConnection.findOne({ userId, providerId: "spotify" }).lean();
    if (!clientId || !clientSecret) {
      if (existingConn?.preferences) {
        const prefs = existingConn.preferences instanceof Map ? Object.fromEntries(existingConn.preferences) : existingConn.preferences;
        if (!clientId && prefs.clientId) clientId = prefs.clientId;
        if (!clientSecret && prefs.clientSecret) clientSecret = CredentialVault.decrypt(prefs.clientSecret);
      }
    }

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${baseUrl}/settings/connections?error=missing_spotify_credentials`);
    }

    const redirectUri = `${baseUrl}/api/connections/spotify/callback`;

    // Exchange auth code for Spotify Access Token & Refresh Token
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: body.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Spotify token exchange failed:", errText);
      return NextResponse.redirect(`${baseUrl}/settings/connections?error=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in;

    // Fetch user profile from Spotify
    let userEmail = "spotify_user@lifeos.internal";
    try {
      const profileRes = await fetch("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        userEmail = profile.email || profile.display_name || userEmail;
      }
    } catch (_) {}

    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;

    const setObj: any = {
      providerDisplayName: "Spotify",
      status: "ACTIVE",
      authType: "OAUTH2",
      connectedAccount: userEmail,
      encryptedTokenPayload: CredentialVault.encrypt(accessToken),
      grantedScopes: [
        "user-read-playback-state",
        "user-modify-playback-state",
        "user-read-currently-playing",
        "playlist-read-private",
        "playlist-read-collaborative",
        "user-library-read",
      ],
      expiresAt,
      lastSuccessfulSync: new Date(),
      consecutiveFailures: 0,
      updatedAt: new Date(),
    };

    const existingPrefs = existingConn?.preferences instanceof Map
      ? Object.fromEntries(existingConn.preferences)
      : (existingConn?.preferences as any) || {};

    const updatedPrefs: Record<string, string> = { ...existingPrefs };
    if (refreshToken) {
      updatedPrefs.refreshToken = CredentialVault.encrypt(refreshToken);
    }
    if (clientId) {
      updatedPrefs.clientId = clientId;
    }
    if (clientSecret) {
      updatedPrefs.clientSecret = CredentialVault.encrypt(clientSecret);
    }
    setObj.preferences = updatedPrefs;

    await UserProviderConnection.findOneAndUpdate(
      { userId, providerId: "spotify" },
      {
        $set: setObj,
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Spotify Connected — LifeOS</title>
  <style>
    * { box-sizing: border-box; }
    body {
      background: #0E0F11;
      color: #ECE7E3;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }
    .card {
      background: #1F2023;
      border: 1px solid #2A2B2F;
      border-radius: 16px;
      padding: 36px 32px;
      text-align: center;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    .badge {
      width: 56px;
      height: 56px;
      background: rgba(232, 65, 74, 0.1);
      border: 1px solid rgba(232, 65, 74, 0.3);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      color: #E8414A;
      font-size: 24px;
    }
    h1 {
      font-size: 20px;
      font-weight: 600;
      margin: 0 0 8px;
      color: #FFFDFC;
    }
    p {
      color: #9BA1A6;
      font-size: 13.5px;
      line-height: 1.5;
      margin: 0 0 16px;
    }
    .account {
      background: #161618;
      border: 1px solid #2A2B2F;
      padding: 6px 14px;
      border-radius: 20px;
      font-family: monospace;
      font-size: 12.5px;
      color: #ECE7E3;
      margin-bottom: 24px;
      display: inline-block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .btn {
      background: #E8414A;
      color: #FFFDFC;
      font-weight: 600;
      border: none;
      padding: 12px 28px;
      border-radius: 10px;
      font-size: 14px;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #D62C35;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✓</div>
    <h1>Spotify Connected</h1>
    <div class="account">${userEmail}</div>
    <p>LifeOS is now linked with your Spotify account. Your desktop app will automatically update. You can close this tab and return to LifeOS.</p>
    <button class="btn" onclick="window.close()">Close This Tab</button>
  </div>
  <script>
    setTimeout(function() {
      try { window.close(); } catch(e) {}
    }, 4000);
  </script>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err: any) {
    console.error("Spotify callback error:", err);
    return NextResponse.redirect(`${baseUrl}/settings/connections?error=internal_error`);
  }
}
