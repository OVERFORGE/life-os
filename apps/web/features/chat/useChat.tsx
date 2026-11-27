"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  SseStreamParser,
  createInitialChatStreamState,
  reduceChatStreamEvent,
  type TurnStatus,
  type ParsedToolActivityItem,
  type ParsedConfirmationItem,
  type ParsedMissingConnectionItem,
} from "./sseStreamParser";

export interface ToolActivityItem extends Omit<ParsedToolActivityItem, "details"> {
  details?: Record<string, any>;
}
export type ConfirmationItem = ParsedConfirmationItem;
export type MissingConnectionItem = ParsedMissingConnectionItem;
export type { TurnStatus };

export interface ChatMessageItem {
  id?: string;
  requestId?: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  statusPhase?: string;
  turnStatus?: TurnStatus;
  errorMessage?: string;
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
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedModel, setSelectedModel] = useState("openai/gpt-oss-120b");

  const abortControllerRef = useRef<AbortController | null>(null);
  const historyAbortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const activeConversationRef = useRef<string | null | undefined>(conversationId);

  useEffect(() => {
    activeConversationRef.current = conversationId;
  }, [conversationId]);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Load message history whenever active conversationId changes
  const loadHistory = useCallback(async (id: string) => {
    historyAbortRef.current?.abort();
    const historyController = new AbortController();
    historyAbortRef.current = historyController;

    try {
      setIsLoadingHistory(true);
      const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
        signal: historyController.signal,
      });
      if (!res.ok) {
        if (res.status === 404) {
          if (activeConversationRef.current === id) setMessages([]);
          return;
        }
        throw new Error(`Failed to load history (${res.status})`);
      }
      const data = await res.json();
      if (activeConversationRef.current !== id) return;
      const history: ChatMessageItem[] = (data.messages || []).map((m: any, idx: number) => ({
        id: m._id || m.id || `hist_${idx}`,
        requestId: m.requestId,
        role: m.role as "user" | "assistant",
        content: m.content || "",
        createdAt: m.createdAt,
        turnStatus: m.status,
        toolActivities: m.toolActivities && m.toolActivities.length > 0 ? m.toolActivities : undefined,
        missingConnection: m.missingConnection,
        confirmation: m.confirmation,
      }));
      setMessages(history);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.warn("[USE_CHAT] Error loading history for conversation:", id, err);
      }
    } finally {
      if (historyAbortRef.current === historyController) {
        historyAbortRef.current = null;
        setIsLoadingHistory(false);
      }
    }
  }, []);

  useEffect(() => {
    // Cancel any active stream when switching conversations so stale chunks never leak
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    inFlightRef.current = false;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setIsStreaming(false);
      if (conversationId) {
        void loadHistory(conversationId);
      } else {
        setMessages([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, loadHistory]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || inFlightRef.current) return;

      inFlightRef.current = true;
      setIsStreaming(true);

      const activeId = conversationId || "default";
      const clientRequestId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? `req_${crypto.randomUUID()}`
          : `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const userMsgId = `${clientRequestId}_user`;
      const assistantMsgId = `${clientRequestId}_assistant`;

      // 1. Optimistically display user's bubble and an initial streaming assistant bubble
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, requestId: clientRequestId, role: "user", content: trimmed },
        {
          id: assistantMsgId,
          requestId: clientRequestId,
          role: "assistant",
          content: "",
          statusPhase: "understanding",
          turnStatus: "streaming",
        },
      ]);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      let streamState = createInitialChatStreamState();

      const updateBubble = () => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: streamState.content,
                  statusPhase: streamState.statusPhase,
                  turnStatus: streamState.turnStatus,
                  errorMessage: streamState.errorMessage,
                  toolActivities:
                    streamState.toolActivities.length > 0 ? [...streamState.toolActivities] : undefined,
                  confirmation: streamState.confirmation,
                  missingConnection: streamState.missingConnection,
                }
              : m
          )
        );
      };

      try {
        const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const endpoint = `/api/conversations/${encodeURIComponent(activeId)}/messages`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            "x-timezone": localTz,
            "x-request-id": clientRequestId,
          },
          body: JSON.stringify({
            requestId: clientRequestId,
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
        const parser = new SseStreamParser();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunkText = decoder.decode(value, { stream: true });
          const events = parser.push(chunkText);
          if (events.length > 0) {
            for (const ev of events) {
              streamState = reduceChatStreamEvent(streamState, ev);
            }
            updateBubble();
          }
        }

        const trailingEvents = parser.flush();
        if (trailingEvents.length > 0) {
          for (const ev of trailingEvents) {
            streamState = reduceChatStreamEvent(streamState, ev);
          }
        }
        if (streamState.turnStatus === "streaming") {
          streamState = { ...streamState, turnStatus: "completed", statusPhase: "completed" };
        }
        updateBubble();
        onMessageSent?.();
      } catch (err: any) {
        if (err?.name === "AbortError") {
          streamState = {
            ...streamState,
            turnStatus: "cancelled",
            statusPhase: "cancelled",
          };
          updateBubble();
        } else {
          console.error("[USE_CHAT] Failed to send message:", err);
          streamState = {
            ...streamState,
            turnStatus: "failed",
            statusPhase: "failed",
            errorMessage: err?.message || "Failed to respond",
          };
          updateBubble();
        }
      } finally {
        inFlightRef.current = false;
        setIsStreaming(false);
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    },
    [conversationId, selectedModel, onMessageSent]
  );

  return {
    messages,
    loading: isStreaming || isLoadingHistory,
    isStreaming,
    isLoadingHistory,
    selectedModel,
    setSelectedModel,
    sendMessage,
    stopGeneration,
    reload: () => {
      if (conversationId) loadHistory(conversationId);
    },
  };
}
