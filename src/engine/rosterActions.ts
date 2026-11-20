import type {
  Condition,
  ConditionGroup,
  Constraint,
  EntryLink,
  FactionBundle,
  Modifier,
  ModifierGroup,
  Profile,
  Rule,
  SelectionEntry,
  SelectionEntryGroup,
  SystemIndex,
} from '../types/data';
import type { Roster, RosterForce, RosterSelection } from '../types/roster';
import {
  findEntryDefinition,
  instantiateSelection,
  PTS_COST_ID,
  resolveEntry,
  resolveGroup,
  resolveProfilesAndRulesForDef,
  type EvalContext,
  type ResolvedCatalogEntry,
  type ResolvedCatalogGroup,
} from './rosterEngine';

export type AllegianceChoice = 'Loyalist' | 'Traitor' | 'Beholden to None';

export function cloneSelectionWithNewIds(sel: RosterSelection): RosterSelection {
  const nextId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    ...sel,
    instanceId: nextId,
    selections: sel.selections.map(cloneSelectionWithNewIds),
  };
}

export function getDefaultAllegianceForFaction(factionName: string): AllegianceChoice {
  const lower = factionName.toLowerCase();
  if (lower.includes('blackshield')) return 'Beholden to None';
  const traitorKeywords = [
    "emperor's children",
    'iron warriors',
    'night lords',
    'world eaters',
    'death guard',
    'thousand sons',
    'sons of horus',
    'word bearers',
    'alpha legion',
    'daemon',
  ];
  if (traitorKeywords.some((k) => lower.includes(k))) return 'Traitor';
  return 'Loyalist';
}

export function buildAutoConfigSelections(
  bundle: FactionBundle,
  roster: Roster,
  force: RosterForce,
  allegiance: AllegianceChoice,
  enableExpanded: boolean
): RosterSelection[] {
  const autoSelections: RosterSelection[] = [];
  const allRoots: Array<SelectionEntry | EntryLink> = [...bundle.rootEntries, ...bundle.rootLinks];

  if (enableExpanded) {
    const expRaw = allRoots.find(
      (x) => x.id === '15dd-ba85-599e-d215' || x.name?.startsWith('Expanded Army List Profiles')
    );
    if (expRaw) {
      const resolved = resolveEntry(expRaw, bundle);
      if (resolved) {
        const pCat =
          resolved.categoryLinks.find((c) => c.primary)?.targetId ??
          resolved.categoryLinks[0]?.targetId;
        autoSelections.push(
          instantiateSelection(resolved, bundle, { primaryCategoryId: pCat, roster, force })
        );
      }
    }
  }

  const alRaw = allRoots.find(
    (x) => x.id === '928e-1782-8717-7384' || x.name === 'Allegiance'
  );
  if (alRaw) {
    const resolved = resolveEntry(alRaw, bundle);
    if (resolved) {
      const pCat =
        resolved.categoryLinks.find((c) => c.primary)?.targetId ??
        resolved.categoryLinks[0]?.targetId;
      const alSel = instantiateSelection(resolved, bundle, {
        primaryCategoryId: pCat,
        roster,
        force,
      });

      // Gewählte Allegiance (Loyalist / Traitor / Beholden to None) in der Untergruppe setzen
      const grp = resolved.selectionEntryGroups[0];
      if (grp) {
        const candidates = [...grp.selectionEntries, ...grp.entryLinks];
        const chosenRaw =
          candidates.find((c) => c.name === allegiance) ??
          candidates.find((c) => c.name === 'Loyalist');
        if (chosenRaw) {
          const chosenResolved = resolveEntry(chosenRaw, bundle);
          if (chosenResolved) {
            const optionIds = candidates.flatMap((c) =>
              'targetId' in c ? [c.id, c.targetId] : [c.id]
            );
            alSel.selections = [
              ...alSel.selections.filter(
                (s) =>
                  s.groupId !== grp.id &&
                  !optionIds.includes(s.entryId) &&
                  !optionIds.includes(s.targetEntryId)
              ),
              instantiateSelection(chosenResolved, bundle, {
                count: 1,
                groupId: grp.id,
                roster,
                force,
              }),
            ];
          }
        }
      }
      autoSelections.push(alSel);
    }
  }

  return autoSelections;
}

