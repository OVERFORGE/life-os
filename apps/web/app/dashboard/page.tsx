"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  TrendingUp,
  Sparkles,
  Mic,
  ArrowUp,
  Check,
  CheckCircle2,
  Circle,
  Moon,
  Clock,
  Layers,
  Zap,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { AvenBlob } from "@/components/ai/AvenBlob";
import { useDashboard } from "@/hooks/useDashboard";
import { useTasks } from "@/hooks/useTasks";
import { useWorld } from "@/hooks/useWorld";
import { useAssistant } from "@/hooks/useAssistant";
import RealtimeVoiceModal from "@/features/voice/RealtimeVoiceModal";

interface StreamItem {
  id: string;
  title: string;
  time: string;
  active?: boolean;
}

interface CockpitTask {
  id: string;
  title: string;
  subtitle: string;
  time?: string;
  tag: string;
  tagType: "priority" | "calm" | "ritual";
  completed: boolean;
}

export default function CockpitDashboardPage() {
  const { data: session } = useSession();
  const userName = session?.user?.name || "Arjun";

  // Prevent Next.js SSR hydration mismatches with client local time
  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [isVoiceCallOpen, setIsVoiceCallOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Kernel Backend Projections & Telemetry
  const { dashboard } = useDashboard();
  const { readyTasks, blockedTasks, criticalPath } = useTasks();
  const { world } = useWorld();
  const { assistantContext } = useAssistant();

  // 1. Dynamic Greeting based on User's Local Time Zone
  const hour = mounted ? currentTime.getHours() : 10;
  let greeting = "Good morning";
  if (hour >= 12 && hour < 17) {
    greeting = "Good afternoon";
  } else if (hour >= 17 && hour < 21) {
    greeting = "Good evening";
  } else if (hour >= 21 || hour < 5) {
    greeting = "Good night";
  }

  // 2. Dynamic Cadence State & Shielded Time
  const cadenceState =
    dashboard?.lifeState?.state ||
    world?.lifeState?.state ||
    assistantContext?.lifeState?.state ||
    "Steady";

  const confidence =
    dashboard?.lifeState?.confidence ??
    world?.lifeState?.confidence ??
    assistantContext?.lifeState?.confidence ??
    0.87;
  const clarityPct = Math.round(confidence * 100);

  // Calculate dynamic uninterrupted focus / shielded time from ready execution tasks
  const allTasks = useMemo(
    () => [...(readyTasks || []), ...(criticalPath || [])],
    [readyTasks, criticalPath]
  );

  // 3. Dynamic Continuous Stream from Today's Calendar Timeline & Routine
  const [todayBlocks, setTodayBlocks] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    const fetchTodaySchedule = async () => {
      try {
        const now = new Date();
        const yr = now.getFullYear();
        const mo = String(now.getMonth() + 1).padStart(2, "0");
        const da = String(now.getDate()).padStart(2, "0");
        const todayStr = `${yr}-${mo}-${da}`;
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const res = await fetch(`/api/calendar/timeline?date=${todayStr}&view=day&timezone=${encodeURIComponent(tz)}`);
        const json = await res.json();
        if (active && res.ok && (json.ok || json.success) && json.data?.blocks) {
          setTodayBlocks(json.data.blocks);
        }
      } catch (e) {
        console.error("Failed to load today schedule for stream", e);
      }
    };
    fetchTodaySchedule();

    const handleFocus = () => {
      fetchTodaySchedule();
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const totalReadyMinutes = allTasks.reduce(
    (acc, t) => acc + (t.estimatedDurationMinutes || 45),
    0
  );

  const plannedFocusMinutes = todayBlocks.length > 0
    ? todayBlocks
        .filter((b) => !b.kind?.toUpperCase().includes("BREAK") && !b.kind?.toUpperCase().includes("REST"))
        .reduce((acc, b) => acc + (b.planned?.durationMinutes ?? 60), 0)
    : totalReadyMinutes;

  const shieldedHours =
    plannedFocusMinutes > 0 ? (plannedFocusMinutes / 60).toFixed(1) : "4.5";

  // Dynamic Continuous Stream & Live Playhead Needle (Synced to User's Day Schedule)
  const nowMinutes = mounted
    ? currentTime.getHours() * 60 + currentTime.getMinutes()
    : 648; // default to 10:48 AM if not mounted

  const liveTimeStr = mounted
    ? currentTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) +
      " Live"
    : "10:48 AM Live";

  const formatStreamTime = (min: number) => {
    const norm = ((min % 1440) + 1440) % 1440;
    const h = Math.floor(norm / 60);
    const m = norm % 60;
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  };

  const defaultStreamData = [
    { id: "def-1", title: "Executive Sync", startMin: 510, endMin: 570 }, // 08:30 - 09:30
    { id: "def-2", title: "Systems Architecture", startMin: 585, endMin: 690 }, // 09:45 - 11:30
    { id: "def-3", title: "Lunch & Walk", startMin: 720, endMin: 780 }, // 12:00 - 13:00
    { id: "def-4", title: "Architecture Review", startMin: 780, endMin: 840 }, // 13:00 - 14:00
  ];

  interface StreamBlockData {
    id: string;
    title: string;
    startMin: number;
    endMin: number;
    time: string;
    active: boolean;
    past: boolean;
  }

  const streamData = useMemo(() => {
    let rawItems: { id: string; title: string; startMin: number; endMin: number }[] = [];

    if (todayBlocks && todayBlocks.length > 0) {
      const filtered = [...todayBlocks]
        .filter((b) => b.status !== "CANCELLED")
        .sort((a, b) => (a.planned?.startMinute ?? 0) - (b.planned?.startMinute ?? 0));

      rawItems = filtered.slice(0, 4).map((b) => {
        const sMin = b.planned?.startMinute ?? 0;
        const eMin = b.planned?.endMinute ?? sMin + (b.planned?.durationMinutes ?? 60);
        return {
          id: b.blockId || b.occurrenceId || Math.random().toString(),
          title: b.title,
          startMin: sMin,
          endMin: eMin,
        };
      });
    }

    if (rawItems.length === 0) {
      rawItems = defaultStreamData;
    }

    // Determine active index strictly when current time falls within event bounds
    const activeIdx = rawItems.findIndex(
      (item) => nowMinutes >= item.startMin && nowMinutes < item.endMin
    );

    const streamStartMin = rawItems[0]?.startMin ?? 0;
    const streamEndMin = rawItems[rawItems.length - 1]?.endMin ?? 1440;

    const items: StreamBlockData[] = rawItems.map((item, idx) => {
      const isActive = activeIdx !== -1 && idx === activeIdx;
      const isPast = nowMinutes >= item.endMin;
      return {
        id: item.id,
        title: item.title,
        startMin: item.startMin,
        endMin: item.endMin,
        time: `${formatStreamTime(item.startMin)} – ${formatStreamTime(item.endMin)}`,
        active: isActive,
        past: isPast,
      };
    });

    const N = items.length;
    let needlePct: number | null = null;
    let statusText: string = "";

    if (nowMinutes < streamStartMin) {
      // Current time is before the day's schedule starts
      needlePct = null;
      statusText = `Schedule starts at ${formatStreamTime(streamStartMin)}`;
    } else if (nowMinutes > streamEndMin) {
      // Current time is past the day's commitments
      needlePct = null;
      statusText = "Day schedule complete";
    } else {
      // Current time is within schedule window
      if (activeIdx !== -1) {
        const activeItem = rawItems[activeIdx];
        const span = Math.max(1, activeItem.endMin - activeItem.startMin);
        const progressInCard = Math.max(0, Math.min(1, (nowMinutes - activeItem.startMin) / span));
        needlePct = (activeIdx / N) * 100 + progressInCard * (100 / N);
      } else {
        const nextIdx = rawItems.findIndex((it) => it.startMin > nowMinutes);
        if (nextIdx !== -1) {
          needlePct = (nextIdx / N) * 100;
          statusText = `Next: ${rawItems[nextIdx].title} at ${formatStreamTime(rawItems[nextIdx].startMin)}`;
        } else {
          needlePct = 100;
        }
      }
    }

    // Axis tick markers aligned with column boundaries
    const axisTicks: { label: string; leftPct: number; align: "left" | "center" | "right" }[] = [];
    items.forEach((it, idx) => {
      if (idx === 0) {
        axisTicks.push({
          label: formatStreamTime(it.startMin),
          leftPct: 0,
          align: "left",
        });
      } else {
        axisTicks.push({
          label: formatStreamTime(it.startMin),
          leftPct: (idx / N) * 100,
          align: "center",
        });
      }
    });
    if (items.length > 0) {
      axisTicks.push({
        label: formatStreamTime(items[items.length - 1].endMin),
        leftPct: 100,
        align: "right",
      });
    }

    return {
      items,
      streamStartMin,
      streamEndMin,
      needlePct,
      statusText,
      axisTicks,
    };
  }, [todayBlocks, nowMinutes]);

  const gridColsClass =
    streamData.items.length === 1
      ? "grid-cols-1"
      : streamData.items.length === 2
      ? "grid-cols-2"
      : streamData.items.length === 3
      ? "grid-cols-1 sm:grid-cols-3"
      : "grid-cols-2 sm:grid-cols-4";

  // Contextual Decision State
  const [decisionDismissed, setDecisionDismissed] = useState(false);
  const [decisionConfirmed, setDecisionConfirmed] = useState(false);

  // Dynamic Contextual Decision Content from Kernel Signals
  const activeSignal =
    dashboard?.activeSignals?.[0] || assistantContext?.predictions?.[0];
  const decisionTitle = (activeSignal as any)?.title || "Hold 90m focus block?";
  const decisionExplanation =
    (activeSignal as any)?.message ||
    (activeSignal as any)?.predictionText ||
    "Elena's team inquiry advisory notes are buffered. Holding this slot safeguards deep architecture prototype delivery.";
  const slotTime = `${((hour + 1) % 12) || 12}:00 ${hour + 1 >= 12 ? "PM" : "AM"} Slot`;
  const bufferedAlertsCount = dashboard?.goalLoad?.highPressureGoalsCount || 4;
  const autoResolveMinutes = Math.max(15, 60 - (mounted ? currentTime.getMinutes() : 15));

  // Command input state
  const [promptInput, setPromptInput] = useState("");
  const [isSubmittingPrompt, setIsSubmittingPrompt] = useState(false);

  // System Architecture & Service Tasks
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(
    new Set(["t1"])
  );

  const defaultTasks: CockpitTask[] = [
    {
      id: "t1",
      title: "Systems Architecture & Service Flow",
      subtitle: "Offline boundary contracts • 50m slot",
      tag: "PRIORITY",
      tagType: "priority",
      completed: true,
    },
    {
      id: "t2",
      title: "Review Elena's Horizon Brief",
      subtitle: "Design advisory notes • 30m slot",
      time: "14:00",
      tag: "CALM",
      tagType: "calm",
      completed: false,
    },
    {
      id: "t3",
      title: "Sunset Reflection & Evening Lock",
      subtitle: "Clear notification spillover, record daily wins",
      time: "17:30",
      tag: "RITUAL",
      tagType: "ritual",
      completed: false,
    },
  ];

  const taskList: CockpitTask[] = useMemo(() => {
    if (!allTasks || allTasks.length === 0) {
      return defaultTasks.map((t) => ({
        ...t,
        completed: completedTaskIds.has(t.id),
      }));
    }

    return allTasks.slice(0, 5).map((t, idx) => {
      const isHigh =
        t.priority === 1 || t.priority === "high" || t.priority === "HIGH";
      const tagType: "priority" | "calm" | "ritual" = t.isBlocked
        ? "calm"
        : isHigh
        ? "priority"
        : idx % 2 === 0
        ? "ritual"
        : "calm";
      const tag = t.isBlocked ? "BLOCKED" : isHigh ? "PRIORITY" : tagType.toUpperCase();

      return {
        id: t.id,
        title: t.title,
        subtitle:
          t.blockReason ||
          `${t.estimatedDurationMinutes || 45}m slot • Execution-ready DAG node`,
        time: t.dueDate
          ? new Date(t.dueDate).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : undefined,
        tag,
        tagType,
        completed: completedTaskIds.has(t.id) || t.status === "completed",
      };
    });
  }, [allTasks, completedTaskIds]);

  const toggleTask = (id: string) => {
    setCompletedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim()) return;
    setIsSubmittingPrompt(true);
    setTimeout(() => {
      setPromptInput("");
      setIsSubmittingPrompt(false);
    }, 600);
  };

  const addressedCount = taskList.filter((t) => t.completed).length;

  // Pacing Wave & Telemetry dynamic metrics
  const clarityScore = Math.round(confidence * 233);
  const peakZone = clarityScore;
  const telemetryRestNote =
    world?.lifeState?.explanation ||
    dashboard?.lifeState?.explanation ||
    "Cognitive reserve remains uncompromised. Mental bandwidth will comfortably sustain deep execution until planned evening shutdown at 18:00.";

  return (
    <div className="relative w-full min-h-full bg-[#111113] text-[#F7F5F0] p-6 lg:p-8 flex flex-col justify-between overflow-x-hidden select-none font-sans">
      
      {/* Background Precise Coordinate Grid Lines (Very Dim, Radial Fade-out to Edges) */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255, 255, 255, 0.022) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.022) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          maskImage:
            "radial-gradient(ellipse 65% 60% at 50% 48%, black 15%, rgba(0,0,0,0.4) 55%, transparent 88%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 65% 60% at 50% 48%, black 15%, rgba(0,0,0,0.4) 55%, transparent 88%)",
        }}
      />

      {/* TOP ROW: Greeting & Cadence (Left) + Continuous Stream (Right) */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Greeting & System Cadence */}
        <div className="lg:col-span-5 flex flex-col pt-1">
          <h1 className="text-3xl lg:text-4xl font-semibold text-[#F7F5F0] tracking-tight">
            {greeting}, <span className="font-normal italic text-[#F5E6C8]">{userName}.</span>
          </h1>
          <div className="flex items-center gap-6 mt-4">
            <div>
              <span className="text-[#85827A] block text-[10px] font-mono uppercase tracking-wider">
                Cadence State
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-semibold text-xs text-[#F7F5F0]">{cadenceState}</span>
                <span className="font-mono text-[11px] text-[#D98B2B]">{clarityPct}% clarity</span>
              </div>
            </div>

            <div className="w-[1px] h-6 bg-[#23242A]" />

            <div>
              <span className="text-[#85827A] block text-[10px] font-mono uppercase tracking-wider">
                Shielded Time
              </span>
              <div className="mt-0.5">
                <span className="font-semibold text-xs text-[#F7F5F0]">{shieldedHours}h</span>
                <span className="text-[#85827A] text-xs ml-1 font-mono">uninterrupted</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Continuous Stream Timeline Widget (Exact Stitch Design) */}
        <div className="lg:col-span-7 bg-[#17171A] border border-[#23242A] rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col justify-between">
          {/* Header Row */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-[#D98B2B] stroke-[2.5]" />
              <h2 className="text-sm font-semibold text-[#F7F5F0] tracking-tight">
                Continuous Stream
              </h2>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-mono text-[#D98B2B]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D98B2B] shadow-[0_0_6px_#D98B2B] animate-pulse" />
              <span>{liveTimeStr}</span>
              {streamData.statusText && (
                <span className="text-[#85827A] font-sans text-[11px] hidden sm:inline">
                  · {streamData.statusText}
                </span>
              )}
            </div>
          </div>

          {/* Timeline Axis Labels (Directly Aligned with Schedule Cards) */}
          <div className="relative w-full h-5 text-[11px] font-mono text-[#85827A] px-1 mb-1.5 select-none">
            {streamData.axisTicks.map((tick, i) => (
              <span
                key={i}
                className={`absolute top-0 transition-opacity duration-300 ${
                  tick.align === "left"
                    ? "left-1 text-left"
                    : tick.align === "right"
                    ? "right-1 text-right"
                    : "hidden sm:inline -translate-x-1/2 text-center"
                }`}
                style={tick.align === "center" ? { left: `${tick.leftPct}%` } : undefined}
              >
                {tick.label}
              </span>
            ))}

            {/* Live Playhead Needle Marker Beacon on Axis (Only if within schedule range) */}
            {streamData.needlePct !== null && (
              <div
                className="absolute top-0 -translate-x-1/2 flex items-center gap-1 text-[#D98B2B] font-semibold transition-all duration-500 z-10 bg-[#17171A]/95 px-1.5 py-0.5 rounded shadow text-[10px]"
                style={{ left: `${Math.max(4, Math.min(96, streamData.needlePct))}%` }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#D98B2B] shadow-[0_0_6px_#D98B2B] animate-pulse" />
                <span>{liveTimeStr}</span>
              </div>
            )}
          </div>

          {/* Recessed Track Container */}
          <div className="relative w-full bg-[#121214] border border-[#23242A] rounded-xl p-1.5 overflow-hidden">
            {/* Live Playhead / Golden Needle Marker aligned with live time (Only if in range) */}
            {streamData.needlePct !== null && (
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-[#D98B2B] shadow-[0_0_8px_rgba(217,139,43,0.95),0_0_2px_#FFF] pointer-events-none z-20 transition-all duration-500"
                style={{ left: `${Math.max(1, Math.min(99, streamData.needlePct))}%` }}
              >
                {/* Needle Top Beacon Cap */}
                <div className="absolute -top-0.5 -left-[3px] w-2 h-1.5 bg-[#F5E6C8] rounded-b-full shadow-[0_0_6px_#D98B2B]" />
              </div>
            )}

            {/* Stream Cards Track */}
            <div className={`grid ${gridColsClass} gap-2 relative z-10`}>
              {streamData.items.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-lg p-2.5 transition-all text-left flex flex-col justify-between min-h-[58px] ${
                    item.active
                      ? "bg-[#241A10] border border-[#D98B2B]/60 shadow-[0_0_12px_rgba(217,139,43,0.12)]"
                      : item.past
                      ? "bg-[#18181B] border border-[#23242A]/60 opacity-60"
                      : "bg-[#1E1F24] border border-[#23242A] hover:border-[#32343D]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span
                      className={`text-xs font-semibold truncate ${
                        item.past ? "text-[#A09D95]" : "text-[#F7F5F0]"
                      }`}
                    >
                      {item.title}
                    </span>
                    {item.active && (
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#D98B2B] text-[#111113] shrink-0">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span
                      className={
                        item.active
                          ? "text-[#D98B2B] font-medium"
                          : item.past
                          ? "text-[#6B6860]"
                          : "text-[#85827A]"
                      }
                    >
                      {item.time}
                    </span>
                    {item.past && (
                      <span className="text-[9px] text-[#6B6860] uppercase tracking-wider">Done</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* MIDDLE ROW: Glowing Aven Orb (Center) & Contextual Decision Card (Right) */}
      <div className="relative z-10 my-8 flex flex-col items-center justify-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 items-center gap-6">
          
          {/* Spacer for symmetry on large screens */}
          <div className="hidden lg:block lg:col-span-3" />

          {/* Centerpiece: Glowing Aven AI Blob (WebGL2 Fluid Glass Orb) */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center">
            <div
              onClick={() => setIsVoiceCallOpen(true)}
              className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center cursor-pointer group select-none"
              title="Click orb to speak with Aven"
            >
              {/* Diffuse Outer Ambient Glow */}
              <div className="absolute inset-4 rounded-full bg-[#D98B2B]/20 group-hover:bg-[#D98B2B]/40 blur-3xl pointer-events-none -z-10 transition-all duration-300 animate-pulse" />
              
              {/* Interactive WebGL2 AI Blob */}
              <AvenBlob
                colors={["#D98B2B", "#F5E6C8", "#8C5212"]}
                backgroundColor="#111113"
                size={1.05}
                glow={1.2}
                bleed={1.0}
                wobble={0.85}
                highlight={1.3}
                trail={1.1}
                speed={0.9}
                hoverIntensity={1.25}
                followCursor={true}
                clickPulse={true}
                intro={true}
                className="w-full h-full cursor-pointer"
              />
            </div>

            {/* Aven Subtitle Label (Interactive Clickable Trigger) */}
            <button
              type="button"
              onClick={() => setIsVoiceCallOpen(true)}
              className="flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-[#17171A] hover:bg-[#1E1F24] border border-[#23242A] hover:border-[#D98B2B]/50 text-xs font-mono font-semibold tracking-widest text-[#85827A] hover:text-[#ffb86c] transition-all cursor-pointer shadow-sm group"
              title="Click to start voice session"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#D98B2B] shadow-[0_0_6px_rgba(217,139,43,0.8)] group-hover:animate-ping" />
              <span>AVEN · CLICK TO TALK</span>
            </button>

            {/* Command Prompt Pill under Orb */}
            <form
              onSubmit={handlePromptSubmit}
              className="mt-4 w-full max-w-md bg-[#17171A] border border-[#23242A] hover:border-[#32343D] focus-within:border-[#D98B2B]/60 rounded-full px-4 py-2.5 flex items-center gap-3 shadow-2xl transition-all"
            >
              <Sparkles size={14} className="text-[#D98B2B] shrink-0" />
              <input
                type="text"
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="Ask Aven or log a boundary note..."
                className="bg-transparent text-xs text-[#F7F5F0] placeholder-[#66635B] outline-none flex-1 min-w-0"
              />
              <button
                type="button"
                onClick={() => setIsVoiceCallOpen(true)}
                className="text-[#85827A] hover:text-[#ffb86c] transition-colors p-1 cursor-pointer"
                title="Start Voice Call with Aven"
              >
                <Mic size={14} />
              </button>
              <button
                type="submit"
                disabled={isSubmittingPrompt || !promptInput.trim()}
                className={`p-1.5 rounded-full text-[#111113] transition-all cursor-pointer ${
                  promptInput.trim()
                    ? "bg-[#D98B2B] hover:bg-[#EAA13F] shadow-md"
                    : "bg-[#23242A] text-[#85827A] cursor-not-allowed"
                }`}
                title="Submit Command"
              >
                <ArrowUp size={13} strokeWidth={2.5} />
              </button>
            </form>
          </div>

          {/* Right: Contextual Decision Card */}
          <div className="lg:col-span-3 flex justify-end">
            {!decisionDismissed && (
              <div className="w-full max-w-sm bg-[#17171A] border border-[#23242A] rounded-2xl p-4 shadow-xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-[#D98B2B] uppercase">
                    <Zap size={11} className="fill-[#D98B2B]" />
                    <span>Contextual Decision</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#85827A]">
                    {slotTime}
                  </span>
                </div>

                <h3 className="text-sm font-semibold text-[#F7F5F0] tracking-tight">
                  {decisionTitle}
                </h3>
                <p className="text-xs text-[#85827A] mt-1.5 leading-relaxed">
                  {decisionExplanation}
                </p>

                <div className="flex items-center gap-2 mt-3 text-[10px] font-mono text-[#85827A]">
                  <span className="bg-[#111113] border border-[#23242A] px-2 py-0.5 rounded">
                    BUFFERED: {bufferedAlertsCount} alerts
                  </span>
                  <span className="bg-[#111113] border border-[#23242A] px-2 py-0.5 rounded">
                    AUTO-RESOLVE: in {autoResolveMinutes}m
                  </span>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  <button
                    onClick={() => setDecisionConfirmed(true)}
                    disabled={decisionConfirmed}
                    className="w-full bg-[#D98B2B] hover:bg-[#EAA13F] text-[#111113] font-semibold text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer active:scale-98"
                  >
                    <Check size={14} strokeWidth={2.5} />
                    <span>{decisionConfirmed ? "Hold Confirmed" : "Confirm Hold"}</span>
                  </button>
                  <button
                    onClick={() => setDecisionDismissed(true)}
                    className="text-xs text-[#85827A] hover:text-[#F7F5F0] py-1 text-center transition-colors cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM ROW: Pacing Wave & Telemetry (Left) + System Architecture & Service (Right) */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
        
        {/* Left Card: Pacing Wave & Telemetry */}
        <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#85827A]">
                <TrendingUp size={13} className="text-[#D98B2B]" />
                <span className="tracking-wide">Pacing Wave & Telemetry</span>
              </div>
              <span className="text-xs font-mono font-semibold text-[#D98B2B]">
                {clarityScore} Clarity
              </span>
            </div>

            {/* SVG Telemetry Curve Chart with Axis Ticks */}
            <div className="relative w-full h-24 my-2 flex items-center">
              {/* Left Y-Axis labels */}
              <div className="flex flex-col justify-between h-full pr-2 text-[9px] font-mono text-[#85827A]/60 select-none">
                <span>400</span>
                <span>300</span>
              </div>

              <div className="relative flex-1 h-full">
                <svg
                  viewBox="0 0 400 100"
                  className="w-full h-full overflow-visible"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="waveGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#D98B2B" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#D98B2B" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  {/* Area Fill */}
                  <path
                    d="M 10 80 Q 80 85 150 55 T 270 20 T 350 80 L 350 100 L 10 100 Z"
                    fill="url(#waveGradient)"
                  />
                  {/* Curve Line */}
                  <path
                    d="M 10 80 Q 80 85 150 55 T 270 20 T 350 80"
                    fill="none"
                    stroke="#D98B2B"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  {/* Dot 1 */}
                  <circle cx="10" cy="80" r="3.5" fill="#D98B2B" />
                  {/* Dot 2 */}
                  <circle cx="150" cy="55" r="3" fill="#D98B2B" />
                  {/* Dot Peak */}
                  <circle
                    cx="270"
                    cy="20"
                    r="4.5"
                    fill="#F5E6C8"
                    stroke="#D98B2B"
                    strokeWidth="2"
                  />
                  {/* Dot End */}
                  <circle cx="350" cy="80" r="3.5" fill="#D98B2B" />
                </svg>

                {/* Peak Zone Tag */}
                <div className="absolute top-1 left-[67%] -translate-x-1/2 bg-[#1E1F24] border border-[#23242A] px-2 py-0.5 rounded text-[10px] font-mono text-[#D98B2B] shadow-sm pointer-events-none">
                  Peak Zone {peakZone}
                </div>
              </div>
            </div>
          </div>

          {/* Restorative Rest Telemetry Note */}
          <div className="mt-4 pt-3 border-t border-[#23242A]/70 flex items-start gap-3">
            <Moon size={16} className="text-[#D98B2B] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#F7F5F0]">
                  7.5h Restorative Rest
                </span>
                <span className="text-[10px] font-mono text-[#85827A]">
                  Optimal Recovery
                </span>
              </div>
              <p className="text-[11px] text-[#85827A] mt-1 leading-relaxed">
                {telemetryRestNote}
              </p>
            </div>
          </div>
        </div>

        {/* Right Card: System Architecture & Service */}
        <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#85827A]">
                <Layers size={13} className="text-[#D98B2B]" />
                <span className="tracking-wide">System Architecture & Service</span>
              </div>
              <span className="text-xs font-mono text-[#85827A]">
                {addressedCount} of {taskList.length} addressed
              </span>
            </div>

            {/* Tasks List */}
            <div className="space-y-2 mt-2">
              {taskList.map((task) => (
                <div
                  key={task.id}
                  onClick={() => toggleTask(task.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    task.completed
                      ? "bg-[#1E1F24]/60 border-[#23242A] opacity-80"
                      : "bg-[#1E1F24] border-[#23242A] hover:border-[#32343D]"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      className="text-[#D98B2B] shrink-0 focus:outline-none"
                    >
                      {task.completed ? (
                        <CheckCircle2 size={16} className="text-[#D98B2B]" />
                      ) : (
                        <Circle size={16} className="text-[#85827A] hover:text-[#C5C2BA]" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <div
                        className={`text-xs font-medium truncate ${
                          task.completed
                            ? "line-through text-[#85827A]"
                            : "text-[#F7F5F0]"
                        }`}
                      >
                        {task.title}
                      </div>
                      <div className="text-[10px] text-[#85827A] mt-0.5 truncate">
                        {task.subtitle}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {task.time && (
                      <span className="text-[10px] font-mono text-[#85827A]">
                        {task.time}
                      </span>
                    )}
                    <span
                      className={`text-[9px] font-mono font-semibold uppercase px-2 py-0.5 rounded border ${
                        task.tagType === "priority"
                          ? "bg-[#D98B2B]/15 text-[#D98B2B] border-[#D98B2B]/30"
                          : task.tagType === "calm"
                          ? "bg-[#3B82F6]/15 text-[#60A5FA] border-[#3B82F6]/30"
                          : "bg-[#8B5CF6]/15 text-[#A78BFA] border-[#8B5CF6]/30"
                      }`}
                    >
                      {task.tag}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#23242A]/70 flex items-center justify-between text-[11px] text-[#85827A]">
            <div className="flex items-center gap-1.5">
              <Clock size={12} className="text-[#85827A]" />
              <span>Next anchor: Architecture Review at 13:00</span>
            </div>
            <span className="font-mono text-[10px]">Autonomic Pacing: Calm</span>
          </div>
        </div>

      </div>

      {/* Realtime Autonomous Voice Kernel Modal */}
      <RealtimeVoiceModal
        isOpen={isVoiceCallOpen}
        onClose={() => setIsVoiceCallOpen(false)}
      />
    </div>
  );
}
