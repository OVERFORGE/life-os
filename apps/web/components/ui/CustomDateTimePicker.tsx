"use client";

import React, { useState, useEffect, useRef } from "react";
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, ChevronDown, X, Check } from "lucide-react";

interface CustomDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (val: string) => void;
  label?: string;
  className?: string;
}

export function CustomDatePicker({ value, onChange, label, className = "" }: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse current value or fallback to today
  const parseDate = (str: string) => {
    if (!str) return new Date();
    const [y, m, d] = str.split("-").map(Number);
    if (!y || !m || !d) return new Date();
    return new Date(y, m - 1, d);
  };

  const selectedDate = value ? parseDate(value) : null;
  const [viewDate, setViewDate] = useState<Date>(selectedDate || new Date());

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Keep viewDate in sync when opened
  useEffect(() => {
    if (isOpen && value) {
      setViewDate(parseDate(value));
    }
  }, [isOpen, value]);

  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  const prevMonth = () => {
    setViewDate(new Date(viewYear, viewMonth - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(viewYear, viewMonth + 1, 1));
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const shortMonthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const daysOfWeek = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  // Days in month calculation
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const toIsoString = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const handleSelectDay = (day: number) => {
    const newDate = new Date(viewYear, viewMonth, day);
    onChange(toIsoString(newDate));
    setIsOpen(false);
  };

  const setPreset = (preset: "today" | "tomorrow" | "weekend" | "next_week") => {
    const d = new Date();
    if (preset === "tomorrow") {
      d.setDate(d.getDate() + 1);
    } else if (preset === "weekend") {
      const day = d.getDay();
      const diff = day === 6 ? 7 : (6 - day);
      d.setDate(d.getDate() + diff);
    } else if (preset === "next_week") {
      const day = d.getDay();
      const diff = day === 0 ? 1 : (8 - day);
      d.setDate(d.getDate() + diff);
    }
    onChange(toIsoString(d));
    setIsOpen(false);
  };

  // Format label
  const getDisplayLabel = () => {
    if (!value) return "Select date";
    const [y, m, d] = value.split("-").map(Number);
    const today = new Date();
    const isToday = today.getFullYear() === y && today.getMonth() === m - 1 && today.getDate() === d;
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const isTomorrow = tomorrow.getFullYear() === y && tomorrow.getMonth() === m - 1 && tomorrow.getDate() === d;

    const shortFormatted = `${shortMonthNames[m - 1]} ${d}, ${y}`;
    if (isToday) return `Today (${shortFormatted})`;
    if (isTomorrow) return `Tomorrow (${shortFormatted})`;
    return shortFormatted;
  };

  const todayIso = toIsoString(new Date());

  return (
    <div ref={containerRef} className={`relative flex flex-col gap-1.5 ${className}`}>
      {label && (
        <span className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70">
          {label}
        </span>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#17171A] border transition-all text-xs font-medium cursor-pointer ${
          isOpen
            ? "border-[#ffb86c] ring-1 ring-[#ffb86c]/30 text-[#F7F5F0]"
            : "border-[#23242A] hover:border-[#ffb86c]/50 text-[#F7F5F0]"
        }`}
      >
        <div className="flex items-center gap-2.5 truncate">
          <CalendarIcon className="w-4 h-4 text-[#ffb86c] shrink-0" />
          <span className="truncate">{getDisplayLabel()}</span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-[#85827A] transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute top-[calc(100%+6px)] left-0 z-50 w-72 rounded-2xl bg-[#17171A] border border-[#23242A] p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
          {/* Quick Presets */}
          <div className="grid grid-cols-4 gap-1 pb-3 mb-3 border-b border-[#23242A]">
            <button
              type="button"
              onClick={() => setPreset("today")}
              className="px-2 py-1.5 rounded-lg text-[10px] font-mono bg-[#111113] hover:bg-[#ffb86c]/15 hover:text-[#ffb86c] text-[#C5C2BA] border border-[#23242A] transition cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setPreset("tomorrow")}
              className="px-2 py-1.5 rounded-lg text-[10px] font-mono bg-[#111113] hover:bg-[#ffb86c]/15 hover:text-[#ffb86c] text-[#C5C2BA] border border-[#23242A] transition cursor-pointer"
            >
              Tmrw
            </button>
            <button
              type="button"
              onClick={() => setPreset("weekend")}
              className="px-2 py-1.5 rounded-lg text-[10px] font-mono bg-[#111113] hover:bg-[#ffb86c]/15 hover:text-[#ffb86c] text-[#C5C2BA] border border-[#23242A] transition cursor-pointer"
            >
              Weekend
            </button>
            <button
              type="button"
              onClick={() => setPreset("next_week")}
              className="px-2 py-1.5 rounded-lg text-[10px] font-mono bg-[#111113] hover:bg-[#ffb86c]/15 hover:text-[#ffb86c] text-[#C5C2BA] border border-[#23242A] transition cursor-pointer"
            >
              Next Wk
            </button>
          </div>

          {/* Month Header */}
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-bold font-mono text-[#F7F5F0]">
              {monthNames[viewMonth]} {viewYear}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={prevMonth}
                className="w-6 h-6 rounded-lg bg-[#111113] hover:bg-[#23242A] text-[#85827A] hover:text-[#F7F5F0] flex items-center justify-center border border-[#23242A] transition cursor-pointer"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="w-6 h-6 rounded-lg bg-[#111113] hover:bg-[#23242A] text-[#85827A] hover:text-[#F7F5F0] flex items-center justify-center border border-[#23242A] transition cursor-pointer"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Days of Week */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {daysOfWeek.map((d) => (
              <span key={d} className="text-[10px] font-mono text-[#85827A] py-1">
                {d}
              </span>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Blank leading days */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`blank-${i}`} className="w-8 h-8" />
            ))}

            {/* Days in Month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSelected = value === dateStr;
              const isToday = todayIso === dateStr;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`w-8 h-8 rounded-lg text-xs font-mono transition-all flex items-center justify-center cursor-pointer ${
                    isSelected
                      ? "bg-[#ffb86c] text-[#492900] font-bold shadow-md"
                      : isToday
                      ? "bg-[#ffb86c]/15 text-[#ffb86c] border border-[#ffb86c]/40 font-semibold"
                      : "text-[#C5C2BA] hover:bg-[#23242A] hover:text-[#F7F5F0]"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface CustomTimePickerProps {
  value: string; // HH:mm or empty
  onChange: (val: string) => void;
  label?: string;
  className?: string;
}

export function CustomTimePicker({ value, onChange, label, className = "" }: CustomTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const QUICK_TIMES = [
    { label: "09:00 AM", val: "09:00" },
    { label: "12:00 PM", val: "12:00" },
    { label: "02:00 PM", val: "14:00" },
    { label: "04:30 PM", val: "16:30" },
    { label: "06:00 PM", val: "18:00" },
    { label: "09:00 PM", val: "21:00" },
  ];

  const formatDisplayTime = (t: string) => {
    if (!t) return "No time set";
    const [hStr, mStr] = t.split(":");
    const h = parseInt(hStr, 10);
    const m = mStr || "00";
    if (isNaN(h)) return t;
    const period = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${displayH}:${m} ${period}`;
  };

  const handleSelectTime = (t: string) => {
    onChange(t);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative flex flex-col gap-1.5 ${className}`}>
      {label && (
        <span className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70">
          {label}
        </span>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#17171A] border transition-all text-xs font-medium cursor-pointer ${
          isOpen
            ? "border-[#ffb86c] ring-1 ring-[#ffb86c]/30 text-[#F7F5F0]"
            : "border-[#23242A] hover:border-[#ffb86c]/50 text-[#F7F5F0]"
        }`}
      >
        <div className="flex items-center gap-2.5 truncate">
          <Clock className={`w-4 h-4 shrink-0 ${value ? "text-[#ffb86c]" : "text-[#85827A]"}`} />
          <span className={value ? "text-[#F7F5F0]" : "text-[#85827A]"}>
            {formatDisplayTime(value)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="text-[#85827A] hover:text-rose-400 p-0.5 transition cursor-pointer"
            >
              <X size={13} />
            </button>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-[#85827A] transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute top-[calc(100%+6px)] left-0 z-50 w-64 rounded-2xl bg-[#17171A] border border-[#23242A] p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#23242A]">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#85827A]">
              Quick Time Slots
            </span>
            {value && (
              <button
                type="button"
                onClick={() => handleSelectTime("")}
                className="text-[10px] font-mono text-rose-400 hover:text-rose-300 transition cursor-pointer"
              >
                Clear Time
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_TIMES.map((qt) => {
              const isSelected = value === qt.val;
              return (
                <button
                  key={qt.val}
                  type="button"
                  onClick={() => handleSelectTime(qt.val)}
                  className={`py-2 px-3 rounded-xl text-xs font-mono transition-all text-center border cursor-pointer ${
                    isSelected
                      ? "bg-[#ffb86c] border-[#ffb86c] text-[#492900] font-bold shadow-md"
                      : "bg-[#111113] border-[#23242A] text-[#C5C2BA] hover:bg-[#23242A] hover:text-[#F7F5F0]"
                  }`}
                >
                  {qt.label}
                </button>
              );
            })}
          </div>

          {/* Custom Time Manual Input */}
          <div className="mt-3 pt-2.5 border-t border-[#23242A]">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[#85827A] block mb-1.5">
              Custom Time (24h)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="e.g. 15:30"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="flex-1 bg-[#111113] border border-[#23242A] rounded-xl px-3 py-1.5 text-xs font-mono text-[#F7F5F0] outline-none focus:border-[#ffb86c]"
              />
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-[#ffb86c]/15 border border-[#ffb86c]/30 text-[#ffb86c] text-xs font-mono hover:bg-[#ffb86c]/25 transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
