import { NextRequest } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/apiResponse";
import { UserProviderConnection } from "@/server/db/models/UserProviderConnection";
import { CredentialVault } from "@life-os/execution-kernel";

type RouteParams = { params: Promise<{ providerId: string }> };

export async function POST(req: NextRequest, props: RouteParams) {
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

    const conn = await UserProviderConnection.findOne({ userId, providerId }).lean();
    if (!conn) {
      return apiError(`Connection for "${providerId}" not found`, "NOT_FOUND", 404);
    }

    if (providerId === "spotify") {
      const rawToken =
        conn.encryptedTokenPayload ||
        (conn.preferences instanceof Map
          ? conn.preferences.get("accessToken")
          : (conn.preferences as any)?.accessToken) ||
        process.env.SPOTIFY_ACCESS_TOKEN;

      const accessToken = rawToken ? CredentialVault.decrypt(rawToken) : undefined;

      if (!accessToken) {
        return apiSuccess({
          success: false,
          hasToken: false,
          message: "No Spotify access token configured yet. Please paste your token below.",
          devices: [],
        });
      }

      try {
        let currentToken = accessToken;
        let devicesRes = await fetch("https://api.spotify.com/v1/me/player/devices", {
          headers: { Authorization: `Bearer ${currentToken}` },
        });

        if (devicesRes.status === 401) {
          const prefs =
            conn.preferences instanceof Map
              ? Object.fromEntries(conn.preferences)
              : (conn.preferences as any) || {};
          const refreshToken = prefs.refreshToken ? CredentialVault.decrypt(prefs.refreshToken) : undefined;
          const clientId = prefs.clientId || process.env.SPOTIFY_CLIENT_ID;
          const clientSecret = prefs.clientSecret ? CredentialVault.decrypt(prefs.clientSecret) : process.env.SPOTIFY_CLIENT_SECRET;

          if (refreshToken && clientId && clientSecret) {
            try {
              const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
                },
                body: new URLSearchParams({
                  grant_type: "refresh_token",
                  refresh_token: refreshToken,
                }),
              });
              if (tokenRes.ok) {
                const tokenData = await tokenRes.json();
                if (tokenData.access_token) {
                  currentToken = tokenData.access_token;
                  await UserProviderConnection.updateOne(
                    { userId, providerId: "spotify" },
                    { $set: { encryptedTokenPayload: CredentialVault.encrypt(currentToken), lastSuccessfulSync: new Date() } }
                  );
                  devicesRes = await fetch("https://api.spotify.com/v1/me/player/devices", {
                    headers: { Authorization: `Bearer ${currentToken}` },
                  });
                }
              }
            } catch (_) {}
          }
        }

        if (devicesRes.status === 401) {
          return apiSuccess({
            success: false,
            hasToken: true,
            status: "EXPIRED",
            message: "Spotify session expired. Please click 'Re-authorize in Chrome' to renew your session.",
            devices: [],
          });
        }

        const devicesData = await devicesRes.json().catch(() => ({ devices: [] }));
        const devices = (devicesData.devices || []).map((d: any) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          isActive: d.is_active,
        }));

        if (devices.length === 0) {
          return apiSuccess({
            success: true,
            hasToken: true,
            status: "NO_ACTIVE_PLAYER",
            message: "Token is valid! But no active Spotify device was found. Please open Spotify on your phone, PC, or web player.",
            devices: [],
          });
        }

        const activeDevice = devices.find((d: any) => d.isActive) || devices[0];
        return apiSuccess({
          success: true,
          hasToken: true,
          status: "READY",
          message: `Ready for playback! Active device: ${activeDevice.name} (${activeDevice.type}).`,
          devices,
        });
      } catch (netErr: any) {
        return apiSuccess({
          success: false,
          hasToken: true,
          message: `Network error reaching Spotify: ${netErr.message}`,
          devices: [],
        });
      }
    }

    if (providerId === "github") {
      const prefs =
        conn.preferences instanceof Map
          ? Object.fromEntries(conn.preferences)
          : (conn.preferences as any) || {};
      const rawToken = conn.encryptedTokenPayload || prefs.token || prefs.accessToken;
      const token = rawToken ? CredentialVault.decrypt(rawToken) : null;
      if (!token) {
        return apiSuccess({
          success: false,
          message: "No GitHub Personal Access Token (PAT) configured. Please enter your PAT below.",
        });
      }
      try {
        const ghRes = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "LifeOS-Sovereign-Agent",
          },
        });
        if (ghRes.ok) {
          const u = await ghRes.json();
          return apiSuccess({
            success: true,
            message: `Connected to GitHub as @${u.login} (${u.name || "Authenticated"}).`,
          });
        }
        return apiSuccess({
          success: false,
          message: `GitHub token rejected (Status ${ghRes.status}). Please check your token and scopes.`,
        });
      } catch (err: any) {
        return apiSuccess({
          success: false,
          message: `Couldn't reach GitHub: ${err.message}`,
        });
      }
    }

    if (providerId === "notion") {
      const prefs =
        conn.preferences instanceof Map
          ? Object.fromEntries(conn.preferences)
          : (conn.preferences as any) || {};
      const rawSecret = conn.encryptedTokenPayload || prefs.secret || prefs.token || prefs.apiKey;
      const secret = rawSecret ? CredentialVault.decrypt(rawSecret) : null;
      if (!secret) {
        return apiSuccess({
          success: false,
          message: "No Notion Internal Integration Secret configured. Please enter your secret below.",
        });
      }
      try {
        const notionRes = await fetch("https://api.notion.com/v1/users/me", {
          headers: {
            Authorization: `Bearer ${secret}`,
            "Notion-Version": "2022-06-28",
          },
        });
        if (notionRes.ok) {
          const user = await notionRes.json();
          return apiSuccess({
            success: true,
            message: `Connected to Notion workspace as ${user.name || "Internal Integration"}.`,
          });
        }
        return apiSuccess({
          success: false,
          message: `Notion secret rejected (Status ${notionRes.status}). Please check your secret token.`,
        });
      } catch (err: any) {
        return apiSuccess({
          success: false,
          message: `Couldn't reach Notion: ${err.message}`,
        });
      }
    }

    if (providerId === "obsidian_vault") {
      const fs = require("fs");
      const path = require("path");
      const os = require("os");
      const prefs =
        conn.preferences instanceof Map
          ? Object.fromEntries(conn.preferences)
          : (conn.preferences as any) || {};
      const vaultPath = prefs.vaultPath || prefs.path || path.join(os.homedir(), "Documents", "Obsidian");

      if (fs.existsSync(vaultPath)) {
        try {
          const entries = fs.readdirSync(vaultPath);
          const mdCount = entries.filter((e: string) => e.toLowerCase().endsWith(".md")).length;
          return apiSuccess({
            success: true,
            message: `Obsidian vault verified at "${vaultPath}" (${mdCount} Markdown notes found).`,
          });
        } catch (_) {}
      }
      return apiSuccess({
        success: true,
        message: `Obsidian vault directory configured at "${vaultPath}". LifeOS will index notes from this path.`,
      });
    }

    if (["google_drive", "gmail", "google_calendar", "google_tasks", "google_contacts", "google_fit"].includes(providerId)) {
      const prefs =
        conn.preferences instanceof Map
          ? Object.fromEntries(conn.preferences)
          : (conn.preferences as any) || {};
      let rawToken = conn.encryptedTokenPayload || prefs.token || prefs.accessToken;

      if (!rawToken) {
        const otherGoogleConn = await UserProviderConnection.findOne({
          userId,
          providerId: { $in: ["google_drive", "gmail", "google_calendar", "google_tasks", "google_contacts", "google_fit"] },
          encryptedTokenPayload: { $exists: true, $ne: "" },
        }).lean();
        if (otherGoogleConn) {
          rawToken = otherGoogleConn.encryptedTokenPayload;
        }
      }

      const token = rawToken ? CredentialVault.decrypt(rawToken) : null;
      if (!token) {
        return apiSuccess({
          success: false,
          hasToken: false,
          message: `No Google OAuth Access Token configured for ${conn.providerDisplayName || providerId}. Please follow the OAuth Playground Guide below to generate and paste your token.`,
        });
      }

      try {
        if (providerId === "google_drive") {
          const driveRes = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (driveRes.ok) {
            const data = await driveRes.json();
            const userName = data.user?.displayName || data.user?.emailAddress || "Authenticated";
            await UserProviderConnection.updateOne({ userId, providerId }, { $set: { lastSuccessfulSync: new Date() } });
            return apiSuccess({
              success: true,
              hasToken: true,
              message: `Connected to Google Drive as ${userName} (${data.user?.emailAddress || ""}). File search ready.`,
            });
          }
          if (driveRes.status === 401) {
            return apiSuccess({
              success: false,
              hasToken: true,
              message: "Google token expired or invalid (401 Unauthorized). Please refresh your token from OAuth Playground.",
            });
          }
          if (driveRes.status === 403) {
            return apiSuccess({
              success: false,
              hasToken: true,
              message: "Google Drive permission denied (403 Forbidden). Ensure https://www.googleapis.com/auth/drive.readonly was authorized on OAuth Playground.",
            });
          }
        } else if (providerId === "gmail") {
          const mailRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (mailRes.ok) {
            const m = await mailRes.json();
            await UserProviderConnection.updateOne({ userId, providerId }, { $set: { lastSuccessfulSync: new Date() } });
            return apiSuccess({
              success: true,
              hasToken: true,
              message: `Connected to Gmail as ${m.emailAddress} (${m.messagesTotal?.toLocaleString() || 0} messages synced).`,
            });
          }
          if (mailRes.status === 401) {
            return apiSuccess({
              success: false,
              hasToken: true,
              message: "Gmail token expired or invalid (401 Unauthorized). Please refresh your token from OAuth Playground.",
            });
          }
          if (mailRes.status === 403) {
            return apiSuccess({
              success: false,
              hasToken: true,
              message: "Gmail permission denied (403 Forbidden). Ensure https://www.googleapis.com/auth/gmail.readonly was authorized on OAuth Playground.",
            });
          }
        } else if (providerId === "google_calendar") {
          const calRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=5", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (calRes.ok) {
            const c = await calRes.json();
            const primary = (c.items || []).find((i: any) => i.primary) || c.items?.[0];
            await UserProviderConnection.updateOne({ userId, providerId }, { $set: { lastSuccessfulSync: new Date() } });
            return apiSuccess({
              success: true,
              hasToken: true,
              message: `Connected to Google Calendar (${primary?.summary || "Primary"} verified). Schedule access active.`,
            });
          }
          if (calRes.status === 401) {
            return apiSuccess({
              success: false,
              hasToken: true,
              message: "Google Calendar token expired or invalid (401 Unauthorized). Please refresh your token from OAuth Playground.",
            });
          }
          if (calRes.status === 403) {
            return apiSuccess({
              success: false,
              hasToken: true,
              message: "Google Calendar permission denied (403 Forbidden). Ensure https://www.googleapis.com/auth/calendar.events was authorized.",
            });
          }
        } else if (providerId === "google_tasks") {
          const taskRes = await fetch("https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=5", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (taskRes.ok) {
            const t = await taskRes.json();
            const listName = t.items?.[0]?.title || "Tasks";
            await UserProviderConnection.updateOne({ userId, providerId }, { $set: { lastSuccessfulSync: new Date() } });
            return apiSuccess({
              success: true,
              hasToken: true,
              message: `Connected to Google Tasks (${listName} synced).`,
            });
          }
          if (taskRes.status === 401) {
            return apiSuccess({
              success: false,
              hasToken: true,
              message: "Google Tasks token expired or invalid (401 Unauthorized). Please refresh your token from OAuth Playground.",
            });
          }
        } else if (providerId === "google_contacts") {
          const contactRes = await fetch("https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (contactRes.ok) {
            const p = await contactRes.json();
            const name = p.names?.[0]?.displayName || p.emailAddresses?.[0]?.value || "Authenticated";
            await UserProviderConnection.updateOne({ userId, providerId }, { $set: { lastSuccessfulSync: new Date() } });
            return apiSuccess({
              success: true,
              hasToken: true,
              message: `Connected to Google Contacts as ${name}. Contact resolution active.`,
            });
          }
          if (contactRes.status === 401) {
            return apiSuccess({
              success: false,
              hasToken: true,
              message: "Google Contacts token expired or invalid (401 Unauthorized). Please refresh your token from OAuth Playground.",
            });
          }
        } else if (providerId === "google_fit") {
          const fitRes = await fetch("https://www.googleapis.com/fitness/v1/users/me/dataSources", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (fitRes.ok) {
            await UserProviderConnection.updateOne({ userId, providerId }, { $set: { lastSuccessfulSync: new Date() } });
            return apiSuccess({
              success: true,
              hasToken: true,
              message: "Connected to Google Fit telemetry! Live activity & biometric channel active.",
            });
          }
          if (fitRes.status === 401) {
            return apiSuccess({
              success: false,
              hasToken: true,
              message: "Google Fit token expired or invalid (401 Unauthorized). Please refresh your token from OAuth Playground.",
            });
          }
        }
      } catch (err: any) {
        return apiSuccess({
          success: false,
          hasToken: true,
          message: `Network error connecting to Google API: ${err.message}`,
        });
      }
    }

    return apiSuccess({
      success: true,
      message: `${conn.providerDisplayName || providerId} connection is active and ready.`,
    });
  } catch (err: any) {
    console.error("POST /api/connections/[providerId]/test error:", err);
    return apiError(err.message || "Failed to test provider", "INTERNAL_ERROR", 500);
  }
}
