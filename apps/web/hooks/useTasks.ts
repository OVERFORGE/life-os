import { useKernelContext } from "@/providers/KernelProvider";

export function useTasks() {
  const { modules, metadata, refreshModule } = useKernelContext();
  const graph = modules.tasks;

  return {
    graph,
    readyTasks: graph?.readyTasks || [],
    blockedTasks: graph?.blockedTasks || [],
    criticalPath: graph?.criticalPathTasks || [],
    blockageRatio: graph?.blockageRatio || 0,
    nodeCount: graph?.nodeCount || 0,
    isLoading: metadata.loading.tasks,
    error: metadata.errors.tasks,
    lastUpdated: metadata.timestamps.tasks,
    refresh: () => refreshModule("tasks"),
  };
}
