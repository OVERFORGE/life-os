"use client";

import { useState, useEffect } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

interface UseChatOptions {
  conversationId?: string | null;
  onMessageSent?: () => void;
}

export function useChat(options?: UseChatOptions) {
  const conversationId = options?.conversationId;
  const onMessageSent = options?.onMessageSent;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("llama-3.3-70b-versatile");

  useEffect(() => {
    async function loadHistory() {
      if (!conversationId) {
        // Fallback to legacy single conversation
        const res = await fetch("/api/conversation/history");
        if (!res.ok) return;
        const data = await res.json();
        setMessages(
          Array.isArray(data)
            ? data.map((m: any) => ({ role: m.role, content: m.content }))
            : []
        );
        return;
      }

      // Fetch per-conversation history
      try {
        const res = await fetch(`/api/conversations/${conversationId}`);
        if (!res.ok) return;
        const data = await res.json();

        setMessages(
          Array.isArray(data.messages)
            ? data.messages.map((m: any) => ({ role: m.role, content: m.content }))
            : []
        );
      } catch (err) {
        console.error("Error loading conversation history:", err);
      }
    }

    loadHistory();
  }, [conversationId]);

  async function sendMessage(text: string) {
    if (!text.trim()) return;

    const userMessage: Message = {
      role: "user",
      content: text,
    };

    const isFirstMessage = messages.length === 0;

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    const endpoint = conversationId
      ? `/api/conversations/${conversationId}/messages`
      : "/api/conversation";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: text, model: selectedModel }),
    });

    if (!res.body) {
      setLoading(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    let assistantText = "";

    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "" },
    ]);

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      const chunk = decoder.decode(value, { stream: true });

      assistantText += chunk;

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1].content = assistantText;
        return updated;
      });
    }

    setLoading(false);

    // Auto-generate title if this was the first message in a conversation
    if (conversationId && isFirstMessage) {
      const autoTitle = text.trim().slice(0, 30) + (text.length > 30 ? "..." : "");
      fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: autoTitle }),
      }).catch((e) => console.error("Error auto-titling conversation:", e));
    }

    if (onMessageSent) {
      onMessageSent();
    }
  }

  return {
    messages,
    loading,
    sendMessage,
    selectedModel,
    setSelectedModel,
  };
}