import { useKernelContext } from "@/providers/KernelProvider";

export function useSettings() {
  const { modules, metadata, refreshModule } = useKernelContext();

  return {
    settings: modules.settings,
    isLoading: metadata.loading.settings,
    error: metadata.errors.settings,
    lastUpdated: metadata.timestamps.settings,
    refresh: () => refreshModule("settings"),
  };
}
