import { useKernelContext } from "@/providers/KernelProvider";

export function useInsights() {
  const { modules, metadata, refreshModule } = useKernelContext();

  return {
    insights: modules.insights,
    isLoading: metadata.loading.insights,
    error: metadata.errors.insights,
    lastUpdated: metadata.timestamps.insights,
    refresh: () => refreshModule("insights"),
  };
}
