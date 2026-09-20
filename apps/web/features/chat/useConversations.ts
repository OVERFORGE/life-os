"use client";

import { useState, useEffect, useCallback } from "react";

export interface ConversationItem {
  conversationId: string;
  title: string;
  archived: boolean;
  pinned: boolean;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("lifeos_active_conversation_id") || null;
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const setActiveConversationId = useCallback((id: string | null) => {
    setActiveConversationIdState(id);
    if (typeof window !== "undefined") {
      if (id) {
        localStorage.setItem("lifeos_active_conversation_id", id);
      } else {
        localStorage.removeItem("lifeos_active_conversation_id");
      }
    }
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/conversations");
      if (!res.ok) throw new Error("Failed to fetch conversations");
      const data: ConversationItem[] = await res.json();
      setConversations(data);

      // Restore active conversation from localStorage or auto-select the most recent
      const savedId = typeof window !== "undefined" ? localStorage.getItem("lifeos_active_conversation_id") : null;
      if (savedId && data.some((c) => c.conversationId === savedId)) {
        setActiveConversationId(savedId);
      } else if (data.length > 0) {
        setActiveConversationId(data[0].conversationId);
      }
    } catch (err) {
      console.error("Error loading conversations:", err);
    } finally {
      setLoading(false);
    }
  }, [setActiveConversationId]);

  useEffect(() => {
    fetchConversations();
  }, []);

  const createConversation = async (title?: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title || "New Conversation" }),
      });
      if (!res.ok) throw new Error("Failed to create conversation");
      const newConv: ConversationItem = await res.json();

      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.conversationId);
      return newConv.conversationId;
    } catch (err) {
      console.error("Error creating conversation:", err);
      return null;
    }
  };

  const deleteConversation = async (conversationId: string) => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete conversation");

      setConversations((prev) => {
        const next = prev.filter((c) => c.conversationId !== conversationId);
        // If we deleted the active conversation, switch to the first remaining one
        if (activeConversationId === conversationId) {
          setActiveConversationId(next.length > 0 ? next[0].conversationId : null);
        }
        return next;
      });
    } catch (err) {
      console.error("Error deleting conversation:", err);
    }
  };

  const renameConversation = async (conversationId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (!res.ok) throw new Error("Failed to rename conversation");

      setConversations((prev) =>
        prev.map((c) =>
          c.conversationId === conversationId ? { ...c, title: newTitle.trim() } : c
        )
      );
    } catch (err) {
      console.error("Error renaming conversation:", err);
    }
  };

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return {
    conversations: filteredConversations,
    allConversations: conversations,
    activeConversationId,
    setActiveConversationId,
    loading,
    searchQuery,
    setSearchQuery,
    createConversation,
    deleteConversation,
    renameConversation,
    refreshConversations: fetchConversations,
  };
}
