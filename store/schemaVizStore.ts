import { create } from "zustand";
import {
  DARK_THEME,
  LIGHT_THEME,
  loadVizTheme,
  saveVizTheme,
  type SchemaVizTheme,
} from "@/lib/schema-viz/theme";
import type { ObjectType, ParsedRelationship } from "@/lib/schema-viz/types";

interface SchemaVizStore {
  focusedTableId: string | null;
  neighborIds: Set<string>;
  focusedEdgeIds: Set<string>;
  theme: SchemaVizTheme;
  hiddenObjectTypes: Set<ObjectType>;
  layoutDirection: "LR" | "TB";
  searchQuery: string;

  setFocusedTable: (id: string | null, relationships: ParsedRelationship[]) => void;
  toggleTheme: () => void;
  toggleObjectType: (type: ObjectType) => void;
  setLayoutDirection: (dir: "LR" | "TB") => void;
  setSearchQuery: (q: string) => void;
}

export const useSchemaVizStore = create<SchemaVizStore>((set, get) => ({
  focusedTableId: null,
  neighborIds: new Set(),
  focusedEdgeIds: new Set(),
  theme: loadVizTheme(),
  hiddenObjectTypes: new Set(),
  layoutDirection: "LR",
  searchQuery: "",

  setFocusedTable: (id, relationships) => {
    if (id === null) {
      set({ focusedTableId: null, neighborIds: new Set(), focusedEdgeIds: new Set() });
      return;
    }

    const neighborIds = new Set<string>();
    const focusedEdgeIds = new Set<string>();

    for (const rel of relationships) {
      if (rel.fromTable === id) {
        neighborIds.add(rel.toTable);
        focusedEdgeIds.add(rel.id);
      }
      if (rel.toTable === id) {
        neighborIds.add(rel.fromTable);
        focusedEdgeIds.add(rel.id);
      }
    }

    set({ focusedTableId: id, neighborIds, focusedEdgeIds });
  },

  toggleTheme: () => {
    const next = get().theme.id === "dark" ? LIGHT_THEME : DARK_THEME;
    saveVizTheme(next);
    set({ theme: next });
  },

  toggleObjectType: (type) => {
    const hidden = new Set(get().hiddenObjectTypes);
    if (hidden.has(type)) hidden.delete(type);
    else hidden.add(type);
    set({ hiddenObjectTypes: hidden });
  },

  setLayoutDirection: (dir) => set({ layoutDirection: dir }),
  setSearchQuery: (q) => set({ searchQuery: q }),
}));
