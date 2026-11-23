"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { KernelClient } from "@/lib/kernelClient";
import { queryKeys } from "@/lib/queryKeys";

export function useConversation(conversationId: string = "default") {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated" && Boolean((session?.user as any)?.id);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.conversation(conversationId),
    queryFn: () => KernelClient.getConversation(conversationId),
    enabled: isAuthenticated,
  });

  const conversation = query.data ?? null;

  const sendMessage = async (message: string, model?: string, mode?: string) => {
    const res = await KernelClient.sendMessage({ message, model, mode });
    await queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
    return res;
  };

  return {
    conversation,
    messages: conversation?.recentMessages || [],
    activeEntity: conversation?.activeEntity,
    isLoading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    lastUpdated: query.dataUpdatedAt || null,
    sendMessage,
    refresh: async () => {
      await query.refetch();
    },
  };
}
