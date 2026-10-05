"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface ToolActivityItem {
  id: string;
  providerId: string;
  providerDisplayName: string;
  capabilityURN: string;
  iconName: string;
  humanMessage: string;
  state: "started" | "completed" | "failed";
  error?: string;
  details?: Record<string, any>;
}

export interface ConfirmationItem {
  actionId: string;
  title: string;
  message: string;
  details?: Record<string, string>;
  confirmLabel: string;
  cancelLabel: string;
}

export interface MissingConnectionItem {
  providerId: string;
  providerDisplayName: string;
  iconName: string;
  message: string;
  connectUrl: string;
}

export interface ChatMessageItem {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  statusPhase?: string;
  toolActivities?: ToolActivityItem[];
  confirmation?: ConfirmationItem;
  missingConnection?: MissingConnectionItem;
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
        toolActivities: m.toolActivities && m.toolActivities.length > 0 ? m.toolActivities : undefined,
        missingConnection: m.missingConnection,
        confirmation: m.confirmation,
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
        { role: "assistant", content: "", statusPhase: "understanding" },
      ]);
      setLoading(true);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const endpoint = `/api/conversations/${encodeURIComponent(activeId)}/messages`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            "x-timezone": localTz,
          },
          body: JSON.stringify({
            message: trimmed,
            model: selectedModel,
            mode: "general",
            streamFormat: "events",
            timezone: localTz,
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
        let buffer = "";
        let assistantAccumulated = "";
        let currentActivities: ToolActivityItem[] = [];
        let currentConfirmation: ConfirmationItem | undefined = undefined;
        let currentMissingConnection: MissingConnectionItem | undefined = undefined;
        let currentStatusPhase = "understanding";

        const updateBubble = () => {
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (updated[lastIdx].role === "assistant") {
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: assistantAccumulated,
                statusPhase: currentStatusPhase,
                toolActivities: currentActivities.length > 0 ? [...currentActivities] : undefined,
                confirmation: currentConfirmation,
                missingConnection: currentMissingConnection,
              };
            }
            return updated;
          });
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunkText = decoder.decode(value, { stream: true });
          buffer += chunkText;

          // Process SSE lines
          if (buffer.includes("\n\n")) {
            const parts = buffer.split("\n\n");
            buffer = parts.pop() || "";

            for (const part of parts) {
              const lines = part.split("\n");
              for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith("data: ")) {
                  try {
                    const eventData = JSON.parse(trimmedLine.slice(6));
                    if (eventData.type === "assistant_delta") {
                      assistantAccumulated += eventData.text || "";
                    } else if (eventData.type === "status") {
                      currentStatusPhase = eventData.status;
                    } else if (eventData.type === "tool_activity") {
                      const existingIdx = currentActivities.findIndex(
                        (a) =>
                          a.capabilityURN === eventData.capabilityURN &&
                          a.providerId === eventData.providerId
                      );
                      const activityObj: ToolActivityItem = {
                        id: `${eventData.providerId}_${eventData.capabilityURN}`,
                        providerId: eventData.providerId,
                        providerDisplayName: eventData.providerDisplayName,
                        capabilityURN: eventData.capabilityURN,
                        iconName: eventData.iconName,
                        humanMessage: eventData.humanMessage,
                        state: eventData.state,
                        error: eventData.error,
                        details: eventData.details,
                      };
                      if (existingIdx !== -1) {
                        currentActivities[existingIdx] = activityObj;
                      } else {
                        currentActivities.push(activityObj);
                      }
                    } else if (eventData.type === "confirmation_required") {
                      currentConfirmation = {
                        actionId: eventData.actionId,
                        title: eventData.title,
                        message: eventData.message,
                        details: eventData.details,
                        confirmLabel: eventData.confirmLabel || "Allow",
                        cancelLabel: eventData.cancelLabel || "Deny",
                      };
                    } else if (eventData.type === "missing_connection") {
                      currentMissingConnection = {
                        providerId: eventData.providerId,
                        providerDisplayName: eventData.providerDisplayName,
                        iconName: eventData.iconName,
                        message: eventData.message,
                        connectUrl: eventData.connectUrl || "/settings/connections",
                      };
                    } else if (eventData.type === "error") {
                      assistantAccumulated += `\n${eventData.message}`;
                    }
                  } catch (_) {
                    assistantAccumulated += trimmedLine.slice(6);
                  }
                } else if (trimmedLine.length > 0 && !trimmedLine.startsWith("event:")) {
                  // Fallback raw text stream
                  assistantAccumulated += trimmedLine;
                }
              }
            }
            updateBubble();
          } else if (!buffer.startsWith("data:") && !buffer.startsWith("event:")) {
            // Raw text chunking fallback
            assistantAccumulated += buffer;
            buffer = "";
            updateBubble();
          }
        }

        updateBubble();
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