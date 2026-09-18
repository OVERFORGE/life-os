"use client";

import React, { useState, useCallback } from "react";
import { PersonaHeader } from "@/simulation/components/personas/PersonaHeader";
import { PersonaToolbar } from "@/simulation/components/personas/PersonaToolbar";
import { PersonaTable } from "@/simulation/components/personas/PersonaTable";
import { PersonaTemplatePickerModal } from "@/simulation/components/personas/PersonaTemplatePickerModal";
import { PersonaEditorDrawer } from "@/simulation/components/personas/PersonaEditorDrawer";
import { PersonaDeleteModal } from "@/simulation/components/personas/PersonaDeleteModal";
import { usePersonaRegistry } from "@/simulation/hooks/usePersonaRegistry";
import { SimulationPersonaDTO, CreatePersonaPayload, UpdatePersonaPayload } from "@/simulation/types";
import { PersonaTemplate } from "@/simulation/personas";

export default function PersonasPage() {
  const {
    personas,
    isLoading,
    error,
    search,
    setSearch,
    sortField,
    setSortField,
    sortOrder,
    setSortOrder,
    statusFilter,
    setStatusFilter,
    totalCount,
    refresh,
    createPersona,
    updatePersona,
    duplicatePersona,
    archivePersona,
    restorePersona,
    softDeletePersona,
    recoverPersona,
  } = usePersonaRegistry();

  // ── UI State ──
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PersonaTemplate | null>(null);

  const [editingPersona, setEditingPersona] = useState<SimulationPersonaDTO | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SimulationPersonaDTO | null>(null);
  const [deleteMode, setDeleteMode] = useState<"soft-delete" | "permanent">("soft-delete");

  const [editorError, setEditorError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Handlers ──
  const handleNewClick = useCallback(() => {
    setSelectedTemplate(null);
    setEditingPersona(null);
    setEditorError(null);
    setShowTemplatePicker(true);
  }, []);

  const handleTemplateSelect = useCallback((template: PersonaTemplate) => {
    setSelectedTemplate(template);
    setShowTemplatePicker(false);
    setShowEditor(true);
  }, []);

  const handleEdit = useCallback((persona: SimulationPersonaDTO) => {
    setEditingPersona(persona);
    setSelectedTemplate(null);
    setEditorError(null);
    setShowEditor(true);
  }, []);

  const handleEditorSave = useCallback(
    async (payload: CreatePersonaPayload | UpdatePersonaPayload) => {
      setIsSaving(true);
      setEditorError(null);
      try {
        if (editingPersona) {
          await updatePersona(editingPersona.id, payload as UpdatePersonaPayload);
        } else {
          await createPersona(payload as CreatePersonaPayload);
        }
        setShowEditor(false);
        setEditingPersona(null);
        setSelectedTemplate(null);
        await refresh();
      } catch (err) {
        setEditorError(err instanceof Error ? err.message : "Save failed. Please try again.");
      } finally {
        setIsSaving(false);
      }
    },
    [editingPersona, updatePersona, createPersona, refresh]
  );

  const handleEditorClose = useCallback(() => {
    setShowEditor(false);
    setEditingPersona(null);
    setSelectedTemplate(null);
    setEditorError(null);
  }, []);

  const handleDuplicate = useCallback(
    async (persona: SimulationPersonaDTO) => {
      try {
        await duplicatePersona(persona);
      } catch (err) {
        console.error("Duplicate failed:", err);
      }
    },
    [duplicatePersona]
  );

  const handleArchive = useCallback(
    async (persona: SimulationPersonaDTO) => {
      try {
        await archivePersona(persona.id);
      } catch (err) {
        console.error("Archive failed:", err);
      }
    },
    [archivePersona]
  );

  const handleRestore = useCallback(
    async (persona: SimulationPersonaDTO) => {
      try {
        await restorePersona(persona.id);
      } catch (err) {
        console.error("Restore failed:", err);
      }
    },
    [restorePersona]
  );

  const handleSoftDeleteClick = useCallback((persona: SimulationPersonaDTO) => {
    setDeleteTarget(persona);
    setDeleteMode("soft-delete");
  }, []);

  const handleRecoverClick = useCallback(
    async (persona: SimulationPersonaDTO) => {
      try {
        await recoverPersona(persona.id);
      } catch (err) {
        console.error("Recover failed:", err);
      }
    },
    [recoverPersona]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await softDeletePersona(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, softDeletePersona]);

  return (
    <div className="space-y-4 font-sans">
      {/* Page Header */}
      <PersonaHeader />

      {/* Toolbar */}
      <PersonaToolbar
        search={search}
        onSearchChange={setSearch}
        sortField={sortField}
        onSortChange={setSortField}
        sortOrder={sortOrder}
        onSortOrderToggle={() => setSortOrder(prev => (prev === "asc" ? "desc" : "asc"))}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        onNew={handleNewClick}
        totalCount={totalCount}
      />

      {/* Error Banner */}
      {error && (
        <div className="p-3 rounded-md bg-red-900/20 border border-red-900/40 text-xs font-mono text-red-400">
          Failed to load personas: {error}
        </div>
      )}

      {/* Persona Table */}
      <PersonaTable
        personas={personas}
        isLoading={isLoading}
        statusFilter={statusFilter}
        onEdit={handleEdit}
        onDuplicate={handleDuplicate}
        onArchive={handleArchive}
        onRestore={handleRestore}
        onSoftDelete={handleSoftDeleteClick}
        onRecover={handleRecoverClick}
        onNew={handleNewClick}
      />

      {/* Modals & Drawers */}
      {showTemplatePicker && (
        <PersonaTemplatePickerModal
          onSelect={handleTemplateSelect}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}

      {showEditor && (
        <PersonaEditorDrawer
          persona={editingPersona}
          prefill={selectedTemplate}
          onSave={handleEditorSave}
          onClose={handleEditorClose}
          isSaving={isSaving}
          error={editorError}
        />
      )}

      {deleteTarget && (
        <PersonaDeleteModal
          persona={deleteTarget}
          mode={deleteMode}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
          isLoading={isDeleting}
        />
      )}
    </div>
  );
}
