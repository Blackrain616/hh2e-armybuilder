import { useEffect, useState } from 'react';
import {
  getInspectorOptions,
  removeSelectionAtPath,
  selectRadioOptionAtPath,
  setOptionCountAtPath,
  type InspectorGroupNode,
  type InspectorOptionItem,
} from '../engine/rosterActions';
import type { FactionBundle, Profile, Rule } from '../types/data';
import type { EvaluatedSelection, Roster, RosterForce, RosterSelection } from '../types/roster';

interface UnitInspectorProps {
  roster: Roster;
  force: RosterForce;
  bundle: FactionBundle;
  selectedUnit: RosterSelection;
  evaluatedUnit: EvaluatedSelection;
  onChangeRoster: (next: Roster) => void;
  onDeleteUnit: () => void;
  onSaveFavorite?: (name: string) => void;
  previewMode?: {
    onConfirm: () => void;
    onCancel: () => void;
  };
}

interface InspectedInfoData {
  title: string;
  profiles: Profile[];
  rules: Rule[];
}

function collectProfilesAndRules(node: EvaluatedSelection): { profiles: Profile[]; rules: Rule[] } {
  const profMap = new Map<string, Profile>();
  const ruleMap = new Map<string, Rule>();

  function walk(ev: EvaluatedSelection) {
    for (const p of ev.profiles) {
      if (!p.hidden) profMap.set(`${p.name}-${p.typeId}`, p);
    }
    for (const r of ev.rules) {
      if (!r.hidden) ruleMap.set(r.id, r);
    }
    Object.values(ev.children).forEach(walk);
  }

  walk(node);
  return {
    profiles: Array.from(profMap.values()),
    rules: Array.from(ruleMap.values()),
  };
}

