/**
 * Runtime Service — Phase 1.3
 * Communicates with /api/admin/simulation endpoints.
 */

import { SimulationRunDTO, StartSimulationPayload } from "../types";

const BASE = "/api/admin/simulation";

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
  return data as T;
}

export const runtimeService = {
  /** List all simulation runs */
  async listRuns(): Promise<SimulationRunDTO[]> {
    const res = await fetch(BASE);
    const data = await handleResponse<{ runs: SimulationRunDTO[] }>(res);
    return data.runs;
  },

  /** Get simulation run by ID or runUid */
  async getRun(id: string): Promise<SimulationRunDTO> {
    const res = await fetch(`${BASE}/${id}`);
    const data = await handleResponse<{ run: SimulationRunDTO }>(res);
    return data.run;
  },

  /** Start a new simulation run */
  async startSimulation(payload: StartSimulationPayload): Promise<SimulationRunDTO> {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<{ run: SimulationRunDTO }>(res);
    return data.run;
  },

  /** Execute a full pure simulation step (Decision Engine -> Kernel -> Observability -> Clock +1) */
  async executeStep(id: string, useMockProvider: boolean = false): Promise<SimulationRunDTO> {
    console.log("[runtimeService] Calling POST /api/admin/simulation/" + id + "/step");
    const res = await fetch(`${BASE}/${id}/step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useMockProvider }),
    });
    const data = await handleResponse<{ run: SimulationRunDTO }>(res);
    return data.run;
  },

  /** Advance simulation clock by N ticks (Refinement 9: { ticks: N }) */
  async advance(id: string, ticks: number = 1): Promise<SimulationRunDTO> {
    console.log("[runtimeService] Calling POST /api/admin/simulation/" + id + "/advance with ticks:", ticks);
    const res = await fetch(`${BASE}/${id}/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticks }),
    });
    const data = await handleResponse<{ run: SimulationRunDTO }>(res);
    return data.run;
  },

  /** Pause simulation run */
  async pause(id: string): Promise<SimulationRunDTO> {
    const res = await fetch(`${BASE}/${id}/pause`, { method: "POST" });
    const data = await handleResponse<{ run: SimulationRunDTO }>(res);
    return data.run;
  },

  /** Resume simulation run */
  async resume(id: string): Promise<SimulationRunDTO> {
    const res = await fetch(`${BASE}/${id}/resume`, { method: "POST" });
    const data = await handleResponse<{ run: SimulationRunDTO }>(res);
    return data.run;
  },

  /** Finish simulation run */
  async finish(id: string): Promise<SimulationRunDTO> {
    const res = await fetch(`${BASE}/${id}/finish`, { method: "POST" });
    const data = await handleResponse<{ run: SimulationRunDTO }>(res);
    return data.run;
  },

  /** Reset simulation run back to tick 0 */
  async reset(id: string): Promise<SimulationRunDTO> {
    const res = await fetch(`${BASE}/${id}/reset`, { method: "POST" });
    const data = await handleResponse<{ run: SimulationRunDTO }>(res);
    return data.run;
  },
};
