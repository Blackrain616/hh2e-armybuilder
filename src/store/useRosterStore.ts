import { create } from 'zustand';
import LZString from 'lz-string';
import {
  buildAutoConfigSelections,
  cloneSelectionWithNewIds,
  getDefaultAllegianceForFaction,
  type AllegianceChoice,
} from '../engine/rosterActions';
import type { FactionBundle, SystemIndex } from '../types/data';
import type { Roster, RosterForce, UnitFavorite } from '../types/roster';

const STORAGE_KEY = 'hh2e-rosters-v1';
const FAVORITES_KEY = 'hh2e-favorites-v1';

function loadSavedRosters(): Roster[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Roster[]) : [];
  } catch {
    return [];
  }
}

function saveRosters(rosters: Roster[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rosters));
  } catch {
    // Speicherlimit ignoriert
  }
}

function loadSavedFavorites(): UnitFavorite[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? (JSON.parse(raw) as UnitFavorite[]) : [];
  } catch {
    return [];
  }
}

function saveFavorites(favorites: UnitFavorite[]) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch {
    // Speicherlimit ignoriert
  }
}

interface RosterStoreState {
  systemIndex: SystemIndex | null;
  bundles: Record<string, FactionBundle>;
  rosters: Roster[];
  favorites: UnitFavorite[];
  activeRosterId: string | null;
  loading: boolean;
  error: string | null;

  init: () => Promise<void>;
  ensureFactionLoaded: (factionId: string) => Promise<FactionBundle | null>;
  createRoster: (
    name: string,
    pointsLimit: number,
    forceEntryId: string,
    factionId: string,
    options?: { allegiance?: AllegianceChoice; enableExpanded?: boolean }
  ) => Promise<void>;
  deleteRoster: (rosterId: string) => void;
  setActiveRoster: (rosterId: string | null) => Promise<void>;
  updateActiveRoster: (updater: (roster: Roster) => Roster) => void;
  addForceToActiveRoster: (
    forceEntryId: string,
    factionId: string,
    options?: { allegiance?: AllegianceChoice; enableExpanded?: boolean }
  ) => Promise<void>;
  removeForceFromActiveRoster: (forceId: string) => void;
  saveFavorite: (fav: Omit<UnitFavorite, 'id' | 'createdAt'>) => void;
  deleteFavorite: (favId: string) => void;
  buildShareUrl: (roster: Roster) => string;
}

