"use client";

import { useState } from "react";
import { Send, Mic } from "lucide-react";

type Props = {
  onSend: (text: string) => void;
  loading: boolean;
};

export default function ChatInput({ onSend, loading }: Props) {
  const [text, setText] = useState("");

  function handleSend() {
    if (!text.trim()) return;

    onSend(text);
    setText("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-6">
      <div className="flex items-center gap-2 bg-[#161618] rounded-2xl border border-[#2A2B2F] px-4 py-3 shadow-lg focus-within:border-gray-600 transition-colors">
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type your command..."
          rows={1}
          style={{ maxHeight: "150px" }}
          className="
            flex-1
            w-full
            bg-transparent
            resize-none
            text-base
            text-gray-100
            placeholder-gray-500
            py-1
            outline-none
            scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent
          "
        />

        {/* Mic Button (Visual Parity) */}
        <button
          disabled={loading}
          className="ml-2 p-2.5 rounded-xl bg-[#2A2B2F] transition-all hover:bg-[#3A3C42] disabled:opacity-50"
        >
          <Mic size={18} className="text-gray-100" />
        </button>

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={loading || !text.trim()}
          className={`
            ml-2 p-2.5 rounded-xl transition-all active:scale-95 disabled:opacity-50
            ${text.trim() ? 'bg-[#E8414A] hover:bg-[#D62C35]' : 'bg-[#2A2B2F]'}
          `}
        >
          <Send 
            size={18} 
            className={text.trim() ? "text-white" : "text-gray-500"} 
          />
        </button>
      </div>
    </div>
  );
}