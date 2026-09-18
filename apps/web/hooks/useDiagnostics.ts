import { useKernelContext } from "@/providers/KernelProvider";

export function useDiagnostics() {
  const { modules, metadata, refreshModule } = useKernelContext();
  const diagnostics = modules.diagnostics;

  return {
    diagnostics,
    health: diagnostics?.health,
    performance: diagnostics?.performance,
    metrics: diagnostics?.metrics,
    warnings: diagnostics?.warnings || [],
    isLoading: metadata.loading.diagnostics,
    error: metadata.errors.diagnostics,
    lastUpdated: metadata.timestamps.diagnostics,
    refresh: () => refreshModule("diagnostics"),
  };
}
