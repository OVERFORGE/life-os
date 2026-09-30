import { NextRequest } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/apiResponse";
import { UserProviderConnection } from "@/server/db/models/UserProviderConnection";
import { ProviderRegistry, CredentialVault } from "@life-os/execution-kernel";

const PROVIDER_METADATA_EXTRAS: Record<
  string,
  {
    iconName: string;
    humanPermissions: string[];
    defaultAccount: string;
  }
> = {
  google_calendar: {
    iconName: "Calendar",
    humanPermissions: [
      "View your calendar",
      "Create and manage events",
      "Update meeting details",
      "Remove cancelled commitments",
    ],
    defaultAccount: "Connected Account",
  },
  google_tasks: {
    iconName: "CheckSquare",
    humanPermissions: [
      "View to-do lists and task items",
      "Create and schedule tasks",
      "Sync task completion status",
    ],
    defaultAccount: "Google Tasks Account",
  },
  gmail: {
    iconName: "Mail",
    humanPermissions: [
      "Search your inbox and conversation threads",
      "Read selected email details",
      "Draft messages with explicit confirmation",
    ],
    defaultAccount: "Connected Account",
  },
  google_drive: {
    iconName: "Cloud",
    humanPermissions: [
      "Search documents and files",
      "Read document metadata and content",
      "Save exported files and summaries",
    ],
    defaultAccount: "Google Drive Account",
  },
  google_contacts: {
    iconName: "Users",
    humanPermissions: [
      "Resolve contact names and emails",
      "Query communication preferences",
    ],
    defaultAccount: "Google Contacts",
  },
  google_fit: {
    iconName: "Activity",
    humanPermissions: [
      "Read daily step counts and active minutes",
      "Log completed workouts and activities",
      "Track heart rate and sleep telemetry",
    ],
    defaultAccount: "Google Fit Account",
  },
  spotify: {
    iconName: "Music",
    humanPermissions: [
      "Control playback and volume",
      "Play focus and calming playlists",
      "Inspect currently playing track",
    ],
    defaultAccount: "Spotify Account",
  },
  github: {
    iconName: "FolderGit2",
    humanPermissions: [
      "View open pull requests and reviews",
      "Create issues and project tasks",
      "Search repository code",
    ],
    defaultAccount: "GitHub Account",
  },
  linear: {
    iconName: "Kanban",
    humanPermissions: [
      "View sprint issues and project tickets",
      "Create and update tasks",
      "Sync issue progress and cycles",
    ],
    defaultAccount: "Linear Workspace",
  },
  slack: {
    iconName: "MessageSquare",
    humanPermissions: [
      "Read channel updates and mentions",
      "Post messages with confirmation",
    ],
    defaultAccount: "Slack Workspace",
  },
  notion: {
    iconName: "BookOpen",
    humanPermissions: [
      "Query databases and page tables",
      "Read and append notes to workspace",
    ],
    defaultAccount: "Notion Workspace",
  },
  obsidian_vault: {
    iconName: "FileCode",
    humanPermissions: [
      "Index local Markdown knowledge vaults",
      "Read and create linked notes",
    ],
    defaultAccount: "Local Vault",
  },
  home_assistant: {
    iconName: "Home",
    humanPermissions: [
      "Control room temperature and climate",
      "Activate lighting scenes and focus modes",
    ],
    defaultAccount: "Home Assistant Hub",
  },
  philips_hue: {
    iconName: "Lightbulb",
    humanPermissions: [
      "Adjust desk and room lights",
      "Set circadian color temperature",
    ],
    defaultAccount: "Hue Bridge",
  },
  apple_health_bridge: {
    iconName: "HeartPulse",
    humanPermissions: [
      "Read sleep duration and quality scores",
      "Sync daily active calories and workouts",
    ],
    defaultAccount: "Apple Health Bridge",
  },
  health_connect_bridge: {
    iconName: "Activity",
    humanPermissions: [
      "Sync Android biometric telemetry",
      "Read daily step count and activities",
    ],
    defaultAccount: "Health Connect",
  },
  filesystem_desktop: {
    iconName: "HardDrive",
    humanPermissions: [
      "Access approved desktop and local files",
      "Inspect project folders and code files",
      "Launch approved system URLs and browser",
    ],
    defaultAccount: "Local Desktop OS",
  },
  brave_search: {
    iconName: "Globe",
    humanPermissions: [
      "Retrieve real-time web research",
      "Summarize current public information",
    ],
    defaultAccount: "LifeOS Search Engine",
  },
  uber_mobility: {
    iconName: "Car",
    humanPermissions: [
      "Compare UberGo, Premier, and Auto fares",
      "Dispatch 1-tap booking to native Uber mobile app",
      "Zero credentials stored",
    ],
    defaultAccount: "Uber Mobile Dispatch",
  },
  ola_mobility: {
    iconName: "Car",
    humanPermissions: [
      "Compare Ola Mini and Auto fares",
      "1-tap booking intent to native Ola app",
      "Zero credentials stored",
    ],
    defaultAccount: "Ola Cabs Dispatch",
  },
  rapido_mobility: {
    iconName: "Car",
    humanPermissions: [
      "Compare Rapido Bike Taxi & Auto fares",
      "1-tap booking to native Rapido app",
      "Zero credentials stored",
    ],
    defaultAccount: "Rapido Express Dispatch",
  },
  zomato_eats: {
    iconName: "Utensils",
    humanPermissions: [
      "Search local restaurant menus & ratings",
      "Assemble food carts",
      "1-tap checkout on native Zomato app",
    ],
    defaultAccount: "Zomato Dining Bridge",
  },
  zepto_commerce: {
    iconName: "Zap",
    humanPermissions: [
      "10-minute dark store grocery inventory",
      "Assemble quick delivery carts",
      "1-tap checkout on native Zepto app",
    ],
    defaultAccount: "Zepto Quick Commerce",
  },
  swiggy_suite: {
    iconName: "ShoppingBag",
    humanPermissions: [
      "Search Swiggy Food & Instamart groceries",
      "Build carts and review delivery times",
      "1-tap checkout on native Swiggy app",
    ],
    defaultAccount: "Swiggy App Bridge",
  },
  shopping_agent: {
    iconName: "ShoppingCart",
    humanPermissions: [
      "Compare prices on Amazon India & Flipkart",
      "Automate cart addition and address selection",
      "Halts at Checkout Payment Gate for your UPI/Card PIN",
    ],
    defaultAccount: "Online Shopping & Cart Assistant",
  },
};

