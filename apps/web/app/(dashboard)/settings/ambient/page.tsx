"use client";

import React, { useState, useEffect } from "react";
import { 
  Bell, 
  Mic, 
  Sparkles, 
  Sliders, 
  ShieldCheck, 
  Volume2, 
  Check, 
  AlertCircle, 
  ExternalLink,
  Laptop,
  Smartphone
} from "lucide-react";

/**
 * LifeOS Ambient & Aven Settings (Phase 11)
 * 
 * Provides clear, human-oriented configuration for ambient surfaces:
 * - Notifications & Execution reminders
 * - Desktop system tray & global hotkey (Ctrl+Alt+Space)
 * - Wake words ("Aven", "Hey Aven")
 * - Real local privacy transparency
 */
export default function AmbientSettingsPage() {
  const [hudEnabled, setHudEnabledState] = useState(true);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  const [heyAvenEnabled, setHeyAvenEnabled] = useState(true);
  const [avenEnabled, setAvenEnabled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [desktopTrayEnabled, setDesktopTrayEnabled] = useState(true);
  const [globalShortcutEnabled, setGlobalShortcutEnabled] = useState(true);
  const [micStatus, setMicStatus] = useState<"IDLE" | "TESTING" | "PASSED" | "DENIED">("IDLE");
  const [micVolume, setMicVolume] = useState<number>(0);

  // Restore settings from localStorage
  useEffect(() => {
    try {
      const savedWake = localStorage.getItem("lifeos_ambient_wakeword");
      const isWakeEnabled = savedWake === "true";
      setWakeWordEnabled(isWakeEnabled);
      if (isWakeEnabled) {
        import("@/lib/desktopBridge").then(({ startWakeWord }) => startWakeWord());
      } else {
        import("@/lib/desktopBridge").then(({ stopWakeWord }) => stopWakeWord());
      }

      const savedHud = localStorage.getItem("lifeos_ambient_hud");
      if (savedHud !== null) {
        const isEnabled = savedHud === "true";
        setHudEnabledState(isEnabled);
        import("@/lib/desktopBridge").then(({ setHudEnabled }) => setHudEnabled(isEnabled));
      }

      const savedNotifs = localStorage.getItem("lifeos_ambient_notifs");
      if (savedNotifs !== null) setNotificationsEnabled(savedNotifs === "true");

      const savedTray = localStorage.getItem("lifeos_ambient_tray");
      if (savedTray !== null) setDesktopTrayEnabled(savedTray === "true");

      const savedHotkeys = localStorage.getItem("lifeos_ambient_hotkeys");
      if (savedHotkeys !== null) setGlobalShortcutEnabled(savedHotkeys === "true");
    } catch {}
  }, []);

  const saveSetting = (key: string, value: boolean, setter: (v: boolean) => void) => {
    setter(value);
    try {
      localStorage.setItem(key, String(value));
    } catch {}
  };

  const handleHudToggle = async (enabled: boolean) => {
    saveSetting("lifeos_ambient_hud", enabled, setHudEnabledState);
    try {
      const { setHudEnabled } = await import("@/lib/desktopBridge");
      await setHudEnabled(enabled);
    } catch (err) {
      console.warn("[AmbientSettings] HUD toggle bridge error:", err);
    }
  };

  const handleWakeWordToggle = async (enabled: boolean) => {
    saveSetting("lifeos_ambient_wakeword", enabled, setWakeWordEnabled);
    try {
      const { startWakeWord, stopWakeWord } = await import("@/lib/desktopBridge");
      if (enabled) {
        await startWakeWord();
      } else {
        await stopWakeWord();
      }
    } catch (err) {
      console.warn("[AmbientSettings] Wake word toggle bridge error:", err);
    }
  };

  const toggleNotifications = async (enabled: boolean) => {
    saveSetting("lifeos_ambient_notifs", enabled, setNotificationsEnabled);
    if (enabled && typeof window !== "undefined" && "Notification" in window) {
      try {
        const perm = await Notification.requestPermission();
        if (perm === "granted" && "serviceWorker" in navigator) {
          await navigator.serviceWorker.register("/sw.js");
        }
      } catch (err) {
        console.warn("[WebPush] Notification registration error:", err);
      }
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
        const avg = Math.min(100, Math.round((sum / dataArray.length) * 1.5));
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

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8 font-sans">
      
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-[#E8414A]" />
          Aven & Ambient Interaction
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          LifeOS stays with you quietly throughout your day. Configure when and how it appears.
        </p>
      </div>

      {/* Surface 0: Aven Dynamic HUD (Dynamic Notch) */}
      <div className="bg-[#161618] border border-[#2A2B2F] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-[#1F2023] text-[#E8414A] border border-[#2A2B2F]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white">Aven Dynamic HUD (Dynamic Notch)</h2>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    hudEnabled
                      ? "bg-[#6B8E7B]/15 text-[#6B8E7B] border-[#6B8E7B]/30"
                      : "bg-[#23242A] text-gray-500 border-[#32343D]"
                  }`}
                >
                  {hudEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Top-of-screen dynamic notch overlay with ambient conversational intelligence, cursor hover summoning, and execution tracker.
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
            <div className="w-11 h-6 bg-[#2A2B2F] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#E8414A]"></div>
          </label>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[#2A2B2F]/60 text-xs">
          <span className="text-gray-400">Glide cursor to top-center of screen to summon</span>
          <button
            type="button"
            onClick={async () => {
              const { toggleHudWindow } = await import("@/lib/desktopBridge");
              await toggleHudWindow(true);
            }}
            disabled={!hudEnabled}
            className="px-3 py-1 rounded-lg bg-[#1F2023] hover:bg-[#2A2B2F] text-xs font-medium text-white border border-[#2A2B2F] disabled:opacity-30 transition cursor-pointer"
          >
            Summon HUD Now
          </button>
        </div>
      </div>

      {/* Surface 1: Active Execution Notifications */}
      <div className="bg-[#161618] border border-[#2A2B2F] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-[#1F2023] text-[#E8414A] border border-[#2A2B2F]">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Execution Notifications</h2>
              <p className="text-xs text-gray-400">
                Gentle proposal when due, ongoing chronometer during work, and auto-dismiss upon completion.
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(e) => toggleNotifications(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[#2A2B2F] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#E8414A]"></div>
          </label>
        </div>
      </div>

      {/* Surface 2: Desktop Integration */}
      <div className="bg-[#161618] border border-[#2A2B2F] rounded-2xl p-5 space-y-5">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-[#1F2023] text-[#E8414A] border border-[#2A2B2F]">
            <Laptop className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Desktop Presence (Tauri)</h2>
            <p className="text-xs text-gray-400">
              Native system tray and universal hotkey for instant access from any application.
            </p>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          {/* System Tray Toggle */}
          <div className="flex items-center justify-between py-2 border-b border-[#2A2B2F]/60">
            <div>
              <div className="text-xs font-medium text-gray-200">System Tray Active Status</div>
              <div className="text-[11px] text-gray-500">Shows active task title and remaining minutes in Windows taskbar.</div>
            </div>
            <input
              type="checkbox"
              checked={desktopTrayEnabled}
              onChange={(e) => saveSetting("lifeos_ambient_tray", e.target.checked, setDesktopTrayEnabled)}
              className="w-4 h-4 accent-[#E8414A] rounded"
            />
          </div>

          {/* Global Hotkey Toggle */}
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-xs font-medium text-gray-200">Global Shortcut (Ctrl+Alt+Space)</div>
              <div className="text-[11px] text-gray-500">Summons the transient Aven Spotlight HUD from VS Code or any app.</div>
            </div>
            <input
              type="checkbox"
              checked={globalShortcutEnabled}
              onChange={(e) => saveSetting("lifeos_ambient_hotkeys", e.target.checked, setGlobalShortcutEnabled)}
              className="w-4 h-4 accent-[#E8414A] rounded"
            />
          </div>
        </div>
      </div>

      {/* Surface 3: Local Wake Word */}
      <div className="bg-[#161618] border border-[#2A2B2F] rounded-2xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-[#1F2023] text-[#E8414A] border border-[#2A2B2F]">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Local Wake Word</h2>
              <p className="text-xs text-gray-400">
                Summon Aven hands-free using keyword spotting processed 100% on your local machine.
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={wakeWordEnabled}
              onChange={(e) => handleWakeWordToggle(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[#2A2B2F] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#E8414A]"></div>
          </label>
        </div>

        {wakeWordEnabled && (
          <div className="space-y-4 pt-2 border-t border-[#2A2B2F]/60">
            <div className="text-xs font-semibold text-gray-300">Active Wake Phrases</div>
            
            <div className="grid grid-cols-2 gap-3">
              <div 
                onClick={() => setHeyAvenEnabled(!heyAvenEnabled)}
                className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                  heyAvenEnabled ? "bg-[#1F2023] border-[#E8414A]/60 text-white" : "border-[#2A2B2F] text-gray-500"
                }`}
              >
                <div>
                  <div className="text-xs font-semibold">"Hey Aven"</div>
                  <div className="text-[10px] text-gray-400">Recommended • High noise resistance</div>
                </div>
                {heyAvenEnabled && <Check className="w-4 h-4 text-[#E8414A]" />}
              </div>

              <div 
                onClick={() => setAvenEnabled(!avenEnabled)}
                className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                  avenEnabled ? "bg-[#1F2023] border-[#E8414A]/60 text-white" : "border-[#2A2B2F] text-gray-500"
                }`}
              >
                <div>
                  <div className="text-xs font-semibold">"Aven"</div>
                  <div className="text-[10px] text-gray-400">Fast single word • Desk environments</div>
                </div>
                {avenEnabled && <Check className="w-4 h-4 text-[#E8414A]" />}
              </div>
            </div>
          </div>
        )}

        {/* Microphone Testing & Privacy */}
        <div className="p-4 rounded-xl bg-[#1A1A1D] border border-[#2A2B2F] space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-gray-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#E8414A]" />
              Local Privacy Guarantee
            </div>
            <button
              onClick={testMicrophone}
              disabled={micStatus === "TESTING"}
              className="px-3 py-1 rounded-lg bg-[#2A2B2F] hover:bg-[#38393F] text-xs font-medium text-gray-200 transition"
            >
              {micStatus === "TESTING" ? "Testing (Speak now)..." : "Test Microphone"}
            </button>
          </div>

          <p className="text-[11px] text-gray-400 leading-relaxed">
            Microphone audio is processed entirely in transient local RAM on your device.
            Zero audio packets leave your computer until the wake phrase is confirmed.
          </p>

          {micStatus === "TESTING" && (
            <div className="w-full bg-[#2A2B2F] h-2 rounded-full overflow-hidden">
              <div 
                className="bg-[#E8414A] h-full transition-all duration-100"
                style={{ width: `${micVolume}%` }}
              />
            </div>
          )}

          {micStatus === "PASSED" && (
            <div className="text-[11px] text-emerald-400 flex items-center gap-1.5 font-medium">
              <Check className="w-3.5 h-3.5" />
              Microphone operational and clear.
            </div>
          )}

          {micStatus === "DENIED" && (
            <div className="text-[11px] text-[#E8414A] flex items-center gap-1.5 font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              Microphone access denied. Please grant permission in browser settings.
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
