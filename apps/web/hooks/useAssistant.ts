import { useKernelContext } from "@/providers/KernelProvider";

export function useAssistant() {
  const { modules, metadata, refreshModule } = useKernelContext();

  return {
    assistantContext: modules.assistant,
    isLoading: metadata.loading.assistant,
    error: metadata.errors.assistant,
    lastUpdated: metadata.timestamps.assistant,
    refresh: () => refreshModule("assistant"),
  };
}