function ProfileTables({ profiles }: { profiles: Profile[] }) {
  const grouped = profiles.reduce<Record<string, Profile[]>>((acc, p) => {
    const key = p.typeName || 'Profil';
    acc[key] = acc[key] ?? [];
    acc[key].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-2.5">
      {Object.entries(grouped).map(([typeName, list]) => (
        <div key={typeName} className="overflow-x-auto rounded border border-zinc-800">
          <div className="bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-zinc-300">
            {typeName}
          </div>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400">
              <tr>
                <th className="px-2 py-1">Name</th>
                {list[0].characteristics.map((c) => (
                  <th key={c.typeId} className="px-2 py-1">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {list.map((p) => (
                <tr key={p.id} className="bg-zinc-900/30">
                  <td className="px-2 py-1 font-medium text-zinc-200">{p.name}</td>
                  {p.characteristics.map((c) => (
                    <td key={c.typeId} className="px-2 py-1 text-zinc-300">
                      {c.value || '–'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

interface SelectionNodeEditorProps {
  path: RosterSelection[];
  evaluatedNode: EvaluatedSelection;
  roster: Roster;
  force: RosterForce;
  bundle: FactionBundle;
  onChangeRoster: (next: Roster) => void;
  onOpenInfo: (info: InspectedInfoData) => void;
  depth?: number;
}

function SelectionNodeEditor({
  path,
  evaluatedNode,
  roster,
  force,
  bundle,
  onChangeRoster,
  onOpenInfo,
  depth = 0,
}: SelectionNodeEditorProps) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const current = path[path.length - 1];
  const pathIds = path.map((p) => p.instanceId);
  const options = getInspectorOptions(path, roster, force, bundle);

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));

  function renderInfoButton(opt: InspectorOptionItem) {
    if (opt.profiles.length === 0 && opt.rules.length === 0) return null;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenInfo({
            title: opt.resolved.name,
            profiles: opt.profiles,
            rules: opt.rules,
          });
        }}
        className="shrink-0 rounded border border-sky-700/60 bg-sky-950/60 px-1.5 py-0.5 text-[11px] font-bold text-sky-300 hover:bg-sky-900/80"
        title="Waffenprofil & Regeln anzeigen"
      >
        ℹ
      </button>
    );
  }

  function renderChildSubEditor(childSel: RosterSelection, defaultExpanded = false) {
    const childPath = [...path, childSel];
    const subOpts = getInspectorOptions(childPath, roster, force, bundle);
    const hasSub = subOpts.directEntries.length > 0 || subOpts.groups.length > 0;
    if (!hasSub) return null;

    const isOpen = expandedIds[childSel.instanceId] ?? defaultExpanded;
    const evChild = evaluatedNode.children[childSel.instanceId];
    if (!evChild) return null;

    return (
      <div className="mt-1.5 ml-3 border-l border-zinc-700/80 pl-3">
        <button
          type="button"
          onClick={() => toggleExpand(childSel.instanceId)}
          className="text-xs font-medium text-amber-400 hover:text-amber-300"
        >
          {isOpen ? '▾ Ausrüstung ausblenden' : '▸ Ausrüstung / Modelle anpassen'}
        </button>
        {isOpen && (
          <div className="mt-2">
            <SelectionNodeEditor
              path={childPath}
              evaluatedNode={evChild}
              roster={roster}
              force={force}
              bundle={bundle}
              onChangeRoster={onChangeRoster}
              onOpenInfo={onOpenInfo}
              depth={depth + 1}
            />
          </div>
        )}
      </div>
    );
  }

  function renderGroup(groupNode: InspectorGroupNode) {
    const { group, min, max, options: grpOptions, subGroups } = groupNode;
    const isSingleRadio = max === 1 && subGroups.length === 0;
    const allGroupOptionIds = grpOptions.flatMap((o) => [o.resolved.id, o.resolved.targetId]);

    const activeInGroup = current.selections.filter(
      (s) =>
        s.groupId === group.id ||
        grpOptions.some((o) => o.resolved.id === s.entryId || o.resolved.targetId === s.targetEntryId)
    );
    const groupCount = activeInGroup.reduce((sum, s) => sum + s.count, 0);
    const countBad = (min > 0 && groupCount < min) || (max !== null && groupCount > max);

    return (
      <div key={group.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold tracking-wide text-zinc-200 uppercase">
            {group.name}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
              countBad ? 'bg-red-950 text-red-300' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            {groupCount}
            {max !== null ? ` / ${min === max ? max : `${min}–${max}`}` : min > 0 ? ` (min ${min})` : ''}
          </span>
        </div>

        {isSingleRadio ? (
          <div className="space-y-1.5">
            {min === 0 && (
              <label className="flex cursor-pointer items-center justify-between rounded px-2 py-1 text-sm hover:bg-zinc-800/70">
                <span className="flex items-center gap-2 text-zinc-400">
                  <input
                    type="radio"
                    name={`${current.instanceId}-${group.id}`}
                    checked={activeInGroup.length === 0}
                    onChange={() =>
                      onChangeRoster(
                        selectRadioOptionAtPath(
                          roster,
                          force.id,
                          pathIds,
                          group.id,
                          allGroupOptionIds,
                          null,
                          bundle
                        )
                      )
                    }
                    className="accent-amber-500"
                  />
                  Keine Auswahl
                </span>
              </label>
            )}
            {grpOptions.map((opt) => {
              const matched = activeInGroup.find(
                (s) => s.entryId === opt.resolved.id || s.targetEntryId === opt.resolved.targetId
              );
              const isSelected = Boolean(matched);
              return (
                <div key={opt.resolved.id}>
                  <div className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-zinc-800/70">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-zinc-100">
                      <input
                        type="radio"
                        name={`${current.instanceId}-${group.id}`}
                        checked={isSelected}
                        onChange={() =>
                          onChangeRoster(
                            selectRadioOptionAtPath(
                              roster,
                              force.id,
                              pathIds,
                              group.id,
                              allGroupOptionIds,
                              opt.resolved,
                              bundle
                            )
                          )
                        }
                        className="accent-amber-500"
                      />
                      <span className="truncate">{opt.resolved.name}</span>
                    </label>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-amber-400/90">
                        {opt.points > 0 ? `+${opt.points} Pkt` : '0 Pkt'}
                      </span>
                      {renderInfoButton(opt)}
                    </div>
                  </div>
                  {matched && renderChildSubEditor(matched, depth === 0)}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {grpOptions.map((opt) => {
              const matched = current.selections.find(
                (s) =>
                  (s.entryId === opt.resolved.id || s.targetEntryId === opt.resolved.targetId) &&
                  (s.groupId === group.id || !s.groupId)
              );
              const count = matched?.count ?? 0;
              const isToggle = opt.max === 1 && opt.min === 0 && max !== 1;

              return (
                <div key={opt.resolved.id} className="rounded bg-zinc-950/50 px-2.5 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-zinc-100">{opt.resolved.name}</div>
                      <div className="text-[11px] text-zinc-400">
                        {opt.points > 0 ? `${opt.points} Pkt/Stk` : 'Kostenlos'}
                        {opt.max !== null ? ` • max ${opt.max}` : ''}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {renderInfoButton(opt)}
                      {isToggle ? (
                        <input
                          type="checkbox"
                          checked={count > 0}
                          onChange={(e) =>
                            onChangeRoster(
                              setOptionCountAtPath(
                                roster,
                                force.id,
                                pathIds,
                                opt.resolved,
                                group.id,
                                e.target.checked ? 1 : 0,
                                bundle
                              )
                            )
                          }
                          className="h-4 w-4 accent-amber-500"
                        />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={count <= opt.min}
                            onClick={() =>
                              onChangeRoster(
                                setOptionCountAtPath(
                                  roster,
                                  force.id,
                                  pathIds,
                                  opt.resolved,
                                  group.id,
                                  count - 1,
                                  bundle
                                )
                              )
                            }
                            className="h-6 w-6 rounded bg-zinc-800 text-sm font-bold text-zinc-200 hover:bg-zinc-700 disabled:opacity-30"
                          >
                            −
                          </button>
                          <span className="w-7 text-center text-sm font-semibold tabular-nums">
                            {count}
                          </span>
                          <button
                            type="button"
                            disabled={opt.max !== null && count >= opt.max}
                            onClick={() =>
                              onChangeRoster(
                                setOptionCountAtPath(
                                  roster,
                                  force.id,
                                  pathIds,
                                  opt.resolved,
                                  group.id,
                                  count + 1,
                                  bundle
                                )
                              )
                            }
                            className="h-6 w-6 rounded bg-zinc-800 text-sm font-bold text-zinc-200 hover:bg-zinc-700 disabled:opacity-30"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {matched && renderChildSubEditor(matched, false)}
                </div>
              );
            })}
          </div>
        )}

        {subGroups.length > 0 && (
          <div className="mt-2 space-y-2">{subGroups.map((sg) => renderGroup(sg))}</div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {options.directEntries.length > 0 && (
        <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
            Modelle & Basis-Ausrüstung
          </div>
          {options.directEntries.map((opt) => {
            const matched = current.selections.find(
              (s) => s.entryId === opt.resolved.id || s.targetEntryId === opt.resolved.targetId
            );
            const count = matched?.count ?? 0;
            const isLocked = opt.min === 1 && opt.max === 1;
            const isToggle = opt.min === 0 && opt.max === 1;

            return (
              <div key={opt.resolved.id} className="rounded bg-zinc-950/50 px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-zinc-100">{opt.resolved.name}</div>
                    <div className="text-[11px] text-zinc-400">
                      {opt.points > 0 ? `${opt.points} Pkt` : 'Im Preis enthalten'}
                      {isLocked ? ' • Pflicht' : ''}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {renderInfoButton(opt)}
                    {isLocked ? (
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                        ×{count}
                      </span>
                    ) : isToggle ? (
                      <input
                        type="checkbox"
                        checked={count > 0}
                        onChange={(e) =>
                          onChangeRoster(
                            setOptionCountAtPath(
                              roster,
                              force.id,
                              pathIds,
                              opt.resolved,
                              undefined,
                              e.target.checked ? 1 : 0,
                              bundle
                            )
                          )
                        }
                        className="h-4 w-4 accent-amber-500"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={count <= opt.min}
                          onClick={() =>
                            onChangeRoster(
                              setOptionCountAtPath(
                                roster,
                                force.id,
                                pathIds,
                                opt.resolved,
                                undefined,
                                count - 1,
                                bundle
                              )
                            )
                          }
                          className="h-6 w-6 rounded bg-zinc-800 text-sm font-bold text-zinc-200 hover:bg-zinc-700 disabled:opacity-30"
                        >
                          −
                        </button>
                        <span className="w-7 text-center text-sm font-semibold tabular-nums">
                          {count}
                        </span>
                        <button
                          type="button"
                          disabled={opt.max !== null && count >= opt.max}
                          onClick={() =>
                            onChangeRoster(
                              setOptionCountAtPath(
                                roster,
                                force.id,
                                pathIds,
                                opt.resolved,
                                undefined,
                                count + 1,
                                bundle
                              )
                            )
                          }
                          className="h-6 w-6 rounded bg-zinc-800 text-sm font-bold text-zinc-200 hover:bg-zinc-700 disabled:opacity-30"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {matched && renderChildSubEditor(matched, depth === 0 && isLocked)}
              </div>
            );
          })}
        </div>
      )}

      {options.groups.map((grp) => renderGroup(grp))}

      {options.directEntries.length === 0 && options.groups.length === 0 && (
        <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-400">
          Keine weiteren Optionen verfügbar.
        </div>
      )}
    </div>
  );
}

export function UnitInspector({
  roster,
  force,
  bundle,
  selectedUnit,
  evaluatedUnit,
  onChangeRoster,
  onDeleteUnit,
  onSaveFavorite,
  previewMode,
}: UnitInspectorProps) {
  const [inspectedInfo, setInspectedInfo] = useState<InspectedInfoData | null>(null);
  const [showFavForm, setShowFavForm] = useState(false);
  const [favName, setFavName] = useState(evaluatedUnit.name);
  const [favSaved, setFavSaved] = useState(false);

  useEffect(() => {
    setFavName(evaluatedUnit.name);
    setShowFavForm(false);
  }, [selectedUnit.instanceId, evaluatedUnit.name]);

  const { profiles, rules } = collectProfilesAndRules(evaluatedUnit);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      {previewMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-500/40 bg-sky-950/40 p-2.5">
          <span className="text-xs font-semibold text-sky-200">
            Vorschau – noch nicht in der Armeeliste
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={previewMode.onConfirm}
              className="rounded bg-amber-500 px-3 py-1 text-xs font-bold text-zinc-950 hover:bg-amber-400"
            >
              ✓ Hinzufügen ({evaluatedUnit.totalPoints} Pkt)
            </button>
            <button
              type="button"
              onClick={previewMode.onCancel}
              className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Schließen
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2 border-b border-zinc-800 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-amber-400">{evaluatedUnit.name}</h2>
            <p className="text-xs text-zinc-400">
              Gesamt: <span className="font-semibold text-zinc-100">{evaluatedUnit.totalPoints} Pkt</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {onSaveFavorite && (
              <button
                type="button"
                onClick={() => {
                  setFavName(evaluatedUnit.name);
                  setShowFavForm((v) => !v);
                }}
                className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20"
              >
                {favSaved ? '✓ Favorit gespeichert' : '★ Favorit'}
              </button>
            )}
            {!previewMode && (
              <button
                type="button"
                onClick={() => {
                  onChangeRoster(removeSelectionAtPath(roster, force.id, [], selectedUnit.instanceId));
                  onDeleteUnit();
                }}
                className="rounded border border-red-900/60 bg-red-950/40 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-900/50"
              >
                Entfernen
              </button>
            )}
          </div>
        </div>

        {showFavForm && onSaveFavorite && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-zinc-900 p-2">
            <input
              type="text"
              value={favName}
              onChange={(e) => setFavName(e.target.value)}
              placeholder="z.B. Tactical Squad + Rhino"
              className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-100 focus:border-amber-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                onSaveFavorite(favName.trim() || evaluatedUnit.name);
                setShowFavForm(false);
                setFavSaved(true);
                setTimeout(() => setFavSaved(false), 2000);
              }}
              className="rounded bg-amber-500 px-2.5 py-1 text-xs font-bold text-zinc-950 hover:bg-amber-400"
            >
              Speichern
            </button>
            <button
              type="button"
              onClick={() => setShowFavForm(false)}
              className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200"
            >
              Abbrechen
            </button>
          </div>
        )}
      </div>

      <SelectionNodeEditor
        path={[selectedUnit]}
        evaluatedNode={evaluatedUnit}
        roster={roster}
        force={force}
        bundle={bundle}
        onChangeRoster={onChangeRoster}
        onOpenInfo={setInspectedInfo}
      />

      {profiles.length > 0 && (
        <div className="space-y-3 border-t border-zinc-800 pt-3">
          <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Profile</h3>
          <ProfileTables profiles={profiles} />
        </div>
      )}

      {rules.length > 0 && (
        <div className="space-y-2 border-t border-zinc-800 pt-3 pb-4">
          <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Sonderregeln</h3>
          {rules.map((r) => (
            <details key={r.id} className="rounded border border-zinc-800 bg-zinc-900/50 p-2">
              <summary className="cursor-pointer text-xs font-semibold text-zinc-200">
                {r.name}
              </summary>
              <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-zinc-400">
                {r.description || 'Keine Beschreibung hinterlegt.'}
              </p>
            </details>
          ))}
        </div>
      )}

      {inspectedInfo && (
        <div
          onClick={() => setInspectedInfo(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-[1px]"
        >
          <div className="max-h-[85vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-xl border border-amber-500/40 bg-zinc-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h3 className="text-base font-bold text-amber-400">{inspectedInfo.title}</h3>
              <span className="text-[11px] text-zinc-400">Klicken zum Schließen</span>
            </div>

            {inspectedInfo.profiles.length > 0 && (
              <ProfileTables profiles={inspectedInfo.profiles} />
            )}

            {inspectedInfo.rules.length > 0 && (
              <div className="space-y-2">
                {inspectedInfo.rules.map((r) => (
                  <div key={r.id} className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
                    <div className="text-xs font-bold text-zinc-100">{r.name}</div>
                    <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-zinc-300">
                      {r.description || 'Keine Beschreibung hinterlegt.'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
// ENDE UnitInspector.tsx