function selectionMatchesId(sel: RosterSelection, id: string, bundle: FactionBundle): boolean {
  if (sel.entryId === id || sel.targetEntryId === id || sel.linkId === id || sel.groupId === id) {
    return true;
  }
  if (sel.primaryCategoryId === id) return true;
  const entry = bundle.sharedEntries[sel.targetEntryId];
  return Boolean(entry?.categoryLinks.some((cl) => cl.targetId === id));
}

function countInSubtree(
  list: RosterSelection[],
  targetId: string | undefined,
  includeChildren: boolean,
  bundle: FactionBundle
): number {
  let total = 0;
  for (const sel of list) {
    if (!targetId || selectionMatchesId(sel, targetId, bundle)) {
      total += sel.count;
    }
    if (includeChildren && sel.selections.length > 0) {
      total += countInSubtree(sel.selections, targetId, true, bundle);
    }
  }
  return total;
}

function evalSimpleCondition(
  cond: Condition,
  roster: Roster,
  force: RosterForce,
  ancestors: RosterSelection[],
  bundle: FactionBundle
): boolean {
  let value = 0;
  let isMatch = false;

  if (cond.field === 'forces') {
    value = cond.childId
      ? roster.forces.filter((f) => f.forceEntryId === cond.childId || f.factionId === cond.childId).length
      : roster.forces.length;
    isMatch = value > 0;
  } else if (cond.scope === 'primary-catalogue') {
    isMatch = Boolean(cond.childId && force.factionId === cond.childId);
    value = isMatch ? 1 : 0;
  } else if (cond.scope === 'force') {
    value = countInSubtree(force.selections, cond.childId, cond.includeChildSelections ?? true, bundle);
    isMatch = Boolean(cond.childId && (force.forceEntryId === cond.childId || value > 0));
  } else if (cond.scope === 'roster') {
    for (const f of roster.forces) {
      value += countInSubtree(f.selections, cond.childId, cond.includeChildSelections ?? true, bundle);
    }
    isMatch = value > 0;
  } else if (cond.scope === 'parent' || cond.scope === 'unit') {
    const parent = cond.scope === 'unit' ? ancestors[0] : ancestors[ancestors.length - 1];
    if (parent) {
      value = countInSubtree(parent.selections, cond.childId, cond.includeChildSelections ?? true, bundle);
      isMatch = Boolean(cond.childId && selectionMatchesId(parent, cond.childId, bundle));
    } else {
      value = countInSubtree(force.selections, cond.childId, true, bundle);
    }
  } else if (cond.scope === 'ancestor') {
    for (const anc of [...ancestors].reverse()) {
      if (cond.childId && selectionMatchesId(anc, cond.childId, bundle)) {
        value = anc.count;
        isMatch = true;
        break;
      }
    }
  } else {
    const anc = [...ancestors].reverse().find((a) => selectionMatchesId(a, cond.scope, bundle));
    if (anc) {
      value = countInSubtree(anc.selections, cond.childId, cond.includeChildSelections ?? true, bundle);
      isMatch = true;
    } else {
      value = countInSubtree(force.selections, cond.scope, true, bundle);
      isMatch = value > 0;
    }
  }

  switch (cond.type) {
    case 'equalTo':
      return value === cond.value;
    case 'notEqualTo':
      return value !== cond.value;
    case 'greaterThan':
      return value > cond.value;
    case 'lessThan':
      return value < cond.value;
    case 'atLeast':
      return value >= cond.value;
    case 'atMost':
      return value <= cond.value;
    case 'instanceOf':
      return isMatch;
    case 'notInstanceOf':
      return !isMatch;
    default:
      return false;
  }
}

