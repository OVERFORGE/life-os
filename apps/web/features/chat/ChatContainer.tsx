"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  ArrowDown,
  History,
  Plus,
  Radio,
  Sparkles,
  ChevronDown,
  Trash2,
  Edit2,
  Check,
  X,
  MessageSquare,
} from "lucide-react";

import ChatInput from "./ChatInput";
import ChatMessage from "./ChatMessage";
import RealtimeVoiceModal from "../voice/RealtimeVoiceModal";
import { useConversations } from "./useConversations";
import { useChat } from "./useChat";

export default function ChatContainer() {
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    createConversation,
    deleteConversation,
    renameConversation,
    searchQuery,
    setSearchQuery,
    refreshConversations,
  } = useConversations();

  const { messages, sendMessage, loading, selectedModel, setSelectedModel, reload } = useChat({
    conversationId: activeConversationId,
    onMessageSent: refreshConversations,
  });

  const GROQ_MODELS = [
    { id: "openai/gpt-oss-120b", name: "GPT OSS 120B (Aven Flagship)" },
    { id: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B (Fast & Intelligent)" },
    { id: "openai/gpt-oss-20b", name: "GPT OSS 20B (Instant)" },
  ];

  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isHistoryPopoverOpen, setIsHistoryPopoverOpen] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const historyPopoverRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Close popovers on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        historyPopoverRef.current &&
        !historyPopoverRef.current.contains(e.target as Node)
      ) {
        setIsHistoryPopoverOpen(false);
      }
      if (
        modelDropdownRef.current &&
        !modelDropdownRef.current.contains(e.target as Node)
      ) {
        setIsModelDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    const isScrolledUp = scrollHeight - scrollTop - clientHeight > 100;
    setShowScrollButton(isScrolledUp);
  };

  const currentModelName =
    GROQ_MODELS.find((m) => m.id === selectedModel)?.name || "GPT OSS 120B (Aven Flagship)";

  return (
    <div className="h-full w-full flex flex-col bg-[#111113] overflow-hidden relative text-[#F7F5F0]">
      {/* ========================================================================= */}
      {/* MINIMAL QUIET HEADER (Stitch Design & Image 1)                            */}
      {/* ========================================================================= */}
      <header className="px-5 py-3 border-b border-[#23242A]/80 flex items-center justify-between flex-shrink-0 relative z-30 bg-[#111113]">
        {/* Left: Fluid Torus Identity & Name */}
        <div className="flex items-center gap-3">
          <div className="relative w-7 h-7 rounded-full flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-[#ffb86c]/20 blur-sm" />
            <div className="relative w-6 h-6 rounded-full border-2 border-[#ffb86c]/80 bg-gradient-to-tr from-[#D98B2B]/40 via-[#ffb86c]/20 to-transparent shadow-[inset_0_0_8px_rgba(255,184,108,0.4)] flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-[#111113] border border-[#ffb86c]/60" />
            </div>
          </div>
          <h1 className="text-sm font-bold font-mono tracking-tight text-[#F7F5F0]">Aven</h1>
        </div>

        {/* Right Actions: Voice Call, Model Switcher, History, New Chat */}
        <div className="flex items-center gap-2">
          {/* Full-Duplex Realtime Voice Call Launch */}
          <button
            type="button"
            onClick={() => setIsVoiceOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#17171A] hover:bg-[#1E1F24] border border-[#23242A] text-xs font-mono text-[#C5C2BA] hover:text-[#ffb86c] transition-all cursor-pointer"
            title="Start Realtime Voice Call"
          >
            <Radio size={13} className="text-[#ffb86c] animate-pulse" />
            <span className="hidden sm:inline">Voice Call</span>
          </button>

          {/* Model Switcher Pill */}
          <div ref={modelDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#17171A] hover:bg-[#1E1F24] border border-[#23242A] text-xs font-mono text-[#C5C2BA] hover:text-[#F7F5F0] transition-colors cursor-pointer max-w-[200px]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffb86c] shrink-0" />
              <span className="truncate">{currentModelName}</span>
              <ChevronDown
                size={12}
                className={`text-[#85827A] transition-transform ${isModelDropdownOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isModelDropdownOpen && (
              <div className="absolute right-0 top-10 w-64 rounded-2xl bg-[#17171A] border border-[#23242A] shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-[#85827A]">
                  Neural Inference Model
                </div>
                {GROQ_MODELS.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      setSelectedModel(model.id);
                      setIsModelDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-mono transition-colors cursor-pointer ${
                      selectedModel === model.id
                        ? "bg-[#ffb86c]/15 text-[#ffb86c] font-bold"
                        : "text-[#C5C2BA] hover:bg-[#1E1F24] hover:text-[#F7F5F0]"
                    }`}
                  >
                    {model.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* History Popover Button */}
          <div ref={historyPopoverRef} className="relative">
            <button
              type="button"
              onClick={() => setIsHistoryPopoverOpen(!isHistoryPopoverOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                isHistoryPopoverOpen
                  ? "bg-[#1E1F24] border-[#ffb86c]/50 text-[#ffb86c]"
                  : "bg-[#17171A] hover:bg-[#1E1F24] border-[#23242A] text-[#C5C2BA] hover:text-[#F7F5F0]"
              }`}
            >
              <History size={14} className="text-[#85827A]" />
              <span>History</span>
            </button>

            {/* Collapsible History Popover (Matching Stitch Screen) */}
            {isHistoryPopoverOpen && (
              <div className="absolute right-0 top-10 w-80 rounded-2xl bg-[#17171A] border border-[#23242A] shadow-2xl p-2 z-50 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[#23242A]">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#85827A]">
                    Recent Conversations
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      createConversation();
                      setIsHistoryPopoverOpen(false);
                    }}
                    className="text-[10px] font-mono text-[#ffb86c] hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Plus size={11} />
                    <span>New</span>
                  </button>
                </div>

                <div className="max-h-72 overflow-y-auto custom-h-scrollbar flex flex-col gap-1 pr-1">
                  {conversations.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-[#85827A] font-mono">
                      No previous sessions
                    </div>
                  ) : (
                    conversations.map((conv) => {
                      const isActive = activeConversationId === conv.conversationId;
                      const isEditing = editingConvId === conv.conversationId;
                      const dateTimestamp = conv.lastMessageAt || conv.createdAt;

                      if (isEditing) {
                        return (
                          <div
                            key={conv.conversationId}
                            className="flex items-center gap-1.5 p-2 rounded-xl bg-[#111113] border border-[#23242A]"
                          >
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="flex-1 bg-transparent text-xs text-[#F7F5F0] outline-none font-mono"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  renameConversation(conv.conversationId, editTitle);
                                  setEditingConvId(null);
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                renameConversation(conv.conversationId, editTitle);
                                setEditingConvId(null);
                              }}
                              className="text-emerald-400 hover:text-emerald-300 p-1"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingConvId(null)}
                              className="text-[#85827A] hover:text-[#F7F5F0] p-1"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={conv.conversationId}
                          className={`group flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer ${
                            isActive
                              ? "bg-[#ffb86c]/15 text-[#ffb86c] font-medium"
                              : "hover:bg-[#1E1F24] text-[#C5C2BA] hover:text-[#F7F5F0]"
                          }`}
                          onClick={() => {
                            setActiveConversationId(conv.conversationId);
                            setIsHistoryPopoverOpen(false);
                          }}
                        >
                          <div className="flex flex-col min-w-0 pr-2">
                            <span className="text-xs truncate">{conv.title || "Untitled Chat"}</span>
                            <span className="text-[10px] font-mono text-[#85827A] mt-0.5">
                              {isActive
                                ? "Active · Today"
                                : dateTimestamp
                                ? new Date(dateTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                                : "Archived"}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingConvId(conv.conversationId);
                                setEditTitle(conv.title || "");
                              }}
                              className="p-1 hover:text-[#ffb86c] text-[#85827A] transition"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteConversation(conv.conversationId);
                              }}
                              className="p-1 hover:text-rose-400 text-[#85827A] transition"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* New Chat Button */}
          <button
            type="button"
            onClick={() => createConversation()}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#17171A] hover:bg-[#1E1F24] border border-[#23242A] text-xs font-medium text-[#F7F5F0] hover:border-[#ffb86c]/40 transition-colors cursor-pointer"
          >
            <Plus size={14} className="text-[#ffb86c]" />
            <span>New chat</span>
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* CONVERSATION STREAM (Centered Calm Canvas)                                */}
      {/* ========================================================================= */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 custom-h-scrollbar relative"
      >
        <div className="max-w-3xl mx-auto flex flex-col gap-6 pb-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-20 animate-in fade-in duration-300">
              <div className="relative w-12 h-12 rounded-full flex items-center justify-center mb-4">
                <div className="absolute inset-0 rounded-full bg-[#ffb86c]/20 blur-md" />
                <div className="relative w-10 h-10 rounded-full border-2 border-[#ffb86c]/80 bg-gradient-to-tr from-[#D98B2B]/40 via-[#ffb86c]/20 to-transparent flex items-center justify-center shadow-lg">
                  <Sparkles size={18} className="text-[#ffb86c]" />
                </div>
              </div>

              <h2 className="text-base font-bold font-mono text-[#F7F5F0] mb-2">
                Aven Executive Copilot
              </h2>
              <p className="text-xs text-[#85827A] max-w-md leading-relaxed mb-8">
                Context-aware temporal reasoning across your active habits, deep work blocks, and priority trajectory.
              </p>

              {/* Starter Prompt Suggestions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg">
                {[
                  "What's my most critical focus priority today?",
                  "Protect my afternoon from calendar meeting spillover",
                  "Audit my 14-day rolling habit compliance",
                  "Schedule a 90m deep architecture block",
                ].map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => sendMessage(prompt)}
                    className="p-3 rounded-xl bg-[#17171A] border border-[#23242A] hover:border-[#ffb86c]/50 text-left text-xs text-[#C5C2BA] hover:text-[#F7F5F0] transition-all cursor-pointer shadow-sm group"
                  >
                    <span className="block truncate font-medium group-hover:text-[#ffb86c] transition-colors">
                      {prompt}
                    </span>
                    <span className="block text-[10px] font-mono text-[#85827A] mt-1">
                      Execute prompt →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <ChatMessage
                key={i}
                role={m.role}
                content={m.content}
                statusPhase={m.statusPhase}
                toolActivities={m.toolActivities}
                confirmation={m.confirmation}
                missingConnection={m.missingConnection}
                onConfirm={(actionId, confirmed) => {
                  sendMessage(confirmed ? "Yes, confirm." : "No, cancel.");
                }}
                onConnect={(providerId) => {
                  window.location.href = "/settings/connections";
                }}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Floating Scroll-to-Bottom Button */}
      {showScrollButton && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20">
          <button
            type="button"
            onClick={() => scrollToBottom()}
            className="w-8 h-8 bg-[#17171A]/90 hover:bg-[#23242A] backdrop-blur-md rounded-full flex items-center justify-center border border-[#23242A] shadow-2xl text-[#ffb86c] transition-all transform hover:scale-105 cursor-pointer"
            title="Scroll to latest message"
          >
            <ArrowDown size={14} />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DOCKED MESSAGE COMPOSER                                                   */}
      {/* ========================================================================= */}
      <ChatInput
        onSend={sendMessage}
        loading={loading}
        onVoiceClick={() => setIsVoiceOpen(true)}
      />

      {/* Full-Duplex Realtime Voice Call Overlay Modal */}
      <RealtimeVoiceModal
        isOpen={isVoiceOpen}
        onClose={() => setIsVoiceOpen(false)}
        conversationId={activeConversationId}
        onMessageSent={() => {
          refreshConversations();
          reload();
        }}
      />
    </div>
  );
}
