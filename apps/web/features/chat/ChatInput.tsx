"use client";

import React, { useState, useRef, useEffect } from "react";
import { ArrowUp, Mic, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

type Props = {
  onSend: (text: string) => void;
  loading: boolean;
  onVoiceClick?: () => void;
  layoutId?: string;
  initialText?: string;
  autoFocus?: boolean;
};

export default function ChatInput({
  onSend,
  loading,
  onVoiceClick,
  layoutId,
  initialText,
  autoFocus,
}: Props) {
  const [text, setText] = useState(initialText || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialText) {
      setText(initialText);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${Math.min(
          textareaRef.current.scrollHeight,
          140
        )}px`;
      }
    }
  }, [initialText]);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  function handleSend() {
    if (!text.trim() || loading) return;
    onSend(text);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="w-full px-4 sm:px-6 pb-5 pt-2 flex-shrink-0 z-10">
      <div className="max-w-3xl mx-auto">
        <motion.div
          layoutId={layoutId || "aven-command-box-shell"}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#1b1b1d] border border-[#26262a] focus-within:border-[#ffb86c]/60 transition-all shadow-xl"
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(
                e.target.scrollHeight,
                140
              )}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask Aven anything..."
            rows={1}
            style={{ maxHeight: "140px" }}
            className="flex-1 w-full bg-transparent resize-none text-sm text-[#F7F5F0] placeholder:text-[#C5C2BA]/50 py-1 outline-none custom-h-scrollbar leading-relaxed"
          />

          <div className="flex items-center gap-1.5 shrink-0 self-end mb-0.5">
            {/* Realtime Voice Call / Mic Button */}
            <button
              type="button"
              onClick={onVoiceClick}
              disabled={loading}
              title="Voice input (local & private)"
              className="relative w-8 h-8 rounded-xl hover:bg-[#26262a] text-[#C5C2BA] hover:text-[#F7F5F0] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Mic size={16} />
              <span
                className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400"
                title="Local private audio"
              />
            </button>

            {/* Upward Arrow Send Button */}
            <button
              type="button"
              onClick={handleSend}
              disabled={loading || !text.trim()}
              className="w-8 h-8 rounded-xl bg-[#ffb86c] hover:bg-[#ffb86c]/90 disabled:opacity-40 text-[#1A0F00] flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md"
              title="Send message"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin text-[#1A0F00]" />
              ) : (
                <ArrowUp size={16} className="stroke-[2.5]" />
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