function evalCondGroup(
  conditions: Condition[],
  groups: ConditionGroup[],
  roster: Roster,
  force: RosterForce,
  ancestors: RosterSelection[],
  bundle: FactionBundle,
  mode: 'and' | 'or' = 'and'
): boolean {
  const results = [
    ...conditions.map((c) => evalSimpleCondition(c, roster, force, ancestors, bundle)),
    ...groups.map((g) => evalCondGroup(g.conditions, g.conditionGroups, roster, force, ancestors, bundle, g.type)),
  ];
  if (results.length === 0) return true;
  return mode === 'and' ? results.every(Boolean) : results.some(Boolean);
}

export function evaluateVisibilityAndCost(
  modifiers: Modifier[],
  modifierGroups: ModifierGroup[],
  initialHidden: boolean,
  initialPoints: number,
  initialCategoryIds: string[],
  roster: Roster,
  force: RosterForce,
  ancestors: RosterSelection[],
  bundle: FactionBundle
): { hidden: boolean; points: number; categoryIds: string[] } {
  let hidden = initialHidden;
  let points = initialPoints;
  const cats = new Set(initialCategoryIds);

  function applyMods(mods: Modifier[], mgs: ModifierGroup[]) {
    for (const m of mods) {
      if (!evalCondGroup(m.conditions, m.conditionGroups, roster, force, ancestors, bundle)) continue;
      if (m.field === 'hidden' && m.type === 'set') {
        hidden = m.value === 'true';
      } else if (m.field === PTS_COST_ID) {
        const v = Number(m.value) || 0;
        if (m.type === 'set') points = v;
        else if (m.type === 'increment') points += v;
        else if (m.type === 'decrement') points -= v;
      } else if (m.field === 'category') {
        if (m.type === 'add') cats.add(m.value);
        else if (m.type === 'remove') cats.delete(m.value);
      }
    }
    for (const mg of mgs) {
      if (!evalCondGroup(mg.conditions, mg.conditionGroups, roster, force, ancestors, bundle)) continue;
      applyMods(mg.modifiers, mg.modifierGroups);
    }
  }

  applyMods(modifiers, modifierGroups);
  return { hidden, points, categoryIds: Array.from(cats) };
}

function calcDefaultSelectionPoints(
  sel: RosterSelection,
  parentResolved: ResolvedCatalogEntry | null,
  roster: Roster,
  force: RosterForce,
  ancestors: RosterSelection[],
  bundle: FactionBundle
): number {
  const def = findEntryDefinition(sel, parentResolved, bundle);
  if (!def) return 0;

  const { points } = evaluateVisibilityAndCost(
    def.modifiers,
    def.modifierGroups,
    def.hidden,
    def.basePoints,
    [],
    roster,
    force,
    ancestors,
    bundle
  );

  let childrenPts = 0;
  for (const child of sel.selections) {
    childrenPts += calcDefaultSelectionPoints(child, def, roster, force, [...ancestors, sel], bundle);
  }
  return points * sel.count + childrenPts;
}

