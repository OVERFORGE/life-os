"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowDown, PanelLeft, Plus } from "lucide-react";

import ChatInput from "./ChatInput";
import ChatMessage from "./ChatMessage";
import ConversationSidebar from "./ConversationSidebar";
import ConversationDrawer from "./ConversationDrawer";
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

  const { messages, sendMessage, loading, selectedModel, setSelectedModel } = useChat({
    conversationId: activeConversationId,
    onMessageSent: refreshConversations,
  });

  const GROQ_MODELS = [
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B (Best)" },
    { id: "qwen/qwen3-32b", name: "Qwen3 32B (Great)" },
    { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout 17B" },
    { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B (Fastest)" },
  ];

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
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
    const isScrolledUp = scrollHeight - scrollTop - clientHeight > 100;
    setShowScrollButton(isScrolledUp);
  };

  return (
    <div className="h-full flex w-full bg-[#161618] overflow-hidden">
      {/* Desktop Conversation Sidebar */}
      <div className="hidden md:block h-full">
        <ConversationSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelect={setActiveConversationId}
          onCreate={() => createConversation()}
          onDelete={deleteConversation}
          onRename={renameConversation}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </div>

      {/* Mobile Drawer */}
      <ConversationDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelect={setActiveConversationId}
        onCreate={() => createConversation()}
        onDelete={deleteConversation}
        onRename={renameConversation}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative h-full min-w-0">
        {/* Header Controls */}
        <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
          {/* Mobile Drawer Toggle & Quick New Chat */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              onClick={() => setIsMobileDrawerOpen(true)}
              className="md:hidden p-2.5 bg-[#1F2023]/90 border border-[#2A2B2F] rounded-xl text-gray-300 hover:text-white shadow-xl backdrop-blur-xl transition-all"
              title="Open Conversations"
            >
              <PanelLeft size={18} />
            </button>
            <button
              onClick={() => createConversation()}
              className="md:hidden p-2.5 bg-[#E8414A] rounded-xl text-white shadow-xl transition-all active:scale-95"
              title="New Chat"
            >
              <Plus size={18} />
            </button>
          </div>

          {/* Model Switcher Dropdown */}
          <div className="pointer-events-auto relative mx-auto md:ml-auto md:mr-auto">
            <div
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="bg-[#1F2023]/90 border border-[#2A2B2F] rounded-full px-4 py-2.5 shadow-xl backdrop-blur-xl flex items-center justify-between gap-3 transition-all hover:border-gray-500 cursor-pointer min-w-[200px]"
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#E8414A] animate-pulse" />
                <span className="text-gray-200 font-medium text-xs truncate">
                  {GROQ_MODELS.find((m) => m.id === selectedModel)?.name}
                </span>
              </div>
              <div
                className={`text-[#9ca3af] text-[10px] transition-transform duration-300 ${
                  isDropdownOpen ? "rotate-180" : ""
                }`}
              >
                ▼
              </div>
            </div>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute top-12 left-0 w-full bg-[#1F2023]/95 border border-[#2A2B2F] rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-20">
                {GROQ_MODELS.map((model) => (
                  <div
                    key={model.id}
                    onClick={() => {
                      setSelectedModel(model.id);
                      setIsDropdownOpen(false);
                    }}
                    className={`px-4 py-3 text-xs cursor-pointer transition-colors ${
                      selectedModel === model.id
                        ? "bg-[#E8414A]/10 text-[#E8414A]"
                        : "text-gray-300 hover:bg-white/5"
                    }`}
                  >
                    {model.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Messages List */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 md:p-12 space-y-6 pt-24 relative scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
        >
          <div className="max-w-3xl mx-auto space-y-8 pb-10">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-16">
                Start a conversation with LifeOS...
              </div>
            ) : (
              messages.map((m, i) => (
                <ChatMessage key={i} role={m.role} content={m.content} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Scroll to Bottom Button */}
        {showScrollButton && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20">
            <button
              onClick={() => scrollToBottom()}
              className="w-8 h-8 bg-[#2A2B2F]/80 hover:bg-[#3A3C42] backdrop-blur-md rounded-full flex items-center justify-center border border-[#2A2B2F] shadow-lg text-white transition-all transform hover:scale-105"
            >
              <ArrowDown size={16} />
            </button>
          </div>
        )}

        {/* Input Bar */}
        <ChatInput onSend={sendMessage} loading={loading} />
      </div>
    </div>
  );
}