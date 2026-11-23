"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { KernelClient } from "@/lib/kernelClient";
import { queryKeys } from "@/lib/queryKeys";

export function useTasks() {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated" && Boolean((session?.user as any)?.id);

  const query = useQuery({
    queryKey: queryKeys.tasks(),
    queryFn: () => KernelClient.getTasks(),
    enabled: isAuthenticated,
  });

  const graph = query.data ?? null;

  return {
    graph,
    readyTasks: graph?.readyTasks || [],
    blockedTasks: graph?.blockedTasks || [],
    criticalPath: graph?.criticalPathTasks || [],
    blockageRatio: graph?.blockageRatio || 0,
    nodeCount: graph?.nodeCount || 0,
    isLoading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    lastUpdated: query.dataUpdatedAt || null,
    refresh: async () => {
      await query.refetch();
    },
  };
}