export function getVisibleRootEntriesForForce(
  roster: Roster,
  force: RosterForce,
  bundle: FactionBundle,
  system: SystemIndex['gameSystem']
): Array<{
  resolved: ResolvedCatalogEntry;
  primaryCategoryId: string;
  categoryIds: string[];
  points: number;
}> {
  const results: Array<{
    resolved: ResolvedCatalogEntry;
    primaryCategoryId: string;
    categoryIds: string[];
    points: number;
  }> = [];

  const isDaemonFaction = bundle.name.toLowerCase().includes('daemon');
  const isMechanicum = bundle.name.toLowerCase().includes('mechanicum');

  const allRaw: Array<SelectionEntry | EntryLink> = [
    ...bundle.rootEntries,
    ...bundle.rootLinks.filter((l) => l.type === 'selectionEntry'),
  ];

  for (const item of allRaw) {
    const resolved = resolveEntry(item, bundle);
    if (!resolved) continue;

    if (resolved.name.startsWith('How to add')) continue;
    if (!isDaemonFaction && resolved.name === 'Bound Daemons') continue;
    if (!isDaemonFaction && !isMechanicum && resolved.name.includes('Ætheric Dominion')) continue;

    const pCat =
      resolved.categoryLinks.find((c) => c.primary)?.targetId ??
      resolved.categoryLinks[0]?.targetId ??
      '';
    const baseCats = resolved.categoryLinks.map((c) => c.targetId);

    const { hidden, points, categoryIds } = evaluateVisibilityAndCost(
      resolved.modifiers,
      resolved.modifierGroups,
      resolved.hidden,
      resolved.basePoints,
      baseCats,
      roster,
      force,
      [],
      bundle
    );

    if (hidden) continue;

    const finalPrimary = categoryIds.includes(pCat)
      ? pCat
      : categoryIds.find((id) => system.categories[id]) ?? pCat;

    let totalDefaultPoints = points;
    if (resolved.type === 'unit' || resolved.type === 'model') {
      const tempSel = instantiateSelection(resolved, bundle, {
        primaryCategoryId: finalPrimary,
        roster,
        force,
      });
      let childrenPts = 0;
      for (const child of tempSel.selections) {
        childrenPts += calcDefaultSelectionPoints(child, resolved, roster, force, [tempSel], bundle);
      }
      totalDefaultPoints = points * tempSel.count + childrenPts;
    }

    results.push({
      resolved,
      primaryCategoryId: finalPrimary,
      categoryIds,
      points: totalDefaultPoints,
    });
  }

  return results.sort((a, b) => a.resolved.name.localeCompare(b.resolved.name));
}

export function getConstraintMinMax(constraints: Constraint[]): { min: number; max: number | null } {
  let min = 0;
  let max: number | null = null;
  for (const c of constraints) {
    if (c.field !== 'selections' || c.percentValue) continue;
    if (c.scope !== 'parent' && c.scope !== 'self') continue;
    if (c.type === 'min' && c.value > min) min = c.value;
    if (c.type === 'max') max = max === null ? c.value : Math.min(max, c.value);
  }
  return { min, max };
}

export function findCatalogDefinitionForPath(
  path: RosterSelection[],
  bundle: FactionBundle
): ResolvedCatalogEntry | null {
  let currentDef: ResolvedCatalogEntry | null = null;
  for (const node of path) {
    currentDef = findEntryDefinition(node, currentDef, bundle);
    if (!currentDef) return null;
  }
  return currentDef;
}

export interface InspectorOptionItem {
  resolved: ResolvedCatalogEntry;
  points: number;
  min: number;
  max: number | null;
  profiles: Profile[];
  rules: Rule[];
}

export interface InspectorGroupNode {
  group: ResolvedCatalogGroup;
  min: number;
  max: number | null;
  options: InspectorOptionItem[];
  subGroups: InspectorGroupNode[];
}

export interface InspectorOptions {
  directEntries: InspectorOptionItem[];
  groups: InspectorGroupNode[];
}

