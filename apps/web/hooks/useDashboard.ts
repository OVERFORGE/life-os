import { useKernelContext } from "@/providers/KernelProvider";

export function useDashboard() {
  const { modules, metadata, refreshModule } = useKernelContext();

  return {
    dashboard: modules.dashboard,
    isLoading: metadata.loading.dashboard,
    error: metadata.errors.dashboard,
    lastUpdated: metadata.timestamps.dashboard,
    refresh: () => refreshModule("dashboard"),
  };
}
