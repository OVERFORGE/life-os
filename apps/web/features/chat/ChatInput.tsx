"use client";

import { useState } from "react";
import  {ArrowBigUp} from "lucide-react";
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
    <div className="w-full px-58">
      <div className="flex items-end gap-4 py-2 pl-4 pr-2 rounded-3xl bg-gray-800 border border-white/5 focus-within:border-white/10 transition-colors">
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
          }}
          onKeyDown={handleKeyDown}
          placeholder="Message LifeOS..."
          rows={1}
          style={{ maxHeight: "200px" }}
          className="
            flex-1
            w-full
            bg-transparent
            resize-none
            text-md
            text-gray-100
            placeholder-gray-500
            py-3
            outline-none
            scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent
          "
        />

        <button
          onClick={handleSend}
          disabled={loading || !text.trim()}
          className="
          p-2.5
          mb-1
          rounded-xl
          bg-[#2a2d36]
          disabled:opacity-30
          transition-all
          hover:bg-[#333744]
          active:scale-95
          "
        >
          <ArrowBigUp 
            className="w-5 h-5" 
            fill={text.trim() ? "#fbbf24" : "transparent"} 
            stroke={text.trim() ? "#fbbf24" : "#6b7280"} 
          />
        </button>
      </div>
    </div>
  );
}