function collectOptionDetails(
  resolved: ResolvedCatalogEntry,
  roster: Roster,
  force: RosterForce,
  ancestors: RosterSelection[],
  bundle: FactionBundle
): { profiles: Profile[]; rules: Rule[] } {
  const ctx: EvalContext = {
    roster,
    force,
    ancestors,
    bundle,
    pointsByInstance: new Map(),
    pointsByForce: new Map(),
    totalRosterPoints: roster.pointsLimit,
  };
  const profMap = new Map<string, Profile>();
  const ruleMap = new Map<string, Rule>();

  function walkDef(d: ResolvedCatalogEntry, depth: number) {
    const { profiles, rules } = resolveProfilesAndRulesForDef(d, ctx, bundle);
    for (const p of profiles) profMap.set(`${p.name}-${p.typeId}`, p);
    for (const r of rules) ruleMap.set(r.id, r);
    if (depth >= 2) return;
    for (const sub of [...d.selectionEntries, ...d.entryLinks.filter((l) => l.type === 'selectionEntry')]) {
      const rSub = resolveEntry(sub, bundle);
      if (rSub && !rSub.hidden) walkDef(rSub, depth + 1);
    }
  }

  walkDef(resolved, 0);
  return { profiles: Array.from(profMap.values()), rules: Array.from(ruleMap.values()) };
}

export function getInspectorOptions(
  path: RosterSelection[],
  roster: Roster,
  force: RosterForce,
  bundle: FactionBundle
): InspectorOptions {
  const def = findCatalogDefinitionForPath(path, bundle);
  if (!def) return { directEntries: [], groups: [] };

  const directRaw: Array<SelectionEntry | EntryLink> = [
    ...def.selectionEntries,
    ...def.entryLinks.filter((el) => el.type === 'selectionEntry'),
  ];

  const directEntries: InspectorOptionItem[] = directRaw
    .map((item) => resolveEntry(item, bundle))
    .filter((r): r is ResolvedCatalogEntry => Boolean(r))
    .map((r) => {
      const ev = evaluateVisibilityAndCost(
        r.modifiers,
        r.modifierGroups,
        r.hidden,
        r.basePoints,
        [],
        roster,
        force,
        path,
        bundle
      );
      const { min, max } = getConstraintMinMax(r.constraints);
      const details = collectOptionDetails(r, roster, force, path, bundle);
      return { resolved: r, points: ev.points, min, max, hidden: ev.hidden, ...details };
    })
    .filter((o) => !o.hidden)
    .map(({ hidden: _h, ...rest }) => rest);

  function buildGroupNode(rawGroup: SelectionEntryGroup | EntryLink): InspectorGroupNode | null {
    const grp = resolveGroup(rawGroup, bundle);
    if (!grp) return null;

    const grpVis = evaluateVisibilityAndCost(
      grp.modifiers,
      grp.modifierGroups,
      grp.hidden,
      0,
      [],
      roster,
      force,
      path,
      bundle
    );
    if (grpVis.hidden) return null;

    const { min, max } = getConstraintMinMax(grp.constraints);
    const optRaw: Array<SelectionEntry | EntryLink> = [
      ...grp.selectionEntries,
      ...grp.entryLinks.filter((el) => el.type === 'selectionEntry'),
    ];

    const options: InspectorOptionItem[] = optRaw
      .map((item) => resolveEntry(item, bundle))
      .filter((r): r is ResolvedCatalogEntry => Boolean(r))
      .map((r) => {
        const ev = evaluateVisibilityAndCost(
          r.modifiers,
          r.modifierGroups,
          r.hidden,
          r.basePoints,
          [],
          roster,
          force,
          path,
          bundle
        );
        const bounds = getConstraintMinMax(r.constraints);
        const details = collectOptionDetails(r, roster, force, path, bundle);
        return { resolved: r, points: ev.points, min: bounds.min, max: bounds.max, hidden: ev.hidden, ...details };
      })
      .filter((o) => !o.hidden)
      .map(({ hidden: _h, ...rest }) => rest);

    const subGroups = [
      ...grp.selectionEntryGroups,
      ...grp.entryLinks.filter((el) => el.type === 'selectionEntryGroup'),
    ]
      .map(buildGroupNode)
      .filter((n): n is InspectorGroupNode => Boolean(n));

    if (options.length === 0 && subGroups.length === 0) return null;

    return { group: grp, min, max, options, subGroups };
  }

  const groups = [
    ...def.selectionEntryGroups,
    ...def.entryLinks.filter((el) => el.type === 'selectionEntryGroup'),
  ]
    .map(buildGroupNode)
    .filter((n): n is InspectorGroupNode => Boolean(n));

  return { directEntries, groups };
}

