"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowDown } from "lucide-react";

import ChatInput from "./ChatInput";
import ChatMessage from "./ChatMessage";
import { useChat } from "./useChat";

export default function ChatContainer() {
  const { messages, sendMessage, loading, selectedModel, setSelectedModel } = useChat();

  const GROQ_MODELS = [
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B (Best)" },
    { id: "qwen/qwen3-32b", name: "Qwen3 32B (Great)" },
    { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout 17B" },
    { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B (Fastest)" },
  ];

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (!showScrollButton) {
      scrollToBottom();
    }
  }, [messages]);

  useEffect(() => {
    scrollToBottom("auto");
  }, []);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    
    // Show arrow if user scrolled up more than 100px from the bottom
    const isScrolledUp = scrollHeight - scrollTop - clientHeight > 100;
    setShowScrollButton(isScrolledUp);
  };

  return (
    <div className="h-full flex flex-col relative w-full ">

      {/* Premium Header with Custom Model Switcher */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-[220px]">
        <div 
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="bg-[#1a1d24]/90 border border-white/10 rounded-full px-4 py-2.5 shadow-xl backdrop-blur-xl flex items-center justify-between gap-3 transition-all hover:border-white/20 cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-gray-200 font-medium text-xs">
              {GROQ_MODELS.find(m => m.id === selectedModel)?.name}
            </span>
          </div>
          <div className={`text-gray-500 text-[10px] transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`}>▼</div>
        </div>

        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <div className="absolute top-12 left-0 w-full bg-[#1a1d24]/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            {GROQ_MODELS.map(model => (
              <div 
                key={model.id} 
                onClick={() => {
                  setSelectedModel(model.id);
                  setIsDropdownOpen(false);
                }}
                className={`px-4 py-3 text-xs cursor-pointer transition-colors ${selectedModel === model.id ? 'bg-amber-500/10 text-amber-400' : 'text-gray-300 hover:bg-white/5'}`}
              >
                {model.name}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-6 space-y-4 pt-20 relative scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
      >
        {messages.map((m, i) => (
          <ChatMessage
            key={i}
            role={m.role}
            content={m.content}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20">
          <button
            onClick={() => scrollToBottom()}
            className="w-8 h-8 bg-gray-600/80 hover:bg-gray-500 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 shadow-lg text-white transition-all transform hover:scale-105"
          >
            <ArrowDown size={16} />
          </button>
        </div>
      )}

      {/* Input */}
      <ChatInput onSend={sendMessage} loading={loading} />
    </div>
  );
}