export const useRosterStore = create<RosterStoreState>((set, get) => ({
  systemIndex: null,
  bundles: {},
  rosters: loadSavedRosters(),
  favorites: loadSavedFavorites(),
  activeRosterId: null,
  loading: true,
  error: null,

  init: async () => {
    try {
      set({ loading: true, error: null });
      const res = await fetch('/data/index.json');
      if (!res.ok) throw new Error(`HTTP ${res.status} beim Laden von /data/index.json`);
      const systemIndex = (await res.json()) as SystemIndex;
      set({ systemIndex, loading: false });

      if (window.location.hash.startsWith('#list=')) {
        const compressed = window.location.hash.slice('#list='.length);
        const json = LZString.decompressFromEncodedURIComponent(compressed);
        if (json) {
          const imported = JSON.parse(json) as Roster;
          imported.id = crypto.randomUUID ? crypto.randomUUID() : `imp-${Date.now()}`;
          imported.name = `${imported.name} (Import)`;
          const next = [imported, ...get().rosters];
          saveRosters(next);
          set({ rosters: next, activeRosterId: imported.id });
          for (const f of imported.forces) {
            await get().ensureFactionLoaded(f.factionId);
          }
          history.replaceState(null, '', window.location.pathname);
          return;
        }
      }

      const existing = get().rosters;
      if (existing.length > 0) {
        await get().setActiveRoster(existing[0].id);
      }
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Unbekannter Ladefehler',
      });
    }
  },

  ensureFactionLoaded: async (factionId: string) => {
    const cached = get().bundles[factionId];
    if (cached) return cached;

    const index = get().systemIndex;
    const meta = index?.factions.find((f) => f.id === factionId);
    if (!meta) return null;

    const res = await fetch(`/data/${meta.file}`);
    if (!res.ok) throw new Error(`Fraktion "${meta.name}" konnte nicht geladen werden.`);
    const bundle = (await res.json()) as FactionBundle;
    set((state) => ({ bundles: { ...state.bundles, [factionId]: bundle } }));
    return bundle;
  },

  createRoster: async (name, pointsLimit, forceEntryId, factionId, options) => {
    const bundle = await get().ensureFactionLoaded(factionId);
    const id = crypto.randomUUID ? crypto.randomUUID() : `r-${Date.now()}`;
    const forceId = crypto.randomUUID ? crypto.randomUUID() : `f-${Date.now()}`;
    const force: RosterForce = { id: forceId, forceEntryId, factionId, selections: [] };
    const newRoster: Roster = {
      id,
      name: name.trim() || 'Neue Armeeliste',
      pointsLimit,
      forces: [force],
    };

    if (bundle) {
      const allegiance = options?.allegiance ?? getDefaultAllegianceForFaction(bundle.name);
      const enableExpanded = options?.enableExpanded ?? true;
      force.selections = buildAutoConfigSelections(bundle, newRoster, force, allegiance, enableExpanded);
    }

    const next = [newRoster, ...get().rosters];
    saveRosters(next);
    set({ rosters: next, activeRosterId: id });
  },

  deleteRoster: (rosterId) => {
    const next = get().rosters.filter((r) => r.id !== rosterId);
    saveRosters(next);
    const nextActive = get().activeRosterId === rosterId ? next[0]?.id ?? null : get().activeRosterId;
    set({ rosters: next, activeRosterId: nextActive });
    if (nextActive) {
      void get().setActiveRoster(nextActive);
    }
  },

  setActiveRoster: async (rosterId) => {
    set({ activeRosterId: rosterId });
    if (!rosterId) return;
    const roster = get().rosters.find((r) => r.id === rosterId);
    if (!roster) return;
    for (const force of roster.forces) {
      await get().ensureFactionLoaded(force.factionId);
    }
  },

  updateActiveRoster: (updater) => {
    const activeId = get().activeRosterId;
    if (!activeId) return;
    const next = get().rosters.map((r) => (r.id === activeId ? updater(r) : r));
    saveRosters(next);
    set({ rosters: next });
  },

  addForceToActiveRoster: async (forceEntryId, factionId, options) => {
    const bundle = await get().ensureFactionLoaded(factionId);
    const forceId = crypto.randomUUID ? crypto.randomUUID() : `f-${Date.now()}`;
    const active = get().rosters.find((r) => r.id === get().activeRosterId);
    const newForce: RosterForce = { id: forceId, forceEntryId, factionId, selections: [] };

    if (bundle && active) {
      const allegiance = options?.allegiance ?? getDefaultAllegianceForFaction(bundle.name);
      const enableExpanded = options?.enableExpanded ?? true;
      newForce.selections = buildAutoConfigSelections(
        bundle,
        active,
        newForce,
        allegiance,
        enableExpanded
      );
    }

    get().updateActiveRoster((r) => ({
      ...r,
      forces: [...r.forces, newForce],
    }));
  },

  removeForceFromActiveRoster: (forceId) => {
    get().updateActiveRoster((r) => ({
      ...r,
      forces: r.forces.filter((f) => f.id !== forceId),
    }));
  },

  saveFavorite: (fav) => {
    const id = crypto.randomUUID ? crypto.randomUUID() : `fav-${Date.now()}`;
    const entry: UnitFavorite = {
      ...fav,
      id,
      selection: cloneSelectionWithNewIds(fav.selection),
      createdAt: Date.now(),
    };
    const next = [entry, ...get().favorites];
    saveFavorites(next);
    set({ favorites: next });
  },

  deleteFavorite: (favId) => {
    const next = get().favorites.filter((f) => f.id !== favId);
    saveFavorites(next);
    set({ favorites: next });
  },

  buildShareUrl: (roster) => {
    const encoded = LZString.compressToEncodedURIComponent(JSON.stringify(roster));
    return `${window.location.origin}${window.location.pathname}#list=${encoded}`;
  },
}));