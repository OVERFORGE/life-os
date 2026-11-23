"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { KernelClient } from "@/lib/kernelClient";
import { queryKeys } from "@/lib/queryKeys";

export function useLearning() {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated" && Boolean((session?.user as any)?.id);

  const query = useQuery({
    queryKey: queryKeys.learning(),
    queryFn: () => KernelClient.getLearning(),
    enabled: isAuthenticated,
  });

  const learning = query.data ?? null;

  return {
    learning,
    profile: learning?.behavioralProfile,
    patterns: learning?.patterns || [],
    activeSignals: learning?.activeSignals || [],
    isLoading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    lastUpdated: query.dataUpdatedAt || null,
    refresh: async () => {
      await query.refetch();
    },
  };
}
