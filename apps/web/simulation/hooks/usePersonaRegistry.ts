"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { SimulationPersonaDTO } from "../types";
import { personaService, PersonaListParams } from "../services/personaService";

export type PersonaStatusFilter = "active" | "archived" | "deleted" | "all";
export type PersonaSortField = "name" | "createdAt" | "updatedAt" | "code";

export function usePersonaRegistry() {
  const [personas, setPersonas] = useState<SimulationPersonaDTO[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Toolbar state
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<PersonaSortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<PersonaStatusFilter>("active");

  const debouncedSearch = useDebounce(search, 300);

  const fetchPersonas = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: PersonaListParams = {
        search: debouncedSearch,
        sort: sortField,
        order: sortOrder,
        status: statusFilter,
      };
      const result = await personaService.list(params);
      setPersonas(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load personas.");
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, sortField, sortOrder, statusFilter]);

  useEffect(() => {
    fetchPersonas();
  }, [fetchPersonas]);

  const createPersona = useCallback(async (payload: Parameters<typeof personaService.create>[0]) => {
    const created = await personaService.create(payload);
    await fetchPersonas();
    return created;
  }, [fetchPersonas]);

  const updatePersona = useCallback(async (id: string, payload: Parameters<typeof personaService.update>[1]) => {
    const updated = await personaService.update(id, payload);
    setPersonas(prev => prev.map(p => p.id === id ? updated : p));
    return updated;
  }, []);

  const duplicatePersona = useCallback(async (persona: SimulationPersonaDTO) => {
    const copy = await personaService.duplicate(persona);
    await fetchPersonas();
    return copy;
  }, [fetchPersonas]);

  const archivePersona = useCallback(async (id: string) => {
    const updated = await personaService.archive(id);
    await fetchPersonas();
    return updated;
  }, [fetchPersonas]);

  const restorePersona = useCallback(async (id: string) => {
    const updated = await personaService.restore(id);
    await fetchPersonas();
    return updated;
  }, [fetchPersonas]);

  const softDeletePersona = useCallback(async (id: string) => {
    const updated = await personaService.softDelete(id);
    await fetchPersonas();
    return updated;
  }, [fetchPersonas]);

  const recoverPersona = useCallback(async (id: string) => {
    const updated = await personaService.recover(id);
    await fetchPersonas();
    return updated;
  }, [fetchPersonas]);

  const permanentDeletePersona = useCallback(async (id: string) => {
    await personaService.permanentDelete(id);
    setPersonas(prev => prev.filter(p => p.id !== id));
  }, []);

  return {
    personas,
    isLoading,
    error,

    // Toolbar state
    search,
    setSearch,
    sortField,
    setSortField,
    sortOrder,
    setSortOrder,
    statusFilter,
    setStatusFilter,

    // Actions
    refresh: fetchPersonas,
    createPersona,
    updatePersona,
    duplicatePersona,
    archivePersona,
    restorePersona,
    softDeletePersona,
    recoverPersona,
    permanentDeletePersona,

    // Computed
    totalCount: personas.length,
  };
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebounced(value), delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, delay]);

  return debounced;
}
