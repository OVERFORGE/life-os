"use client";

import { useState } from "react";
import { useConversation } from "@/hooks/useConversation";

interface UseChatOptions {
  conversationId?: string | null;
  onMessageSent?: () => void;
}

export function useChat(options?: UseChatOptions) {
  const { messages: kernelMessages, isLoading, sendMessage: kernelSendMessage, refresh } = useConversation();
  const [selectedModel, setSelectedModel] = useState("llama-3.3-70b-versatile");
  const [sending, setSending] = useState(false);

  const messages = kernelMessages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  async function sendMessage(text: string) {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await kernelSendMessage(text, selectedModel);
      options?.onMessageSent?.();
    } catch (err) {
      console.error("Failed to send message via KernelClient", err);
    } finally {
      setSending(false);
    }
  }

  return {
    messages,
    loading: isLoading || sending,
    selectedModel,
    setSelectedModel,
    sendMessage,
    reload: refresh,
  };
}