"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Music,
  FolderGit2,
  Mail,
  HardDrive,
  Globe,
  Plug,
  Check,
  X,
  AlertCircle,
  Loader2,
  RefreshCw,
  ChevronRight,
  Shield,
  Sliders,
  Copy,
  ExternalLink,
  BookOpen,
  Key,
  Disc,
  Headphones,
  ChevronDown,
  ChevronUp,
  Radio,
  CheckSquare,
  Cloud,
  Users,
  Kanban,
  MessageSquare,
  FileCode,
  Home,
  Lightbulb,
  HeartPulse,
  Activity,
  HelpCircle,
  Info,
  Sparkles,
  Trash2,
} from "lucide-react";

const GOOGLE_PROVIDERS = [
  "google_calendar",
  "google_drive",
  "gmail",
  "google_tasks",
  "google_contacts",
  "google_fit",
];

const ALL_GOOGLE_SCOPES_STRING =
  "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.sleep.read";

const GOOGLE_PROVIDER_SCOPES: Record<string, string> = {
  google_calendar: "https://www.googleapis.com/auth/calendar.events",
  google_tasks: "https://www.googleapis.com/auth/tasks",
  gmail: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
  google_drive: "https://www.googleapis.com/auth/drive.readonly",
  google_contacts: "https://www.googleapis.com/auth/contacts.readonly",
  google_fit: "https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.sleep.read",
};

interface ConnectedProvider {
  providerId: string;
  displayName: string;
  category: string;
  description: string;
  iconName: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  hasToken?: boolean;
  connectedAccount: string;
  lastSuccessfulSync?: string;
  humanPermissions: string[];
  preferences?: Record<string, string>;
}

interface AvailableProvider {
  providerId: string;
  displayName: string;
  category: string;
  description: string;
  iconName: string;
  humanPermissions: string[];
  authType: string;
}

