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

  return (
    <div className="w-full   px-58">
      <div className="flex gap-10 py-2 pl-4 pr-2 rounded-full bg-gray-800">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Talk to your assistant..."
          className="
          flex-1
          
          
          rounded-lg
          px-4 py-2
          text-md
          outline-none
          focus:border-white/40
          "
        />

        <button
          onClick={handleSend}
          disabled={loading}
          className="
          px-3 py-3
          rounded-full
          bg-white
          text-gray-900
          text-sm
          font-medium
          disabled:opacity-40
          "
        >
          <ArrowBigUp className="w-5 h-5" fill="white" />
        </button>
      </div>
    </div>
  );
}