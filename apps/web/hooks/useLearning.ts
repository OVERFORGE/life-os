import { useKernelContext } from "@/providers/KernelProvider";

export function useLearning() {
  const { modules, metadata, refreshModule } = useKernelContext();
  const learning = modules.learning;

  return {
    learning,
    profile: learning?.behavioralProfile,
    patterns: learning?.patterns || [],
    activeSignals: learning?.activeSignals || [],
    isLoading: metadata.loading.learning,
    error: metadata.errors.learning,
    lastUpdated: metadata.timestamps.learning,
    refresh: () => refreshModule("learning"),
  };
}