export default function ConnectionsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState<ConnectedProvider[]>([]);
  const [available, setAvailable] = useState<AvailableProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<ConnectedProvider | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Default preferences state for modal
  const [modalPrefs, setModalPrefs] = useState<Record<string, string>>({});
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [clientIdInput, setClientIdInput] = useState("");
  const [clientSecretInput, setClientSecretInput] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [activeSpotifyTab, setActiveSpotifyTab] = useState<"settings" | "guide">("settings");
  const [activeGoogleTab, setActiveGoogleTab] = useState<"settings" | "guide">("settings");
  const [applyToAllGoogle, setApplyToAllGoogle] = useState(true);
  const [copiedScopes, setCopiedScopes] = useState<string | null>(null);
  const [showGoogleSuiteGuideModal, setShowGoogleSuiteGuideModal] = useState(false);
  const [globalGoogleTokenInput, setGlobalGoogleTokenInput] = useState("");
  const [globalSaving, setGlobalSaving] = useState(false);
  const [copiedUri, setCopiedUri] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [waitingForAuth, setWaitingForAuth] = useState(false);
  const [authorizingGoogle, setAuthorizingGoogle] = useState(false);
  const [waitingForGoogleAuth, setWaitingForGoogleAuth] = useState(false);
  const [showAdvancedToken, setShowAdvancedToken] = useState(false);
  const [showGoogleSetupDetails, setShowGoogleSetupDetails] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    hasToken?: boolean;
    message: string;
    devices?: any[];
  } | null>(null);

  const handleCopyScopes = (scopes: string, label: string) => {
    navigator.clipboard.writeText(scopes);
    setCopiedScopes(label);
    setTimeout(() => setCopiedScopes(null), 2500);
  };

  const handleApplyGlobalGoogleToken = async () => {
    if (!globalGoogleTokenInput.trim()) return;
    try {
      setGlobalSaving(true);
      await Promise.all(
        GOOGLE_PROVIDERS.map((pid) =>
          fetch(`/api/connections/${encodeURIComponent(pid)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accessToken: globalGoogleTokenInput.trim(),
              preferences: { token: globalGoogleTokenInput.trim() },
              status: "ACTIVE",
            }),
          }).catch(() => null)
        )
      );
      setNotification({
        type: "success",
        message: "Google OAuth Access Token successfully applied across all 6 Google Workspace services!",
      });
      setShowGoogleSuiteGuideModal(false);
      setGlobalGoogleTokenInput("");
      await loadConnections();
    } catch (err: any) {
      console.error("Global token save error:", err);
      setNotification({ type: "error", message: "Failed to apply Google token." });
    } finally {
      setGlobalSaving(false);
    }
  };

  const openExternalUrl = async (url: string) => {
    if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
      try {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(url);
        return;
      } catch (e) {
        console.error("Tauri openUrl error:", e);
      }
    }
    window.open(url, "_blank");
  };

  const loadConnections = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/connections");
      if (res.ok) {
        const json = await res.json();
        const data = json.data || json;
        setConnected(data.connected || []);
        setAvailable(data.available || []);
      } else {
        throw new Error("Failed to load connections");
      }
    } catch (err: any) {
      console.error("Error loading connections:", err);
      setNotification({ type: "error", message: "Couldn't load connections. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConnections();

    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const err = urlParams.get("error");
      if (err) {
        let msg = `Authorization notice: ${err}`;
        if (err.includes("redirect_uri_mismatch") || (err.includes("redirect_uri") && !err.includes("spotify"))) {
          const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
          msg = `Google redirect_uri_mismatch: Add ${origin}/api/connections/google/callback to 'Authorized redirect URIs' in Google Cloud Console > Credentials.`;
        } else if (err.includes("access_denied")) {
          msg = "Google Error 403 (access_denied): Your Google account must be added to 'Test users' in Google Cloud Console > OAuth consent screen (Audience) while the app is in testing mode.";
        } else if (err.includes("redirect_uri") || err.includes("configuration") || err.includes("Access denied")) {
          msg = "Spotify rejected redirect URI: In your Spotify App Settings, paste http://localhost:3000/api/connections/spotify/callback, click 'Add' so it turns into a badge, then click 'Save' at the bottom.";
        }
        setNotification({ type: "error", message: msg });
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      const googleSuccess = urlParams.get("google_success") || urlParams.get("google_connected");
      if (googleSuccess) {
        setNotification({
          type: "success",
          message: "Google Workspace successfully connected! All 6 services are active.",
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  // Window focus listener: When switching back from Chrome to Tauri desktop, refresh immediately!
  useEffect(() => {
    const onFocus = () => {
      loadConnections();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Window message listener for OAuth popups
  useEffect(() => {
    const handleMsg = (event: MessageEvent) => {
      if (event.data?.type === "LIFEOS_SPOTIFY_AUTH_SUCCESS") {
        loadConnections();
        setWaitingForAuth(false);
        setAuthorizing(false);
        setNotification({ type: "success", message: "Connected to Spotify account!" });
      } else if (event.data?.type === "LIFEOS_GOOGLE_AUTH_SUCCESS") {
        loadConnections();
        setWaitingForGoogleAuth(false);
        setAuthorizingGoogle(false);
        setShowGoogleSuiteGuideModal(false);
        setNotification({
          type: "success",
          message: `Google Workspace Connected (${event.data.email || "Account"})! All 6 services are active.`,
        });
      }
    };
    window.addEventListener("message", handleMsg);
    return () => window.removeEventListener("message", handleMsg);
  }, []);

  // Poll /api/connections every 2s while waiting for browser authorization in Chrome
  useEffect(() => {
    if (!waitingForAuth) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/connections");
        if (res.ok) {
          const json = await res.json();
          const data = json.data || json;
          const spotifyConn = (data.connected || []).find((c: any) => c.providerId === "spotify");
          if (spotifyConn && spotifyConn.hasToken) {
            setConnected(data.connected || []);
            setAvailable(data.available || []);
            setSelectedProvider(spotifyConn);
            setWaitingForAuth(false);
            setAuthorizing(false);
            setNotification({
              type: "success",
              message: `Connected to Spotify account (${spotifyConn.connectedAccount})!`,
            });
          }
        }
      } catch (_) {}
    }, 2000);
    return () => clearInterval(interval);
  }, [waitingForAuth]);

  // Poll /api/connections every 2s while waiting for Google browser authorization
  useEffect(() => {
    if (!waitingForGoogleAuth) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/connections");
        if (res.ok) {
          const json = await res.json();
          const data = json.data || json;
          const googleConn = (data.connected || []).find((c: any) =>
            c.providerId === "google_calendar" || c.providerId === "google_drive" || c.providerId === "gmail"
          );
          if (googleConn && googleConn.hasToken) {
            setConnected(data.connected || []);
            setAvailable(data.available || []);
            setWaitingForGoogleAuth(false);
            setAuthorizingGoogle(false);
            setShowGoogleSuiteGuideModal(false);
            setNotification({
              type: "success",
              message: "Google Workspace Connected! All 6 Google services are now active.",
            });
          }
        }
      } catch (_) {}
    }, 2000);
    return () => clearInterval(interval);
  }, [waitingForGoogleAuth]);

  const handleAuthorizeGoogle = async () => {
    try {
      setAuthorizingGoogle(true);
      const isLocalhost =
        typeof window !== "undefined" &&
        (window.location.origin.includes("localhost") || window.location.origin.includes("127.0.0.1"));
      const origin = isLocalhost
        ? "http://localhost:3000"
        : typeof window !== "undefined" && window.location.origin.startsWith("http")
        ? window.location.origin
        : "http://localhost:3000";
      const authUrl = `${origin}/api/connections/google/authorize`;

      await openExternalUrl(authUrl);
      setWaitingForGoogleAuth(true);
    } catch (err: any) {
      console.error("Failed to launch Google auth:", err);
      setNotification({
        type: "error",
        message: "Failed to open Google authorization in browser.",
      });
      setAuthorizingGoogle(false);
    }
  };

  const handleAuthorizeSpotify = async () => {
    try {
      setAuthorizing(true);
      // Save client ID & secret first if user entered them
      if (clientIdInput.trim() || clientSecretInput.trim()) {
        await fetch("/api/connections/spotify", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preferences: {
              ...modalPrefs,
              clientId: clientIdInput.trim(),
              clientSecret: clientSecretInput.trim(),
            },
          }),
        });
      }

      const isLocalhost =
        typeof window !== "undefined" &&
        (window.location.origin.includes("localhost") || window.location.origin.includes("127.0.0.1"));
      const origin = isLocalhost
        ? "http://127.0.0.1:3000"
        : typeof window !== "undefined" && window.location.origin.startsWith("http")
        ? window.location.origin
        : "http://127.0.0.1:3000";
      const authUrl = `${origin}/api/connections/spotify/authorize`;

      await openExternalUrl(authUrl);
      setWaitingForAuth(true);
    } catch (err: any) {
      console.error("Failed to launch Spotify auth:", err);
      setNotification({
        type: "error",
        message: "Failed to open Spotify authorization in Chrome.",
      });
      setAuthorizing(false);
    }
  };

  const handleConnect = async (providerId: string) => {
    if (providerId === "spotify") {
      const existing = connected.find((c) => c.providerId === "spotify");
      if (existing) {
        openManageModal(existing);
      } else {
        const prov = available.find((p) => p.providerId === "spotify");
        openManageModal({
          providerId: "spotify",
          displayName: prov?.displayName || "Spotify",
          category: prov?.category || "Wellness",
          description: prov?.description || "Control music playback and streaming through Spotify.",
          iconName: "Music",
          status: "ACTIVE",
          hasToken: false,
          connectedAccount: "Not connected yet",
          humanPermissions: prov?.humanPermissions || [
            "Control playback on your active devices",
            "Search catalog tracks and artists",
          ],
          preferences: (prov as any)?.savedPreferences || {},
        });
      }
      return;
    }

    try {
      setActionLoading(providerId);
      const res = await fetch(`/api/connections/${encodeURIComponent(providerId)}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || "Failed to connect");
      }

      const prov = available.find((p) => p.providerId === providerId);
      setNotification({
        type: "success",
        message: `${prov?.displayName || providerId} connected. Aven can now interact with this service.`,
      });
      await loadConnections();

      const autoOpenModalProviders = [
        "github",
        "notion",
        "obsidian_vault",
        "google_calendar",
        "google_drive",
        "gmail",
        "google_tasks",
        "google_contacts",
        "google_fit",
      ];
      if (autoOpenModalProviders.includes(providerId)) {
        setTimeout(async () => {
          try {
            const cRes = await fetch("/api/connections");
            if (cRes.ok) {
              const cJson = await cRes.json();
              const cData = cJson.data || cJson;
              const connItem = (cData.connected || []).find((c: any) => c.providerId === providerId);
              if (connItem) {
                openManageModal(connItem);
              }
            }
          } catch (_) {}
        }, 100);
      }
    } catch (err: any) {
      console.error("Connect error:", err);
      setNotification({
        type: "error",
        message: `Couldn't connect ${providerId}. Please try again.`,
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async (providerId: string) => {
    try {
      setActionLoading(providerId);
      const res = await fetch(`/api/connections/${encodeURIComponent(providerId)}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to disconnect");

      setSelectedProvider(null);
      setNotification({
        type: "success",
        message: `Disconnected successfully.`,
      });
      await loadConnections();
    } catch (err: any) {
      console.error("Disconnect error:", err);
      setNotification({
        type: "error",
        message: "Failed to disconnect. Please try again.",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      setActionLoading("google_workspace");
      await Promise.all(
        GOOGLE_PROVIDERS.map((id) =>
          fetch(`/api/connections/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null)
        )
      );
      setNotification({
        type: "success",
        message: "Google Workspace disconnected successfully.",
      });
      await loadConnections();
    } catch (err: any) {
      console.error("Disconnect Google error:", err);
      setNotification({
        type: "error",
        message: "Failed to disconnect Google Workspace. Please try again.",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleTestProvider = async (providerId: string) => {
    try {
      setTestingConnection(true);
      setTestResult(null);
      const res = await fetch(`/api/connections/${encodeURIComponent(providerId)}/test`, {
        method: "POST",
      });
      const json = await res.json();
      setTestResult(json.data || json);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || "Failed to test provider",
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleCopyUri = (uri: string) => {
    navigator.clipboard.writeText(uri);
    setCopiedUri(uri);
    setTimeout(() => setCopiedUri(null), 2500);
  };

  const handleSavePreferences = async (providerId: string) => {
    try {
      setActionLoading(providerId);
      const isGoogle = GOOGLE_PROVIDERS.includes(providerId);
      const preferencesToSave = {
        ...modalPrefs,
        ...(providerId === "spotify"
          ? {
              clientId: clientIdInput.trim(),
              clientSecret: clientSecretInput.trim(),
            }
          : {}),
        ...(providerId === "github" && tokenInput.trim() ? { token: tokenInput.trim() } : {}),
        ...(providerId === "notion" && tokenInput.trim() ? { secret: tokenInput.trim(), token: tokenInput.trim() } : {}),
        ...(isGoogle && tokenInput.trim() ? { token: tokenInput.trim() } : {}),
      };
      const payload: any = { preferences: preferencesToSave };
      if (tokenInput.trim()) {
        payload.accessToken = tokenInput.trim();
      }
      const res = await fetch(`/api/connections/${encodeURIComponent(providerId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to update preferences");

      if (isGoogle && applyToAllGoogle && tokenInput.trim()) {
        const otherGoogleProviders = GOOGLE_PROVIDERS.filter((p) => p !== providerId);
        await Promise.all(
          otherGoogleProviders.map((pid) =>
            fetch(`/api/connections/${encodeURIComponent(pid)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                accessToken: tokenInput.trim(),
                preferences: { token: tokenInput.trim() },
                status: "ACTIVE",
              }),
            }).catch(() => null)
          )
        );
      }

      setNotification({
        type: "success",
        message: isGoogle && applyToAllGoogle && tokenInput.trim()
          ? "Google OAuth credentials saved and applied across all Google Workspace services!"
          : "Settings and credentials saved successfully.",
      });
      setSelectedProvider(null);
      setTokenInput("");
      setTestResult(null);
      await loadConnections();
    } catch (err: any) {
      console.error("Update error:", err);
      setNotification({
        type: "error",
        message: "Failed to save settings.",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const openManageModal = (provider: ConnectedProvider) => {
    setSelectedProvider(provider);
    setModalPrefs(provider.preferences || {});
    setTokenInput(provider.preferences?.token || provider.preferences?.accessToken || provider.preferences?.secret || "");
    setClientIdInput(provider.preferences?.clientId || "");
    setClientSecretInput(provider.preferences?.clientSecret || "");
    setTestResult(null);
    setActiveSpotifyTab("settings");
    setActiveGoogleTab("settings");
    setApplyToAllGoogle(true);
  };

  const renderProviderIcon = (iconName: string, className = "w-5 h-5") => {
    switch (iconName) {
      case "Calendar":
        return <Calendar className={className} />;
      case "CheckSquare":
        return <CheckSquare className={className} />;
      case "Music":
        return <Music className={className} />;
      case "FolderGit2":
        return <FolderGit2 className={className} />;
      case "Mail":
        return <Mail className={className} />;
      case "Cloud":
        return <Cloud className={className} />;
      case "Users":
        return <Users className={className} />;
      case "Kanban":
        return <Kanban className={className} />;
      case "MessageSquare":
        return <MessageSquare className={className} />;
      case "BookOpen":
        return <BookOpen className={className} />;
      case "FileCode":
        return <FileCode className={className} />;
      case "Home":
        return <Home className={className} />;
      case "Lightbulb":
        return <Lightbulb className={className} />;
      case "HeartPulse":
        return <HeartPulse className={className} />;
      case "Activity":
        return <Activity className={className} />;
      case "HardDrive":
        return <HardDrive className={className} />;
      case "Globe":
        return <Globe className={className} />;
      default:
        return <Plug className={className} />;
    }
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 max-w-4xl mx-auto w-full pt-8 px-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.push("/settings")}
          className="p-2 rounded-xl bg-[#1F2023] border border-[#2A2B2F] text-gray-400 hover:text-white hover:border-[#3E424B] transition-colors"
          title="Back to Settings"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Connections</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Connect the services Aven can use on your behalf.
          </p>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`mb-6 p-4 rounded-xl border flex items-center justify-between animate-in fade-in duration-200 ${
            notification.type === "success"
              ? "bg-[#1F2023] border-[#2A2B2F] text-[#FFFDFC]"
              : "bg-[#1F2023] border-[#E8414A]/40 text-[#FFFDFC]"
          }`}
        >
          <div className="flex items-center gap-3">
            {notification.type === "success" ? (
              <Check className="w-5 h-5 text-[#E8414A] flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-[#E8414A] flex-shrink-0" />
            )}
            <p className="text-sm font-medium">{notification.message}</p>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin text-[#E8414A] mb-3" />
          <p className="text-sm">Loading connections...</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* GOOGLE WORKSPACE CARD */}
          {(() => {
            const googleConnectedList = connected.filter((c) => GOOGLE_PROVIDERS.includes(c.providerId));
            const isGoogleConnected = googleConnectedList.length > 0 && googleConnectedList.some((c) => c.hasToken);
            const activeGoogleCount = googleConnectedList.filter((c) => c.hasToken && c.status === "ACTIVE").length;
            const primaryGoogleAccount =
              googleConnectedList.find((c) => c.connectedAccount && c.connectedAccount !== "Connected Account" && c.connectedAccount !== "Google Contacts")?.connectedAccount ||
              "Connected Account";

            return (
              <div className="p-5 bg-[#1F2023] border border-[#2A2B2F] hover:border-[#383A40] rounded-2xl flex flex-col gap-4 shadow-lg shadow-black/20 transition-all">
                {isGoogleConnected ? (
                  // VERIFIED CONNECTED STATE: Minimal, UX-friendly, Zero Jargon
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start sm:items-center gap-3.5">
                        <div className="p-2.5 rounded-xl bg-[#E8414A]/10 border border-[#E8414A]/25 text-[#E8414A] shrink-0">
                          <Globe className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-[#FFFDFC]">Google Workspace</h3>
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#ECE7E3] bg-[#161618] border border-[#2A2B2F] px-2 py-0.5 rounded-full">
                              <Check className="w-3 h-3 text-[#E8414A]" />
                              Connected ({activeGoogleCount}/6 Active)
                            </span>
                          </div>
                          <p className="text-xs text-[#ECE7E3] font-mono mt-1">
                            {primaryGoogleAccount}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleAuthorizeGoogle}
                          disabled={authorizingGoogle || waitingForGoogleAuth}
                          className="px-3.5 py-2 bg-[#26282E] hover:bg-[#30333A] border border-[#3E424B] text-[#ECE7E3] hover:text-[#FFFDFC] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${authorizingGoogle || waitingForGoogleAuth ? "animate-spin" : ""}`} />
                          <span>Re-sync</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleDisconnectGoogle}
                          disabled={actionLoading === "google_workspace"}
                          className="px-3.5 py-2 bg-[#26282E] hover:bg-[#30333A] border border-[#3E424B] text-[#9BA1A6] hover:text-[#E8414A] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Disconnect</span>
                        </button>
                      </div>
                    </div>

                    {/* Active Services Pills */}
                    <div className="pt-3 border-t border-[#26272B] flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-[#9BA1A6] mr-1">Active channels:</span>
                      {[
                        { id: "google_calendar", label: "Calendar" },
                        { id: "google_drive", label: "Drive" },
                        { id: "gmail", label: "Gmail" },
                        { id: "google_tasks", label: "Tasks" },
                        { id: "google_contacts", label: "Contacts" },
                        { id: "google_fit", label: "Fit" },
                      ].map((srv) => {
                        const isSrvActive = googleConnectedList.some(
                          (c) => c.providerId === srv.id && c.hasToken && c.status === "ACTIVE"
                        );
                        return (
                          <span
                            key={srv.id}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                              isSrvActive
                                ? "bg-[#161618] border border-[#2A2B2F] text-[#ECE7E3]"
                                : "bg-[#161618]/50 border border-[#2A2B2F]/40 text-[#9BA1A6]"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isSrvActive ? "bg-[#E8414A]" : "bg-[#9BA1A6]/40"
                              }`}
                            />
                            {srv.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  // NOT CONNECTED STATE: Minimal, Clean, One-Click
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start sm:items-center gap-3.5">
                        <div className="p-2.5 rounded-xl bg-[#E8414A]/10 border border-[#E8414A]/25 text-[#E8414A] shrink-0">
                          <Globe className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-[#FFFDFC]">Google Workspace</h3>
                            <span className="text-[10px] font-semibold text-[#E8414A] bg-[#E8414A]/10 border border-[#E8414A]/30 px-2 py-0.5 rounded-full">
                              All 6 Services
                            </span>
                          </div>
                          <p className="text-xs text-[#9BA1A6] mt-1 leading-relaxed">
                            Connect Calendar, Drive, Gmail, Tasks, Contacts &amp; Fit for cross-service intelligence.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={handleAuthorizeGoogle}
                          disabled={authorizingGoogle || waitingForGoogleAuth}
                          className="px-4 py-2.5 bg-[#E8414A] hover:bg-[#D62C35] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-[#E8414A]/20 whitespace-nowrap cursor-pointer"
                        >
                          {authorizingGoogle || waitingForGoogleAuth ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Connecting...</span>
                            </>
                          ) : (
                            <>
                              <Globe className="w-3.5 h-3.5" />
                              <span>Connect Google</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowGoogleSuiteGuideModal(true)}
                          className="px-3.5 py-2.5 bg-[#26282E] hover:bg-[#30333A] border border-[#3E424B] text-[#ECE7E3] hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all whitespace-nowrap cursor-pointer"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-[#9BA1A6]" />
                          <span>Playground Guide</span>
                        </button>
                      </div>
                    </div>

                    {/* Subtle Collapsible Configuration Toggle */}
                    <div className="pt-2 border-t border-[#26272B]/60 flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => setShowGoogleSetupDetails(!showGoogleSetupDetails)}
                        className="flex items-center gap-1.5 text-[11px] text-[#9BA1A6] hover:text-[#ECE7E3] transition-colors cursor-pointer self-start font-medium"
                      >
                        <span>{showGoogleSetupDetails ? "Hide configuration details" : "Show configuration details"}</span>
                        <ChevronDown className={`w-3 h-3 transition-transform ${showGoogleSetupDetails ? "rotate-180" : ""}`} />
                      </button>

                      {showGoogleSetupDetails && (
                        <div className="pt-2 flex flex-col gap-2 text-xs">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-[#9BA1A6] text-[11px]">
                              <span className="font-semibold text-[#ECE7E3]">Authorized Redirect URI:</span>
                              <code className="px-2 py-0.5 bg-[#161618] border border-[#2A2B2F] rounded text-[#ECE7E3] font-mono select-all">
                                {typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/connections/google/callback
                              </code>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
                                  const uri = `${origin}/api/connections/google/callback`;
                                  navigator.clipboard.writeText(uri);
                                  setCopiedUri(uri);
                                  setTimeout(() => setCopiedUri(null), 2500);
                                }}
                                className="text-[11px] text-[#E8414A] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                              >
                                <Copy className="w-3 h-3" />
                                <span>{copiedUri ? "Copied Redirect URI!" : "Copy Redirect URI"}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openExternalUrl("https://console.cloud.google.com/apis/credentials")}
                                className="text-[11px] text-[#9BA1A6] hover:text-[#ECE7E3] flex items-center gap-1 font-medium cursor-pointer"
                              >
                                <span>Credentials</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* SECTION 1: CONNECTED */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">
                Connected ({connected.length})
              </h2>
            </div>

            {connected.length === 0 ? (
              <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-8 text-center text-gray-400">
                <Plug className="w-8 h-8 mx-auto mb-2 text-gray-500" />
                <p className="text-sm font-medium text-gray-300">No active connections</p>
                <p className="text-xs text-gray-500 mt-1">
                  Connect services below so Aven can check calendars, manage tasks, or control playback.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {connected.map((item) => (
                  <div
                    key={item.providerId}
                    className="bg-[#1F2023] border border-[#2A2B2F] hover:border-[#383A40] rounded-2xl p-5 transition-all shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Row: Icon + Title + Status */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-[#26282E] text-[#ECE7E3] border border-[#3E424B]">
                            {renderProviderIcon(item.iconName)}
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-white">{item.displayName}</h3>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#E8414A]" />
                              <span className="text-[11px] font-medium text-[#ECE7E3]">Connected</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Description & Account */}
                      <p className="text-xs text-[#9BA1A6] line-clamp-2 mb-3">
                        {item.description}
                      </p>

                      <div className="bg-[#18191B] border border-[#26272B] rounded-xl px-3 py-2 mb-3">
                        <p className="text-[11px] text-gray-500 font-medium">Account</p>
                        <p className="text-xs text-[#ECE7E3] font-semibold truncate">
                          {item.connectedAccount}
                        </p>
                      </div>

                      {item.providerId === "spotify" && (
                        <div className="mb-4 px-3 py-1.5 rounded-xl border flex items-center justify-between text-[11px] font-medium bg-[#18191B] border-[#26272B]">
                          <span className={item.hasToken ? "text-[#ECE7E3]" : "text-[#9BA1A6]"}>
                            {item.hasToken ? "Live Playback Ready" : "Token Needed for Playback"}
                          </span>
                          <span className={`w-2 h-2 rounded-full ${item.hasToken ? "bg-[#E8414A]" : "bg-[#687076]"}`} />
                        </div>
                      )}
                    </div>

                    {/* Footer Row */}
                    <div className="pt-3 border-t border-[#26272B] flex items-center justify-between">
                      <span className="text-[11px] text-gray-500">
                        {item.lastSuccessfulSync
                          ? `Synced ${new Date(item.lastSuccessfulSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                          : "Active"}
                      </span>
                      <button
                        onClick={() => openManageModal(item)}
                        className="px-3.5 py-1.5 bg-[#26282E] hover:bg-[#30333A] border border-[#3E424B] rounded-xl text-xs font-semibold text-gray-200 transition-colors"
                      >
                        Manage
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 2: AVAILABLE */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">
                Available to Connect ({available.length})
              </h2>
            </div>

            {available.length === 0 ? (
              <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 text-center text-gray-400 text-xs">
                All supported services are currently connected.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {available.map((item) => (
                  <div
                    key={item.providerId}
                    className="bg-[#1F2023] border border-[#2A2B2F] hover:border-[#383A40] rounded-2xl p-5 transition-all shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Row: Icon + Title */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2.5 rounded-xl bg-[#26282E] text-gray-400 border border-[#3E424B]">
                          {renderProviderIcon(item.iconName)}
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-white">{item.displayName}</h3>
                          <span className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">
                            {item.category}
                          </span>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-gray-400 mb-3 leading-relaxed">
                        {item.description}
                      </p>

                      {/* Permissions preview */}
                      <div className="space-y-1 mb-4">
                        {item.humanPermissions.slice(0, 2).map((perm, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-[11px] text-gray-400">
                            <Check className="w-3 h-3 text-gray-500 flex-shrink-0" />
                            <span>{perm}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Connect Button */}
                    <div className="pt-3 border-t border-[#26272B] flex justify-end">
                      <button
                        onClick={() => handleConnect(item.providerId)}
                        disabled={actionLoading === item.providerId}
                        className="px-4 py-2 bg-[#E8414A]/10 hover:bg-[#E8414A]/20 border border-[#E8414A]/30 text-[#E8414A] rounded-xl text-xs font-bold tracking-wide transition-colors flex items-center gap-2 disabled:opacity-50"
                      >
                        {actionLoading === item.providerId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plug size={14} />
                        )}
                        Connect
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MANAGE MODAL */}
      {selectedProvider && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-[#26282E] text-[#ECE7E3] border border-[#3E424B]">
                  {renderProviderIcon(selectedProvider.iconName, "w-6 h-6")}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {selectedProvider.displayName}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E8414A]" />
                    <span className="text-xs font-medium text-[#ECE7E3]">Connected</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedProvider(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Permissions list */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                Aven can:
              </p>
              <div className="bg-[#18191B] border border-[#26272B] rounded-xl p-3.5 space-y-2">
                {selectedProvider.humanPermissions.map((perm, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 text-xs text-gray-300">
                    <Check className="w-3.5 h-3.5 text-[#E8414A] mt-0.5 flex-shrink-0" />
                    <span>{perm}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Connected Account */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                Connected Account
              </p>
              <div className="bg-[#18191B] border border-[#26272B] rounded-xl px-3.5 py-2.5 text-xs text-gray-200 font-mono">
                {selectedProvider.connectedAccount}
              </div>
            </div>

            {/* Provider Specific Preferences */}
            {selectedProvider.providerId === "github" && (
              <div className="space-y-4">
                <div className="p-4 bg-[#18191B] border border-[#26272B] rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <Key className="w-4 h-4 text-[#ECE7E3]" />
                      GitHub Personal Access Token (PAT)
                    </span>
                    <button
                      type="button"
                      onClick={() => openExternalUrl("https://github.com/settings/tokens")}
                      className="text-[11px] text-[#ECE7E3] hover:text-[#E8414A] hover:underline flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <span>Create Token on GitHub</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Enter a Personal Access Token with <code>repo</code> and <code>read:user</code> permissions so Aven can inspect pull requests, search code, and create issues.
                  </p>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Personal Access Token
                    </label>
                    <div className="relative">
                      <input
                        type={showToken ? "text" : "password"}
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        className="w-full bg-[#121315] border border-[#26272B] text-gray-200 text-xs rounded-xl px-3.5 py-2.5 pr-16 focus:outline-none focus:border-[#E8414A] font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400 hover:text-white px-1.5 py-0.5 rounded transition-colors"
                      >
                        {showToken ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Default Repository or Org (Optional)
                    </label>
                    <input
                      type="text"
                      value={modalPrefs.repo || ""}
                      onChange={(e) => setModalPrefs({ ...modalPrefs, repo: e.target.value })}
                      placeholder="e.g. username/repo or life-os"
                      className="w-full bg-[#121315] border border-[#26272B] text-gray-200 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#E8414A] font-mono"
                    />
                  </div>
                  <div className="pt-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleTestProvider("github")}
                      disabled={testingConnection}
                      className="px-3.5 py-2 bg-[#26282E] hover:bg-[#30333A] border border-[#3E424B] rounded-xl text-xs font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      {testingConnection ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      <span>Test Connection</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {selectedProvider.providerId === "notion" && (
              <div className="space-y-4">
                <div className="p-4 bg-[#18191B] border border-[#26272B] rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <Key className="w-4 h-4 text-[#ECE7E3]" />
                      Notion Internal Integration Secret
                    </span>
                    <button
                      type="button"
                      onClick={() => openExternalUrl("https://www.notion.so/my-integrations")}
                      className="text-[11px] text-[#ECE7E3] hover:text-[#E8414A] hover:underline flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <span>Create Integration</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Create an internal integration in Notion and paste your secret token. Connect your integration to the workspace pages you want Aven to search and update.
                  </p>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Integration Secret
                    </label>
                    <div className="relative">
                      <input
                        type={showToken ? "text" : "password"}
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
                        placeholder="secret_xxxxxxxxxxxxxxxxxxxx or ntn_..."
                        className="w-full bg-[#121315] border border-[#26272B] text-gray-200 text-xs rounded-xl px-3.5 py-2.5 pr-16 focus:outline-none focus:border-[#E8414A] font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400 hover:text-white px-1.5 py-0.5 rounded transition-colors"
                      >
                        {showToken ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Default Database ID (Optional)
                    </label>
                    <input
                      type="text"
                      value={modalPrefs.databaseId || ""}
                      onChange={(e) => setModalPrefs({ ...modalPrefs, databaseId: e.target.value })}
                      placeholder="e.g. 32-character Notion database UUID"
                      className="w-full bg-[#121315] border border-[#26272B] text-gray-200 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#E8414A] font-mono"
                    />
                  </div>
                  <div className="pt-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleTestProvider("notion")}
                      disabled={testingConnection}
                      className="px-3.5 py-2 bg-[#26282E] hover:bg-[#30333A] border border-[#3E424B] rounded-xl text-xs font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      {testingConnection ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      <span>Test Connection</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {selectedProvider.providerId === "obsidian_vault" && (
              <div className="space-y-4">
                <div className="p-4 bg-[#18191B] border border-[#26272B] rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-[#ECE7E3]" />
                      Local Obsidian Vault Directory
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Set the folder path on your computer where your Obsidian vault is stored. Aven can search your notes, read knowledge graph entries, and create new notes in the vault.
                  </p>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Vault Path on Disk
                    </label>
                    <input
                      type="text"
                      value={modalPrefs.vaultPath || ""}
                      onChange={(e) => setModalPrefs({ ...modalPrefs, vaultPath: e.target.value })}
                      placeholder="e.g. C:\Users\HP\Documents\Obsidian"
                      className="w-full bg-[#121315] border border-[#26272B] text-gray-200 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#E8414A] font-mono"
                    />
                  </div>
                  <div className="pt-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleTestProvider("obsidian_vault")}
                      disabled={testingConnection}
                      className="px-3.5 py-2 bg-[#26282E] hover:bg-[#30333A] border border-[#3E424B] rounded-xl text-xs font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      {testingConnection ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      <span>Verify Vault Path</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {GOOGLE_PROVIDERS.includes(selectedProvider.providerId) && (
              <div className="space-y-4">
                {/* Modal Tabs for Google Workspace */}
                <div className="flex items-center gap-2 p-1 bg-[#18191B] border border-[#26272B] rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setActiveGoogleTab("settings")}
                    className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      activeGoogleTab === "settings"
                        ? "bg-[#26282E] text-white shadow-sm border border-[#3E424B]"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <Key className="w-3.5 h-3.5 text-[#ECE7E3]" />
                    <span>Connection &amp; Access Token</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveGoogleTab("guide")}
                    className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      activeGoogleTab === "guide"
                        ? "bg-[#26282E] text-white shadow-sm border border-[#3E424B]"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5 text-[#9BA1A6]" />
                    <span className="flex items-center gap-1.5">
                      OAuth Playground Guide
                      <span className="px-1.5 py-0.5 bg-[#E8414A]/10 text-[#E8414A] border border-[#E8414A]/30 text-[10px] rounded font-bold">
                        What to Tick
                      </span>
                    </span>
                  </button>
                </div>

                {/* TAB 1: SETTINGS & ACCESS TOKEN */}
                {activeGoogleTab === "settings" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    {/* 1-CLICK INSTANT GOOGLE OAUTH CARD */}
                    <div className="p-4 bg-[#18191B] border border-[#2A2B2F] hover:border-[#383A40] rounded-xl space-y-3 shadow-lg shadow-black/20 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#E8414A] animate-pulse" />
                          <span className="text-xs font-bold text-[#FFFDFC]">Instant 1-Click OAuth</span>
                          <span className="text-[10px] font-semibold text-[#E8414A] bg-[#E8414A]/10 border border-[#E8414A]/30 px-2 py-0.5 rounded-full">
                            Recommended
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-[#ECE7E3] leading-relaxed">
                        Sign in directly with your Google account. Automatically activates and permanently connects <strong>Google Calendar, Drive, Contacts, Gmail, Tasks &amp; Fit</strong> simultaneously.
                      </p>
                      <button
                        type="button"
                        onClick={handleAuthorizeGoogle}
                        disabled={authorizingGoogle || waitingForGoogleAuth}
                        className="w-full py-2.5 px-4 bg-[#E8414A] hover:bg-[#D62C35] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-[#E8414A]/20 cursor-pointer"
                      >
                        {authorizingGoogle || waitingForGoogleAuth ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Waiting for Google authentication in browser...</span>
                          </>
                        ) : (
                          <>
                            <Globe className="w-4 h-4" />
                            <span>Sign In with Google (1-Click)</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Authorized Redirect URI Helper Box */}
                    <div className="p-3 bg-[#121315] border border-[#26272B] rounded-xl text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-wider">
                          Authorized Redirect URI
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
                            const uri = `${origin}/api/connections/google/callback`;
                            navigator.clipboard.writeText(uri);
                            setCopiedUri(uri);
                            setTimeout(() => setCopiedUri(null), 2500);
                          }}
                          className="text-[10px] text-[#E8414A] hover:underline flex items-center gap-1 font-medium cursor-pointer"
                        >
                          <Copy className="w-2.5 h-2.5" />
                          <span>{copiedUri ? "Copied URI!" : "Copy URI"}</span>
                        </button>
                      </div>
                      <div className="px-2.5 py-1.5 bg-[#161618] border border-[#2A2B2F] rounded-lg font-mono text-[11px] text-[#ECE7E3] break-all select-all">
                        {typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/connections/google/callback
                      </div>
                      <p className="text-[10.5px] text-[#9BA1A6] leading-relaxed">
                        If Google shows <em>&ldquo;Error 400: redirect_uri_mismatch&rdquo;</em>, add this exact URI under <strong>Authorized redirect URIs</strong> in your OAuth Client ID in{" "}
                        <button
                          type="button"
                          onClick={() => openExternalUrl("https://console.cloud.google.com/apis/credentials")}
                          className="text-[#FFFDFC] underline hover:text-[#E8414A] cursor-pointer inline-flex items-center gap-0.5"
                        >
                          Google Cloud Console
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>.
                      </p>
                      <p className="text-[10.5px] text-[#9BA1A6] leading-relaxed pt-1 border-t border-[#26272B]/60">
                        If Google shows <em>&ldquo;Error 403: access_denied (Life OS has not completed verification)&rdquo;</em>, add your email under <strong>Test users</strong> in{" "}
                        <button
                          type="button"
                          onClick={() => openExternalUrl("https://console.cloud.google.com/apis/credentials/consent")}
                          className="text-[#FFFDFC] underline hover:text-[#E8414A] cursor-pointer inline-flex items-center gap-0.5"
                        >
                          OAuth Consent Screen &rarr; Test Users
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>.
                      </p>
                    </div>

                    <div className="flex items-center gap-3 my-1 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
                      <div className="h-px bg-[#26272B] flex-1" />
                      <span>Or Connect with Manual Access Token</span>
                      <div className="h-px bg-[#26272B] flex-1" />
                    </div>

                    <div className="p-4 bg-[#18191B] border border-[#26272B] rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-2">
                          <Shield className="w-4 h-4 text-[#E8414A]" />
                          Google Workspace Channel &bull; {selectedProvider.displayName}
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveGoogleTab("guide")}
                          className="text-[11px] text-[#ECE7E3] hover:text-[#E8414A] hover:underline flex items-center gap-1 font-medium cursor-pointer"
                        >
                          <BookOpen className="w-3 h-3 text-[#9BA1A6]" />
                          <span>View Setup Guide</span>
                        </button>
                      </div>
                      <p className="text-[11px] text-[#9BA1A6] leading-relaxed">
                        Alternatively, paste a Google OAuth 2.0 Access Token from OAuth Playground. One token connects all your Google services simultaneously.
                      </p>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                            OAuth Access Token (starts with ya29...)
                          </label>
                          <button
                            type="button"
                            onClick={() => openExternalUrl("https://developers.google.com/oauthplayground")}
                            className="text-[10px] text-[#ECE7E3] hover:text-[#E8414A] hover:underline flex items-center gap-1 font-medium cursor-pointer"
                          >
                            <span>Open OAuth Playground</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        </div>
                        <div className="relative">
                          <input
                            type={showToken ? "text" : "password"}
                            value={tokenInput}
                            onChange={(e) => setTokenInput(e.target.value)}
                            placeholder="ya29.a0Ac_Vb8..."
                            className="w-full bg-[#121315] border border-[#26272B] text-gray-200 text-xs rounded-xl px-3.5 py-2.5 pr-16 focus:outline-none focus:border-[#E8414A] font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setShowToken(!showToken)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400 hover:text-white px-1.5 py-0.5 rounded transition-colors"
                          >
                            {showToken ? "Hide" : "Show"}
                          </button>
                        </div>
                      </div>

                      {/* Apply to All Google Services Checkbox */}
                      <label className="flex items-start gap-2.5 p-2.5 bg-[#121315] border border-[#26272B] rounded-xl cursor-pointer hover:border-[#383A40] transition-colors">
                        <input
                          type="checkbox"
                          checked={applyToAllGoogle}
                          onChange={(e) => setApplyToAllGoogle(e.target.checked)}
                          className="mt-0.5 rounded border-gray-700 accent-[#E8414A] focus:ring-0 focus:ring-offset-0 bg-[#1F2023]"
                        />
                        <div className="text-left">
                          <span className="text-[11px] font-semibold text-gray-200 block">
                            Apply this token to all 6 Google services
                          </span>
                          <span className="text-[10px] text-gray-500 block">
                            Syncs across Calendar, Drive, Gmail, Tasks, Contacts &amp; Fit so you only generate credentials once.
                          </span>
                        </div>
                      </label>

                      {/* Provider-Specific Options */}
                      {selectedProvider.providerId === "google_calendar" && (
                        <div className="pt-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                            Default Calendar View
                          </label>
                          <select
                            value={modalPrefs.defaultCalendar || "Personal"}
                            onChange={(e) =>
                              setModalPrefs({ ...modalPrefs, defaultCalendar: e.target.value })
                            }
                            className="w-full bg-[#121315] border border-[#26272B] text-gray-200 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#E8414A]"
                          >
                            <option value="Personal">Personal</option>
                            <option value="Work">Work</option>
                            <option value="Primary">Primary</option>
                          </select>
                        </div>
                      )}

                      <div className="pt-2 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => handleTestProvider(selectedProvider.providerId)}
                          disabled={testingConnection}
                          className="px-3.5 py-2 bg-[#26282E] hover:bg-[#30333A] border border-[#3E424B] rounded-xl text-xs font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          {testingConnection ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E8414A]" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          <span>Test Channel &amp; Verify API</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveGoogleTab("guide")}
                          className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <span>Need a token? Follow the guide</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: STEP-BY-STEP OAUTH PLAYGROUND GUIDE */}
                {activeGoogleTab === "guide" && (
                  <div className="space-y-4 text-xs text-gray-300 animate-in fade-in duration-200">
                    {/* Header Action */}
                    <div className="p-3.5 bg-[#18191B] border border-[#2A2B2F] rounded-xl flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-white text-xs">Google OAuth 2.0 Playground</h4>
                        <p className="text-[11px] text-[#9BA1A6] mt-0.5">Generate an Access Token in 60 seconds with no coding needed.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openExternalUrl("https://developers.google.com/oauthplayground")}
                        className="px-3.5 py-1.5 bg-[#26282E] hover:bg-[#30333A] border border-[#3E424B] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm shrink-0 cursor-pointer"
                      >
                        <span>Open Playground</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>

                    {/* STEP 1: WHAT TO SELECT */}
                    <div className="bg-[#18191B] border border-[#26272B] rounded-xl p-3.5 space-y-3">
                      <div className="flex items-center gap-2 font-bold text-white">
                        <span className="w-5 h-5 rounded-full bg-[#E8414A]/10 text-[#E8414A] flex items-center justify-center text-[11px] font-mono font-bold">1</span>
                        <span>Step 1: Select &amp; Authorize APIs</span>
                      </div>

                      {/* FASTEST METHOD: INPUT YOUR OWN SCOPES */}
                      <div className="p-3 bg-[#121315] border border-[#26272B] rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-[#FFFDFC] flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-[#E8414A]" />
                            Fastest Method: &ldquo;Input your own scopes&rdquo;
                          </span>
                          <span className="text-[10px] text-[#E8414A] font-semibold bg-[#E8414A]/10 border border-[#E8414A]/30 px-2 py-0.5 rounded-full">
                            Recommended
                          </span>
                        </div>
                        <p className="text-[11px] text-[#9BA1A6] leading-relaxed">
                          Don&rsquo;t hunt through hundreds of dropdowns! On OAuth Playground, scroll to the bottom of the left sidebar under <strong>Step 1</strong> to find the box labeled <strong>&ldquo;Input your own scopes&rdquo;</strong>.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleCopyScopes(ALL_GOOGLE_SCOPES_STRING, "all")}
                            className="flex-1 px-3 py-2 bg-[#E8414A]/10 hover:bg-[#E8414A]/20 border border-[#E8414A]/30 text-[#FFFDFC] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            {copiedScopes === "all" ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-[#E8414A]" />
                                <span className="text-[#E8414A]">Copied All Scopes!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-[#E8414A]" />
                                <span>Copy All Google Scopes (All 6 Apps)</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleCopyScopes(
                                GOOGLE_PROVIDER_SCOPES[selectedProvider.providerId] || ALL_GOOGLE_SCOPES_STRING,
                                "single"
                              )
                            }
                            className="px-3 py-2 bg-[#26282E] hover:bg-[#30333A] border border-[#3E424B] text-gray-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            {copiedScopes === "single" ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-[#E8414A]" />
                                <span className="text-[#E8414A]">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-gray-400" />
                                <span>Copy Just {selectedProvider.displayName} Scope</span>
                              </>
                            )}
                          </button>
                        </div>
                        <p className="text-[10px] text-gray-500">
                          Paste the copied string into the <em>&ldquo;Input your own scopes&rdquo;</em> box, then click the blue <strong>&ldquo;Authorize APIs&rdquo;</strong> button.
                        </p>
                      </div>

                      {/* MANUAL CHECKLIST: WHAT TO TICK & WHAT NOT TO TICK */}
                      <div className="space-y-2 pt-1">
                        <span className="text-[11px] font-bold text-gray-300 block">
                          Or Tick Manually From the List (What to tick &amp; What NOT to tick):
                        </span>

                        <div className="space-y-2 text-[11px]">
                          {/* Drive */}
                          <div className="p-2.5 bg-[#121315] rounded-lg border border-[#26272B] space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white flex items-center gap-1.5">
                                <Cloud className="w-3.5 h-3.5 text-[#ECE7E3]" />
                                Drive API v3
                              </span>
                              <span className="text-[10px] text-gray-400">Category in left sidebar</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[#ECE7E3] font-mono text-[10.5px]">
                              <Check className="w-3 h-3 text-[#E8414A] shrink-0" />
                              <span>Tick: https://www.googleapis.com/auth/drive.readonly</span>
                            </div>
                            <div className="text-[10px] text-gray-500">
                              &times; Do NOT tick: drive.appdata, drive.metadata, or drive.scripts (unnecessary).
                            </div>
                          </div>

                          {/* Gmail */}
                          <div className="p-2.5 bg-[#121315] rounded-lg border border-[#26272B] space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white flex items-center gap-1.5">
                                <Mail className="w-3.5 h-3.5 text-[#ECE7E3]" />
                                Gmail API v1
                              </span>
                              <span className="text-[10px] text-gray-400">Category in left sidebar</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[#ECE7E3] font-mono text-[10.5px]">
                              <Check className="w-3 h-3 text-[#E8414A] shrink-0" />
                              <span>Tick: https://www.googleapis.com/auth/gmail.readonly</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[#ECE7E3] font-mono text-[10.5px]">
                              <Check className="w-3 h-3 text-[#E8414A] shrink-0" />
                              <span>Tick: https://www.googleapis.com/auth/gmail.send</span>
                            </div>
                            <div className="text-[10px] text-gray-500">
                              &times; Do NOT tick: mail.google.com (full admin delete access is not needed).
                            </div>
                          </div>

                          {/* Calendar */}
                          <div className="p-2.5 bg-[#121315] rounded-lg border border-[#26272B] space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-[#ECE7E3]" />
                                Google Calendar API v3
                              </span>
                              <span className="text-[10px] text-gray-400">Category in left sidebar</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[#ECE7E3] font-mono text-[10.5px]">
                              <Check className="w-3 h-3 text-[#E8414A] shrink-0" />
                              <span>Tick: https://www.googleapis.com/auth/calendar.events</span>
                            </div>
                            <div className="text-[10px] text-gray-500">
                              &times; Do NOT tick: calendar.settings.readonly or calendar.addons.
                            </div>
                          </div>

                          {/* Tasks */}
                          <div className="p-2.5 bg-[#121315] rounded-lg border border-[#26272B] space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white flex items-center gap-1.5">
                                <CheckSquare className="w-3.5 h-3.5 text-[#ECE7E3]" />
                                Tasks API v1
                              </span>
                              <span className="text-[10px] text-gray-400">Category in left sidebar</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[#ECE7E3] font-mono text-[10.5px]">
                              <Check className="w-3 h-3 text-[#E8414A] shrink-0" />
                              <span>Tick: https://www.googleapis.com/auth/tasks</span>
                            </div>
                          </div>

                          {/* Contacts / People */}
                          <div className="p-2.5 bg-[#121315] rounded-lg border border-[#26272B] space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-[#ECE7E3]" />
                                People API v1 (Contacts)
                              </span>
                              <span className="text-[10px] text-gray-400">Category in left sidebar</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[#ECE7E3] font-mono text-[10.5px]">
                              <Check className="w-3 h-3 text-[#E8414A] shrink-0" />
                              <span>Tick: https://www.googleapis.com/auth/contacts.readonly</span>
                            </div>
                          </div>

                          {/* Fit */}
                          <div className="p-2.5 bg-[#121315] rounded-lg border border-[#26272B] space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white flex items-center gap-1.5">
                                <Activity className="w-3.5 h-3.5 text-[#ECE7E3]" />
                                Fitness API v1 (Google Fit)
                              </span>
                              <span className="text-[10px] text-gray-400">Category in left sidebar</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[#ECE7E3] font-mono text-[10.5px]">
                              <Check className="w-3 h-3 text-[#E8414A] shrink-0" />
                              <span>Tick: https://www.googleapis.com/auth/fitness.activity.read</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[#ECE7E3] font-mono text-[10.5px]">
                              <Check className="w-3 h-3 text-[#E8414A] shrink-0" />
                              <span>Tick: https://www.googleapis.com/auth/fitness.sleep.read</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* STEP 2: CONSENT SCREEN & UNVERIFIED APP NOTICE */}
                    <div className="bg-[#18191B] border border-[#26272B] rounded-xl p-3.5 space-y-2.5">
                      <div className="flex items-center gap-2 font-bold text-white">
                        <span className="w-5 h-5 rounded-full bg-[#E8414A]/10 text-[#E8414A] flex items-center justify-center text-[11px] font-mono font-bold">2</span>
                        <span>Step 2: Sign In &amp; Handle the Google Warning</span>
                      </div>
                      <p className="text-[11px] text-[#9BA1A6] leading-relaxed">
                        After clicking <strong>&ldquo;Authorize APIs&rdquo;</strong>, select your Google account.
                      </p>

                      <div className="p-3 bg-[#121315] border border-[#26272B] rounded-xl space-y-1.5">
                        <p className="font-bold text-[#FFFDFC] flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-[#E8414A] shrink-0" />
                          If you see &ldquo;Google hasn&rsquo;t verified this app&rdquo;:
                        </p>
                        <ol className="list-decimal list-inside space-y-1 text-[10.5px] text-[#ECE7E3]">
                          <li>This is standard for Google developer test tools (OAuth Playground).</li>
                          <li>Click the small <strong>&ldquo;Advanced&rdquo;</strong> link in the bottom-left of the warning.</li>
                          <li>Click <strong>&ldquo;Go to Google OAuth 2.0 Playground (unsafe)&rdquo;</strong>.</li>
                          <li>Check the checkboxes granting permissions, then click <strong>&ldquo;Continue&rdquo;</strong>.</li>
                        </ol>
                      </div>
                    </div>

                    {/* STEP 3: EXCHANGE CODE FOR TOKENS */}
                    <div className="bg-[#18191B] border border-[#26272B] rounded-xl p-3.5 space-y-2.5">
                      <div className="flex items-center gap-2 font-bold text-white">
                        <span className="w-5 h-5 rounded-full bg-[#E8414A]/10 text-[#E8414A] flex items-center justify-center text-[11px] font-mono font-bold">3</span>
                        <span>Step 3: Exchange Authorization Code &amp; Copy Access Token</span>
                      </div>
                      <p className="text-[11px] text-[#9BA1A6] leading-relaxed">
                        You will be redirected back to Google OAuth Playground.
                      </p>
                      <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-[#ECE7E3]">
                        <li>Look at the left sidebar under <strong>&ldquo;Step 2 Exchange authorization code for tokens&rdquo;</strong>.</li>
                        <li>Click the button: <strong>&ldquo;Exchange authorization code for tokens&rdquo;</strong>.</li>
                        <li>The fields will expand. Locate the field labeled <strong>&ldquo;Access token&rdquo;</strong> (starts with <code className="text-[#E8414A] font-mono">ya29...</code>).</li>
                        <li>Copy the entire <code className="text-[#E8414A] font-mono">ya29...</code> token string.</li>
                      </ol>
                    </div>

                    {/* STEP 4: PASTE INTO LIFEOS */}
                    <div className="bg-[#18191B] border border-[#26272B] rounded-xl p-3.5 space-y-2.5">
                      <div className="flex items-center gap-2 font-bold text-white">
                        <span className="w-5 h-5 rounded-full bg-[#E8414A]/10 text-[#E8414A] flex items-center justify-center text-[11px] font-mono font-bold">4</span>
                        <span>Step 4: Paste Token into LifeOS &amp; Save</span>
                      </div>
                      <p className="text-[11px] text-[#9BA1A6] leading-relaxed">
                        Click the button below to return to the Token tab, paste your token, ensure <strong>&ldquo;Apply to all 6 Google services&rdquo;</strong> is checked, and click <strong>&ldquo;Save Changes&rdquo;</strong>!
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveGoogleTab("settings")}
                        className="w-full py-2.5 bg-[#E8414A] hover:bg-[#D62C35] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors mt-1 cursor-pointer shadow-md shadow-[#E8414A]/20"
                      >
                        <Key className="w-3.5 h-3.5" />
                        <span>I Copied My Token &rarr; Go to Token Tab &amp; Save</span>
                      </button>
                    </div>

                    {/* EXPANDABLE: PERMANENT ACCESS NOTE */}
                    <div className="p-3 bg-[#121315] border border-[#26272B] rounded-xl text-[10.5px] text-[#9BA1A6] space-y-1">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-[#E8414A]" />
                        Note About Token Expiry:
                      </span>
                      <p>
                        Playground tokens expire after 1 hour (3600 seconds). For permanent access without re-authenticating, click the <strong>Gear icon (&gear;)</strong> in the top right of OAuth Playground, check <em>&ldquo;Use your own OAuth credentials&rdquo;</em>, and enter your Client ID &amp; Secret from Google Cloud Console.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Test Result Display for any provider */}
            {testResult && selectedProvider.providerId !== "spotify" && (
              <div
                className={`p-3 rounded-xl border text-xs leading-relaxed animate-in fade-in duration-150 ${
                  testResult.success
                    ? "bg-[#18191B] border-[#2A2B2F] text-[#FFFDFC]"
                    : "bg-[#2E1E20]/70 border-[#E8414A]/40 text-[#F9A8AC]"
                }`}
              >
                <p className="font-semibold">{testResult.message}</p>
              </div>
            )}

            {selectedProvider.providerId === "spotify" && (
              <div className="space-y-4">
                {/* Modal Tabs */}
                <div className="flex items-center gap-2 p-1 bg-[#18191B] border border-[#26272B] rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setActiveSpotifyTab("settings")}
                    className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-2 transition-all ${
                      activeSpotifyTab === "settings"
                        ? "bg-[#26282E] text-white shadow-sm border border-[#3E424B]"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Connection & Controls</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSpotifyTab("guide")}
                    className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-2 transition-all ${
                      activeSpotifyTab === "guide"
                        ? "bg-[#26282E] text-white shadow-sm border border-[#3E424B]"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Setup Guide (How-To)</span>
                  </button>
                </div>

                {/* TAB 1: SETUP GUIDE */}
                {activeSpotifyTab === "guide" && (
                  <div className="space-y-4 text-xs text-gray-300 animate-in fade-in duration-200">
                    <div className="bg-[#18191B] border border-[#26272B] rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-[#E8414A]/10 text-[#E8414A] flex items-center justify-center text-[11px] font-mono font-bold">1</span>
                          Open Spotify Developer Portal
                        </span>
                        <button
                          type="button"
                          onClick={() => openExternalUrl("https://developer.spotify.com/dashboard")}
                          className="px-2.5 py-1 bg-[#26282E] hover:bg-[#30333A] border border-[#3E424B] rounded-lg text-[11px] text-white font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span>Open Dashboard</span>
                          <ExternalLink className="w-3 h-3 text-gray-400" />
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-400 leading-relaxed">
                        Log in with your normal Spotify account (Free or Premium) and click <strong>&ldquo;Create app&rdquo;</strong>.
                      </p>
                    </div>

                    <div className="bg-[#18191B] border border-[#26272B] rounded-xl p-3.5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-[#E8414A]/10 text-[#E8414A] flex items-center justify-center text-[11px] font-mono font-bold">2</span>
                          Add Redirect URI in Spotify Dashboard
                        </span>
                        {clientIdInput.trim() ? (
                          <button
                            type="button"
                            onClick={() => openExternalUrl(`https://developer.spotify.com/dashboard/${clientIdInput.trim()}/settings`)}
                            className="px-2.5 py-1 bg-[#26282E] hover:bg-[#30333A] border border-[#3E424B] rounded-lg text-[10px] font-semibold text-[#ECE7E3] hover:text-[#E8414A] flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <span>Open App Settings</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        ) : null}
                      </div>
                      <div className="space-y-2 text-[11px]">
                        <div className="flex items-center justify-between bg-[#121315] px-3 py-2 rounded-lg">
                          <span className="text-gray-400">App name:</span>
                          <span className="font-mono text-white font-bold">LifeOS</span>
                        </div>
                        <div className="flex items-center justify-between bg-[#121315] px-3 py-2 rounded-lg">
                          <span className="text-gray-400">APIs used:</span>
                          <span className="text-white font-medium">Check Web API &amp; Web Playback SDK</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                          1. Local Development (127.0.0.1 Loopback):
                        </p>
                        <div className="flex items-center gap-2 bg-[#121315] border border-[#26272B] px-3 py-2 rounded-xl">
                          <span className="font-mono text-[11px] text-[#ECE7E3] truncate flex-1">
                            http://127.0.0.1:3000/api/connections/spotify/callback
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyUri("http://127.0.0.1:3000/api/connections/spotify/callback")}
                            className="px-2 py-1 bg-[#26282E] hover:bg-[#30333A] border border-[#3E424B] rounded-lg text-[10px] font-semibold text-white flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            {copiedUri === "http://127.0.0.1:3000/api/connections/spotify/callback" ? (
                              <>
                                <Check className="w-3 h-3 text-[#E8414A]" />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-gray-400" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>

                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider pt-1">
                          2. Production (Vercel HTTPS):
                        </p>
                        <div className="flex items-center gap-2 bg-[#121315] border border-[#26272B] px-3 py-2 rounded-xl">
                          <span className="font-mono text-[11px] text-[#ECE7E3] truncate flex-1">
                            https://life-os-gamma-ten.vercel.app/api/connections/spotify/callback
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyUri("https://life-os-gamma-ten.vercel.app/api/connections/spotify/callback")}
                            className="px-2 py-1 bg-[#26282E] hover:bg-[#30333A] border border-[#3E424B] rounded-lg text-[10px] font-semibold text-white flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            {copiedUri === "https://life-os-gamma-ten.vercel.app/api/connections/spotify/callback" ? (
                              <>
                                <Check className="w-3 h-3 text-[#E8414A]" />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-gray-400" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Important Warning Alert */}
                      <div className="p-3 bg-[#121315] border border-[#26272B] rounded-xl text-[11px] text-[#ECE7E3] space-y-1.5">
                        <p className="font-bold text-[#FFFDFC] flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-[#E8414A] shrink-0" />
                          Spotify Loopback Rule &amp; Save Requirement:
                        </p>
                        <ol className="list-decimal list-inside space-y-1 text-[10.5px] text-[#9BA1A6]">
                          <li>Spotify requires <strong>127.0.0.1</strong> instead of <strong>localhost</strong> for HTTP (or your HTTPS Vercel URL).</li>
                          <li>Paste the URI into the <em>&ldquo;Redirect URIs&rdquo;</em> input box in Spotify.</li>
                          <li>Click the <strong>&ldquo;Add&rdquo;</strong> button so it appears as a badge.</li>
                          <li>Scroll down to the bottom and click the <strong>&ldquo;Save&rdquo;</strong> button!</li>
                        </ol>
                      </div>
                    </div>

                    <div className="bg-[#18191B] border border-[#26272B] rounded-xl p-3.5 space-y-2">
                      <span className="font-bold text-white flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#E8414A]/10 text-[#E8414A] flex items-center justify-center text-[11px] font-mono font-bold">3</span>
                        Save App &amp; Paste Credentials in LifeOS
                      </span>
                      <p className="text-[11px] text-gray-400 leading-relaxed">
                        After saving your app in Spotify, copy your <strong>Client ID</strong> and <strong>Client Secret</strong>. Switch to the <strong>&ldquo;Connection &amp; Controls&rdquo;</strong> tab above, paste them in, and click <strong>&ldquo;Save Credentials &amp; Authorize in Chrome&rdquo;</strong>.
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveSpotifyTab("settings")}
                        className="w-full py-2 bg-[#26282E] hover:bg-[#30333A] border border-[#3E424B] rounded-xl text-xs font-semibold text-[#ECE7E3] hover:text-white flex items-center justify-center gap-2 transition-colors mt-1 cursor-pointer"
                      >
                        <span>I have my Client ID &amp; Secret &rarr; Enter Credentials</span>
                      </button>
                    </div>

                    <div className="bg-[#18191B] border border-[#26272B] rounded-xl p-3.5 space-y-2">
                      <span className="font-bold text-white flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#E8414A]/10 text-[#E8414A] flex items-center justify-center text-[11px] font-mono font-bold">4</span>
                        What you can ask Aven in chat:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-gray-300">
                        <div className="bg-[#121315] p-2 rounded-lg flex items-center gap-2">
                          <Music className="w-3.5 h-3.5 text-[#ECE7E3] shrink-0" />
                          <span><em>&ldquo;Play Taylor Swift&rdquo;</em> (Artist)</span>
                        </div>
                        <div className="bg-[#121315] p-2 rounded-lg flex items-center gap-2">
                          <Disc className="w-3.5 h-3.5 text-[#ECE7E3] shrink-0" />
                          <span><em>&ldquo;Play Bohemian Rhapsody&rdquo;</em> (Song)</span>
                        </div>
                        <div className="bg-[#121315] p-2 rounded-lg flex items-center gap-2">
                          <Radio className="w-3.5 h-3.5 text-[#ECE7E3] shrink-0" />
                          <span><em>&ldquo;Play some jazz&rdquo;</em> (Genre)</span>
                        </div>
                        <div className="bg-[#121315] p-2 rounded-lg flex items-center gap-2">
                          <Headphones className="w-3.5 h-3.5 text-[#ECE7E3] shrink-0" />
                          <span><em>&ldquo;Play my workout playlist&rdquo;</em> (Playlist)</span>
                        </div>
                        <div className="bg-[#121315] p-2 rounded-lg flex items-center gap-2">
                          <Sliders className="w-3.5 h-3.5 text-[#ECE7E3] shrink-0" />
                          <span><em>&ldquo;Play music, I am tired&rdquo;</em> (Relaxing)</span>
                        </div>
                        <div className="bg-[#121315] p-2 rounded-lg flex items-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5 text-[#ECE7E3] shrink-0" />
                          <span><em>&ldquo;Pause music / Resume&rdquo;</em> (Control)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: SETTINGS & CONTROLS */}
                {activeSpotifyTab === "settings" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    {/* STATE 1: WAITING FOR CHROME AUTHORIZATION */}
                    {waitingForAuth ? (
                      <div className="p-6 bg-[#18191B] border border-[#26272B] rounded-2xl flex flex-col items-center text-center space-y-4">
                        <div className="relative">
                          <div className="w-14 h-14 rounded-2xl bg-[#E8414A]/10 border border-[#E8414A]/30 flex items-center justify-center">
                            <Music className="w-7 h-7 text-[#E8414A] animate-pulse" />
                          </div>
                          <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-[#121315] border border-[#26272B]">
                            <Loader2 className="w-4 h-4 animate-spin text-[#E8414A]" />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-sm font-bold text-white">Authorizing in Chrome...</h3>
                          <p className="text-xs text-gray-400 max-w-sm">
                            A browser tab has been opened to Spotify. Click <strong>&ldquo;Agree&rdquo;</strong> to link your account. LifeOS will detect it automatically once complete.
                          </p>
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                          <button
                            type="button"
                            onClick={handleAuthorizeSpotify}
                            className="px-3.5 py-2 bg-[#26282E] hover:bg-[#30333A] border border-[#3E424B] rounded-xl text-xs font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Open Chrome Again</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setWaitingForAuth(false);
                              setAuthorizing(false);
                            }}
                            className="px-3.5 py-2 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : !selectedProvider.hasToken ? (
                      /* STATE 2: NOT AUTHORIZED YET - CLEAN CREDENTIAL SETUP */
                      <div className="space-y-4">
                        <div className="p-4 bg-[#18191B] border border-[#26272B] rounded-xl space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white flex items-center gap-2">
                              <Key className="w-4 h-4 text-[#E8414A]" />
                              Connect Spotify Account
                            </span>
                            <button
                              type="button"
                              onClick={() => setActiveSpotifyTab("guide")}
                              className="text-[11px] text-[#ECE7E3] hover:text-[#E8414A] hover:underline flex items-center gap-1 font-medium cursor-pointer"
                            >
                              <BookOpen className="w-3 h-3" />
                              <span>View Setup Guide</span>
                            </button>
                          </div>
                          <p className="text-[11px] text-gray-400 leading-relaxed">
                            Enter your Spotify Developer App credentials once. LifeOS will open Chrome to link your Spotify account and manage automatic background token refreshes.
                          </p>

                          <div className="space-y-2.5 pt-1">
                            <div>
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                                Client ID
                              </label>
                              <input
                                type="text"
                                value={clientIdInput}
                                onChange={(e) => setClientIdInput(e.target.value)}
                                placeholder="Paste your 32-character Client ID from Spotify Dashboard"
                                className="w-full bg-[#121315] border border-[#26272B] text-gray-200 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#E8414A] font-mono"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                                Client Secret
                              </label>
                              <div className="relative">
                                <input
                                  type={showSecret ? "text" : "password"}
                                  value={clientSecretInput}
                                  onChange={(e) => setClientSecretInput(e.target.value)}
                                  placeholder="Paste your Client Secret"
                                  className="w-full bg-[#121315] border border-[#26272B] text-gray-200 text-xs rounded-xl px-3.5 py-2.5 pr-16 focus:outline-none focus:border-[#E8414A] font-mono"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowSecret(!showSecret)}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400 hover:text-white px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                                >
                                  {showSecret ? "Hide" : "Show"}
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={handleAuthorizeSpotify}
                              disabled={authorizing || (!clientIdInput.trim() && !selectedProvider.preferences?.clientId)}
                              className="w-full py-3 bg-[#E8414A] hover:bg-[#D62C35] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-[#E8414A]/20 cursor-pointer"
                            >
                              {authorizing ? (
                                <Loader2 className="w-4 h-4 animate-spin text-white" />
                              ) : (
                                <ExternalLink className="w-4 h-4 text-white" />
                              )}
                              <span>Save Credentials &amp; Authorize in Chrome</span>
                            </button>
                            <p className="text-[10px] text-gray-500 text-center mt-2">
                              Opens Spotify in Chrome to approve playback permissions. No manual tokens required.
                            </p>
                          </div>

                          {/* Spotify Gotcha Helper */}
                          <div className="p-3 bg-[#18191B] border border-[#2A2B2F] rounded-xl space-y-1.5 text-left">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-[#FFFDFC] flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5 text-[#E8414A]" />
                                Spotify Loopback Notice
                              </span>
                              {clientIdInput.trim() && (
                                <button
                                  type="button"
                                  onClick={() => openExternalUrl(`https://developer.spotify.com/dashboard/${clientIdInput.trim()}/settings`)}
                                  className="text-[10px] text-[#ECE7E3] hover:text-[#E8414A] underline font-medium flex items-center gap-1 cursor-pointer"
                                >
                                  <span>Open Spotify App Settings</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-400 leading-relaxed">
                              Spotify disallows <code>localhost</code> for HTTP. In Spotify App Settings &rarr; Redirect URIs: add <code className="text-[#ECE7E3] font-mono">http://127.0.0.1:3000/api/connections/spotify/callback</code> (or your HTTPS Vercel link), click <strong>Add</strong>, then scroll down and click <strong>Save</strong>.
                            </p>
                          </div>
                        </div>

                        {/* Collapsible Advanced: Direct Access Token */}
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => setShowAdvancedToken(!showAdvancedToken)}
                            className="text-[11px] text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <span>{showAdvancedToken ? "Hide Advanced Options" : "Advanced: Direct Access Token"}</span>
                            {showAdvancedToken ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </button>
                          {showAdvancedToken && (
                            <div className="mt-2 p-3 bg-[#121315] border border-[#26272B] rounded-xl space-y-2 animate-in fade-in duration-150">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                                  Temporary Bearer Token (Optional Bypass)
                                </label>
                                <button
                                  type="button"
                                  onClick={() => openExternalUrl("https://developer.spotify.com/documentation/web-api")}
                                  className="text-[10px] text-gray-400 hover:text-white flex items-center gap-1 cursor-pointer"
                                >
                                  <span>Spotify Docs</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </button>
                              </div>
                              <div className="relative">
                                <input
                                  type={showToken ? "text" : "password"}
                                  value={tokenInput}
                                  onChange={(e) => setTokenInput(e.target.value)}
                                  placeholder="Paste temporary Bearer token if not using Chrome OAuth..."
                                  className="w-full bg-[#18191B] border border-[#26272B] text-gray-200 text-xs rounded-xl px-3 py-2 pr-16 focus:outline-none focus:border-[#E8414A] font-mono"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowToken(!showToken)}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400 hover:text-white px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                                >
                                  {showToken ? "Hide" : "Show"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* STATE 3: CONNECTED & AUTHORIZED */
                      <div className="space-y-4">
                        {/* Connected Status Card */}
                        <div className="p-4 bg-[#18191B] border border-[#2A2B2F] rounded-xl space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-[#E8414A]/10 border border-[#E8414A]/30 flex items-center justify-center">
                                <Music className="w-4 h-4 text-[#E8414A]" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-white">Spotify Linked</span>
                                  <span className="text-[10px] font-bold text-white bg-white/10 border border-white/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Check className="w-2.5 h-2.5 text-[#E8414A]" />
                                    Active
                                  </span>
                                </div>
                                <p className="text-[11px] text-gray-300 truncate max-w-[240px]">
                                  {selectedProvider.connectedAccount || "Linked Account"}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={handleAuthorizeSpotify}
                              disabled={authorizing}
                              className="px-2.5 py-1.5 bg-[#26282E] hover:bg-[#30333A] border border-[#3E424B] rounded-lg text-[11px] font-medium text-gray-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                              title="Re-authorize or switch accounts in Chrome"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Re-authorize</span>
                            </button>
                          </div>
                          <p className="text-[11px] text-[#9BA1A6] leading-relaxed">
                            Playback control is live. LifeOS will automatically refresh tokens in the background.
                          </p>
                        </div>

                        {/* Device Detection Section */}
                        <div className="bg-[#18191B] border border-[#26272B] rounded-xl p-3.5 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-300 flex items-center gap-2">
                              <Radio className="w-3.5 h-3.5 text-[#ECE7E3]" />
                              Active Playback Devices
                            </span>
                            <button
                              type="button"
                              onClick={() => handleTestProvider("spotify")}
                              disabled={testingConnection}
                              className="px-3 py-1.5 bg-[#26282E] hover:bg-[#30333A] border border-[#3E424B] rounded-xl text-xs font-semibold text-gray-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                              {testingConnection ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E8414A]" />
                              ) : (
                                <RefreshCw className="w-3.5 h-3.5" />
                              )}
                              <span>Check Devices</span>
                            </button>
                          </div>

                          {testResult ? (
                            <div
                              className={`p-3 rounded-xl border text-xs leading-relaxed ${
                                testResult.success
                                  ? "bg-[#18191B] border-[#2A2B2F] text-[#FFFDFC]"
                                  : "bg-[#2E1E20]/70 border-[#E8414A]/40 text-[#F9A8AC]"
                              }`}
                            >
                              <p className="font-semibold">{testResult.message}</p>
                              {testResult.devices && testResult.devices.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                    Detected Devices:
                                  </p>
                                  {testResult.devices.map((d: any) => (
                                    <div
                                      key={d.id}
                                      className="flex items-center justify-between text-[11px] bg-black/25 px-2.5 py-1 rounded-lg"
                                    >
                                      <span>
                                        {d.name} <span className="text-gray-400">({d.type})</span>
                                      </span>
                                      {d.isActive && (
                                        <span className="text-[#E8414A] font-bold text-[10px]">
                                          ● Active Player
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-[11px] text-gray-500">
                              Click &ldquo;Check Devices&rdquo; to see Spotify devices currently active on your network.
                            </p>
                          )}
                        </div>

                        {/* Fallback Playlist */}
                        <div className="bg-[#18191B] border border-[#26272B] rounded-xl p-3.5 space-y-2">
                          <p className="text-xs font-bold text-gray-300 flex items-center gap-2">
                            <Headphones className="w-3.5 h-3.5 text-[#ECE7E3]" />
                            Default Relax Playlist
                          </p>
                          <p className="text-[11px] text-gray-500">
                            Played when you say &ldquo;play music&rdquo; without specifying an artist or genre.
                          </p>
                          <select
                            value={modalPrefs.defaultPlaylist || "Ambient Focus"}
                            onChange={(e) =>
                              setModalPrefs({ ...modalPrefs, defaultPlaylist: e.target.value })
                            }
                            className="w-full bg-[#121315] border border-[#26272B] text-gray-200 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#E8414A]"
                          >
                            <option value="Ambient Focus">Ambient Focus (Deep Electronic Calm)</option>
                            <option value="Deep Work Lo-Fi">Deep Work Lo-Fi (Beats to Study to)</option>
                            <option value="Calm Piano Resonance">Calm Piano Resonance (Solo Piano)</option>
                          </select>
                        </div>

                        {/* What you can say cheat sheet */}
                        <div className="bg-[#18191B] border border-[#26272B] rounded-xl p-3.5 space-y-2">
                          <span className="text-xs font-bold text-white flex items-center gap-2">
                            <Disc className="w-3.5 h-3.5 text-[#ECE7E3]" />
                            What you can ask Aven in chat:
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-gray-300">
                            <div className="bg-[#121315] p-2 rounded-lg flex items-center gap-2">
                              <Music className="w-3.5 h-3.5 text-[#ECE7E3] shrink-0" />
                              <span><em>&ldquo;Play Taylor Swift&rdquo;</em> (Artist)</span>
                            </div>
                            <div className="bg-[#121315] p-2 rounded-lg flex items-center gap-2">
                              <Disc className="w-3.5 h-3.5 text-[#ECE7E3] shrink-0" />
                              <span><em>&ldquo;Play Bohemian Rhapsody&rdquo;</em> (Song)</span>
                            </div>
                            <div className="bg-[#121315] p-2 rounded-lg flex items-center gap-2">
                              <Radio className="w-3.5 h-3.5 text-[#ECE7E3] shrink-0" />
                              <span><em>&ldquo;Play some jazz&rdquo;</em> (Genre)</span>
                            </div>
                            <div className="bg-[#121315] p-2 rounded-lg flex items-center gap-2">
                              <Headphones className="w-3.5 h-3.5 text-[#ECE7E3] shrink-0" />
                              <span><em>&ldquo;Play my workout playlist&rdquo;</em> (Playlist)</span>
                            </div>
                          </div>
                        </div>

                        {/* App Credentials Collapsible */}
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => setShowAdvancedToken(!showAdvancedToken)}
                            className="text-[11px] text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
                          >
                            <span>{showAdvancedToken ? "Hide App Credentials" : "Edit App Credentials (Client ID / Secret)"}</span>
                            {showAdvancedToken ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </button>
                          {showAdvancedToken && (
                            <div className="mt-2.5 p-3.5 bg-[#121315] border border-[#26272B] rounded-xl space-y-2.5 animate-in fade-in duration-150">
                              <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                                  Client ID
                                </label>
                                <input
                                  type="text"
                                  value={clientIdInput}
                                  onChange={(e) => setClientIdInput(e.target.value)}
                                  className="w-full bg-[#18191B] border border-[#26272B] text-gray-200 text-xs rounded-xl px-3 py-2 font-mono"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                                  Client Secret
                                </label>
                                <div className="relative">
                                  <input
                                    type={showSecret ? "text" : "password"}
                                    value={clientSecretInput}
                                    onChange={(e) => setClientSecretInput(e.target.value)}
                                    className="w-full bg-[#18191B] border border-[#26272B] text-gray-200 text-xs rounded-xl px-3 py-2 pr-16 font-mono"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowSecret(!showSecret)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 hover:text-white"
                                  >
                                    {showSecret ? "Hide" : "Show"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Modal Actions */}
            <div className="pt-3 border-t border-[#26272B] flex items-center justify-between">
              {(connected.some((c) => c.providerId === selectedProvider.providerId) || selectedProvider.hasToken || selectedProvider.status === "ACTIVE") ? (
                <button
                  type="button"
                  onClick={() => handleDisconnect(selectedProvider.providerId)}
                  disabled={actionLoading === selectedProvider.providerId}
                  className="px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 rounded-xl text-xs font-bold text-red-400 transition-colors"
                >
                  Disconnect
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProvider(null);
                    setWaitingForAuth(false);
                    setAuthorizing(false);
                    setTestResult(null);
                  }}
                  className="px-3.5 py-2 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSavePreferences(selectedProvider.providerId)}
                  disabled={actionLoading === selectedProvider.providerId}
                  className="px-4 py-2 bg-[#E8414A] hover:bg-[#d0353e] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  {actionLoading === selectedProvider.providerId ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* STANDALONE GOOGLE SUITE GUIDE MODAL */}
      {showGoogleSuiteGuideModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-[#E8414A]/10 text-[#E8414A] border border-[#E8414A]/25">
                  <Globe className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Google Workspace Setup Guide</h3>
                  <p className="text-xs text-[#9BA1A6] mt-0.5">
                    Connect Calendar, Drive, Gmail, Tasks, Contacts &amp; Fit with 1 token
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowGoogleSuiteGuideModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* 1-Click Instant Connect Bar */}
            <div className="p-4 bg-[#18191B] border border-[#2A2B2F] hover:border-[#383A40] rounded-xl space-y-2 shadow-lg shadow-black/20 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#E8414A]" />
                  Easiest Method: 1-Click Google OAuth
                </span>
                <span className="text-[10px] font-semibold text-[#E8414A] bg-[#E8414A]/10 border border-[#E8414A]/30 px-2 py-0.5 rounded-full">
                  Zero Token Copying
                </span>
              </div>
              <p className="text-[11px] text-[#ECE7E3] leading-relaxed">
                Skip OAuth Playground completely! Click below to authorize directly with your Google account. All 6 Google services connect simultaneously.
              </p>
              <button
                type="button"
                onClick={handleAuthorizeGoogle}
                disabled={authorizingGoogle || waitingForGoogleAuth}
                className="w-full py-2.5 px-4 bg-[#E8414A] hover:bg-[#D62C35] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-[#E8414A]/20 cursor-pointer"
              >
                {authorizingGoogle || waitingForGoogleAuth ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Connecting in browser...</span>
                  </>
                ) : (
                  <>
                    <Globe className="w-4 h-4" />
                    <span>1-Click Connect Google Workspace</span>
                  </>
                )}
              </button>
            </div>

            {/* Authorized Redirect URI Helper Box */}
            <div className="p-3.5 bg-[#121315] border border-[#26272B] rounded-xl text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-wider">
                  OAuth Redirect URI (For 1-Click Connect)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
                    const uri = `${origin}/api/connections/google/callback`;
                    navigator.clipboard.writeText(uri);
                    setCopiedUri(uri);
                    setTimeout(() => setCopiedUri(null), 2500);
                  }}
                  className="text-[10px] text-[#E8414A] hover:underline flex items-center gap-1 font-medium cursor-pointer"
                >
                  <Copy className="w-2.5 h-2.5" />
                  <span>{copiedUri ? "Copied URI!" : "Copy URI"}</span>
                </button>
              </div>
              <div className="px-2.5 py-1.5 bg-[#161618] border border-[#2A2B2F] rounded-lg font-mono text-[11px] text-[#ECE7E3] break-all select-all">
                {typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/connections/google/callback
              </div>
              <p className="text-[10.5px] text-[#9BA1A6] leading-relaxed">
                If Google shows <em>&ldquo;Error 400: redirect_uri_mismatch&rdquo;</em>, add this exact URI under <strong>Authorized redirect URIs</strong> in your OAuth Client ID in{" "}
                <button
                  type="button"
                  onClick={() => openExternalUrl("https://console.cloud.google.com/apis/credentials")}
                  className="text-[#FFFDFC] underline hover:text-[#E8414A] cursor-pointer inline-flex items-center gap-0.5"
                >
                  Google Cloud Console
                  <ExternalLink className="w-2.5 h-2.5" />
                </button>.
              </p>
              <p className="text-[10.5px] text-[#9BA1A6] leading-relaxed pt-1 border-t border-[#26272B]/60">
                If Google shows <em>&ldquo;Error 403: access_denied&rdquo;</em>, add your email under <strong>Test users</strong> in{" "}
                <button
                  type="button"
                  onClick={() => openExternalUrl("https://console.cloud.google.com/apis/credentials/consent")}
                  className="text-[#FFFDFC] underline hover:text-[#E8414A] cursor-pointer inline-flex items-center gap-0.5"
                >
                  OAuth Consent Screen &rarr; Test Users
                  <ExternalLink className="w-2.5 h-2.5" />
                </button>.
              </p>
            </div>

            <div className="flex items-center gap-3 my-1 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
              <div className="h-px bg-[#26272B] flex-1" />
              <span>OR GENERATE TOKEN VIA OAUTH PLAYGROUND</span>
              <div className="h-px bg-[#26272B] flex-1" />
            </div>

            {/* Quick Action Top Bar */}
            <div className="p-4 bg-[#18191B] border border-[#26272B] rounded-xl flex items-center justify-between">
              <div>
                <p className="font-bold text-white text-xs">Google OAuth 2.0 Playground</p>
                <p className="text-[11px] text-[#9BA1A6] mt-0.5">Free official Google tool to generate tokens in 60s.</p>
              </div>
              <button
                type="button"
                onClick={() => openExternalUrl("https://developers.google.com/oauthplayground")}
                className="px-3.5 py-1.5 bg-[#26282E] hover:bg-[#30333A] border border-[#3E424B] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm shrink-0 cursor-pointer"
              >
                <span>Open Playground</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* STEP 1 */}
            <div className="bg-[#18191B] border border-[#26272B] rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 font-bold text-white">
                <span className="w-5 h-5 rounded-full bg-[#E8414A]/10 text-[#E8414A] flex items-center justify-center text-[11px] font-mono font-bold">1</span>
                <span>Step 1: Select &amp; Authorize APIs</span>
              </div>

              {/* Fast Track */}
              <div className="p-3.5 bg-[#121315] border border-[#26272B] rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#FFFDFC] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#E8414A]" />
                    Recommended: &ldquo;Input your own scopes&rdquo;
                  </span>
                  <span className="text-[10px] text-[#E8414A] font-semibold bg-[#E8414A]/10 border border-[#E8414A]/30 px-2 py-0.5 rounded-full">
                    No Hunting Required
                  </span>
                </div>
                <p className="text-xs text-[#9BA1A6] leading-relaxed">
                  On Google OAuth Playground, scroll down to the bottom of the left sidebar to <strong>&ldquo;Input your own scopes&rdquo;</strong>.
                </p>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => handleCopyScopes(ALL_GOOGLE_SCOPES_STRING, "global_all")}
                    className="w-full px-4 py-2.5 bg-[#E8414A]/10 hover:bg-[#E8414A]/20 border border-[#E8414A]/30 text-[#FFFDFC] rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    {copiedScopes === "global_all" ? (
                      <>
                        <Check className="w-4 h-4 text-[#E8414A]" />
                        <span className="text-[#E8414A]">Copied All 6 Google Scopes!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-[#E8414A]" />
                        <span>Copy All Google Scopes (Calendar, Gmail, Drive, Tasks, Contacts, Fit)</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">
                  Paste the copied scopes into the box at the bottom of the list and click the blue <strong>&ldquo;Authorize APIs&rdquo;</strong> button.
                </p>
              </div>

              {/* What to tick breakdown */}
              <div className="space-y-2 pt-1">
                <span className="text-xs font-bold text-gray-300 block">
                  Checklist: What to tick if selecting checkboxes manually:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 bg-[#121315] rounded-lg border border-[#26272B]">
                    <span className="font-bold text-white block mb-0.5">Drive API v3</span>
                    <span className="text-[#ECE7E3] font-mono text-[10px] block">&bull; .../auth/drive.readonly</span>
                    <span className="text-gray-500 text-[10px] block mt-0.5">&times; No need for drive.metadata or scripts</span>
                  </div>
                  <div className="p-2.5 bg-[#121315] rounded-lg border border-[#26272B]">
                    <span className="font-bold text-white block mb-0.5">Gmail API v1</span>
                    <span className="text-[#ECE7E3] font-mono text-[10px] block">&bull; .../auth/gmail.readonly</span>
                    <span className="text-[#ECE7E3] font-mono text-[10px] block">&bull; .../auth/gmail.send</span>
                    <span className="text-gray-500 text-[10px] block mt-0.5">&times; No need for full mail.google.com</span>
                  </div>
                  <div className="p-2.5 bg-[#121315] rounded-lg border border-[#26272B]">
                    <span className="font-bold text-white block mb-0.5">Google Calendar API v3</span>
                    <span className="text-[#ECE7E3] font-mono text-[10px] block">&bull; .../auth/calendar.events</span>
                    <span className="text-gray-500 text-[10px] block mt-0.5">&times; No need for calendar.settings</span>
                  </div>
                  <div className="p-2.5 bg-[#121315] rounded-lg border border-[#26272B]">
                    <span className="font-bold text-white block mb-0.5">Tasks API v1</span>
                    <span className="text-[#ECE7E3] font-mono text-[10px] block">&bull; .../auth/tasks</span>
                  </div>
                  <div className="p-2.5 bg-[#121315] rounded-lg border border-[#26272B]">
                    <span className="font-bold text-white block mb-0.5">People API v1 (Contacts)</span>
                    <span className="text-[#ECE7E3] font-mono text-[10px] block">&bull; .../auth/contacts.readonly</span>
                  </div>
                  <div className="p-2.5 bg-[#121315] rounded-lg border border-[#26272B]">
                    <span className="font-bold text-white block mb-0.5">Fitness API v1 (Fit)</span>
                    <span className="text-[#ECE7E3] font-mono text-[10px] block">&bull; .../auth/fitness.activity.read</span>
                    <span className="text-[#ECE7E3] font-mono text-[10px] block">&bull; .../auth/fitness.sleep.read</span>
                  </div>
                </div>
              </div>
            </div>

            {/* STEP 2 */}
            <div className="bg-[#18191B] border border-[#26272B] rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 font-bold text-white">
                <span className="w-5 h-5 rounded-full bg-[#E8414A]/10 text-[#E8414A] flex items-center justify-center text-[11px] font-mono font-bold">2</span>
                <span>Step 2: Sign In &amp; Handle the Google Consent Warning</span>
              </div>
              <div className="p-3 bg-[#121315] border border-[#26272B] rounded-xl space-y-1.5 text-xs">
                <p className="font-bold text-[#FFFDFC] flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-[#E8414A] shrink-0" />
                  If Google shows &ldquo;Google hasn&rsquo;t verified this app&rdquo;:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[#ECE7E3] text-[11px]">
                  <li>Click the small <strong>&ldquo;Advanced&rdquo;</strong> link in the bottom-left of the Google popup.</li>
                  <li>Click <strong>&ldquo;Go to Google OAuth 2.0 Playground (unsafe)&rdquo;</strong>.</li>
                  <li>Check the permissions and click <strong>&ldquo;Continue&rdquo;</strong>.</li>
                </ol>
              </div>
            </div>

            {/* STEP 3 & 4: PASTE TOKEN RIGHT HERE */}
            <div className="bg-[#18191B] border border-[#26272B] rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 font-bold text-white">
                <span className="w-5 h-5 rounded-full bg-[#E8414A]/10 text-[#E8414A] flex items-center justify-center text-[11px] font-mono font-bold">3</span>
                <span>Step 3 &amp; 4: Copy &amp; Apply Access Token to All Services</span>
              </div>
              <p className="text-xs text-[#9BA1A6] leading-relaxed">
                In Step 2 on OAuth Playground, click the <strong>&ldquo;Exchange authorization code for tokens&rdquo;</strong> button. Copy the <strong>Access token</strong> (starts with <code className="text-[#E8414A] font-mono">ya29...</code>) and paste it below:
              </p>

              <div className="space-y-2 pt-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  Paste Access Token (ya29...)
                </label>
                <input
                  type="text"
                  value={globalGoogleTokenInput}
                  onChange={(e) => setGlobalGoogleTokenInput(e.target.value)}
                  placeholder="Paste your ya29... token here to connect all Google apps in 1 click"
                  className="w-full bg-[#121315] border border-[#26272B] text-gray-200 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#E8414A] font-mono"
                />
                <button
                  type="button"
                  onClick={handleApplyGlobalGoogleToken}
                  disabled={globalSaving || !globalGoogleTokenInput.trim()}
                  className="w-full py-3 bg-[#E8414A] hover:bg-[#D62C35] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-[#E8414A]/20 mt-2 cursor-pointer"
                >
                  {globalSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Check className="w-4 h-4 text-white" />
                  )}
                  <span>Apply Token to All 6 Google Services &amp; Connect</span>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-2 border-t border-[#26272B] flex justify-end">
              <button
                type="button"
                onClick={() => setShowGoogleSuiteGuideModal(false)}
                className="px-4 py-2 bg-[#26282E] hover:bg-[#30333A] text-xs font-semibold text-gray-300 rounded-xl transition-colors"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
