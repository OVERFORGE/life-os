"use client";

import { useState ,useEffect } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("llama-3.3-70b-versatile");

  useEffect(() => {
  async function loadHistory() {
    const res = await fetch("/api/conversation/history");
    const data = await res.json();

    setMessages(
      data.map((m:any)=>({
        role:m.role,
        content:m.content
      }))
    );
  }

  loadHistory();
}, []);
  async function sendMessage(text: string) {
    if (!text.trim()) return;

    const userMessage: Message = {
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    const res = await fetch("/api/conversation", {
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
  }

  return {
    messages,
    loading,
    sendMessage,
    selectedModel,
    setSelectedModel
  };
}