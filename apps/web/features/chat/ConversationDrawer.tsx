"use client";

import { X } from "lucide-react";
import ConversationSidebar from "./ConversationSidebar";
import { ConversationItem } from "./useConversations";

interface ConversationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: ConversationItem[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export default function ConversationDrawer({
  isOpen,
  onClose,
  conversations,
  activeConversationId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  searchQuery,
  onSearchChange,
}: ConversationDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div className="relative z-10 w-72 h-full bg-[#18181A] shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
        <div className="flex items-center justify-between p-3 border-b border-[#2A2B2F]">
          <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
            Conversations
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          <ConversationSidebar
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelect={(id) => {
              onSelect(id);
              onClose();
            }}
            onCreate={() => {
              onCreate();
              onClose();
            }}
            onDelete={onDelete}
            onRename={onRename}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
          />
        </div>
      </div>
    </div>
  );
}
