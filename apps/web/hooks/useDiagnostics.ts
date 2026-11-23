"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { KernelClient } from "@/lib/kernelClient";
import { queryKeys } from "@/lib/queryKeys";

export function useDiagnostics(requestId: string = "poll") {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated" && Boolean((session?.user as any)?.id);

  const query = useQuery({
    queryKey: [...queryKeys.diagnostics(), requestId],
    queryFn: () => KernelClient.getDiagnostics(requestId),
    enabled: isAuthenticated,
  });

  const diagnostics = query.data ?? null;

  return {
    diagnostics,
    health: diagnostics?.health,
    performance: diagnostics?.performance,
    metrics: diagnostics?.metrics,
    warnings: diagnostics?.warnings || [],
    isLoading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    lastUpdated: query.dataUpdatedAt || null,
    refresh: async () => {
      await query.refetch();
    },
  };
}