function parsePreferences(prefs: any): Record<string, string> {
  if (!prefs) return {};
  const raw =
    prefs instanceof Map
      ? Object.fromEntries(prefs)
      : typeof prefs === "object"
      ? { ...prefs }
      : {};
  return CredentialVault.sanitizePreferencesForClient(raw);
}

export async function GET(req: NextRequest) {
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

    // 1. Fetch user provider connections from DB
    const existingConnections = await UserProviderConnection.find({ userId }).lean();
    const connectionMap = new Map<string, any>();
    for (const conn of existingConnections) {
      connectionMap.set(conn.providerId, conn);
    }

    // 2. Fetch canonical providers from kernel ProviderRegistry
    const allProviders = ProviderRegistry.getInstance().getAll();

    const connected: any[] = [];
    const available: any[] = [];

    for (const provider of allProviders) {
      const conn = connectionMap.get(provider.providerId);
      const extras = PROVIDER_METADATA_EXTRAS[provider.providerId] || {
        iconName: "Plug",
        humanPermissions: ["Access provider capabilities on your behalf"],
        defaultAccount: "Connected Account",
      };

      const hasToken = Boolean(
        conn &&
          (conn.encryptedTokenPayload ||
            (conn.preferences &&
              (conn.preferences instanceof Map
                ? conn.preferences.get("accessToken") || conn.preferences.get("token") || conn.preferences.get("apiKey")
                : (conn.preferences as any).accessToken || (conn.preferences as any).token || (conn.preferences as any).apiKey)))
      );

      if (conn && conn.status === "ACTIVE") {
        connected.push({
          providerId: provider.providerId,
          displayName: provider.displayName,
          category: provider.category,
          description: provider.description,
          iconName: extras.iconName,
          status: conn.status,
          hasToken,
          connectedAccount: conn.connectedAccount || extras.defaultAccount,
          lastSuccessfulSync: conn.lastSuccessfulSync || conn.updatedAt || conn.createdAt,
          humanPermissions: extras.humanPermissions,
          preferences: parsePreferences(conn.preferences),
        });
      } else if (conn && (conn.status === "EXPIRED" || conn.status === "SUSPENDED")) {
        connected.push({
          providerId: provider.providerId,
          displayName: provider.displayName,
          category: provider.category,
          description: provider.description,
          iconName: extras.iconName,
          status: conn.status,
          hasToken,
          connectedAccount: conn.connectedAccount || extras.defaultAccount,
          lastSuccessfulSync: conn.lastSuccessfulSync,
          humanPermissions: extras.humanPermissions,
          preferences: parsePreferences(conn.preferences),
        });
      } else {
        available.push({
          providerId: provider.providerId,
          displayName: provider.displayName,
          category: provider.category,
          description: provider.description,
          iconName: extras.iconName,
          humanPermissions: extras.humanPermissions,
          authType: provider.authType,
          savedPreferences: conn ? parsePreferences(conn.preferences) : undefined,
        });
      }
    }

    return apiSuccess({ connected, available });
  } catch (err: any) {
    console.error("GET /api/connections error:", err);
    return apiError(err.message || "Failed to load connections", "INTERNAL_ERROR", 500);
  }
}
