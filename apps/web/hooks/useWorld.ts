import { useKernelContext } from "@/providers/KernelProvider";

export function useWorld() {
  const { modules, metadata, refreshModule } = useKernelContext();
  const world = modules.world;

  return {
    world,
    lifeState: world?.lifeState,
    predictions: world?.predictions || [],
    trends: world?.trends || [],
    projectStates: world?.projectStates || [],
    insights: world?.insights || [],
    isLoading: metadata.loading.world,
    error: metadata.errors.world,
    lastUpdated: metadata.timestamps.world,
    refresh: () => refreshModule("world"),
  };
}