function updateSelectionsAtPath(
  list: RosterSelection[],
  pathIds: string[],
  updater: (children: RosterSelection[]) => RosterSelection[]
): RosterSelection[] {
  if (pathIds.length === 0) {
    return updater(list);
  }
  const [head, ...rest] = pathIds;
  return list.map((sel) =>
    sel.instanceId === head
      ? { ...sel, selections: updateSelectionsAtPath(sel.selections, rest, updater) }
      : sel
  );
}

export function addUnitToForce(
  roster: Roster,
  forceId: string,
  resolved: ResolvedCatalogEntry,
  primaryCategoryId: string,
  bundle: FactionBundle
): { roster: Roster; newInstanceId: string } {
  const force = roster.forces.find((f) => f.id === forceId);
  const newSel = instantiateSelection(resolved, bundle, { primaryCategoryId, roster, force });
  return {
    newInstanceId: newSel.instanceId,
    roster: {
      ...roster,
      forces: roster.forces.map((f) =>
        f.id === forceId ? { ...f, selections: [...f.selections, newSel] } : f
      ),
    },
  };
}

export function removeSelectionAtPath(
  roster: Roster,
  forceId: string,
  parentPathIds: string[],
  targetInstanceId: string
): Roster {
  return {
    ...roster,
    forces: roster.forces.map((f) =>
      f.id !== forceId
        ? f
        : {
            ...f,
            selections: updateSelectionsAtPath(f.selections, parentPathIds, (children) =>
              children.filter((c) => c.instanceId !== targetInstanceId)
            ),
          }
    ),
  };
}

export function setOptionCountAtPath(
  roster: Roster,
  forceId: string,
  parentPathIds: string[],
  resolved: ResolvedCatalogEntry,
  groupId: string | undefined,
  newCount: number,
  bundle: FactionBundle
): Roster {
  const safeCount = Math.max(0, newCount);
  return {
    ...roster,
    forces: roster.forces.map((f) => {
      if (f.id !== forceId) return f;
      return {
        ...f,
        selections: updateSelectionsAtPath(f.selections, parentPathIds, (children) => {
          const existing = children.find(
            (c) =>
              (c.entryId === resolved.id || c.targetEntryId === resolved.targetId) &&
              (groupId ? c.groupId === groupId : true)
          );
          if (safeCount === 0) {
            return existing ? children.filter((c) => c.instanceId !== existing.instanceId) : children;
          }
          if (existing) {
            return children.map((c) =>
              c.instanceId === existing.instanceId ? { ...c, count: safeCount } : c
            );
          }
          const created = instantiateSelection(resolved, bundle, {
            count: safeCount,
            groupId,
            roster,
            force: f,
          });
          return [...children, created];
        }),
      };
    }),
  };
}

export function selectRadioOptionAtPath(
  roster: Roster,
  forceId: string,
  parentPathIds: string[],
  groupId: string,
  optionIdsInGroup: string[],
  chosen: ResolvedCatalogEntry | null,
  bundle: FactionBundle
): Roster {
  return {
    ...roster,
    forces: roster.forces.map((f) => {
      if (f.id !== forceId) return f;
      return {
        ...f,
        selections: updateSelectionsAtPath(f.selections, parentPathIds, (children) => {
          const filtered = children.filter(
            (c) =>
              c.groupId !== groupId &&
              !optionIdsInGroup.includes(c.entryId) &&
              !optionIdsInGroup.includes(c.targetEntryId)
          );
          if (!chosen) return filtered;
          return [
            ...filtered,
            instantiateSelection(chosen, bundle, { count: 1, groupId, roster, force: f }),
          ];
        }),
      };
    }),
  };
}
// ENDE rosterActions.ts
