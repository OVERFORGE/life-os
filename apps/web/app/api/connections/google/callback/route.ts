import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { UserProviderConnection } from "@/server/db/models/UserProviderConnection";
import { CredentialVault } from "@life-os/execution-kernel";

const GOOGLE_PROVIDER_IDS = [
  { providerId: "google_calendar", displayName: "Google Calendar" },
  { providerId: "google_tasks", displayName: "Google Tasks" },
  { providerId: "gmail", displayName: "Gmail" },
  { providerId: "google_drive", displayName: "Google Drive" },
  { providerId: "google_contacts", displayName: "Google Contacts" },
  { providerId: "google_fit", displayName: "Google Fit" },
];

export async function GET(req: NextRequest) {
  const rawHost = req.headers.get("host") || "localhost:3000";
  const protocol = rawHost.includes("localhost") || rawHost.includes("127.0.0.1") ? "http" : "https";
  const baseUrl = `${protocol}://${rawHost}`;

  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const state = searchParams.get("state");

    if (error || !code) {
      return NextResponse.redirect(`${baseUrl}/settings/connections?error=${encodeURIComponent(error || "Google access was not granted")}`);
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

    let clientId = process.env.GOOGLE_CLIENT_ID;
    let clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      const existingConn = await UserProviderConnection.findOne({
        userId,
        providerId: { $in: GOOGLE_PROVIDER_IDS.map((p) => p.providerId) },
      }).lean();

      if (existingConn?.preferences) {
        const prefs = existingConn.preferences instanceof Map ? Object.fromEntries(existingConn.preferences) : existingConn.preferences;
        if (!clientId && prefs.clientId) clientId = prefs.clientId;
        if (!clientSecret && prefs.clientSecret) clientSecret = CredentialVault.decrypt(prefs.clientSecret);
      }
    }

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${baseUrl}/settings/connections?error=missing_google_credentials`);
    }

    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/connections/google/callback`;

    // Exchange auth code for Google Access Token & Refresh Token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Google token exchange failed:", errText);
      return NextResponse.redirect(`${baseUrl}/settings/connections?error=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in;
    const grantedScopes = (tokenData.scope || "").split(" ").filter(Boolean);

    // Fetch user profile from Google
    let userEmail = "google_user@gmail.com";
    try {
      const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        userEmail = profile.email || profile.name || userEmail;
      }
    } catch (_) {}

    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;

    // Synchronize across ALL 6 Google services in LifeOS simultaneously
    const updates = GOOGLE_PROVIDER_IDS.map(async ({ providerId, displayName }) => {
      const existingConn = await UserProviderConnection.findOne({ userId, providerId }).lean();
      const existingPrefs = existingConn?.preferences instanceof Map
        ? Object.fromEntries(existingConn.preferences)
        : (existingConn?.preferences as any) || {};

      const updatedPrefs: Record<string, string> = {
        ...existingPrefs,
        token: accessToken,
      };
      if (refreshToken) {
        updatedPrefs.refreshToken = CredentialVault.encrypt(refreshToken);
      }
      if (clientId) {
        updatedPrefs.clientId = clientId;
      }
      if (clientSecret) {
        updatedPrefs.clientSecret = CredentialVault.encrypt(clientSecret);
      }

      return UserProviderConnection.findOneAndUpdate(
        { userId, providerId },
        {
          $set: {
            providerDisplayName: displayName,
            status: "ACTIVE",
            authType: "OAUTH2",
            connectedAccount: userEmail,
            encryptedTokenPayload: CredentialVault.encrypt(accessToken),
            grantedScopes,
            expiresAt,
            lastSuccessfulSync: new Date(),
            consecutiveFailures: 0,
            preferences: updatedPrefs,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true, returnDocument: "after" }
      );
    });

    await Promise.all(updates);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Google Workspace Connected — LifeOS</title>
  <style>
    * { box-sizing: border-box; }
    body {
      background: #161618;
      color: #ECE7E3;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
    }
    .card {
      background: #1F2023;
      border: 1px solid #2A2B2F;
      border-radius: 16px;
      padding: 36px 32px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    .badge {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: rgba(232, 65, 74, 0.1);
      border: 1px solid rgba(232, 65, 74, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      color: #E8414A;
    }
    h1 { font-size: 20px; font-weight: 600; margin: 0 0 8px; color: #FFFDFC; }
    p { font-size: 13.5px; color: #9BA1A6; margin: 0 0 16px; line-height: 1.5; }
    .email {
      display: inline-block;
      background: #161618;
      border: 1px solid #2A2B2F;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12.5px;
      color: #ECE7E3;
      font-family: monospace;
      margin-bottom: 24px;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 12px;
      background: #E8414A;
      color: #FFFDFC;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #D62C35;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    </div>
    <h1>Google Workspace Connected</h1>
    <p>Calendar, Drive, Contacts, Gmail, Tasks, and Fit are now fully synchronized with LifeOS.</p>
    <div class="email">${userEmail}</div>
    <a href="/settings/connections?google_success=true" class="btn" id="closeBtn">Return to Connections</a>
  </div>

  <script>
    if (window.opener) {
      window.opener.postMessage({ type: "LIFEOS_GOOGLE_AUTH_SUCCESS", email: "${userEmail}" }, "*");
      setTimeout(() => { window.close(); }, 1200);
    } else {
      setTimeout(() => { window.location.href = "/settings/connections?google_success=true"; }, 1500);
    }
  </script>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err: any) {
    console.error("Google callback error:", err);
    return NextResponse.redirect(`${baseUrl}/settings/connections?error=${encodeURIComponent(err.message || "Unknown error")}`);
  }
}
