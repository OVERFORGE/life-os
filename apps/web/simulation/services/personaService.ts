/**
 * Persona Service — Phase 1.2
 * All UI interactions with persona data go through this service.
 * Communicates with /api/admin/personas endpoints.
 */

import { SimulationPersonaDTO, CreatePersonaPayload, UpdatePersonaPayload } from "../types";

const BASE = "/api/admin/personas";

export interface PersonaListParams {
  search?: string;
  sort?: string;
  order?: "asc" | "desc";
  status?: "active" | "archived" | "deleted" | "all";
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
  return data as T;
}

export const personaService = {
  /** List personas with optional search, sort, filter */
  async list(params: PersonaListParams = {}): Promise<SimulationPersonaDTO[]> {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.sort) qs.set("sort", params.sort);
    if (params.order) qs.set("order", params.order);
    if (params.status) qs.set("status", params.status);
    const res = await fetch(`${BASE}?${qs.toString()}`);
    const data = await handleResponse<{ personas: SimulationPersonaDTO[] }>(res);
    return data.personas;
  },

  /** Get a persona by ID */
  async getById(id: string): Promise<SimulationPersonaDTO> {
    const res = await fetch(`${BASE}/${id}`);
    const data = await handleResponse<{ persona: SimulationPersonaDTO }>(res);
    return data.persona;
  },

  /** Create a new persona */
  async create(payload: CreatePersonaPayload): Promise<SimulationPersonaDTO> {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<{ persona: SimulationPersonaDTO }>(res);
    return data.persona;
  },

  /** Update a persona (full update) */
  async update(id: string, payload: UpdatePersonaPayload): Promise<SimulationPersonaDTO> {
    const res = await fetch(`${BASE}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<{ persona: SimulationPersonaDTO }>(res);
    return data.persona;
  },

  /** Duplicate a persona (creates a new one with a newly generated personaUid and code) */
  async duplicate(source: SimulationPersonaDTO): Promise<SimulationPersonaDTO> {
    const payload: CreatePersonaPayload = {
      code: `${source.code}_COPY_${Date.now()}`,
      name: `${source.name} (Copy)`,
      description: source.description,
      archetype: source.archetype,
      templateId: source.templateId,
      templateVersion: source.templateVersion,
      identity: source.identity,
      traits: source.traits,
      initialState: source.initialState,
      lifestyle: source.lifestyle,
      motivation: source.motivation,
      capabilities: source.capabilities,
      memoryProfile: source.memoryProfile,
      supportedScenarioTypes: source.supportedScenarioTypes,
      metadata: { ...source.metadata },
      promptVersion: source.promptVersion,
      personaVersion: "1.0.0",
      schemaVersion: source.schemaVersion ?? "1.0.0",
      tags: [...source.tags],
    };
    return personaService.create(payload);
  },

  /** Archive a persona (sets isActive = false) */
  async archive(id: string): Promise<SimulationPersonaDTO> {
    const res = await fetch(`${BASE}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archive" }),
    });
    const data = await handleResponse<{ persona: SimulationPersonaDTO }>(res);
    return data.persona;
  },

  /** Restore an archived or soft-deleted persona */
  async restore(id: string): Promise<SimulationPersonaDTO> {
    const res = await fetch(`${BASE}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore" }),
    });
    const data = await handleResponse<{ persona: SimulationPersonaDTO }>(res);
    return data.persona;
  },

  /** Soft-delete a persona (isDeleted = true, recoverable) */
  async softDelete(id: string): Promise<SimulationPersonaDTO> {
    const res = await fetch(`${BASE}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "soft-delete" }),
    });
    const data = await handleResponse<{ persona: SimulationPersonaDTO }>(res);
    return data.persona;
  },

  /** Recover a soft-deleted persona back to archived state */
  async recover(id: string): Promise<SimulationPersonaDTO> {
    const res = await fetch(`${BASE}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "recover" }),
    });
    const data = await handleResponse<{ persona: SimulationPersonaDTO }>(res);
    return data.persona;
  },

  /** Permanently delete a persona (irreversible) */
  async permanentDelete(id: string): Promise<void> {
    const res = await fetch(`${BASE}/${id}`, { method: "DELETE" });
    await handleResponse<{ success: boolean }>(res);
  },
};
