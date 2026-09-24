"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Sparkles,
  Mic,
  Square,
  Volume2,
  Clock,
  Scale,
  Check,
  Flame,
  Activity,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DIET_MODES = [
  { id: "maintenance", label: "Maintenance", desc: "Maintain current weight & energy" },
  { id: "recomp", label: "Recomposition", desc: "Build muscle while losing fat" },
  { id: "cut", label: "Calorie Deficit", desc: "Targeted fat loss" },
  { id: "bulk", label: "Calorie Surplus", desc: "Targeted muscle gain" },
];

export default function PersonalizationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // User Profile & Voice State
  const [userName, setUserName] = useState("");
  const [phoneticName, setPhoneticName] = useState("");
  const [pronunciationPreference, setPronunciationPreference] = useState<"auto" | "custom" | "voice_sample">("auto");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingSample, setIsProcessingSample] = useState(false);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Daily Preferences State
  const [rolloverHour, setRolloverHour] = useState(4);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderDay, setReminderDay] = useState(0);
  const [reminderHour, setReminderHour] = useState(9);

  // Diet Mode State
  const [dietMode, setDietMode] = useState("recomp");
  const [maintenanceCals, setMaintenanceCals] = useState(2200);

  useEffect(() => {
    fetch("/api/user")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setUserName(data.name || "");
          const prefs = data.preferences || {};
          setPhoneticName(prefs.phoneticName || "");
          setPronunciationPreference(prefs.pronunciationPreference || "auto");
          setRolloverHour(prefs.dayRolloverHour ?? 4);
          setReminderEnabled(prefs.weightReminderEnabled !== false);
          setReminderDay(prefs.weightReminderDay ?? 0);
          setReminderHour(prefs.weightReminderHour ?? 9);
          if (data.dietMode) setDietMode(data.dietMode);
          if (data.maintenanceCalories) setMaintenanceCals(data.maintenanceCalories);
        }
      })
      .catch((err) => console.error("Failed to load user preferences:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch (err) {
      console.error("Failed to save preferences:", err);
    } finally {
      setSaving(false);
    }
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        setIsProcessingSample(true);

        try {
          const audioBlob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
          const formData = new FormData();
          formData.append("file", audioBlob, "pronunciation_sample.webm");

          const res = await fetch("/api/user/pronunciation-sample", {
            method: "POST",
            body: formData,
          });

          if (res.ok) {
            const data = await res.json();
            if (data.phoneticName) {
              setPhoneticName(data.phoneticName);
              setPronunciationPreference("voice_sample");
            }
          } else {
            const err = await res.json();
            alert(err.error || "Failed to process pronunciation sample");
          }
        } catch (e: any) {
          console.error("Failed to upload pronunciation sample:", e);
          alert("Error uploading sample: " + e.message);
        } finally {
          setIsProcessingSample(false);
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error("Microphone access error:", err);
      alert("Could not access microphone: " + err.message);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const handleTestVoice = () => {
    if (isTestingVoice) return;
    setIsTestingVoice(true);
    const targetName = phoneticName.trim() || userName || "Daksh";
    const text = `Hello ${targetName}. I am Aven, your executive operating system.`;
    const audio = new Audio(
      `/api/voice/tts?text=${encodeURIComponent(text)}&voice=en-GB-RyanNeural`
    );
    audio.onended = () => setIsTestingVoice(false);
    audio.onerror = () => setIsTestingVoice(false);
    audio.play().catch(() => setIsTestingVoice(false));
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin" />
        <div className="text-gray-400 mt-4 text-sm font-medium">Loading Preferences...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-6 border-b border-[#2A2B2F]">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2.5 bg-[#1F2023] border border-[#2A2B2F] hover:border-gray-500 rounded-xl text-gray-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Personalization & Voice</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Customize voice assistant behavior, teach name pronunciation, and configure daily operations.
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#E8414A] hover:bg-[#D3353E] disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-md shadow-[#E8414A]/20"
        >
          {saving ? (
            <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : saved ? (
            <Check className="w-4 h-4" />
          ) : null}
          <span>{saved ? "Saved!" : "Save Changes"}</span>
        </button>
      </div>

      <div className="space-y-8">
        {/* ── 1. Voice Identity & Name Pronunciation ── */}
        <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-[#E8414A]/10 text-[#E8414A] rounded-xl">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Aven Voice & Name Pronunciation</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Ensure Aven pronounces your name naturally regardless of cultural background.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Active Voice Card */}
            <div className="bg-[#25262A] border border-[#303136] rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Assistant Voice</span>
                <p className="text-sm font-bold text-white mt-0.5">Aven (Polished British Jarvis)</p>
                <p className="text-xs text-gray-400 mt-0.5">Neural synthesis via Edge TTS</p>
              </div>
              <span className="px-3 py-1 bg-[#E8414A]/10 text-[#E8414A] border border-[#E8414A]/20 rounded-lg text-xs font-mono font-bold">
                en-GB-RyanNeural
              </span>
            </div>

            {/* Phonetic Alias Input */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-300 mb-2">
                Phonetic Name Alias
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={phoneticName}
                  onChange={(e) => {
                    setPhoneticName(e.target.value);
                    setPronunciationPreference("custom");
                  }}
                  placeholder={userName ? `e.g. Duksh for ${userName}` : "e.g. Duksh"}
                  className="w-full bg-[#25262A] border border-[#303136] focus:border-[#E8414A] rounded-xl px-4 py-3 text-sm text-white font-semibold outline-none transition-colors placeholder:text-gray-500"
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Type an English phonetic respelling or record an audio sample below so the British voice speaks your name with accurate phonetics.
              </p>
            </div>

            {/* Action Buttons: Audio Sample Recording & TTS Preview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <button
                type="button"
                onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                disabled={isProcessingSample}
                className={`flex items-center justify-center gap-3 p-3.5 rounded-xl border text-sm font-bold transition-all ${
                  isRecording
                    ? "bg-red-600 border-red-500 text-white animate-pulse"
                    : "bg-[#25262A] border-[#303136] hover:border-[#E8414A] text-white hover:bg-[#2A2B30]"
                }`}
              >
                {isProcessingSample ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>Analyzing Phonetics...</span>
                  </>
                ) : isRecording ? (
                  <>
                    <Square className="w-4 h-4 fill-white" />
                    <span>Stop Recording</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4 text-[#E8414A]" />
                    <span>Record Voice Sample</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleTestVoice}
                disabled={isTestingVoice || isRecording}
                className={`flex items-center justify-center gap-3 p-3.5 rounded-xl border text-sm font-bold transition-all ${
                  isTestingVoice
                    ? "bg-[#E8414A]/20 border-[#E8414A] text-[#E8414A]"
                    : "bg-[#25262A] border-[#303136] hover:border-gray-500 text-white hover:bg-[#2A2B30]"
                }`}
              >
                {isTestingVoice ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin" />
                    <span>Playing Preview...</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4 text-[#E8414A]" />
                    <span>Test Pronunciation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── 2. Daily Schedule & Rollover ── */}
        <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-[#26282E] text-[#ECE7E3] border border-[#3E424B] rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Daily Schedule & Rollover</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Set when your daily tasks archive and when new mornings begin.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Day Rollover Hour */}
            <div className="flex items-center justify-between bg-[#25262A] border border-[#303136] rounded-xl p-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Day Rollover Hour</span>
                <p className="text-sm font-bold text-white mt-0.5">
                  {rolloverHour === 0 ? "12:00 AM (Midnight)" : `${rolloverHour}:00 AM`}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Tasks from the previous day roll over at this time.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRolloverHour(Math.max(0, rolloverHour - 1))}
                  className="p-2 bg-[#1F2023] border border-[#303136] hover:border-gray-500 rounded-lg text-gray-300"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <span className="w-12 text-center font-mono font-bold text-white text-sm">
                  {rolloverHour}:00
                </span>
                <button
                  type="button"
                  onClick={() => setRolloverHour(Math.min(12, rolloverHour + 1))}
                  className="p-2 bg-[#1F2023] border border-[#303136] hover:border-gray-500 rounded-lg text-gray-300"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Weight Measurement Reminder */}
            <div className="bg-[#25262A] border border-[#303136] rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Weight Measurement Reminder</span>
                  <p className="text-sm font-bold text-white mt-0.5">Get reminded to weigh in</p>
                </div>
                <input
                  type="checkbox"
                  checked={reminderEnabled}
                  onChange={(e) => setReminderEnabled(e.target.checked)}
                  className="w-5 h-5 accent-[#E8414A] rounded cursor-pointer"
                />
              </div>

              {reminderEnabled && (
                <div className="space-y-4 pt-3 border-t border-[#303136]">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                      Reminder Day
                    </label>
                    <div className="grid grid-cols-7 gap-2">
                      {DAYS.map((day, idx) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setReminderDay(idx)}
                          className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                            reminderDay === idx
                              ? "bg-[#E8414A] border-[#E8414A] text-white shadow-sm"
                              : "bg-[#1F2023] border-[#303136] text-gray-400 hover:text-white"
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs font-bold text-gray-300">Reminder Time</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setReminderHour(Math.max(5, reminderHour - 1))}
                        className="p-1.5 bg-[#1F2023] border border-[#303136] rounded-lg text-gray-300"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-mono font-bold text-sm text-white px-2">
                        {reminderHour % 12 || 12}:00 {reminderHour < 12 ? "AM" : "PM"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setReminderHour(Math.min(22, reminderHour + 1))}
                        className="p-1.5 bg-[#1F2023] border border-[#303136] rounded-lg text-gray-300"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 3. Nutrition & Diet Baseline ── */}
        <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-[#26282E] text-[#ECE7E3] border border-[#3E424B] rounded-xl">
              <Flame className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Nutrition Strategy & Targets</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Caloric targets used by Aven when planning daily health and logging meals.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DIET_MODES.map((dm) => (
                <div
                  key={dm.id}
                  onClick={() => setDietMode(dm.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    dietMode === dm.id
                      ? "bg-[#E8414A]/10 border-[#E8414A]"
                      : "bg-[#25262A] border-[#303136] hover:border-gray-500"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-bold ${dietMode === dm.id ? "text-[#E8414A]" : "text-white"}`}>
                      {dm.label}
                    </span>
                    {dietMode === dm.id && <Check className="w-4 h-4 text-[#E8414A]" />}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{dm.desc}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between bg-[#25262A] border border-[#303136] rounded-xl p-4 mt-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Daily Baseline Calories
                </span>
                <p className="text-xs text-gray-400 mt-0.5">Base expenditure before exercise</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMaintenanceCals(Math.max(1200, maintenanceCals - 50))}
                  className="p-2 bg-[#1F2023] border border-[#303136] rounded-lg text-gray-300"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <span className="font-mono font-bold text-white text-base min-w-[70px] text-center">
                  {maintenanceCals} <span className="text-xs font-normal text-gray-400">kcal</span>
                </span>
                <button
                  type="button"
                  onClick={() => setMaintenanceCals(Math.min(4500, maintenanceCals + 50))}
                  className="p-2 bg-[#1F2023] border border-[#303136] rounded-lg text-gray-300"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
