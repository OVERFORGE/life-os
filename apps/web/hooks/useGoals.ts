import { useKernelContext } from "@/providers/KernelProvider";

export function useGoals() {
  const { modules, metadata, refreshModule } = useKernelContext();
  const goals = modules.goals || [];

  return {
    goals,
    highPressureGoals: goals.filter((g) => g.pressure.pressureScore >= 50),
    isLoading: metadata.loading.goals,
    error: metadata.errors.goals,
    lastUpdated: metadata.timestamps.goals,
    refresh: () => refreshModule("goals"),
  };
}
