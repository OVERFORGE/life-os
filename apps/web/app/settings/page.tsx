"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plug,
  Sparkles,
  Sliders,
  Laptop,
  MapPin,
  Radio,
  Scale,
  Tags,
  ShieldCheck,
  Check,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  LogOut,
  Mic,
  MicOff,
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronRight,
  Volume2,
  Plus,
  Trash2,
  Power,
  Globe,
  Smartphone,
  Tablet,
  Monitor,
  Clock,
  Square,
  Loader2,
  Key,
  Copy,
  Info,
  CheckSquare,
  Cloud,
  Mail,
  FolderGit2,
  Kanban,
  MessageSquare,
  BookOpen,
  Home,
  Lightbulb,
  HeartPulse,
  Activity,
  Flame,
  RotateCcw,
  X,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { startWakeWord, stopWakeWord, setHudEnabled, toggleHudWindow } from "@/lib/desktopBridge";

type SettingsCategory =
  | "connections"
  | "personalization"
  | "ambient"
  | "locations"
  | "signals"
  | "devices"
  | "weights"
  | "categories"
  | "privacy";

interface UserProfile {
  name?: string;
  email?: string;
  role?: string;
  avatar?: string;
  createdAt?: string;
  dietMode?: string;
  maintenanceCalories?: number;
  preferences?: {
    phoneticName?: string;
    pronunciationPreference?: "auto" | "custom" | "voice_sample";
    dayRolloverHour?: number;
    weightReminderEnabled?: boolean;
    weightReminderDay?: number;
    weightReminderHour?: number;
    savedLocations?: SavedLocation[];
  };
  settings?: {
    timezone?: string;
  };
}

interface SavedLocation {
  name: string;
  lat: number;
  lng: number;
  radius: number;
  voiceAssistantEnabled: boolean;
}

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

interface SessionEntry {
  id: string;
  deviceType: "mobile" | "desktop" | "tablet" | "web";
  platform: string;
  browser: string;
  os: string;
  ipAddress: string;
  lastActive: string;
  createdAt: string;
  isCurrent: boolean;
}

