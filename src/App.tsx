import { useEffect, useMemo, useState } from 'react';
import { PlayView } from './components/PlayView';
import { UnitInspector } from './components/UnitInspector';
import {
  addUnitToForce,
  cloneSelectionWithNewIds,
  getDefaultAllegianceForFaction,
  getVisibleRootEntriesForForce,
  removeSelectionAtPath,
  type AllegianceChoice,
} from './engine/rosterActions';
import { evaluateRoster, findForceEntry, instantiateSelection } from './engine/rosterEngine';
import { useRosterStore } from './store/useRosterStore';
import type { RosterSelection } from './types/roster';

const CONFIG_CATEGORIES = [
  'Allegiance:',
  'Allegiance',
  'Rite of War:',
  'Expanded Army Lists',
  'Blackshield Oaths',
  'The Rewards Of Treachery',
  'Provenances of War',
];

export default function App() {
  const {
    systemIndex,
    bundles,
    rosters,
    favorites,
    activeRosterId,
    loading,
    error,
    init,
    createRoster,
    deleteRoster,
    setActiveRoster,
    updateActiveRoster,
    addForceToActiveRoster,
    removeForceFromActiveRoster,
    saveFavorite,
    deleteFavorite,
    buildShareUrl,
  } = useRosterStore();

  const [viewMode, setViewMode] = useState<'edit' | 'play'>('edit');
  const [mobileTab, setMobileTab] = useState<'catalog' | 'roster' | 'inspector'>('catalog');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showForceModal, setShowForceModal] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const [newName, setNewName] = useState('Meine Legion');
  const [newPoints, setNewPoints] = useState(3000);
  const [newForceId, setNewForceId] = useState('');
  const [newFactionId, setNewFactionId] = useState('');
  const [newAllegiance, setNewAllegiance] = useState<AllegianceChoice>('Traitor');
  const [newExpanded, setNewExpanded] = useState(true);

  const [activeForceId, setActiveForceId] = useState<string | null>(null);
  const [selectedUnitRef, setSelectedUnitRef] = useState<{ forceId: string; instanceId: string } | null>(null);
  const [previewDraft, setPreviewDraft] = useState<{
    forceId: string;
    primaryCategoryId: string;
    selection: RosterSelection;
  } | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({ __favorites__: true });

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!systemIndex) return;
    if (!newForceId) {
      const crusade =
        systemIndex.gameSystem.forceEntries.find((f) => f.name.includes('Crusade')) ??
        systemIndex.gameSystem.forceEntries[0];
      if (crusade) setNewForceId(crusade.id);
    }
    if (!newFactionId && systemIndex.factions.length > 0) {
      const soh =
        systemIndex.factions.find((f) => f.name.includes('Sons of Horus')) ?? systemIndex.factions[0];
      setNewFactionId(soh.id);
      setNewAllegiance(getDefaultAllegianceForFaction(soh.name));
    }
  }, [systemIndex, newForceId, newFactionId]);

  const activeRoster = useMemo(
    () => rosters.find((r) => r.id === activeRosterId) ?? null,
    [rosters, activeRosterId]
  );

  useEffect(() => {
    setPreviewDraft(null);
    if (activeRoster && activeRoster.forces.length > 0) {
      if (!activeForceId || !activeRoster.forces.some((f) => f.id === activeForceId)) {
        setActiveForceId(activeRoster.forces[0].id);
      }
    } else {
      setActiveForceId(null);
    }
  }, [activeRoster, activeForceId]);

  const evaluated = useMemo(() => {
    if (!activeRoster || !systemIndex) return null;
    return evaluateRoster(activeRoster, systemIndex.gameSystem, bundles);
  }, [activeRoster, systemIndex, bundles]);

  const previewRoster = useMemo(() => {
    if (!previewDraft || !activeRoster) return null;
    return {
      ...activeRoster,
      forces: activeRoster.forces.map((f) =>
        f.id === previewDraft.forceId
          ? { ...f, selections: [...f.selections, previewDraft.selection] }
          : f
      ),
    };
  }, [previewDraft, activeRoster]);

  const previewEvaluated = useMemo(() => {
    if (!previewRoster || !systemIndex) return null;
    return evaluateRoster(previewRoster, systemIndex.gameSystem, bundles);
  }, [previewRoster, systemIndex, bundles]);

  const activeForce = useMemo(
    () => activeRoster?.forces.find((f) => f.id === activeForceId) ?? activeRoster?.forces[0] ?? null,
    [activeRoster, activeForceId]
  );

  const activeBundle = activeForce ? bundles[activeForce.factionId] : undefined;

  const factionFavorites = useMemo(() => {
    if (!activeForce) return [];
    const q = searchTerm.trim().toLowerCase();
    return favorites.filter(
      (f) => f.factionId === activeForce.factionId && (!q || f.name.toLowerCase().includes(q))
    );
  }, [favorites, activeForce, searchTerm]);

  const catalogByCategory = useMemo(() => {
    if (!activeRoster || !activeForce || !activeBundle || !systemIndex) return [];
    const visible = getVisibleRootEntriesForForce(
      activeRoster,
      activeForce,
      activeBundle,
      systemIndex.gameSystem
    );
    const q = searchTerm.trim().toLowerCase();
    const filtered = q ? visible.filter((v) => v.resolved.name.toLowerCase().includes(q)) : visible;

    const grouped = new Map<string, { catId: string; catName: string; items: typeof filtered }>();
    for (const item of filtered) {
      const catId = item.primaryCategoryId || 'other';
      const catName = systemIndex.gameSystem.categories[catId]?.name ?? 'Sonstige';
      const bucket = grouped.get(catId) ?? { catId, catName, items: [] };
      bucket.items.push(item);
      grouped.set(catId, bucket);
    }

    const forceEntry = findForceEntry(systemIndex.gameSystem.forceEntries, activeForce.forceEntryId);
    const focOrder = forceEntry?.categoryLinks.map((c) => c.targetId) ?? [];

    return Array.from(grouped.values()).sort((a, b) => {
      const ia = focOrder.indexOf(a.catId);
      const ib = focOrder.indexOf(b.catId);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.catName.localeCompare(b.catName);
    });
  }, [activeRoster, activeForce, activeBundle, systemIndex, searchTerm]);

  const selectedUnitData = useMemo(() => {
    if (!selectedUnitRef || !activeRoster || !evaluated) return null;
    const force = activeRoster.forces.find((f) => f.id === selectedUnitRef.forceId);
    if (!force) return null;
    const unit = force.selections.find((s) => s.instanceId === selectedUnitRef.instanceId);
    const evUnit = evaluated.selections[selectedUnitRef.instanceId];
    const bundle = bundles[force.factionId];
    if (!unit || !evUnit || !bundle) return null;
    return { force, unit, evUnit, bundle };
  }, [selectedUnitRef, activeRoster, evaluated, bundles]);

  const previewUnitData = useMemo(() => {
    if (!previewDraft || !previewRoster || !previewEvaluated) return null;
    const force = previewRoster.forces.find((f) => f.id === previewDraft.forceId);
    if (!force) return null;
    const evUnit = previewEvaluated.selections[previewDraft.selection.instanceId];
    const bundle = bundles[force.factionId];
    if (!evUnit || !bundle) return null;
    return { roster: previewRoster, force, unit: previewDraft.selection, evUnit, bundle };
  }, [previewDraft, previewRoster, previewEvaluated, bundles]);

  function handleFactionChange(factionId: string) {
    setNewFactionId(factionId);
    const meta = systemIndex?.factions.find((f) => f.id === factionId);
    if (meta) {
      setNewAllegiance(getDefaultAllegianceForFaction(meta.name));
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-zinc-400">
        Lade Horus Heresy 2e Systemdaten…
      </div>
    );
  }

  if (error || !systemIndex) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 p-4 text-center">
        <p className="text-lg font-bold text-red-400">Fehler beim Laden</p>
        <p className="text-sm text-zinc-400">{error ?? 'System-Index nicht verfügbar.'}</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Kopfzeile */}
      <header className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-black tracking-wider text-amber-400 uppercase">
            HH 2e Army Builder
          </span>

          <select
            value={activeRosterId ?? ''}
            onChange={(e) => void setActiveRoster(e.target.value || null)}
            className="max-w-[220px] rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-sm text-zinc-100"
          >
            {rosters.length === 0 && <option value="">Keine Liste vorhanden</option>}
            {rosters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="rounded bg-amber-500 px-2.5 py-1 text-xs font-bold text-zinc-950 hover:bg-amber-400"
          >
            + Neue Liste
          </button>

          {activeRoster && (
            <button
              type="button"
              onClick={() => {
                if (confirm(`Liste "${activeRoster.name}" wirklich löschen?`)) {
                  deleteRoster(activeRoster.id);
                }
              }}
              className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-red-800 hover:text-red-300"
            >
              Löschen
            </button>
          )}
        </div>

        {activeRoster && evaluated && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowIssues((v) => !v)}
              className={`rounded px-2.5 py-1 text-xs font-semibold ${
                evaluated.issues.length === 0
                  ? 'bg-emerald-950 text-emerald-300'
                  : 'bg-red-950 text-red-300 hover:bg-red-900/70'
              }`}
            >
              {evaluated.issues.length === 0
                ? '✓ Regelkonform'
                : `⚠ ${evaluated.issues.length} Hinweis(e)`}
            </button>

            <span
              className={`rounded border px-2.5 py-1 text-xs font-bold tabular-nums ${
                evaluated.totalPoints > activeRoster.pointsLimit
                  ? 'border-red-700 bg-red-950 text-red-300'
                  : 'border-zinc-700 bg-zinc-950 text-amber-400'
              }`}
            >
              {evaluated.totalPoints} / {activeRoster.pointsLimit} Pkt
            </span>

            <button
              type="button"
              onClick={() => {
                const url = buildShareUrl(activeRoster);
                void navigator.clipboard.writeText(url).then(() => {
                  setShareCopied(true);
                  setTimeout(() => setShareCopied(false), 2000);
                });
              }}
              className="rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              {shareCopied ? '✓ Link kopiert' : 'Teilen'}
            </button>

            <button
              type="button"
              onClick={() => setViewMode((m) => (m === 'edit' ? 'play' : 'edit'))}
              className="rounded border border-amber-500/60 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
            >
              {viewMode === 'edit' ? 'Spielmodus / Druck' : '← Zurück zum Editor'}
            </button>
          </div>
        )}
      </header>

      {/* Validierungshinweise */}
      {showIssues && evaluated && evaluated.issues.length > 0 && (
        <div className="no-print max-h-40 overflow-y-auto border-b border-red-900/60 bg-red-950/40 px-4 py-2 text-xs text-red-200">
          <ul className="space-y-1">
            {evaluated.issues.map((iss) => (
              <li key={iss.id}>
                <span className="font-semibold">{iss.scopeName}:</span> {iss.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Hauptbereich */}
      {!activeRoster || !evaluated ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-2xl font-bold text-amber-400">Willkommen im Horus Heresy 2e Army Builder</h1>
          <p className="max-w-md text-sm text-zinc-400">
            Alle 29 Fraktionen sind geladen. Lege deine erste Armeeliste an, um loszulegen – deine
            Listen und Favoriten werden automatisch im Browser gespeichert.
          </p>
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="rounded-lg bg-amber-500 px-5 py-2.5 font-bold text-zinc-950 hover:bg-amber-400"
          >
            + Erste Armeeliste erstellen
          </button>
        </div>
      ) : viewMode === 'play' ? (
        <div className="flex-1 overflow-y-auto">
          <PlayView
            roster={activeRoster}
            evaluated={evaluated}
            system={systemIndex.gameSystem}
          />
        </div>
      ) : (
        <>
          {/* Mobile Tabs */}
          <div className="no-print grid grid-cols-3 border-b border-zinc-800 bg-zinc-900 md:hidden">
            <button
              type="button"
              onClick={() => setMobileTab('catalog')}
              className={`py-2 text-xs font-semibold ${
                mobileTab === 'catalog' ? 'border-b-2 border-amber-400 text-amber-400' : 'text-zinc-400'
              }`}
            >
              Katalog
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('roster')}
              className={`py-2 text-xs font-semibold ${
                mobileTab === 'roster' ? 'border-b-2 border-amber-400 text-amber-400' : 'text-zinc-400'
              }`}
            >
              Liste ({activeRoster.forces.reduce((s, f) => s + f.selections.length, 0)})
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('inspector')}
              className={`py-2 text-xs font-semibold ${
                mobileTab === 'inspector' ? 'border-b-2 border-amber-400 text-amber-400' : 'text-zinc-400'
              }`}
            >
              {previewUnitData ? 'Vorschau' : 'Einheit'}
            </button>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-12">
            {/* Spalte 1: Einheiten-Katalog */}
            <aside
              className={`${
                mobileTab === 'catalog' ? 'flex' : 'hidden'
              } min-h-0 flex-col border-r border-zinc-800 bg-zinc-950 p-3 md:col-span-4 md:flex lg:col-span-3`}
            >
              <div className="mb-3 space-y-2">
                {activeRoster.forces.length > 1 && (
                  <select
                    value={activeForce?.id ?? ''}
                    onChange={(e) => setActiveForceId(e.target.value)}
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
                  >
                    {activeRoster.forces.map((f) => {
                      const evF = evaluated.forces[f.id];
                      return (
                        <option key={f.id} value={f.id}>
                          {evF?.factionName} ({evF?.name})
                        </option>
                      );
                    })}
                  </select>
                )}
                <input
                  type="search"
                  placeholder="Einheit / Favorit / Rite suchen…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
                />
                <p className="text-[11px] text-zinc-500">
                  Klick auf Name = Vorschau & Optionen • Klick auf „+“ = Direkt hinzufügen
                </p>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                {/* Favoriten-Bereich */}
                {factionFavorites.length > 0 && (
                  <div className="rounded border border-amber-500/40 bg-amber-950/20">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenCategories((prev) => ({
                          ...prev,
                          __favorites__: !(prev.__favorites__ ?? true),
                        }))
                      }
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold tracking-wide text-amber-400 uppercase hover:bg-amber-950/30"
                    >
                      <span>★ Favoriten</span>
                      <span className="text-amber-300/70">
                        {factionFavorites.length} {(openCategories.__favorites__ ?? true) ? '▾' : '▸'}
                      </span>
                    </button>
                    {(openCategories.__favorites__ ?? true) && (
                      <div className="divide-y divide-amber-500/20 border-t border-amber-500/30">
                        {factionFavorites.map((fav) => (
                          <div
                            key={fav.id}
                            className="flex items-center justify-between gap-1 px-2.5 py-1 text-xs hover:bg-amber-950/30"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (!activeForce) return;
                                const cloned = cloneSelectionWithNewIds(fav.selection);
                                setSelectedUnitRef(null);
                                setPreviewDraft({
                                  forceId: activeForce.id,
                                  primaryCategoryId: fav.primaryCategoryId ?? '',
                                  selection: cloned,
                                });
                                setMobileTab('inspector');
                              }}
                              className="min-w-0 flex-1 py-1 text-left text-amber-100 hover:text-amber-300"
                              title="Favorit als Vorschau öffnen"
                            >
                              <span className="block truncate font-medium">{fav.name}</span>
                              {fav.categoryName && (
                                <span className="text-[10px] text-zinc-400">
                                  {fav.categoryName.replace(/:$/, '')}
                                </span>
                              )}
                            </button>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <span className="text-[11px] text-amber-300 tabular-nums">
                                {fav.points}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!activeForce) return;
                                  const cloned = cloneSelectionWithNewIds(fav.selection);
                                  setPreviewDraft(null);
                                  updateActiveRoster((r) => ({
                                    ...r,
                                    forces: r.forces.map((f) =>
                                      f.id === activeForce.id
                                        ? { ...f, selections: [...f.selections, cloned] }
                                        : f
                                    ),
                                  }));
                                  setSelectedUnitRef({
                                    forceId: activeForce.id,
                                    instanceId: cloned.instanceId,
                                  });
                                  setMobileTab('inspector');
                                }}
                                className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-bold text-amber-300 hover:bg-amber-500 hover:text-zinc-950"
                                title="Favorit direkt hinzufügen"
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteFavorite(fav.id)}
                                className="px-1 text-[11px] text-zinc-500 hover:text-red-400"
                                title="Favorit löschen"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!activeBundle ? (
                  <p className="text-xs text-zinc-400">Lade Fraktionskatalog…</p>
                ) : (
                  catalogByCategory.map((group) => {
                    const isOpen =
                      searchTerm.trim().length > 0 || (openCategories[group.catId] ?? false);
                    const isConfig = CONFIG_CATEGORIES.includes(group.catName);
                    return (
                      <div key={group.catId} className="rounded border border-zinc-800/90 bg-zinc-900/40">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenCategories((prev) => ({
                              ...prev,
                              [group.catId]: !isOpen,
                            }))
                          }
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold tracking-wide uppercase hover:bg-zinc-900"
                        >
                          <span className={isConfig ? 'text-sky-300' : 'text-amber-300'}>
                            {group.catName}
                          </span>
                          <span className="text-zinc-500">
                            {group.items.length} {isOpen ? '▾' : '▸'}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="divide-y divide-zinc-800/60 border-t border-zinc-800/80">
                            {group.items.map((item) => {
                              const isPreviewed =
                                previewDraft?.selection.entryId === item.resolved.id &&
                                previewDraft?.primaryCategoryId === item.primaryCategoryId;
                              return (
                                <div
                                  key={`${item.resolved.id}-${item.primaryCategoryId}`}
                                  className={`flex items-center justify-between gap-1 px-2.5 py-1 text-xs ${
                                    isPreviewed ? 'bg-sky-950/50' : 'hover:bg-zinc-800/60'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!activeForce || !activeBundle) return;
                                      const tempSel = instantiateSelection(
                                        item.resolved,
                                        activeBundle,
                                        {
                                          primaryCategoryId: item.primaryCategoryId,
                                          roster: activeRoster,
                                          force: activeForce,
                                        }
                                      );
                                      setSelectedUnitRef(null);
                                      setPreviewDraft({
                                        forceId: activeForce.id,
                                        primaryCategoryId: item.primaryCategoryId,
                                        selection: tempSel,
                                      });
                                      setMobileTab('inspector');
                                    }}
                                    className="min-w-0 flex-1 py-1 text-left text-zinc-200 hover:text-amber-300"
                                    title="Optionen & Profile vorab anzeigen"
                                  >
                                    <span className="block truncate">{item.resolved.name}</span>
                                  </button>

                                  <div className="flex shrink-0 items-center gap-1.5">
                                    {item.points > 0 && (
                                      <span className="text-[11px] text-zinc-400 tabular-nums">
                                        {item.points}
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!activeForce || !activeBundle) return;
                                        const res = addUnitToForce(
                                          activeRoster,
                                          activeForce.id,
                                          item.resolved,
                                          item.primaryCategoryId,
                                          activeBundle
                                        );
                                        setPreviewDraft(null);
                                        updateActiveRoster(() => res.roster);
                                        setSelectedUnitRef({
                                          forceId: activeForce.id,
                                          instanceId: res.newInstanceId,
                                        });
                                        setMobileTab('inspector');
                                      }}
                                      className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs font-bold text-amber-400 hover:bg-amber-500 hover:text-zinc-950"
                                      title="Direkt zur Armeeliste hinzufügen"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </aside>

            {/* Spalte 2: Aktuelle Armeeliste */}
            <main
              className={`${
                mobileTab === 'roster' ? 'flex' : 'hidden'
              } min-h-0 flex-col border-r border-zinc-800 bg-zinc-950/60 p-3 md:col-span-4 md:flex`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={activeRoster.name}
                  onChange={(e) =>
                    updateActiveRoster((r) => ({ ...r, name: e.target.value }))
                  }
                  className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-base font-bold text-zinc-100 hover:border-zinc-700 focus:border-amber-500 focus:bg-zinc-900 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowForceModal(true)}
                  className="shrink-0 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:border-amber-500 hover:text-amber-300"
                >
                  + Detachment
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                {activeRoster.forces.map((force) => {
                  const evForce = evaluated.forces[force.id];
                  if (!evForce) return null;

                  return (
                    <div
                      key={force.id}
                      className={`rounded-lg border p-3 ${
                        activeForce?.id === force.id
                          ? 'border-amber-500/40 bg-zinc-900/60'
                          : 'border-zinc-800 bg-zinc-900/30'
                      }`}
                    >
                      <div
                        onClick={() => setActiveForceId(force.id)}
                        className="mb-2 flex cursor-pointer items-center justify-between gap-2 border-b border-zinc-800 pb-2"
                      >
                        <div>
                          <div className="text-sm font-bold text-amber-400">{evForce.factionName}</div>
                          <div className="text-[11px] text-zinc-400">{evForce.name}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-zinc-200">
                            {evForce.totalPoints} Pkt
                          </span>
                          {activeRoster.forces.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeForceFromActiveRoster(force.id);
                              }}
                              className="text-xs text-zinc-500 hover:text-red-400"
                              title="Detachment entfernen"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      {force.selections.length === 0 ? (
                        <p className="py-4 text-center text-xs text-zinc-500">
                          Noch keine Einheiten gewählt – links aus dem Katalog hinzufügen.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {force.selections.map((sel) => {
                            const evSel = evaluated.selections[sel.instanceId];
                            if (!evSel) return null;
                            const isSelected =
                              selectedUnitRef?.forceId === force.id &&
                              selectedUnitRef?.instanceId === sel.instanceId;
                            const catName = sel.primaryCategoryId
                              ? systemIndex.gameSystem.categories[sel.primaryCategoryId]?.name
                              : '';

                            return (
                              <div
                                key={sel.instanceId}
                                onClick={() => {
                                  setPreviewDraft(null);
                                  setActiveForceId(force.id);
                                  setSelectedUnitRef({
                                    forceId: force.id,
                                    instanceId: sel.instanceId,
                                  });
                                  setMobileTab('inspector');
                                }}
                                className={`flex cursor-pointer items-center justify-between gap-2 rounded border px-2.5 py-2 transition ${
                                  isSelected
                                    ? 'border-amber-500 bg-amber-500/10'
                                    : 'border-zinc-800/80 bg-zinc-950/60 hover:border-zinc-700'
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    {catName && (
                                      <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                                        {catName.replace(/:$/, '')}
                                      </span>
                                    )}
                                    <span className="truncate text-sm font-medium text-zinc-100">
                                      {evSel.name}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <span className="text-xs font-bold text-amber-400 tabular-nums">
                                    {evSel.totalPoints} Pkt
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateActiveRoster((r) =>
                                        removeSelectionAtPath(r, force.id, [], sel.instanceId)
                                      );
                                      if (isSelected) setSelectedUnitRef(null);
                                    }}
                                    className="text-xs text-zinc-500 hover:text-red-400"
                                    title="Einheit entfernen"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </main>

            {/* Spalte 3: Einheiten-Konfigurator / Vorschau */}
            <section
              className={`${
                mobileTab === 'inspector' ? 'flex' : 'hidden'
              } min-h-0 flex-col bg-zinc-950 p-3 md:col-span-4 md:flex lg:col-span-5`}
            >
              {selectedUnitData ? (
                <UnitInspector
                  roster={activeRoster}
                  force={selectedUnitData.force}
                  bundle={selectedUnitData.bundle}
                  selectedUnit={selectedUnitData.unit}
                  evaluatedUnit={selectedUnitData.evUnit}
                  onChangeRoster={(next) => updateActiveRoster(() => next)}
                  onDeleteUnit={() => setSelectedUnitRef(null)}
                  onSaveFavorite={(customName) => {
                    const catName = selectedUnitData.unit.primaryCategoryId
                      ? systemIndex.gameSystem.categories[selectedUnitData.unit.primaryCategoryId]?.name
                      : undefined;
                    saveFavorite({
                      name: customName,
                      factionId: selectedUnitData.force.factionId,
                      factionName: selectedUnitData.bundle.name,
                      primaryCategoryId: selectedUnitData.unit.primaryCategoryId,
                      categoryName: catName,
                      points: selectedUnitData.evUnit.totalPoints,
                      selection: selectedUnitData.unit,
                    });
                  }}
                />
              ) : previewUnitData && previewDraft ? (
                <UnitInspector
                  roster={previewUnitData.roster}
                  force={previewUnitData.force}
                  bundle={previewUnitData.bundle}
                  selectedUnit={previewUnitData.unit}
                  evaluatedUnit={previewUnitData.evUnit}
                  onChangeRoster={(next) => {
                    const f = next.forces.find((x) => x.id === previewDraft.forceId);
                    const updatedSel = f?.selections.find(
                      (s) => s.instanceId === previewDraft.selection.instanceId
                    );
                    if (updatedSel) {
                      setPreviewDraft({ ...previewDraft, selection: updatedSel });
                    }
                  }}
                  onDeleteUnit={() => setPreviewDraft(null)}
                  onSaveFavorite={(customName) => {
                    const catName = previewUnitData.unit.primaryCategoryId
                      ? systemIndex.gameSystem.categories[previewUnitData.unit.primaryCategoryId]?.name
                      : undefined;
                    saveFavorite({
                      name: customName,
                      factionId: previewUnitData.force.factionId,
                      factionName: previewUnitData.bundle.name,
                      primaryCategoryId: previewUnitData.unit.primaryCategoryId,
                      categoryName: catName,
                      points: previewUnitData.evUnit.totalPoints,
                      selection: previewUnitData.unit,
                    });
                  }}
                  previewMode={{
                    onConfirm: () => {
                      const committed = previewDraft.selection;
                      const fId = previewDraft.forceId;
                      updateActiveRoster((r) => ({
                        ...r,
                        forces: r.forces.map((f) =>
                          f.id === fId
                            ? { ...f, selections: [...f.selections, committed] }
                            : f
                        ),
                      }));
                      setPreviewDraft(null);
                      setSelectedUnitRef({ forceId: fId, instanceId: committed.instanceId });
                    },
                    onCancel: () => setPreviewDraft(null),
                  }}
                />
              ) : (
                <div className="flex flex-1 items-center justify-center text-center text-sm text-zinc-500">
                  Klicke links auf eine Einheit für eine Vorschau – oder auf eine Einheit in deiner
                  Armeeliste zum Bearbeiten.
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {/* Modal: Neue Armeeliste */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-bold text-amber-400">Neue Armeeliste erstellen</h2>
            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Name der Liste</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Punktelimit</label>
                <input
                  type="number"
                  step={50}
                  value={newPoints}
                  onChange={(e) => setNewPoints(Number(e.target.value) || 3000)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Force Organisation Chart</label>
                <select
                  value={newForceId}
                  onChange={(e) => setNewForceId(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5"
                >
                  {systemIndex.gameSystem.forceEntries.map((fe) => (
                    <option key={fe.id} value={fe.id}>
                      {fe.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Fraktion / Legion</label>
                <select
                  value={newFactionId}
                  onChange={(e) => handleFactionChange(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5"
                >
                  {systemIndex.factions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Allegiance</label>
                <select
                  value={newAllegiance}
                  onChange={(e) => setNewAllegiance(e.target.value as AllegianceChoice)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5"
                >
                  <option value="Loyalist">Loyalist</option>
                  <option value="Traitor">Traitor</option>
                  <option value="Beholden to None">Beholden to None (Blackshields)</option>
                </select>
              </div>
              <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={newExpanded}
                  onChange={(e) => setNewExpanded(e.target.checked)}
                  className="h-4 w-4 accent-amber-500"
                />
                Expanded Army List Profiles (Exemplary & Legacy) aktivieren
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => {
                  void createRoster(newName, newPoints, newForceId, newFactionId, {
                    allegiance: newAllegiance,
                    enableExpanded: newExpanded,
                  });
                  setShowNewModal(false);
                }}
                className="rounded bg-amber-500 px-4 py-1.5 text-sm font-bold text-zinc-950 hover:bg-amber-400"
              >
                Erstellen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Weiteres Detachment hinzufügen */}
      {showForceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-bold text-amber-400">Detachment hinzufügen</h2>
            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Force Organisation Chart</label>
                <select
                  value={newForceId}
                  onChange={(e) => setNewForceId(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5"
                >
                  {systemIndex.gameSystem.forceEntries.map((fe) => (
                    <option key={fe.id} value={fe.id}>
                      {fe.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Fraktion / Legion</label>
                <select
                  value={newFactionId}
                  onChange={(e) => handleFactionChange(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5"
                >
                  {systemIndex.factions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Allegiance</label>
                <select
                  value={newAllegiance}
                  onChange={(e) => setNewAllegiance(e.target.value as AllegianceChoice)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5"
                >
                  <option value="Loyalist">Loyalist</option>
                  <option value="Traitor">Traitor</option>
                  <option value="Beholden to None">Beholden to None (Blackshields)</option>
                </select>
              </div>
              <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={newExpanded}
                  onChange={(e) => setNewExpanded(e.target.checked)}
                  className="h-4 w-4 accent-amber-500"
                />
                Expanded Army List Profiles (Exemplary & Legacy) aktivieren
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowForceModal(false)}
                className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => {
                  void addForceToActiveRoster(newForceId, newFactionId, {
                    allegiance: newAllegiance,
                    enableExpanded: newExpanded,
                  });
                  setShowForceModal(false);
                }}
                className="rounded bg-amber-500 px-4 py-1.5 text-sm font-bold text-zinc-950 hover:bg-amber-400"
              >
                Hinzufügen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ENDE App.tsx
