import { create } from 'zustand';

export type EntityType = 'task' | 'goal' | 'log' | 'workout' | null;

interface SelectionState {
  activeEntityId: string | null;
  activeEntityType: EntityType;
  selectedIds: string[]; // For multi-select actions
  
  // Actions
  selectEntity: (id: string, type: EntityType) => void;
  clearSelection: () => void;
  toggleMultiSelect: (id: string) => void;
  clearMultiSelect: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  activeEntityId: null,
  activeEntityType: null,
  selectedIds: [],

  selectEntity: (id, type) => 
    set({ activeEntityId: id, activeEntityType: type, selectedIds: [] }),
    
  clearSelection: () => 
    set({ activeEntityId: null, activeEntityType: null }),
    
  toggleMultiSelect: (id) => 
    set((state) => {
      const isSelected = state.selectedIds.includes(id);
      if (isSelected) {
        return { selectedIds: state.selectedIds.filter(selectedId => selectedId !== id) };
      }
      return { selectedIds: [...state.selectedIds, id] };
    }),
    
  clearMultiSelect: () => 
    set({ selectedIds: [] }),
}));