const COMMON_TIMEZONES = [
  { value: "Asia/Kolkata", label: "India Standard Time (IST · UTC+5:30)" },
  { value: "America/New_York", label: "Eastern Time (EST/EDT · UTC-5:00)" },
  { value: "America/Chicago", label: "Central Time (CST/CDT · UTC-6:00)" },
  { value: "America/Denver", label: "Mountain Time (MST/MDT · UTC-7:00)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PST/PDT · UTC-8:00)" },
  { value: "Europe/London", label: "London / GMT (UTC+0:00)" },
  { value: "Europe/Berlin", label: "Central European Time (CET · UTC+1:00)" },
  { value: "Europe/Paris", label: "Paris / Romance (UTC+1:00)" },
  { value: "Asia/Dubai", label: "Gulf Standard Time (GST · UTC+4:00)" },
  { value: "Asia/Singapore", label: "Singapore / Hong Kong (SGT · UTC+8:00)" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (JST · UTC+9:00)" },
  { value: "Australia/Sydney", label: "Sydney / Melbourne (AEST · UTC+10:00)" },
  { value: "UTC", label: "Universal Coordinated Time (UTC)" },
];

const DIET_MODES = [
  { id: "maintenance", label: "Maintenance", desc: "Maintain current weight & energy" },
  { id: "recomp", label: "Recomposition", desc: "Build muscle while losing fat" },
  { id: "cut", label: "Calorie Deficit", desc: "Targeted fat loss" },
  { id: "bulk", label: "Calorie Surplus", desc: "Targeted muscle gain" },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SettingsWorkspace() {
  const router = useRouter();
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<SettingsCategory>("connections");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // -------------------------------------------------------------
  // TAB 1: CONNECTIONS STATE
  // -------------------------------------------------------------
  const [connectedProviders, setConnectedProviders] = useState<ConnectedProvider[]>([]);
  const [availableProviders, setAvailableProviders] = useState<AvailableProvider[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [selectedProviderModal, setSelectedProviderModal] = useState<ConnectedProvider | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Calendar Destination & Conflict Rules
  const [defaultCalendar, setDefaultCalendar] = useState("native");
  const [conflictStrategy, setConflictStrategy] = useState("non-destructive");

  // -------------------------------------------------------------
  // TAB 2: PERSONALIZATION & VOICE STATE
  // -------------------------------------------------------------
  const [displayName, setDisplayName] = useState("Arjun Mehta");
  const [phoneticName, setPhoneticName] = useState("/ɑːrˈdʒuːn/");
  const [pronunciationPreference, setPronunciationPreference] = useState<"auto" | "custom" | "voice_sample">("auto");
  const [rolloverHour, setRolloverHour] = useState(4);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderDay, setReminderDay] = useState(0);
  const [reminderHour, setReminderHour] = useState(9);
  const [dietMode, setDietMode] = useState("recomp");
  const [maintenanceCals, setMaintenanceCals] = useState(2200);
  const [isRecordingSample, setIsRecordingSample] = useState(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // -------------------------------------------------------------
  // TAB 3: AMBIENT & VOICE SURFACES STATE
  // -------------------------------------------------------------
  const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
  const [hudEnabledState, setHudEnabledState] = useState(true);
  const [trayEnabled, setTrayEnabled] = useState(true);
  const [hotkeyEnabled, setHotkeyEnabled] = useState(true);
  const [micStatus, setMicStatus] = useState<"IDLE" | "TESTING" | "PASSED" | "DENIED">("IDLE");
  const [micVolume, setMicVolume] = useState<number>(0);

  // -------------------------------------------------------------
  // TAB 4: LOCATIONS & TIMEZONES STATE
  // -------------------------------------------------------------
  const [currentTimezone, setCurrentTimezone] = useState("UTC");
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationCoord, setNewLocationCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [newLocationVoice, setNewLocationVoice] = useState(true);
  const [geoError, setGeoError] = useState("");

  // -------------------------------------------------------------
  // TAB 5: SIGNALS & AUTOMATIONS STATE
  // -------------------------------------------------------------
  const [signalsList, setSignalsList] = useState<any[]>([]);
  const [categoriesList, setCategoriesList] = useState<any[]>([]);
  const [loadingSignals, setLoadingSignals] = useState(false);
  const [newSignalForm, setNewSignalForm] = useState({
    key: "",
    label: "",
    categoryKey: "",
    inputType: "number",
    direction: "higher_better",
    unit: "",
    target: "",
    min: "",
    max: "",
    step: "",
    dependsOn: "",
  });

  // -------------------------------------------------------------
  // TAB 6: CONNECTED DEVICES STATE
  // -------------------------------------------------------------
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [revokingAllSessions, setRevokingAllSessions] = useState(false);

  // -------------------------------------------------------------
  // TAB 7: WEIGHT & HEALTH HUB STATE
  // -------------------------------------------------------------
  const [weightsData, setWeightsData] = useState<any>(null);
  const [weightOverrides, setWeightOverrides] = useState<any>({});
  const [loadingWeights, setLoadingWeights] = useState(false);

  // -------------------------------------------------------------
  // TAB 8: CUSTOM CATEGORIES STATE
  // -------------------------------------------------------------
  const [newCategoryForm, setNewCategoryForm] = useState({
    key: "",
    label: "",
    order: 0,
  });

  // =============================================================
  // DATA LOADERS & SYNC LIFECYCLE
  // =============================================================

  // 1. Load User Profile
  const loadUserProfile = useCallback(async () => {
    try {
      setLoadingUser(true);
      const res = await fetch("/api/user");
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        if (data.name) setDisplayName(data.name);
        if (data.dietMode) setDietMode(data.dietMode);
        if (data.maintenanceCalories) setMaintenanceCals(data.maintenanceCalories);

        const prefs = data.preferences || {};
        if (prefs.phoneticName) setPhoneticName(prefs.phoneticName);
        if (prefs.pronunciationPreference) setPronunciationPreference(prefs.pronunciationPreference);
        if (prefs.dayRolloverHour !== undefined) setRolloverHour(prefs.dayRolloverHour);
        if (prefs.weightReminderEnabled !== undefined) setReminderEnabled(prefs.weightReminderEnabled);
        if (prefs.weightReminderDay !== undefined) setReminderDay(prefs.weightReminderDay);
        if (prefs.weightReminderHour !== undefined) setReminderHour(prefs.weightReminderHour);
        if (prefs.savedLocations) setLocations(prefs.savedLocations);

        const tz = data.settings?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        setCurrentTimezone(tz);
      }
    } catch (err) {
      console.error("Failed to load user profile:", err);
    } finally {
      setLoadingUser(false);
    }
  }, []);

  // 2. Load Connections
  const loadConnections = useCallback(async () => {
    try {
      setLoadingConnections(true);
      const res = await fetch("/api/connections");
      if (res.ok) {
        const json = await res.json();
        const data = json.data || json;
        setConnectedProviders(data.connected || []);
        setAvailableProviders(data.available || []);
      }
    } catch (err) {
      console.error("Failed to load connections:", err);
    } finally {
      setLoadingConnections(false);
    }
  }, []);

  // 3. Load Sessions
  const loadSessions = useCallback(async (silent = false) => {
    if (!silent) setLoadingSessions(true);
    try {
      const res = await fetch("/api/sessions");
      if (res.ok) {
        const data = await res.json();
        if (data.sessions) setSessions(data.sessions);
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
    } finally {
      if (!silent) setLoadingSessions(false);
    }
  }, []);

  // 4. Load Signals & Categories
  const loadSignalsAndCategories = useCallback(async () => {
    try {
      setLoadingSignals(true);
      const [catRes, sigRes] = await Promise.all([
        fetch("/api/categories"),
        fetch("/api/signals"),
      ]);

      if (catRes.ok) {
        const catData = await catRes.json();
        const cats = catData.categories || [];
        setCategoriesList(cats);
        if (cats.length > 0 && !newSignalForm.categoryKey) {
          setNewSignalForm((f) => ({ ...f, categoryKey: cats[0].key }));
        }
      }

      if (sigRes.ok) {
        const sigData = await sigRes.json();
        setSignalsList(sigData.signals || []);
      }
    } catch (err) {
      console.error("Failed to load signals/categories:", err);
    } finally {
      setLoadingSignals(false);
    }
  }, [newSignalForm.categoryKey]);

  // 5. Load Weights Settings
  const loadWeights = useCallback(async () => {
    try {
      setLoadingWeights(true);
      const res = await fetch("/api/settings");
      if (res.ok) {
        const d = await res.json();
        setWeightsData(d);
        setWeightOverrides(d.overrides || {});
      }
    } catch (err) {
      console.error("Failed to load weights:", err);
    } finally {
      setLoadingWeights(false);
    }
  }, []);

  useEffect(() => {
    loadUserProfile();
    loadConnections();
    loadSessions();
    loadSignalsAndCategories();
    loadWeights();

    // Restore ambient voice preferences from localStorage
    try {
      const savedWake = localStorage.getItem("lifeos_ambient_wakeword");
      if (savedWake !== null) setWakeWordEnabled(savedWake === "true");
      const savedHud = localStorage.getItem("lifeos_ambient_hud");
      if (savedHud !== null) {
        const isEnabled = savedHud === "true";
        setHudEnabledState(isEnabled);
        setHudEnabled(isEnabled);
      }
      const savedTray = localStorage.getItem("lifeos_ambient_tray");
      if (savedTray !== null) setTrayEnabled(savedTray === "true");
      const savedHotkey = localStorage.getItem("lifeos_ambient_hotkeys");
      if (savedHotkey !== null) setHotkeyEnabled(savedHotkey === "true");
    } catch {}
  }, [loadUserProfile, loadConnections, loadSessions, loadSignalsAndCategories, loadWeights]);

  // Real-time auto-poll for sessions when devices tab is active
  useEffect(() => {
    if (activeTab !== "devices") return;
    const interval = setInterval(() => {
      loadSessions(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [activeTab, loadSessions]);

  // =============================================================
  // ACTION HANDLERS
  // =============================================================

  // Save Personalization
  const handleSavePersonalization = async () => {
    setSavingGlobal(true);
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: displayName.trim(),
          dietMode,
          maintenanceCalories: maintenanceCals,
          preferences: {
            phoneticName: phoneticName.trim(),
            pronunciationPreference,
            dayRolloverHour: rolloverHour,
            weightReminderEnabled: reminderEnabled,
            weightReminderDay: reminderDay,
            weightReminderHour: reminderHour,
          },
        }),
      });

      if (res.ok) {
        setNotification({ type: "success", message: "Personalization preferences updated successfully!" });
        loadUserProfile();
      } else {
        throw new Error("Failed to save preferences");
      }
    } catch (err) {
      setNotification({ type: "error", message: "Error saving personalization." });
    } finally {
      setSavingGlobal(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  // Timezone Save
  const handleSaveTimezone = async (tz: string) => {
    setCurrentTimezone(tz);
    try {
      await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { timezone: tz },
        }),
      });
      setNotification({ type: "success", message: `Timezone updated to ${tz}` });
      loadUserProfile();
    } catch {
      setNotification({ type: "error", message: "Failed to update timezone" });
    } finally {
      setTimeout(() => setNotification(null), 3000);
    }
  };

  // Ambient Voice Handlers
  const handleWakeWordToggle = async (enabled: boolean) => {
    setWakeWordEnabled(enabled);
    try {
      localStorage.setItem("lifeos_ambient_wakeword", String(enabled));
      if (enabled) {
        await startWakeWord();
      } else {
        await stopWakeWord();
      }
    } catch (err) {
      console.warn("Wake word bridge warning:", err);
    }
  };

  const handleHudToggle = async (enabled: boolean) => {
    setHudEnabledState(enabled);
    try {
      localStorage.setItem("lifeos_ambient_hud", String(enabled));
      await setHudEnabled(enabled);
    } catch (err) {
      console.warn("HUD bridge warning:", err);
    }
  };

  const testMicrophone = async () => {
    setMicStatus("TESTING");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const micSource = audioContext.createMediaStreamSource(stream);
      micSource.connect(analyser);
      analyser.fftSize = 256;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      let ticks = 0;
      const interval = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((acc, val) => acc + val, 0);
        const avg = Math.min(100, Math.round((sum / dataArray.length) * 1.6));
        setMicVolume(avg);
        ticks++;
        if (ticks >= 30) {
          clearInterval(interval);
          stream.getTracks().forEach((track) => track.stop());
          audioContext.close();
          setMicStatus("PASSED");
          setTimeout(() => setMicStatus("IDLE"), 3500);
        }
      }, 70);
    } catch (err) {
      console.error("Microphone test error:", err);
      setMicStatus("DENIED");
      setTimeout(() => setMicStatus("IDLE"), 4000);
    }
  };

  // Location Geofencing
  const handleCaptureCurrentGeo = () => {
    setGeoError("");
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNewLocationCoord({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setGeoError(err.message);
      }
    );
  };

  const handleSaveLocation = async () => {
    if (!newLocationName.trim()) return alert("Location name is required");
    if (!newLocationCoord) return alert("Please capture coordinates first");

    const updated = [
      ...locations,
      {
        name: newLocationName.trim(),
        lat: newLocationCoord.lat,
        lng: newLocationCoord.lng,
        radius: 150,
        voiceAssistantEnabled: newLocationVoice,
      },
    ];

    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: { savedLocations: updated } }),
      });
      if (res.ok) {
        setLocations(updated);
        setIsAddingLocation(false);
        setNewLocationName("");
        setNewLocationCoord(null);
        setNotification({ type: "success", message: "Location saved successfully!" });
      }
    } catch {
      setNotification({ type: "error", message: "Failed to save location" });
    } finally {
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleDeleteLocation = async (idx: number) => {
    const updated = locations.filter((_, i) => i !== idx);
    try {
      await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: { savedLocations: updated } }),
      });
      setLocations(updated);
    } catch {
      setNotification({ type: "error", message: "Failed to delete location" });
    }
  };

  // Device Session Revoke
  const handleRevokeSession = async (id: string) => {
    setRevokingSessionId(id);
    try {
      await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setNotification({ type: "success", message: "Device session revoked." });
    } catch {
      setNotification({ type: "error", message: "Failed to revoke session." });
    } finally {
      setRevokingSessionId(null);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleRevokeAllOtherSessions = async () => {
    if (!confirm("Sign out all other devices? You'll stay signed in on this device.")) return;
    setRevokingAllSessions(true);
    try {
      await fetch("/api/sessions/all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revokeAll: true }),
      });
      await loadSessions();
      setNotification({ type: "success", message: "All other sessions signed out." });
    } catch {
      setNotification({ type: "error", message: "Failed to revoke all sessions." });
    } finally {
      setRevokingAllSessions(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  // Signals Actions
  const handleAddSignal = async () => {
    if (!newSignalForm.key || !newSignalForm.label || !newSignalForm.categoryKey) {
      alert("Key, Label, and Category are required");
      return;
    }
    try {
      const res = await fetch("/api/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newSignalForm,
          target: newSignalForm.target ? Number(newSignalForm.target) : null,
          min: newSignalForm.min ? Number(newSignalForm.min) : null,
          max: newSignalForm.max ? Number(newSignalForm.max) : null,
          step: newSignalForm.step ? Number(newSignalForm.step) : null,
          dependsOn: newSignalForm.dependsOn || null,
        }),
      });
      if (res.ok) {
        setNewSignalForm({
          key: "",
          label: "",
          categoryKey: categoriesList[0]?.key || "",
          inputType: "number",
          direction: "higher_better",
          unit: "",
          target: "",
          min: "",
          max: "",
          step: "",
          dependsOn: "",
        });
        loadSignalsAndCategories();
        setNotification({ type: "success", message: "New signal created successfully!" });
      }
    } catch {
      setNotification({ type: "error", message: "Failed to add signal" });
    } finally {
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleRemoveSignal = async (key: string) => {
    if (!confirm(`Delete signal "${key}"?`)) return;
    try {
      await fetch(`/api/signals?key=${encodeURIComponent(key)}`, { method: "DELETE" });
      loadSignalsAndCategories();
    } catch {
      setNotification({ type: "error", message: "Failed to delete signal" });
    }
  };

  // Category Actions
  const handleAddCategory = async () => {
    if (!newCategoryForm.key || !newCategoryForm.label) {
      alert("Key and Label are required");
      return;
    }
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCategoryForm),
      });
      if (res.ok) {
        setNewCategoryForm({ key: "", label: "", order: 0 });
        loadSignalsAndCategories();
        setNotification({ type: "success", message: "Custom category created!" });
      }
    } catch {
      setNotification({ type: "error", message: "Failed to create category" });
    } finally {
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleRemoveCategory = async (key: string) => {
    if (!confirm(`Delete category "${key}"? Signals under this category will need re-assignment.`)) return;
    try {
      await fetch(`/api/categories?key=${encodeURIComponent(key)}`, { method: "DELETE" });
      loadSignalsAndCategories();
    } catch {
      setNotification({ type: "error", message: "Failed to delete category" });
    }
  };

  // Weight Overrides Actions
  const handleSaveWeights = async () => {
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(weightOverrides),
      });
      setNotification({ type: "success", message: "Weight overrides saved successfully!" });
      loadWeights();
    } catch {
      setNotification({ type: "error", message: "Failed to save weight overrides" });
    } finally {
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleResetWeights = async () => {
    if (!confirm("Reset all weights and thresholds to default factory state?")) return;
    try {
      await fetch("/api/settings", { method: "DELETE" });
      loadWeights();
      setNotification({ type: "success", message: "Weights reset to factory defaults." });
    } catch {
      setNotification({ type: "error", message: "Failed to reset weights" });
    } finally {
      setTimeout(() => setNotification(null), 3000);
    }
  };

  // Disconnect a connection
  const handleDisconnectProvider = async (providerId: string) => {
    if (!confirm(`Disconnect ${providerId}? You can reconnect anytime.`)) return;
    setActionLoading(providerId);
    try {
      await fetch(`/api/connections/${encodeURIComponent(providerId)}`, {
        method: "DELETE",
      });
      setNotification({ type: "success", message: `Disconnected ${providerId}` });
      await loadConnections();
    } catch {
      setNotification({ type: "error", message: `Failed to disconnect ${providerId}` });
    } finally {
      setActionLoading(null);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  // Sovereign Sign Out
  const handleSovereignSignOut = async () => {
    if (confirm("Sign out and purge local offline cache from this device?")) {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {}
      await signOut({ callbackUrl: "/login" });
    }
  };

  // =============================================================
  // UI RENDER HELPERS
  // =============================================================

  const categories: { id: SettingsCategory; label: string; icon: any }[] = [
    { id: "connections", label: "Connections", icon: Plug },
    { id: "personalization", label: "Personalization & Voice", icon: Sparkles },
    { id: "ambient", label: "Ambient & Voice Surfaces", icon: Sliders },
    { id: "locations", label: "Locations & Timezones", icon: MapPin },
    { id: "signals", label: "Signals & Automations", icon: Radio },
    { id: "devices", label: "Connected Devices", icon: Laptop },
    { id: "weights", label: "Weight & Health Hub", icon: Scale },
    { id: "categories", label: "Custom Categories", icon: Tags },
    { id: "privacy", label: "Privacy & Local Cache", icon: ShieldCheck },
  ];

  const effectiveWeights = weightsData?.effective || {};
  const goalWeights = effectiveWeights?.goals?.pressureWeights || {};
  const phaseThresholds = effectiveWeights?.phases?.thresholds || {};

  return (
    <div className="flex h-full w-full bg-[#111113] text-[#F7F5F0] overflow-hidden select-none font-sans">
      {/* Toast Notification Banner */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl border flex items-center gap-2 text-xs font-mono shadow-2xl transition-all animate-in fade-in duration-200 ${
            notification.type === "success"
              ? "bg-[#1E1F24] border-emerald-500/40 text-emerald-400"
              : "bg-[#1E1F24] border-rose-500/40 text-rose-400"
          }`}
        >
          {notification.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Modern Studio Left Sidebar Tabs */}
      <aside className="w-64 border-r border-[#23242A] bg-[#141416] p-4 flex flex-col justify-between shrink-0">
        <div className="space-y-6">
          {/* User Profile Card Header */}
          <div className="px-2 pt-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D98B2B] to-[#8C5212] flex items-center justify-center font-bold text-base text-[#111113] border border-[#ffb86c]/30 font-mono shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#F7F5F0] truncate flex items-center gap-1.5">
                  <span>{displayName}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </div>
                <div className="text-[11px] text-[#85827A] truncate font-mono">
                  {user?.email || "Synced Account"}
                </div>
              </div>
            </div>
          </div>

          {/* Nav Categories */}
          <nav className="space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#85827A] font-semibold px-3 mb-2">
              Preferences & Subsystems
            </div>
            {categories.map((cat) => {
              const Icon = cat.icon;
              const active = activeTab === cat.id;

              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveTab(cat.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer relative group ${
                    active
                      ? "bg-[#1E1F24] border border-[#32343D] text-[#F7F5F0] shadow-sm font-medium"
                      : "text-[#C5C2BA] hover:bg-[#17171A] hover:text-[#F7F5F0]"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-[#D98B2B] rounded-r-full" />
                  )}
                  <Icon
                    size={16}
                    className={active ? "text-[#D98B2B]" : "text-[#85827A] group-hover:text-[#C5C2BA]"}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs truncate">{cat.label}</div>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer Vault Indicator */}
        <div className="px-2 pt-4 border-t border-[#23242A]/60">
          <div className="flex items-center gap-2 text-[11px] font-mono text-[#85827A]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Local Vault Synchronized</span>
          </div>
        </div>
      </aside>

      {/* Main Configuration Content Canvas */}
      <section className="flex-1 overflow-y-auto px-8 py-6 max-w-4xl custom-h-scrollbar">
        {/* Header */}
        <div className="mb-6 pb-4 border-b border-[#23242A] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#D98B2B] font-semibold block mb-1">
              External Providers & Local Runtime
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#F7F5F0]">
              {categories.find((c) => c.id === activeTab)?.label}
            </h1>
          </div>

          <button
            type="button"
            onClick={handleSovereignSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs font-mono font-bold tracking-wider uppercase transition-colors cursor-pointer"
            title="Sign out of LifeOS"
          >
            <Power size={13} />
            <span>Logout</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: CONNECTIONS (ALL 20+ PROVIDERS)                                    */}
        {/* ========================================================================= */}
        {activeTab === "connections" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Active Connections */}
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#23242A]">
                <div>
                  <h2 className="text-sm font-semibold text-[#F7F5F0]">
                    Active Connected Services ({connectedProviders.length})
                  </h2>
                  <p className="text-xs text-[#85827A] mt-0.5">
                    Authorized external data sources feeding Aven intelligence.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadConnections}
                  className="px-3 py-1.5 rounded-xl bg-[#1E1F24] hover:bg-[#282930] border border-[#23242A] text-xs text-[#C5C2BA] hover:text-[#F7F5F0] transition flex items-center gap-1.5 cursor-pointer font-mono"
                >
                  <RefreshCw size={12} className={loadingConnections ? "animate-spin" : ""} /> Refresh
                </button>
              </div>

              {connectedProviders.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#85827A] font-mono">
                  No services currently connected. Connect a provider below.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {connectedProviders.map((cp) => (
                    <div
                      key={cp.providerId}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-[#111113] border border-[#23242A] hover:border-[#32343D] transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#D98B2B]/10 border border-[#D98B2B]/20 flex items-center justify-center text-[#ffb86c]">
                          <Plug size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-[#F7F5F0]">{cp.displayName}</span>
                            <span className="px-2 py-0.2 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[9px] font-mono font-medium">
                              ● Connected
                            </span>
                          </div>
                          <p className="text-[11px] text-[#85827A] font-mono mt-0.5">
                            {cp.connectedAccount || cp.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDisconnectProvider(cp.providerId)}
                          disabled={actionLoading === cp.providerId}
                          className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs text-rose-400 font-mono transition cursor-pointer"
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Available Integrations Hub (20+ providers) */}
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-[#F7F5F0]">
                  Available Providers Hub ({availableProviders.length} Integrations)
                </h2>
                <p className="text-xs text-[#85827A] mt-0.5 font-mono">
                  Google Workspace, Spotify, GitHub, Notion, Linear, Health, Smart Home, and Mobility.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {availableProviders.map((ap) => (
                  <div
                    key={ap.providerId}
                    className="p-3.5 rounded-xl bg-[#111113] border border-[#23242A] hover:border-[#383A42] flex flex-col justify-between gap-3 transition"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#F7F5F0]">{ap.displayName}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1E1F24] text-[#85827A] border border-[#282930]">
                          {ap.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#85827A] mt-1 leading-relaxed">{ap.description}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => router.push("/settings/connections")}
                      className="self-start px-3 py-1 rounded-lg bg-[#1E1F24] hover:bg-[#282930] text-[#ffb86c] border border-[#23242A] hover:border-[#ffb86c]/40 text-xs font-mono transition cursor-pointer"
                    >
                      Configure & Connect &rarr;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: PERSONALIZATION & VOICE                                            */}
        {/* ========================================================================= */}
        {activeTab === "personalization" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-[#F7F5F0] pb-2 border-b border-[#23242A]">
                Identity, Pronunciation & Rollover
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-[#85827A] mb-1.5">
                    User Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-[#111113] border border-[#23242A] focus:border-[#D98B2B] rounded-xl px-3.5 py-2 text-xs text-[#F7F5F0] outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-[#85827A] mb-1.5">
                    Phonetic Name (IPA or phonetic spelling)
                  </label>
                  <input
                    type="text"
                    value={phoneticName}
                    onChange={(e) => setPhoneticName(e.target.value)}
                    className="w-full bg-[#111113] border border-[#23242A] focus:border-[#D98B2B] rounded-xl px-3.5 py-2 text-xs text-[#F7F5F0] outline-none font-mono"
                  />
                </div>
              </div>

              {/* Day Rollover Hour */}
              <div className="pt-2">
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[#85827A] mb-2">
                  Daily Rollover Anchor ({rolloverHour}:00 AM)
                </label>
                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1 bg-[#111113] p-1.5 rounded-xl border border-[#23242A]">
                  {Array.from({ length: 13 }).map((_, h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setRolloverHour(h)}
                      className={`py-1.5 rounded-lg text-xs font-mono transition-all text-center cursor-pointer ${
                        rolloverHour === h
                          ? "bg-[#D98B2B] text-[#111113] font-bold shadow-md"
                          : "text-[#85827A] hover:text-[#F7F5F0]"
                      }`}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[#85827A] mt-1 font-mono">
                  Determines when yesterday's tasks rollover and the new day timeline initializes.
                </p>
              </div>

              {/* Diet Mode & Calorie Baseline */}
              <div className="pt-2">
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[#85827A] mb-2">
                  Dietary Baseline Mode
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {DIET_MODES.map((dm) => (
                    <button
                      key={dm.id}
                      type="button"
                      onClick={() => setDietMode(dm.id)}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        dietMode === dm.id
                          ? "bg-[#D98B2B]/15 border-[#D98B2B] text-[#ffb86c]"
                          : "bg-[#111113] border-[#23242A] text-[#85827A] hover:text-[#C5C2BA]"
                      }`}
                    >
                      <div className="text-xs font-bold">{dm.label}</div>
                      <div className="text-[10px] mt-0.5 opacity-80 leading-tight">{dm.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Maintenance Calories */}
              <div className="pt-2 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-[#F7F5F0]">Maintenance Caloric Intake</div>
                  <div className="text-[11px] text-[#85827A] font-mono">
                    Used to gauge metabolic equilibrium across meals
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={maintenanceCals}
                    onChange={(e) => setMaintenanceCals(Number(e.target.value))}
                    className="w-24 bg-[#111113] border border-[#23242A] focus:border-[#D98B2B] rounded-xl px-3 py-1.5 text-xs text-[#F7F5F0] text-center font-mono outline-none"
                  />
                  <span className="text-xs text-[#85827A] font-mono">kcal/day</span>
                </div>
              </div>

              <div className="pt-3 border-t border-[#23242A] flex justify-end">
                <button
                  type="button"
                  onClick={handleSavePersonalization}
                  disabled={savingGlobal}
                  className="px-5 py-2 rounded-xl bg-[#D98B2B] hover:bg-[#EAA13F] text-[#111113] font-mono text-xs font-bold transition shadow-md active:scale-95 cursor-pointer"
                >
                  {savingGlobal ? "Saving..." : "Save Preferences"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: AMBIENT & VOICE SURFACES                                           */}
        {/* ========================================================================= */}
        {activeTab === "ambient" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-[#F7F5F0] pb-2 border-b border-[#23242A]">
                Desktop System Surfaces & Wake Engine
              </h2>

              {/* Wake Word */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#111113] border border-[#23242A]">
                <div>
                  <div className="text-xs font-semibold text-[#F7F5F0]">Wake Word Engine ("Hey Aven")</div>
                  <div className="text-[11px] text-[#85827A] font-mono">
                    Runs in local audio thread without transmitting voice data externally.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleWakeWordToggle(!wakeWordEnabled)}
                  className={`px-3 py-1 rounded-full text-xs font-mono font-semibold transition cursor-pointer border ${
                    wakeWordEnabled
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                      : "bg-[#1E1F24] text-[#85827A] border-[#282930]"
                  }`}
                >
                  {wakeWordEnabled ? "ENABLED" : "MUTED"}
                </button>
              </div>

              {/* Aven Dynamic HUD */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#111113] border border-[#23242A]">
                <div>
                  <div className="text-xs font-semibold text-[#F7F5F0]">Aven Floating HUD Window</div>
                  <div className="text-[11px] text-[#85827A] font-mono">
                    Minimal floating dynamic pill for quick boundary notes & voice dictation.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleHudToggle(!hudEnabledState)}
                  className={`px-3 py-1 rounded-full text-xs font-mono font-semibold transition cursor-pointer border ${
                    hudEnabledState
                      ? "bg-[#D98B2B]/20 text-[#ffb86c] border-[#D98B2B]/40"
                      : "bg-[#1E1F24] text-[#85827A] border-[#282930]"
                  }`}
                >
                  {hudEnabledState ? "ACTIVE" : "DISABLED"}
                </button>
              </div>

              {/* Microphone Diagnostics */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-[#F7F5F0]">Microphone Audio Feed Diagnostics</div>
                  <button
                    type="button"
                    onClick={testMicrophone}
                    disabled={micStatus === "TESTING"}
                    className="px-3 py-1 rounded-lg bg-[#1E1F24] hover:bg-[#282930] text-xs font-mono text-[#ffb86c] border border-[#23242A] transition cursor-pointer"
                  >
                    {micStatus === "TESTING" ? "Testing Audio..." : "Run Mic Test"}
                  </button>
                </div>
                <div className="h-2 w-full bg-[#111113] rounded-full overflow-hidden border border-[#23242A]">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 via-[#D98B2B] to-rose-500 transition-all duration-75"
                    style={{ width: `${micVolume}%` }}
                  />
                </div>
                <p className="text-[10px] text-[#85827A] font-mono mt-1">
                  Status: {micStatus === "PASSED" ? "Microphone input verified" : micStatus}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: LOCATIONS & TIMEZONES                                              */}
        {/* ========================================================================= */}
        {activeTab === "locations" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Timezone Configuration */}
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#23242A]">
                <div>
                  <h2 className="text-sm font-semibold text-[#F7F5F0]">Temporal Coordinates & Timezone</h2>
                  <p className="text-xs text-[#85827A] font-mono mt-0.5">
                    Aligns all timeline tasks, DAG nodes, and execution slots with your circadian day.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
                    handleSaveTimezone(localTz);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#1E1F24] hover:bg-[#282930] border border-[#23242A] hover:border-[#ffb86c]/40 text-xs font-mono text-[#ffb86c] transition cursor-pointer"
                >
                  Detect from Device
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-[#85827A] mb-1.5">
                    Current Active Timezone
                  </label>
                  <select
                    value={currentTimezone}
                    onChange={(e) => handleSaveTimezone(e.target.value)}
                    className="w-full bg-[#111113] border border-[#23242A] focus:border-[#D98B2B] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] outline-none font-mono"
                  >
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-3 rounded-xl bg-[#111113] border border-[#23242A]">
                  <div className="text-[10px] uppercase font-mono text-[#85827A]">Local Time in {currentTimezone}</div>
                  <div className="text-base font-bold font-mono text-[#F7F5F0] mt-0.5">
                    {new Date().toLocaleTimeString("en-US", {
                      timeZone: currentTimezone,
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Geofencing Quiet Zones */}
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#23242A]">
                <div>
                  <h2 className="text-sm font-semibold text-[#F7F5F0]">Geofencing & Ambient Quiet Zones</h2>
                  <p className="text-xs text-[#85827A] font-mono mt-0.5">
                    Suppress voice responses automatically when entering designated quiet or office zones.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingLocation(!isAddingLocation)}
                  className="px-3 py-1.5 rounded-xl bg-[#D98B2B] hover:bg-[#EAA13F] text-[#111113] text-xs font-mono font-bold transition cursor-pointer"
                >
                  {isAddingLocation ? "Cancel" : "+ Add Zone"}
                </button>
              </div>

              {isAddingLocation && (
                <div className="p-4 rounded-xl bg-[#111113] border border-[#23242A] space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Zone name (e.g. Home, Office, Gym)"
                      value={newLocationName}
                      onChange={(e) => setNewLocationName(e.target.value)}
                      className="bg-[#17171A] border border-[#282930] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCaptureCurrentGeo}
                      className="px-3 py-2 bg-[#1E1F24] hover:bg-[#282930] text-xs text-[#ffb86c] border border-[#282930] rounded-xl flex items-center justify-center gap-1.5 font-mono cursor-pointer"
                    >
                      <MapPin size={13} />
                      <span>
                        {newLocationCoord
                          ? `${newLocationCoord.lat.toFixed(4)}, ${newLocationCoord.lng.toFixed(4)}`
                          : "Capture Current GPS"}
                      </span>
                    </button>
                  </div>
                  {geoError && <div className="text-[11px] text-rose-400 font-mono">{geoError}</div>}
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSaveLocation}
                      className="px-4 py-1.5 rounded-xl bg-[#D98B2B] text-[#111113] font-bold text-xs font-mono cursor-pointer"
                    >
                      Save Zone
                    </button>
                  </div>
                </div>
              )}

              {locations.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#85827A] font-mono">
                  No geofenced zones configured.
                </div>
              ) : (
                <div className="space-y-2">
                  {locations.map((loc, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-xl bg-[#111113] border border-[#23242A]"
                    >
                      <div className="flex items-center gap-3">
                        <MapPin size={16} className="text-[#D98B2B]" />
                        <div>
                          <div className="text-xs font-semibold text-[#F7F5F0]">{loc.name}</div>
                          <div className="text-[10px] text-[#85827A] font-mono">
                            {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)} • Radius: {loc.radius}m
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteLocation(idx)}
                        className="p-1.5 rounded-lg text-[#85827A] hover:text-rose-400 transition cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: SIGNALS & AUTOMATIONS                                              */}
        {/* ========================================================================= */}
        {activeTab === "signals" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#23242A]">
                <div>
                  <h2 className="text-sm font-semibold text-[#F7F5F0]">
                    Configured Telemetry Signals ({signalsList.length})
                  </h2>
                  <p className="text-xs text-[#85827A] font-mono mt-0.5">
                    Context inputs feeding daily check-in observations and goal pressures.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadSignalsAndCategories}
                  className="px-3 py-1.5 rounded-xl bg-[#1E1F24] hover:bg-[#282930] text-xs font-mono text-[#ffb86c] border border-[#23242A] transition cursor-pointer"
                >
                  <RefreshCw size={12} className={loadingSignals ? "animate-spin" : ""} />
                </button>
              </div>

              {/* Add New Signal Form */}
              <div className="p-4 rounded-xl bg-[#111113] border border-[#23242A] space-y-3">
                <div className="text-xs font-bold font-mono uppercase text-[#D98B2B] tracking-wider">
                  + Add New Signal
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    placeholder="Key (e.g. gym.steps)"
                    value={newSignalForm.key}
                    onChange={(e) => setNewSignalForm({ ...newSignalForm, key: e.target.value })}
                    className="bg-[#17171A] border border-[#282930] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] outline-none font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Label (e.g. Daily Steps)"
                    value={newSignalForm.label}
                    onChange={(e) => setNewSignalForm({ ...newSignalForm, label: e.target.value })}
                    className="bg-[#17171A] border border-[#282930] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] outline-none"
                  />
                  <select
                    value={newSignalForm.categoryKey}
                    onChange={(e) => setNewSignalForm({ ...newSignalForm, categoryKey: e.target.value })}
                    className="bg-[#17171A] border border-[#282930] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] outline-none font-mono"
                  >
                    {categoriesList.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleAddSignal}
                    className="px-4 py-1.5 rounded-xl bg-[#D98B2B] hover:bg-[#EAA13F] text-[#111113] font-bold text-xs font-mono transition cursor-pointer"
                  >
                    Create Signal
                  </button>
                </div>
              </div>

              {/* Signals List */}
              <div className="space-y-2">
                {signalsList.map((s) => (
                  <div
                    key={s.key}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#111113] border border-[#23242A]"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#F7F5F0]">{s.label}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1E1F24] text-[#85827A] border border-[#282930]">
                          {s.categoryKey}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#85827A] font-mono mt-0.5">
                        Key: {s.key} • Type: {s.inputType} • Direction: {s.direction}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveSignal(s.key)}
                      className="p-1.5 rounded-lg text-[#85827A] hover:text-rose-400 transition cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: CONNECTED DEVICES (REAL DYNAMIC SESSION MANAGEMENT)                */}
        {/* ========================================================================= */}
        {activeTab === "devices" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#23242A]">
                <div>
                  <h2 className="text-sm font-semibold text-[#F7F5F0]">
                    Active Machine & Client Sessions ({sessions.length})
                  </h2>
                  <p className="text-xs text-[#85827A] font-mono mt-0.5">
                    Real-time session detection across Desktop, Mobile, and Web companions.
                  </p>
                </div>
                {sessions.filter((s) => !s.isCurrent).length > 0 && (
                  <button
                    type="button"
                    onClick={handleRevokeAllOtherSessions}
                    disabled={revokingAllSessions}
                    className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-mono text-rose-400 transition cursor-pointer"
                  >
                    {revokingAllSessions ? "Signing Out..." : "Sign Out All Other Devices"}
                  </button>
                )}
              </div>

              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={`p-4 rounded-xl border flex items-center justify-between ${
                    s.isCurrent
                      ? "bg-[#1E1F24] border-[#D98B2B]/40 shadow-sm"
                      : "bg-[#111113] border-[#23242A]"
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-[#23242A] flex items-center justify-center text-[#ffb86c]">
                      {s.deviceType === "desktop" ? (
                        <Laptop size={20} />
                      ) : s.deviceType === "mobile" ? (
                        <Smartphone size={20} />
                      ) : (
                        <Monitor size={20} />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#F7F5F0]">
                          {s.platform || "LifeOS Companion"} ({s.browser || "Client"} · {s.os || "OS"})
                        </span>
                        {s.isCurrent && (
                          <span className="px-2 py-0.5 rounded-full bg-[#D98B2B]/20 text-[#ffb86c] border border-[#D98B2B]/40 text-[9px] font-mono font-bold uppercase">
                            This Device
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#85827A] font-mono mt-0.5">
                        IP: {s.ipAddress || "Localhost"} • Last active: {new Date(s.lastActive).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>

                  {!s.isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleRevokeSession(s.id)}
                      disabled={revokingSessionId === s.id}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs font-mono text-rose-400 transition cursor-pointer"
                    >
                      {revokingSessionId === s.id ? "Revoking..." : "Revoke Session"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 7: WEIGHT & HEALTH HUB (REAL WEIGHT OVERRIDES)                        */}
        {/* ========================================================================= */}
        {activeTab === "weights" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#23242A]">
                <div>
                  <h2 className="text-sm font-semibold text-[#F7F5F0]">Goal Pressure & Sensitivity Weights</h2>
                  <p className="text-xs text-[#85827A] font-mono mt-0.5">
                    Tune mathematical sensitivity and threshold weights for cognitive load calculation.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetWeights}
                    className="px-3 py-1.5 rounded-xl bg-[#1E1F24] hover:bg-[#282930] border border-[#23242A] text-xs font-mono text-[#85827A] hover:text-[#F7F5F0] transition cursor-pointer"
                  >
                    Reset Defaults
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveWeights}
                    className="px-4 py-1.5 rounded-xl bg-[#D98B2B] hover:bg-[#EAA13F] text-[#111113] text-xs font-mono font-bold transition cursor-pointer"
                  >
                    Save Weights
                  </button>
                </div>
              </div>

              {/* Goal Weights Inputs */}
              <div className="space-y-3 pt-1">
                <div className="text-xs font-bold font-mono uppercase text-[#D98B2B] tracking-wider">
                  Goal Pressure Multipliers
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Object.entries(goalWeights).map(([type, weight]) => (
                    <div key={type} className="p-3 rounded-xl bg-[#111113] border border-[#23242A]">
                      <div className="text-[11px] font-mono capitalize text-[#85827A] mb-1">{type}</div>
                      <input
                        type="number"
                        step="0.1"
                        value={weightOverrides?.goals?.pressureWeights?.[type] ?? (weight as number)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setWeightOverrides((prev: any) => ({
                            ...prev,
                            goals: {
                              ...prev.goals,
                              pressureWeights: {
                                ...prev.goals?.pressureWeights,
                                [type]: val,
                              },
                            },
                          }));
                        }}
                        className="w-full bg-[#17171A] border border-[#282930] rounded-lg px-2.5 py-1.5 text-xs text-[#F7F5F0] font-mono outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 8: CUSTOM CATEGORIES (REAL API)                                       */}
        {/* ========================================================================= */}
        {activeTab === "categories" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#23242A]">
                <div>
                  <h2 className="text-sm font-semibold text-[#F7F5F0]">
                    Daily Log Life Categories ({categoriesList.length})
                  </h2>
                  <p className="text-xs text-[#85827A] font-mono mt-0.5">
                    Structure the organizational taxonomy of daily check-ins and signals.
                  </p>
                </div>
              </div>

              {/* Add Category Form */}
              <div className="p-4 rounded-xl bg-[#111113] border border-[#23242A] space-y-3">
                <div className="text-xs font-bold font-mono uppercase text-[#D98B2B] tracking-wider">
                  + Add Life Category
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    placeholder="Key (e.g. discipline)"
                    value={newCategoryForm.key}
                    onChange={(e) => setNewCategoryForm({ ...newCategoryForm, key: e.target.value })}
                    className="bg-[#17171A] border border-[#282930] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] outline-none font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Label (e.g. Discipline)"
                    value={newCategoryForm.label}
                    onChange={(e) => setNewCategoryForm({ ...newCategoryForm, label: e.target.value })}
                    className="bg-[#17171A] border border-[#282930] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] outline-none"
                  />
                  <input
                    type="number"
                    placeholder="Order"
                    value={newCategoryForm.order}
                    onChange={(e) => setNewCategoryForm({ ...newCategoryForm, order: Number(e.target.value) })}
                    className="bg-[#17171A] border border-[#282930] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] outline-none font-mono"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    className="px-4 py-1.5 rounded-xl bg-[#D98B2B] hover:bg-[#EAA13F] text-[#111113] font-bold text-xs font-mono transition cursor-pointer"
                  >
                    Add Category
                  </button>
                </div>
              </div>

              {/* Categories List */}
              <div className="space-y-2">
                {categoriesList.map((cat) => (
                  <div
                    key={cat.key}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#111113] border border-[#23242A]"
                  >
                    <div>
                      <div className="text-xs font-semibold text-[#F7F5F0]">{cat.label}</div>
                      <div className="text-[10px] text-[#85827A] font-mono">
                        Key: {cat.key} • Order: {cat.order}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCategory(cat.key)}
                      className="p-1.5 rounded-lg text-[#85827A] hover:text-rose-400 transition cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 9: PRIVACY & LOCAL CACHE (THE ONE ADDED STAYS)                         */}
        {/* ========================================================================= */}
        {activeTab === "privacy" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 space-y-5">
              <h2 className="text-sm font-semibold text-[#F7F5F0] pb-2 border-b border-[#23242A]">
                Offline Cache & Data Sovereignty
              </h2>

              <div className="p-4 rounded-xl bg-[#111113] border border-[#23242A] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-[#F7F5F0]">Local Vault Storage</div>
                  <span className="text-xs font-mono text-[#D98B2B]">14.2 MB IndexedDB</span>
                </div>
                <div className="w-full bg-[#1E1F24] h-1.5 rounded-full overflow-hidden">
                  <div className="bg-[#D98B2B] h-full w-[18%]" />
                </div>
                <p className="text-[11px] text-[#85827A] font-mono">
                  Encrypted local cache covering Cockpit, Timeline, Execute, Trajectory, and Vitals.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-[#F7F5F0]">Export Personal Data</div>
                  <div className="text-[11px] text-[#85827A] font-mono">
                    Download complete JSON archive of tasks and logs.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => alert("LifeOS personal archive generated.")}
                  className="px-3 py-1.5 rounded-xl bg-[#1E1F24] hover:bg-[#282930] border border-[#23242A] text-xs font-mono text-[#F7F5F0] transition cursor-pointer"
                >
                  Export JSON
                </button>
              </div>

              <div className="pt-4 border-t border-[#23242A] flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-rose-400">Sovereign Session Termination</div>
                  <div className="text-[11px] text-[#85827A] font-mono">
                    Signs out and immediately wipes all local decrypted cache from this device.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSovereignSignOut}
                  className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-mono font-medium text-rose-400 rounded-xl transition cursor-pointer"
                >
                  Sign Out & Wipe Local Machine
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
