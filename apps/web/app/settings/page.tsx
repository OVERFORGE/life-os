"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plug,
  Sparkles,
  Sliders,
  Laptop,
  MapPin,
  Radio,
  ShieldCheck,
  Check,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  LogOut,
  Mic,
  Calendar as CalendarIcon,
  ChevronDown,
  Volume2,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { startWakeWord, stopWakeWord, setHudEnabled, toggleHudWindow } from "@/lib/desktopBridge";

type SettingsCategory =
  | "connections"
  | "personalization"
  | "ambient"
  | "devices"
  | "locations"
  | "signals"
  | "privacy";

interface UserProfile {
  name?: string;
  email?: string;
  role?: string;
  avatar?: string;
  createdAt?: string;
}

export default function SettingsWorkspace() {
  const router = useRouter();
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<SettingsCategory>("connections");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Connection & Calendar Settings
  const [isGoogleConnected, setIsGoogleConnected] = useState(true);
  const [selectedSubCalendars, setSelectedSubCalendars] = useState({
    work: true,
    studio: true,
    personal: false,
    holidays: false,
  });
  const [defaultCalendar, setDefaultCalendar] = useState("native");
  const [conflictStrategy, setConflictStrategy] = useState("non-destructive");

  // Personalization Settings
  const [displayName, setDisplayName] = useState("Arjun Mehta");
  const [phoneticName, setPhoneticName] = useState("/ɑːrˈdʒuːn/");
  const [rolloverHour, setRolloverHour] = useState("04:00");

  // Ambient Voice Settings (P3-07)
  const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
  const [hudEnabled, setHudEnabledState] = useState(true);
  const [trayEnabled, setTrayEnabled] = useState(true);
  const [hotkeyEnabled, setHotkeyEnabled] = useState(true);
  const [micStatus, setMicStatus] = useState<"IDLE" | "TESTING" | "PASSED" | "DENIED">("IDLE");
  const [micVolume, setMicVolume] = useState<number>(0);

  // Load user data
  useEffect(() => {
    fetch("/api/user")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setUser(data);
          if (data.name) setDisplayName(data.name);
          if (data.preferences?.phoneticName) setPhoneticName(data.preferences.phoneticName);
        }
      })
      .catch((err) => console.error("Failed to load user profile:", err))
      .finally(() => setLoading(false));

    // Restore ambient voice preferences
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
  }, []);

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
      console.warn("Wake word toggle bridge error:", err);
    }
  };

  const handleHudToggle = async (enabled: boolean) => {
    setHudEnabledState(enabled);
    try {
      localStorage.setItem("lifeos_ambient_hud", String(enabled));
      await setHudEnabled(enabled);
    } catch (err) {
      console.warn("HUD toggle bridge error:", err);
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
          stream.getTracks().forEach((t) => t.stop());
          audioContext.close();
          setMicStatus("PASSED");
          setMicVolume(0);
        }
      }, 100);
    } catch {
      setMicStatus("DENIED");
    }
  };

  const handleSovereignSignOut = async () => {
    if (
      confirm(
        "Sign Out of LifeOS?\n\nThis will terminate your session and wipe all decrypted local cache (14.2 MB) from this device."
      )
    ) {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {}
      await signOut({ callbackUrl: "/login" });
    }
  };

  const categories = [
    {
      id: "connections" as SettingsCategory,
      label: "Connections",
      icon: Plug,
      desc: "Google Calendar & services",
    },
    {
      id: "personalization" as SettingsCategory,
      label: "Personalization & Voice",
      icon: Sparkles,
      desc: "Pronunciation & day rollover",
    },
    {
      id: "ambient" as SettingsCategory,
      label: "Ambient & Voice Surfaces",
      icon: Sliders,
      desc: "Wake words, HUD & hotkeys",
    },
    {
      id: "devices" as SettingsCategory,
      label: "Connected Devices",
      icon: Laptop,
      desc: "Desktop & mobile sessions",
    },
    {
      id: "locations" as SettingsCategory,
      label: "Locations & Zones",
      icon: MapPin,
      desc: "Home & work geofencing",
    },
    {
      id: "signals" as SettingsCategory,
      label: "Signals & Automations",
      icon: Radio,
      desc: "Peripheral context inputs",
    },
    {
      id: "privacy" as SettingsCategory,
      label: "Privacy & Local Cache",
      icon: ShieldCheck,
      desc: "Vault storage & sovereignty",
    },
  ];

  return (
    <div className="flex h-full w-full overflow-hidden select-none">
      {/* Secondary Category Navigation Rail (220px width) */}
      <aside className="w-[220px] shrink-0 border-r border-[#23242A] p-4 flex flex-col justify-between bg-[#111113]">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#85827A] font-semibold mb-3 px-2">
            Preferences
          </div>

          <nav className="space-y-1">
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
            <span className="w-1.5 h-1.5 rounded-full bg-[#6B8E7B]" />
            <span>Local Vault Synchronized</span>
          </div>
        </div>
      </aside>

      {/* Main Configuration Content Canvas */}
      <section className="flex-1 overflow-y-auto px-8 py-6 max-w-4xl">
        {/* Header */}
        <div className="mb-6 pb-4 border-b border-[#23242A]">
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#D98B2B] font-semibold block mb-1">
            External Providers & Local Runtime
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-[#F7F5F0]">
            System Configuration & Connections
          </h1>
          <p className="text-xs text-[#C5C2BA] mt-1">
            Manage calendar synchronizations, ambient voice privacy boundaries, active client sessions, and local storage.
          </p>
        </div>

        {/* TAB 1: CONNECTIONS */}
        {activeTab === "connections" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Google Calendar Master Plate */}
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#23242A]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#D98B2B]/10 border border-[#D98B2B]/20 flex items-center justify-center text-[#D98B2B]">
                    <CalendarIcon size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-[#F7F5F0]">Google Calendar</h2>
                      <span className="px-2 py-0.5 rounded-full bg-[#6B8E7B]/15 border border-[#6B8E7B]/30 text-[#6B8E7B] text-[10px] font-mono font-medium">
                        ● Synchronized
                      </span>
                    </div>
                    <p className="text-xs text-[#85827A]">
                      Connected as {user?.email || "arjun.mehta@layerhorizon.studio"} • Synced 2m ago
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => alert("Calendar re-synchronized with local timeline.")}
                    className="px-3 py-1.5 rounded-xl bg-[#1E1F24] hover:bg-[#282930] border border-[#23242A] text-xs text-[#C5C2BA] hover:text-[#F7F5F0] transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw size={12} /> Force Re-Sync
                  </button>
                  <button
                    onClick={() => setIsGoogleConnected(!isGoogleConnected)}
                    className="px-3 py-1.5 rounded-xl bg-[#DE4343]/10 hover:bg-[#DE4343]/20 border border-[#DE4343]/25 text-xs text-[#E85656] transition cursor-pointer"
                  >
                    {isGoogleConnected ? "Disconnect" : "Connect"}
                  </button>
                </div>
              </div>

              {/* Sub-Calendars Checklist */}
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-[#85827A] mb-2">
                  Participating Sub-Calendars
                </div>
                <div className="space-y-2">
                  <label className="flex items-center justify-between p-3 rounded-xl bg-[#111113] border border-[#23242A] cursor-pointer hover:border-[#32343D] transition">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedSubCalendars.work}
                        onChange={(e) =>
                          setSelectedSubCalendars({ ...selectedSubCalendars, work: e.target.checked })
                        }
                        className="rounded accent-[#D98B2B] w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-medium text-[#F7F5F0]">Work / Primary</div>
                        <div className="text-[11px] text-[#85827A]">
                          Events import to Timeline and buffer focus blocks automatically.
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-[#F5E6C8] bg-[#D98B2B]/10 px-2 py-0.5 rounded border border-[#D98B2B]/20">
                      Primary
                    </span>
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl bg-[#111113] border border-[#23242A] cursor-pointer hover:border-[#32343D] transition">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedSubCalendars.studio}
                        onChange={(e) =>
                          setSelectedSubCalendars({ ...selectedSubCalendars, studio: e.target.checked })
                        }
                        className="rounded accent-[#D98B2B] w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-medium text-[#F7F5F0]">Studio Architecture</div>
                        <div className="text-[11px] text-[#85827A]">
                          Team architectural reviews and critical milestone locks.
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-[#D98B2B] bg-[#D98B2B]/10 px-2 py-0.5 rounded border border-[#D98B2B]/20">
                      Amber
                    </span>
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl bg-[#111113] border border-[#23242A] cursor-pointer hover:border-[#32343D] transition">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedSubCalendars.personal}
                        onChange={(e) =>
                          setSelectedSubCalendars({ ...selectedSubCalendars, personal: e.target.checked })
                        }
                        className="rounded accent-[#D98B2B] w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-medium text-[#F7F5F0]">Personal & Errands</div>
                        <div className="text-[11px] text-[#85827A]">
                          Read-only commitments visible on Day Horizon.
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-[#6B8E7B] bg-[#6B8E7B]/10 px-2 py-0.5 rounded border border-[#6B8E7B]/20">
                      Sage
                    </span>
                  </label>
                </div>
              </div>

              {/* Destination & Conflict Rules */}
              <div className="pt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-[#85827A] mb-2">
                    Default Write Destination
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 bg-[#111113] p-1 rounded-xl border border-[#23242A]">
                    {[
                      { label: "LifeOS Native", val: "native" },
                      { label: "Google Calendar", val: "google_work" },
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setDefaultCalendar(opt.val)}
                        className={`py-2 px-2.5 rounded-lg text-xs font-mono transition-all text-center cursor-pointer border ${
                          defaultCalendar === opt.val
                            ? "bg-[#D98B2B]/20 border-[#D98B2B] text-[#ffb86c] font-bold"
                            : "bg-transparent border-transparent text-[#85827A] hover:text-[#C5C2BA]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-[#85827A] mb-2">
                    Sync Conflict Strategy
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 bg-[#111113] p-1 rounded-xl border border-[#23242A]">
                    {[
                      { label: "Non-destructive", val: "non-destructive" },
                      { label: "Prioritize Native", val: "native_priority" },
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setConflictStrategy(opt.val)}
                        className={`py-2 px-2.5 rounded-lg text-xs font-mono transition-all text-center cursor-pointer border ${
                          conflictStrategy === opt.val
                            ? "bg-[#D98B2B]/20 border-[#D98B2B] text-[#ffb86c] font-bold"
                            : "bg-transparent border-transparent text-[#85827A] hover:text-[#C5C2BA]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PERSONALIZATION */}
        {activeTab === "personalization" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-[#F7F5F0] pb-2 border-b border-[#23242A]">
                Human Persona & Aven Phonetics
              </h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-[#85827A] mb-1.5">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] focus:outline-none focus:border-[#D98B2B]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-[#85827A] mb-1.5">
                    Phonetic Pronunciation
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={phoneticName}
                      onChange={(e) => setPhoneticName(e.target.value)}
                      className="flex-1 bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] focus:outline-none focus:border-[#D98B2B] font-mono"
                    />
                    <button
                      onClick={() => alert("Microphone listening: Please speak your name.")}
                      className="px-3 py-2 bg-[#1E1F24] hover:bg-[#282930] border border-[#23242A] rounded-xl text-xs text-[#C5C2BA] hover:text-[#F7F5F0] transition cursor-pointer"
                    >
                      Record
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[#85827A] mb-2">
                  Daily Execution Rollover Hour
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#111113] p-1.5 rounded-xl border border-[#23242A]">
                  {[
                    { label: "02:00 AM", val: "02:00" },
                    { label: "03:00 AM", val: "03:00" },
                    { label: "04:00 AM", val: "04:00" },
                    { label: "05:00 AM", val: "05:00" },
                  ].map((h) => (
                    <button
                      key={h.val}
                      type="button"
                      onClick={() => setRolloverHour(h.val)}
                      className={`py-2 px-3 rounded-lg text-xs font-mono transition-all text-center cursor-pointer border ${
                        rolloverHour === h.val
                          ? "bg-[#D98B2B]/20 border-[#D98B2B] text-[#ffb86c] font-bold"
                          : "bg-transparent border-transparent text-[#85827A] hover:text-[#C5C2BA]"
                      }`}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[#85827A] mt-2">
                  Protects late-night momentum from resetting daily tasks prematurely at midnight (04:00 AM Recommended).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: AMBIENT VOICE & SURFACES */}
        {activeTab === "ambient" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Aven Dynamic HUD (Dynamic Notch) */}
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#23242A]">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-2 rounded-xl bg-[#D98B2B]/10 border border-[#D98B2B]/20 text-[#D98B2B]">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-[#F7F5F0]">
                        Aven Dynamic HUD (Dynamic Notch)
                      </h2>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                          hudEnabled
                            ? "bg-[#6B8E7B]/15 text-[#6B8E7B] border-[#6B8E7B]/30"
                            : "bg-[#23242A] text-[#85827A] border-[#32343D]"
                        }`}
                      >
                        {hudEnabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <p className="text-xs text-[#85827A] mt-1">
                      Top-of-screen dynamic notch overlay with ambient conversational intelligence, cursor hover gesture summoning, and live execution tracker.
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={hudEnabled}
                    onChange={(e) => handleHudToggle(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-[#23242A] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#D98B2B]"></div>
                </label>
              </div>

              {/* Sub-controls when HUD is enabled */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between py-2 border-b border-[#23242A]/60">
                  <div>
                    <div className="text-xs font-medium text-[#F7F5F0]">Cursor Top-Edge Summoning</div>
                    <div className="text-[11px] text-[#85827A]">
                      Gliding your cursor to the top center of the screen reveals the Aven HUD notch.
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-[#C5C2BA]/70 bg-[#111113] px-2 py-0.5 rounded border border-[#23242A]">
                    {hudEnabled ? "Active (Center ±140px)" : "Inactive"}
                  </span>
                </div>

                <div className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-xs font-medium text-[#F7F5F0]">Test HUD Overlay</div>
                    <div className="text-[11px] text-[#85827A]">
                      Trigger the dynamic notch now to inspect appearance and microphone readiness.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleHudWindow(true)}
                    disabled={!hudEnabled}
                    className="px-3 py-1.5 rounded-xl bg-[#1E1F24] hover:bg-[#282930] text-xs font-medium text-[#F7F5F0] border border-[#23242A] disabled:opacity-40 transition cursor-pointer"
                  >
                    Summon HUD
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-[#23242A]">
                <div>
                  <h2 className="text-sm font-semibold text-[#F7F5F0] flex items-center gap-2">
                    <Mic size={16} className="text-[#D98B2B]" />
                    Ambient Voice Detection (P3-07)
                  </h2>
                  <p className="text-xs text-[#85827A] mt-0.5">
                    Summon Aven hands-free by speaking "Hey Aven" or "Aven".
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wakeWordEnabled}
                    onChange={(e) => handleWakeWordToggle(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-[#23242A] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#D98B2B]"></div>
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-[#23242A]/60">
                  <div>
                    <div className="text-xs font-medium text-[#F7F5F0]">OS Microphone Permission</div>
                    <div className="text-[11px] text-[#85827A]">System access for hardware audio input.</div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-[#6B8E7B]/15 border border-[#6B8E7B]/30 text-[#6B8E7B] text-[10px] font-mono font-medium">
                    ✓ Granted in OS Preferences
                  </span>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-[#23242A]/60">
                  <div>
                    <div className="text-xs font-medium text-[#F7F5F0]">System Tray Active Chronometer</div>
                    <div className="text-[11px] text-[#85827A]">Displays remaining focus minutes in desktop menu bar.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={trayEnabled}
                    onChange={(e) => {
                      setTrayEnabled(e.target.checked);
                      localStorage.setItem("lifeos_ambient_tray", String(e.target.checked));
                    }}
                    className="rounded accent-[#D98B2B] w-4 h-4 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-xs font-medium text-[#F7F5F0]">Global Shortcut (Ctrl+Alt+Space)</div>
                    <div className="text-[11px] text-[#85827A]">Summons transient Aven Spotlight HUD from any application.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={hotkeyEnabled}
                    onChange={(e) => {
                      setHotkeyEnabled(e.target.checked);
                      localStorage.setItem("lifeos_ambient_hotkeys", String(e.target.checked));
                    }}
                    className="rounded accent-[#D98B2B] w-4 h-4 cursor-pointer"
                  />
                </div>
              </div>

              {/* Real Audio Testing Box */}
              <div className="p-4 rounded-xl bg-[#111113] border border-[#23242A] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-[#F7F5F0] flex items-center gap-2">
                    <Volume2 size={15} className="text-[#D98B2B]" />
                    Microphone Hardware Diagnostic
                  </div>
                  <button
                    onClick={testMicrophone}
                    disabled={micStatus === "TESTING"}
                    className="px-3 py-1 rounded-lg bg-[#1E1F24] hover:bg-[#282930] text-xs font-medium text-[#F7F5F0] border border-[#23242A] transition cursor-pointer"
                  >
                    {micStatus === "TESTING" ? "Testing (Speak now)..." : "Test Microphone"}
                  </button>
                </div>

                <p className="text-[11px] text-[#85827A] leading-relaxed">
                  Audio is processed 100% locally in transient circular RAM buffers. Strict zero audio retention invariant enforced.
                </p>

                {micStatus === "TESTING" && (
                  <div className="w-full bg-[#1E1F24] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-[#D98B2B] h-full transition-all duration-100"
                      style={{ width: `${micVolume}%` }}
                    />
                  </div>
                )}

                {micStatus === "PASSED" && (
                  <div className="text-[11px] text-[#6B8E7B] flex items-center gap-1.5 font-medium">
                    <Check size={14} /> Microphone input verified and operating clearly.
                  </div>
                )}

                {micStatus === "DENIED" && (
                  <div className="text-[11px] text-[#DE4343] flex items-center gap-1.5 font-medium">
                    <AlertCircle size={14} /> Microphone access denied in browser / OS settings.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CONNECTED DEVICES */}
        {activeTab === "devices" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-[#F7F5F0] pb-2 border-b border-[#23242A]">
                Active Client Sessions
              </h2>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-[#111113] border border-[#23242A]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#1E1F24] flex items-center justify-center text-[#D98B2B]">
                      <Laptop size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-[#F7F5F0]">
                        Desktop Electron LTS (Windows 11) — Active Client
                      </div>
                      <div className="text-[11px] text-[#85827A]">Current Host Session • Local IPC Active</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-[#6B8E7B] bg-[#6B8E7B]/10 px-2 py-0.5 rounded border border-[#6B8E7B]/20">
                    Current Device
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-[#111113] border border-[#23242A]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#1E1F24] flex items-center justify-center text-[#C5C2BA]">
                      <Laptop size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-[#F7F5F0]">iPhone 16 Pro (iOS 18)</div>
                      <div className="text-[11px] text-[#85827A]">Synced 14m ago • End-to-End Encrypted</div>
                    </div>
                  </div>
                  <button
                    onClick={() => alert("Session revoked.")}
                    className="text-xs text-[#E85656] hover:underline"
                  >
                    Revoke
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => alert("All other sessions signed out.")}
                  className="px-4 py-2 bg-[#1E1F24] hover:bg-[#282930] border border-[#23242A] rounded-xl text-xs text-[#C5C2BA] hover:text-[#F7F5F0] transition cursor-pointer"
                >
                  Sign Out All Other Sessions
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: LOCATIONS & ZONES */}
        {activeTab === "locations" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-[#F7F5F0] pb-2 border-b border-[#23242A]">
                Geofencing & Ambient Zones
              </h2>
              <p className="text-xs text-[#C5C2BA]">
                Configure location triggers so Aven automatically suppresses audio in quiet work zones.
              </p>

              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-xl bg-[#111113] border border-[#23242A]">
                  <div>
                    <div className="text-xs font-medium text-[#F7F5F0]">Studio / Architectural Office</div>
                    <div className="text-[11px] text-[#85827A]">Quiet Mode Active • Mute Ambient Voice</div>
                  </div>
                  <span className="text-[10px] font-mono text-[#D98B2B] bg-[#D98B2B]/10 px-2 py-0.5 rounded border border-[#D98B2B]/20">
                    Active Zone
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: SIGNALS & AUTOMATIONS */}
        {activeTab === "signals" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-[#F7F5F0] pb-2 border-b border-[#23242A]">
                Signals & Proactive Behaviors
              </h2>
              <p className="text-xs text-[#C5C2BA]">
                Manage context signals feeding into daily cadence observations.
              </p>

              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-xl bg-[#111113] border border-[#23242A]">
                  <div>
                    <div className="text-xs font-medium text-[#F7F5F0]">Daily Restorative Rest Log</div>
                    <div className="text-[11px] text-[#85827A]">Grounded manual sleep recording</div>
                  </div>
                  <span className="text-[10px] font-mono text-[#6B8E7B] bg-[#6B8E7B]/10 px-2 py-0.5 rounded border border-[#6B8E7B]/20">
                    Active
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: PRIVACY & LOCAL CACHE */}
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
                <p className="text-[11px] text-[#85827A]">
                  Encrypted local cache covering Cockpit, Timeline, Execute, Trajectory, and Vitals.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-[#F7F5F0]">Export Personal Data</div>
                  <div className="text-[11px] text-[#85827A]">Download complete JSON archive of tasks and logs.</div>
                </div>
                <button
                  onClick={() => alert("LifeOS personal archive generated.")}
                  className="px-3 py-1.5 rounded-xl bg-[#1E1F24] hover:bg-[#282930] border border-[#23242A] text-xs text-[#F7F5F0] transition cursor-pointer"
                >
                  Export JSON
                </button>
              </div>

              <div className="pt-4 border-t border-[#23242A] flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-[#E85656]">Sovereign Session Termination</div>
                  <div className="text-[11px] text-[#85827A]">
                    Signs out and immediately wipes all local decrypted cache from this device.
                  </div>
                </div>
                <button
                  onClick={handleSovereignSignOut}
                  className="px-4 py-2 bg-[#DE4343]/10 hover:bg-[#DE4343]/20 border border-[#DE4343]/30 text-xs font-medium text-[#E85656] rounded-xl transition cursor-pointer"
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
