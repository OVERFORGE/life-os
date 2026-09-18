"use client";

import { useState, useCallback, useEffect } from "react";
import { SimulationRunDTO, StartSimulationPayload } from "../types";
import { runtimeService } from "../services/runtimeService";

export function useSimulationRuntime() {
  const [runs, setRuns] = useState<SimulationRunDTO[]>([]);
  const [activeRun, setActiveRun] = useState<SimulationRunDTO | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await runtimeService.listRuns();
      setRuns(list);
      if (list.length > 0 && !activeRun) {
        setActiveRun(list[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch simulation runs.");
    } finally {
      setIsLoading(false);
    }
  }, [activeRun]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const selectRun = useCallback((run: SimulationRunDTO) => {
    setActiveRun(run);
  }, []);

  const startSimulation = useCallback(async (payload: StartSimulationPayload) => {
    setIsExecuting(true);
    setError(null);
    try {
      const newRun = await runtimeService.startSimulation(payload);
      setActiveRun(newRun);
      await fetchRuns();
      return newRun;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start simulation.");
      throw err;
    } finally {
      setIsExecuting(false);
    }
  }, [fetchRuns]);

  const executeStep = useCallback(async (useMockProvider: boolean = false) => {
    if (!activeRun) return;
    setIsExecuting(true);
    setError(null);
    try {
      console.log("[useSimulationRuntime] executeStep starting for run:", activeRun.runUid);
      const updated = await runtimeService.executeStep(activeRun.id, useMockProvider);
      setActiveRun(updated);
      setRuns(prev => prev.map(r => r.id === updated.id ? updated : r));
      return updated;
    } catch (err) {
      console.error("[useSimulationRuntime] executeStep error:", err);
      setError(err instanceof Error ? err.message : "Failed to execute simulation step.");
    } finally {
      setIsExecuting(false);
    }
  }, [activeRun]);

  const advance = useCallback(async (ticks: number = 1) => {
    if (!activeRun) return;
    setIsExecuting(true);
    setError(null);
    try {
      if (ticks === 1) {
        // Single tick advance maps to a full simulation step execution (Decision -> Kernel -> Observability)
        console.log("[useSimulationRuntime] advance(1) routing to runtimeService.executeStep");
        const updated = await runtimeService.executeStep(activeRun.id);
        setActiveRun(updated);
        setRuns(prev => prev.map(r => r.id === updated.id ? updated : r));
      } else {
        // Multi-tick fast-forward clock advance
        console.log(`[useSimulationRuntime] advance(${ticks}) calling runtimeService.advance`);
        const updated = await runtimeService.advance(activeRun.id, ticks);
        setActiveRun(updated);
        setRuns(prev => prev.map(r => r.id === updated.id ? updated : r));
      }
    } catch (err) {
      console.error("[useSimulationRuntime] advance error:", err);
      setError(err instanceof Error ? err.message : "Failed to advance simulation.");
    } finally {
      setIsExecuting(false);
    }
  }, [activeRun]);

  const pause = useCallback(async () => {
    if (!activeRun) return;
    setIsExecuting(true);
    setError(null);
    try {
      const updated = await runtimeService.pause(activeRun.id);
      setActiveRun(updated);
      setRuns(prev => prev.map(r => r.id === updated.id ? updated : r));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pause simulation.");
    } finally {
      setIsExecuting(false);
    }
  }, [activeRun]);

  const resume = useCallback(async () => {
    if (!activeRun) return;
    setIsExecuting(true);
    setError(null);
    try {
      const updated = await runtimeService.resume(activeRun.id);
      setActiveRun(updated);
      setRuns(prev => prev.map(r => r.id === updated.id ? updated : r));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resume simulation.");
    } finally {
      setIsExecuting(false);
    }
  }, [activeRun]);

  const finish = useCallback(async () => {
    if (!activeRun) return;
    setIsExecuting(true);
    setError(null);
    try {
      const updated = await runtimeService.finish(activeRun.id);
      setActiveRun(updated);
      setRuns(prev => prev.map(r => r.id === updated.id ? updated : r));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to finish simulation.");
    } finally {
      setIsExecuting(false);
    }
  }, [activeRun]);

  const reset = useCallback(async () => {
    if (!activeRun) return;
    setIsExecuting(true);
    setError(null);
    try {
      const updated = await runtimeService.reset(activeRun.id);
      setActiveRun(updated);
      setRuns(prev => prev.map(r => r.id === updated.id ? updated : r));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset simulation.");
    } finally {
      setIsExecuting(false);
    }
  }, [activeRun]);

  return {
    runs,
    activeRun,
    isLoading,
    isExecuting,
    error,
    selectRun,
    startSimulation,
    executeStep,
    advance,
    pause,
    resume,
    finish,
    reset,
    refresh: fetchRuns,
  };
}
