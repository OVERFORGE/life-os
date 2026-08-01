"use client";

import { useState } from "react";
import { Plus, MessageSquare, Trash2, Edit2, Search, Check, X } from "lucide-react";
import { ConversationItem } from "./useConversations";

interface ConversationSidebarProps {
  conversations: ConversationItem[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export default function ConversationSidebar({
  conversations,
  activeConversationId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  searchQuery,
  onSearchChange,
}: ConversationSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const handleStartRename = (c: ConversationItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(c.conversationId);
    setEditTitle(c.title);
  };

  const handleSaveRename = (id: string) => {
    if (editTitle.trim()) {
      onRename(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleCancelRename = () => {
    setEditingId(null);
  };

  return (
    <aside className="w-64 shrink-0 h-full bg-[#18181A] border-r border-[#2A2B2F] flex flex-col pt-4 pb-4 px-3 select-none">
      {/* New Chat Button */}
      <button
        onClick={onCreate}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#E8414A] hover:bg-[#d03841] text-white font-medium text-xs rounded-xl shadow-lg transition-all transform active:scale-95 mb-3"
      >
        <Plus size={16} />
        <span>New Chat</span>
      </button>

      {/* Search Input */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search chats..."
          className="w-full bg-[#1F2023] border border-[#2A2B2F] text-gray-200 placeholder-gray-500 text-xs rounded-lg pl-8 pr-3 py-1.5 outline-none focus:border-gray-500 transition-colors"
        />
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {conversations.length === 0 ? (
          <div className="text-center text-gray-500 text-xs py-8">
            {searchQuery ? "No chats found" : "No conversations yet"}
          </div>
        ) : (
          conversations.map((c) => {
            const isActive = c.conversationId === activeConversationId;
            const isEditing = editingId === c.conversationId;

            return (
              <div
                key={c.conversationId}
                onClick={() => !isEditing && onSelect(c.conversationId)}
                className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer text-xs transition-all ${
                  isActive
                    ? "bg-[#1F2023] text-white border border-[#2A2B2F] shadow-sm"
                    : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <MessageSquare
                    size={14}
                    className={`shrink-0 ${isActive ? "text-[#E8414A]" : "text-gray-500"}`}
                  />

                  {isEditing ? (
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveRename(c.conversationId);
                        if (e.key === "Escape") handleCancelRename();
                      }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-[#2A2B2F] text-white text-xs rounded px-1.5 py-0.5 outline-none border border-[#E8414A]"
                    />
                  ) : (
                    <span
                      onDoubleClick={(e) => handleStartRename(c, e)}
                      className="truncate font-medium"
                      title={c.title}
                    >
                      {c.title}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0">
                  {isEditing ? (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveRename(c.conversationId);
                        }}
                        className="p-1 hover:text-green-400 text-gray-400"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelRename();
                        }}
                        className="p-1 hover:text-gray-200 text-gray-400"
                      >
                        <X size={12} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={(e) => handleStartRename(c, e)}
                        className="p-1 hover:text-gray-200 text-gray-500"
                        title="Rename"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${c.title}"?`)) {
                            onDelete(c.conversationId);
                          }
                        }}
                        className="p-1 hover:text-red-400 text-gray-500"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
