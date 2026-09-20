"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface ChatMessageItem {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

interface UseChatOptions {
  conversationId?: string | null;
  onMessageSent?: () => void;
}

export function useChat(options?: UseChatOptions) {
  const conversationId = options?.conversationId;
  const onMessageSent = options?.onMessageSent;

  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("openai/gpt-oss-120b");
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load message history whenever active conversationId changes
  const loadHistory = useCallback(async (id: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`);
      if (!res.ok) {
        if (res.status === 404) {
          setMessages([]);
          return;
        }
        throw new Error(`Failed to load history (${res.status})`);
      }
      const data = await res.json();
      const history = (data.messages || []).map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content || "",
        createdAt: m.createdAt,
      }));
      setMessages(history);
    } catch (err) {
      console.warn("[USE_CHAT] Error loading history for conversation:", id, err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (conversationId) {
      loadHistory(conversationId);
    } else {
      setMessages([]);
    }
  }, [conversationId, loadHistory]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const activeId = conversationId || "default";

      // 1. Optimistically display user's bubble and an initial streaming assistant bubble
      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed },
        { role: "assistant", content: "" },
      ]);
      setLoading(true);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const endpoint = `/api/conversations/${encodeURIComponent(activeId)}/messages`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            model: selectedModel,
            mode: "general",
          }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          let errorDetail = `Server error (${res.status})`;
          try {
            const errData = await res.json();
            if (errData?.error) errorDetail = errData.error;
          } catch (_) {}
          throw new Error(errorDetail);
        }

        if (!res.body) {
          throw new Error("No streaming body received from assistant");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let assistantAccumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunkText = decoder.decode(value, { stream: true });
          assistantAccumulated += chunkText;

          // Stream chunks in real time directly to the active assistant bubble
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (updated[lastIdx].role === "assistant") {
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: assistantAccumulated,
              };
            }
            return updated;
          });
        }

        onMessageSent?.();
      } catch (err: any) {
        if (err.name === "AbortError") {
          console.log("[USE_CHAT] Request aborted by user.");
        } else {
          console.error("[USE_CHAT] Failed to send message:", err);
          // Update assistant bubble with clear error feedback
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (updated[lastIdx].role === "assistant") {
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: `Sorry, I encountered an issue: ${err.message || "Failed to respond"}`,
              };
            }
            return updated;
          });
        }
      } finally {
        setLoading(false);
        abortControllerRef.current = null;
      }
    },
    [conversationId, loading, selectedModel, onMessageSent]
  );

  return {
    messages,
    loading,
    selectedModel,
    setSelectedModel,
    sendMessage,
    reload: () => {
      if (conversationId) loadHistory(conversationId);
    },
  };
}