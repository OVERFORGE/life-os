"use client";

import React from "react";
import { Terminal } from "lucide-react";
import { RuntimeLogEntryDTO } from "../../types";

interface RuntimeLogFeedProps {
  logs: RuntimeLogEntryDTO[];
}

const LEVEL_STYLE: Record<string, { text: string; label: string }> = {
  INFO: { text: "text-blue-400", label: "INFO " },
  WARN: { text: "text-amber-400", label: "WARN " },
  ERROR: { text: "text-red-400", label: "ERROR" },
  DEBUG: { text: "text-[#52525B]", label: "DEBUG" },
  TICK: { text: "text-emerald-400", label: "TICK " },
  LIFECYCLE: { text: "text-indigo-400", label: "LIFE " },
};

export function RuntimeLogFeed({ logs }: RuntimeLogFeedProps) {
  const feedRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="rounded-xl border border-[#27272A] bg-[#0A0A0B] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#27272A] bg-[#0F0F10]">
        <Terminal className="w-3.5 h-3.5 text-[#E8414A]" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#52525B]">
          Execution Trace Log
        </span>
        <span className="ml-auto text-[10px] font-mono text-[#3F3F46]">
          {logs.length} entries
        </span>
      </div>

      {/* Log entries */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto max-h-72 p-2"
        style={{ fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace" }}
      >
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-[11px] text-[#3F3F46] font-mono">
            No log entries yet. Start a simulation run.
          </div>
        ) : (
          <div className="space-y-0.5">
            {logs.map((entry, index) => {
              const style = LEVEL_STYLE[entry.level] ?? LEVEL_STYLE.INFO;
              const seqDisplay = `#${String(entry.sequence ?? index + 1).padStart(3, "0")}`;
              return (
                <div
                  key={index}
                  className="flex items-baseline gap-3 px-2 py-0.5 rounded hover:bg-[#18181B] group transition-colors"
                >
                  <span className="text-[9px] text-[#3F3F46] shrink-0 tabular-nums font-mono">
                    {seqDisplay}
                  </span>
                  <span className={`text-[9px] font-semibold shrink-0 ${style.text}`}>
                    {style.label}
                  </span>
                  <span className="text-[10px] font-mono text-[#A1A1AA] text-xs leading-snug">
                    {entry.message}
                  </span>
                  {entry.tick !== undefined && (
                    <span className="ml-auto text-[9px] font-mono text-[#3F3F46] shrink-0">
                      t:{entry.tick}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
