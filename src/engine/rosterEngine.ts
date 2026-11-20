import type {
  Condition,
  ConditionGroup,
  Constraint,
  EntryLink,
  FactionBundle,
  ForceEntry,
  Modifier,
  ModifierGroup,
  Profile,
  Repeat,
  Rule,
  SelectionEntry,
  SelectionEntryGroup,
  SystemIndex,
} from '../types/data';
import type {
  EvaluatedForce,
  EvaluatedRoster,
  EvaluatedSelection,
  Roster,
  RosterForce,
  RosterSelection,
  ValidationIssue,
} from '../types/roster';

export const PTS_COST_ID = 'd2ee-04cb-5f8a-2642';

export interface ResolvedCatalogEntry {
  id: string;
  targetId: string;
  linkId?: string;
  name: string;
  type: SelectionEntry['type'];
  hidden: boolean;
  collective: boolean;
  basePoints: number;
  constraints: Constraint[];
  categoryLinks: SelectionEntry['categoryLinks'];
  infoLinks: SelectionEntry['infoLinks'];
  profiles: Profile[];
  rules: Rule[];
  modifiers: Modifier[];
  modifierGroups: ModifierGroup[];
  selectionEntries: SelectionEntry[];
  selectionEntryGroups: SelectionEntryGroup[];
  entryLinks: EntryLink[];
}

export interface ResolvedCatalogGroup {
  id: string;
  targetId: string;
  linkId?: string;
  name: string;
  hidden: boolean;
  defaultSelectionEntryId?: string;
  constraints: Constraint[];
  modifiers: Modifier[];
  modifierGroups: ModifierGroup[];
  selectionEntries: SelectionEntry[];
  selectionEntryGroups: SelectionEntryGroup[];
  entryLinks: EntryLink[];
}

export function resolveEntry(
  item: SelectionEntry | EntryLink,
  bundle: FactionBundle
): ResolvedCatalogEntry | null {
  if ('targetId' in item) {
    const target = bundle.sharedEntries[item.targetId];
    if (!target) return null;
    const linkPts = item.costs.find((c) => c.typeId === PTS_COST_ID)?.value;
    const targetPts = target.costs.find((c) => c.typeId === PTS_COST_ID)?.value ?? 0;

    return {
      id: item.id,
      targetId: target.id,
      linkId: item.id,
      name: item.name || target.name,
      type: target.type,
      hidden: Boolean(item.hidden || target.hidden),
      collective: Boolean(item.collective || target.collective),
      basePoints: linkPts !== undefined ? linkPts : targetPts,
      constraints: [...target.constraints, ...item.constraints],
      categoryLinks: [...target.categoryLinks, ...item.categoryLinks],
      infoLinks: [...target.infoLinks, ...item.infoLinks],
      profiles: [...target.profiles, ...item.profiles],
      rules: [...target.rules, ...item.rules],
      modifiers: [...target.modifiers, ...item.modifiers],
      modifierGroups: [...target.modifierGroups, ...item.modifierGroups],
      selectionEntries: target.selectionEntries,
      selectionEntryGroups: target.selectionEntryGroups,
      entryLinks: target.entryLinks,
    };
  }

  return {
    id: item.id,
    targetId: item.id,
    name: item.name,
    type: item.type,
    hidden: Boolean(item.hidden),
    collective: Boolean(item.collective),
    basePoints: item.costs.find((c) => c.typeId === PTS_COST_ID)?.value ?? 0,
    constraints: item.constraints,
    categoryLinks: item.categoryLinks,
    infoLinks: item.infoLinks,
    profiles: item.profiles,
    rules: item.rules,
    modifiers: item.modifiers,
    modifierGroups: item.modifierGroups,
    selectionEntries: item.selectionEntries,
    selectionEntryGroups: item.selectionEntryGroups,
    entryLinks: item.entryLinks,
  };
}

export function resolveGroup(
  item: SelectionEntryGroup | EntryLink,
  bundle: FactionBundle
): ResolvedCatalogGroup | null {
  if ('targetId' in item) {
    const target = bundle.sharedGroups[item.targetId];
    if (!target) return null;
    return {
      id: item.id,
      targetId: target.id,
      linkId: item.id,
      name: item.name || target.name,
      hidden: Boolean(item.hidden || target.hidden),
      defaultSelectionEntryId: target.defaultSelectionEntryId,
      constraints: [...target.constraints, ...item.constraints],
      modifiers: [...target.modifiers, ...item.modifiers],
      modifierGroups: [...target.modifierGroups, ...item.modifierGroups],
      selectionEntries: target.selectionEntries,
      selectionEntryGroups: target.selectionEntryGroups,
      entryLinks: target.entryLinks,
    };
  }

  return {
    id: item.id,
    targetId: item.id,
    name: item.name,
    hidden: Boolean(item.hidden),
    defaultSelectionEntryId: item.defaultSelectionEntryId,
    constraints: item.constraints,
    modifiers: item.modifiers,
    modifierGroups: item.modifierGroups,
    selectionEntries: item.selectionEntries,
    selectionEntryGroups: item.selectionEntryGroups,
    entryLinks: item.entryLinks,
  };
}

function makeId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getMinParentSelectionConstraint(constraints: Constraint[]): number {
  let min = 0;
  for (const c of constraints) {
    if (
      c.type === 'min' &&
      c.field === 'selections' &&
      (c.scope === 'parent' || c.scope === 'self') &&
      !c.percentValue
    ) {
      if (c.value > min) min = c.value;
    }
  }
  return min;
}

function isNodeHiddenWithModifiers(
  initialHidden: boolean,
  modifiers: Modifier[],
  modifierGroups: ModifierGroup[],
  ctx: EvalContext
): boolean {
  let hidden = initialHidden;
  for (const { mod } of collectActiveModifiers(modifiers, modifierGroups, ctx)) {
    if (mod.field === 'hidden' && mod.type === 'set') {
      hidden = mod.value === 'true';
    }
  }
  return hidden;
}

export function instantiateSelection(
  resolved: ResolvedCatalogEntry,
  bundle: FactionBundle,
  options?: {
    count?: number;
    groupId?: string;
    primaryCategoryId?: string;
    depth?: number;
    roster?: Roster;
    force?: RosterForce;
    ancestors?: RosterSelection[];
  }
): RosterSelection {
  const depth = options?.depth ?? 0;
  const primaryCat =
    options?.primaryCategoryId ??
    resolved.categoryLinks.find((cl) => cl.primary)?.targetId ??
    resolved.categoryLinks[0]?.targetId;

  const selection: RosterSelection = {
    instanceId: makeId(),
    entryId: resolved.id,
    targetEntryId: resolved.targetId,
    ...(resolved.linkId ? { linkId: resolved.linkId } : {}),
    ...(options?.groupId ? { groupId: options.groupId } : {}),
    ...(primaryCat ? { primaryCategoryId: primaryCat } : {}),
    count: options?.count ?? 1,
    selections: [],
  };

  if (depth > 8) return selection;

  const roster: Roster = options?.roster ?? { id: 'init', name: '', pointsLimit: 3000, forces: [] };
  const force: RosterForce = options?.force ?? {
    id: 'init-f',
    forceEntryId: '',
    factionId: bundle.id,
    selections: [],
  };
  const nextAncestors = [...(options?.ancestors ?? []), selection];

  const ctx: EvalContext = {
    roster,
    force,
    ancestors: nextAncestors,
    current: selection,
    primaryCategoryId: primaryCat,
    bundle,
    pointsByInstance: new Map(),
    pointsByForce: new Map(),
    totalRosterPoints: roster.pointsLimit,
  };

  const childEntries: Array<SelectionEntry | EntryLink> = [
    ...resolved.selectionEntries,
    ...resolved.entryLinks.filter((el) => el.type === 'selectionEntry'),
  ];

  for (const child of childEntries) {
    const rChild = resolveEntry(child, bundle);
    if (!rChild) continue;
    if (isNodeHiddenWithModifiers(rChild.hidden, rChild.modifiers, rChild.modifierGroups, ctx)) continue;
    const min = getMinParentSelectionConstraint(rChild.constraints);
    if (min >= 1) {
      selection.selections.push(
        instantiateSelection(rChild, bundle, {
          count: min,
          depth: depth + 1,
          roster,
          force,
          ancestors: nextAncestors,
        })
      );
    }
  }

  const childGroups: Array<SelectionEntryGroup | EntryLink> = [
    ...resolved.selectionEntryGroups,
    ...resolved.entryLinks.filter((el) => el.type === 'selectionEntryGroup'),
  ];

  for (const grp of childGroups) {
    populateGroupDefaults(grp, bundle, selection.selections, depth + 1, roster, force, nextAncestors);
  }

  return selection;
}

function populateGroupDefaults(
  rawGroup: SelectionEntryGroup | EntryLink,
  bundle: FactionBundle,
  targetList: RosterSelection[],
  depth: number,
  roster: Roster,
  force: RosterForce,
  ancestors: RosterSelection[]
) {
  if (depth > 8) return;
  const group = resolveGroup(rawGroup, bundle);
  if (!group) return;

  const ctx: EvalContext = {
    roster,
    force,
    ancestors,
    bundle,
    pointsByInstance: new Map(),
    pointsByForce: new Map(),
    totalRosterPoints: roster.pointsLimit,
  };

  if (isNodeHiddenWithModifiers(group.hidden, group.modifiers, group.modifierGroups, ctx)) return;

  let effectiveDefaultId = group.defaultSelectionEntryId;
  for (const { mod } of collectActiveModifiers(group.modifiers, group.modifierGroups, ctx)) {
    if (mod.field === 'defaultSelectionEntryId' && mod.type === 'set') {
      effectiveDefaultId = mod.value;
    }
  }

  const groupMin = getMinParentSelectionConstraint(group.constraints);
  const candidates: Array<SelectionEntry | EntryLink> = [
    ...group.selectionEntries,
    ...group.entryLinks.filter((el) => el.type === 'selectionEntry'),
  ];

  // Nur Gruppen mit min >= 1 bekommen automatisch ihre Standard-Auswahl
  if (effectiveDefaultId && groupMin >= 1) {
    const defItem = candidates.find(
      (c) =>
        c.id === effectiveDefaultId ||
        ('targetId' in c && c.targetId === effectiveDefaultId)
    );
    if (defItem) {
      const resolved = resolveEntry(defItem, bundle);
      if (
        resolved &&
        !isNodeHiddenWithModifiers(resolved.hidden, resolved.modifiers, resolved.modifierGroups, ctx)
      ) {
        const childMin = getMinParentSelectionConstraint(resolved.constraints);
        const min = Math.max(1, groupMin, childMin);
        targetList.push(
          instantiateSelection(resolved, bundle, {
            count: min,
            groupId: group.id,
            depth,
            roster,
            force,
            ancestors,
          })
        );
      }
    }
  } else {
    for (const c of candidates) {
      const resolved = resolveEntry(c, bundle);
      if (!resolved) continue;
      if (isNodeHiddenWithModifiers(resolved.hidden, resolved.modifiers, resolved.modifierGroups, ctx)) continue;
      const min = getMinParentSelectionConstraint(resolved.constraints);
      if (min >= 1) {
        targetList.push(
          instantiateSelection(resolved, bundle, {
            count: min,
            groupId: group.id,
            depth,
            roster,
            force,
            ancestors,
          })
        );
      }
    }
  }

  for (const subGrp of [
    ...group.selectionEntryGroups,
    ...group.entryLinks.filter((el) => el.type === 'selectionEntryGroup'),
  ]) {
    populateGroupDefaults(subGrp, bundle, targetList, depth + 1, roster, force, ancestors);
  }
}

export interface EvalContext {
  roster: Roster;
  force: RosterForce;
  ancestors: RosterSelection[];
  current?: RosterSelection;
  primaryCategoryId?: string;
  bundle: FactionBundle;
  pointsByInstance: Map<string, number>;
  pointsByForce: Map<string, number>;
  totalRosterPoints: number;
}

function selectionMatchesId(
  sel: RosterSelection,
  id: string,
  bundle: FactionBundle
): boolean {
  if (sel.entryId === id || sel.targetEntryId === id || sel.linkId === id || sel.groupId === id) {
    return true;
  }
  if (sel.primaryCategoryId === id) return true;
  const entry = bundle.sharedEntries[sel.targetEntryId];
  if (entry?.categoryLinks.some((cl) => cl.targetId === id)) return true;
  return false;
}

function countSelectionsInSubtree(
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
      total += countSelectionsInSubtree(sel.selections, targetId, true, bundle);
    }
  }
  return total;
}

function resolveScopeValue(
  scope: string,
  field: string,
  childId: string | undefined,
  includeChildSelections: boolean,
  ctx: EvalContext
): { value: number; isInstanceMatch: boolean } {
  const isPoints = field === PTS_COST_ID;
  const isForces = field === 'forces';

  if (isForces) {
    if (!childId) return { value: ctx.roster.forces.length, isInstanceMatch: ctx.roster.forces.length > 0 };
    const matching = ctx.roster.forces.filter((f) => f.forceEntryId === childId || f.factionId === childId).length;
    return { value: matching, isInstanceMatch: matching > 0 };
  }

  if (scope === 'primary-catalogue') {
    const match = childId ? ctx.force.factionId === childId : false;
    return { value: match ? 1 : 0, isInstanceMatch: match };
  }

  if (scope === 'primary-category') {
    const pCat = ctx.current?.primaryCategoryId ?? ctx.primaryCategoryId;
    const match = childId ? pCat === childId : false;
    return { value: match ? 1 : 0, isInstanceMatch: match };
  }

  if (scope === 'self') {
    if (!ctx.current) return { value: 0, isInstanceMatch: false };
    if (isPoints) {
      return { value: ctx.pointsByInstance.get(ctx.current.instanceId) ?? 0, isInstanceMatch: true };
    }
    const val = childId
      ? countSelectionsInSubtree(ctx.current.selections, childId, includeChildSelections, ctx.bundle)
      : ctx.current.count;
    return { value: val, isInstanceMatch: Boolean(childId && selectionMatchesId(ctx.current, childId, ctx.bundle)) };
  }

  if (scope === 'parent') {
    const parent = ctx.ancestors[ctx.ancestors.length - 1];
    if (!parent) {
      if (isPoints) return { value: ctx.pointsByForce.get(ctx.force.id) ?? 0, isInstanceMatch: false };
      const val = countSelectionsInSubtree(ctx.force.selections, childId, includeChildSelections, ctx.bundle);
      return { value: val, isInstanceMatch: false };
    }
    if (isPoints) return { value: ctx.pointsByInstance.get(parent.instanceId) ?? 0, isInstanceMatch: true };
    const val = countSelectionsInSubtree(parent.selections, childId, includeChildSelections, ctx.bundle);
    return { value: val, isInstanceMatch: Boolean(childId && selectionMatchesId(parent, childId, ctx.bundle)) };
  }

  if (scope === 'unit') {
    const unitAnc =
      [...ctx.ancestors].reverse().find((a) => ctx.bundle.sharedEntries[a.targetEntryId]?.type === 'unit') ??
      ctx.ancestors[0] ??
      ctx.current;
    if (!unitAnc) return { value: 0, isInstanceMatch: false };
    if (isPoints) return { value: ctx.pointsByInstance.get(unitAnc.instanceId) ?? 0, isInstanceMatch: true };
    const val = countSelectionsInSubtree(unitAnc.selections, childId, true, ctx.bundle);
    return { value: val, isInstanceMatch: Boolean(childId && selectionMatchesId(unitAnc, childId, ctx.bundle)) };
  }

  if (scope === 'ancestor') {
    for (const anc of [...ctx.ancestors].reverse()) {
      if (childId && selectionMatchesId(anc, childId, ctx.bundle)) {
        return { value: anc.count, isInstanceMatch: true };
      }
    }
    return { value: 0, isInstanceMatch: false };
  }

  if (scope === 'force') {
    if (isPoints) return { value: ctx.pointsByForce.get(ctx.force.id) ?? 0, isInstanceMatch: false };
    const val = countSelectionsInSubtree(ctx.force.selections, childId, includeChildSelections || !childId, ctx.bundle);
    return { value: val, isInstanceMatch: Boolean(childId && (ctx.force.forceEntryId === childId || val > 0)) };
  }

  if (scope === 'roster') {
    if (isPoints) return { value: ctx.totalRosterPoints, isInstanceMatch: false };
    let val = 0;
    for (const f of ctx.roster.forces) {
      val += countSelectionsInSubtree(f.selections, childId, includeChildSelections || !childId, ctx.bundle);
    }
    return { value: val, isInstanceMatch: val > 0 };
  }

  for (const anc of [...ctx.ancestors].reverse()) {
    if (selectionMatchesId(anc, scope, ctx.bundle)) {
      if (isPoints) return { value: ctx.pointsByInstance.get(anc.instanceId) ?? 0, isInstanceMatch: true };
      const val = childId
        ? countSelectionsInSubtree(anc.selections, childId, includeChildSelections, ctx.bundle)
        : anc.count;
      return { value: val, isInstanceMatch: true };
    }
  }

  const val = countSelectionsInSubtree(ctx.force.selections, scope, true, ctx.bundle);
  return { value: val, isInstanceMatch: val > 0 };
}

function evaluateCondition(cond: Condition, ctx: EvalContext): boolean {
  const { value, isInstanceMatch } = resolveScopeValue(
    cond.scope,
    cond.field,
    cond.childId,
    cond.includeChildSelections ?? true,
    ctx
  );

  let compareValue = value;
  if (cond.percentValue && cond.field === PTS_COST_ID) {
    compareValue = ctx.roster.pointsLimit > 0 ? (value / ctx.roster.pointsLimit) * 100 : 0;
  }

  switch (cond.type) {
    case 'equalTo':
      return compareValue === cond.value;
    case 'notEqualTo':
      return compareValue !== cond.value;
    case 'greaterThan':
      return compareValue > cond.value;
    case 'lessThan':
      return compareValue < cond.value;
    case 'atLeast':
      return compareValue >= cond.value;
    case 'atMost':
      return compareValue <= cond.value;
    case 'instanceOf':
      return isInstanceMatch;
    case 'notInstanceOf':
      return !isInstanceMatch;
    default:
      return false;
  }
}

function evaluateConditionsAndGroups(
  conditions: Condition[],
  groups: ConditionGroup[],
  ctx: EvalContext,
  mode: 'and' | 'or' = 'and'
): boolean {
  const results: boolean[] = [
    ...conditions.map((c) => evaluateCondition(c, ctx)),
    ...groups.map((g) => evaluateConditionsAndGroups(g.conditions, g.conditionGroups, ctx, g.type)),
  ];
  if (results.length === 0) return true;
  return mode === 'and' ? results.every(Boolean) : results.some(Boolean);
}

function getRepeatCount(repeats: Repeat[], ctx: EvalContext): number {
  if (repeats.length === 0) return 1;
  let totalRepeats = 1;
  for (const r of repeats) {
    const { value } = resolveScopeValue(
      r.scope,
      r.field,
      r.childId,
      r.includeChildSelections ?? true,
      ctx
    );
    if (r.value <= 0) continue;
    const steps = r.roundUp ? Math.ceil(value / r.value) : Math.floor(value / r.value);
    totalRepeats *= Math.max(0, steps * r.repeats);
  }
  return totalRepeats;
}

export function collectActiveModifiers(
  modifiers: Modifier[],
  modifierGroups: ModifierGroup[],
  ctx: EvalContext
): Array<{ mod: Modifier; count: number }> {
  const active: Array<{ mod: Modifier; count: number }> = [];

  for (const m of modifiers) {
    if (evaluateConditionsAndGroups(m.conditions, m.conditionGroups, ctx)) {
      const count = getRepeatCount(m.repeats, ctx);
      if (count > 0) active.push({ mod: m, count });
    }
  }

  for (const mg of modifierGroups) {
    if (evaluateConditionsAndGroups(mg.conditions, mg.conditionGroups, ctx)) {
      const groupCount = getRepeatCount(mg.repeats, ctx);
      if (groupCount > 0) {
        for (const sub of collectActiveModifiers(mg.modifiers, mg.modifierGroups, ctx)) {
          active.push({ mod: sub.mod, count: sub.count * groupCount });
        }
      }
    }
  }

  return active;
}

export function resolveProfilesAndRulesForDef(
  def: ResolvedCatalogEntry,
  ctx: EvalContext,
  bundle: FactionBundle
): { profiles: Profile[]; rules: Rule[] } {
  const profiles: Profile[] = [];
  const rules: Rule[] = [];

  function evalProfile(
    base: Profile,
    extraMods: Modifier[],
    extraModGroups: ModifierGroup[],
    linkHidden?: boolean
  ): Profile | null {
    let hidden = Boolean(linkHidden || base.hidden);
    let name = base.name;
    const chars = base.characteristics.map((c) => ({ ...c }));

    const activeMods = [
      ...collectActiveModifiers(base.modifiers, base.modifierGroups, ctx),
      ...collectActiveModifiers(extraMods, extraModGroups, ctx),
    ];

    for (const { mod, count } of activeMods) {
      if (mod.field === 'hidden' && mod.type === 'set') {
        hidden = mod.value === 'true';
      } else if (mod.field === 'name') {
        if (mod.type === 'set') name = mod.value;
        else if (mod.type === 'append') name = `${name}${mod.value}`;
      } else {
        const ch = chars.find((c) => c.typeId === mod.field);
        if (ch) {
          if (mod.type === 'set') ch.value = mod.value;
          else if (mod.type === 'append') ch.value = `${ch.value}${mod.value}`;
          else if (mod.type === 'increment' || mod.type === 'decrement') {
            const cur = Number(ch.value);
            const delta = Number(mod.value) || 0;
            if (Number.isFinite(cur)) {
              ch.value = String(mod.type === 'increment' ? cur + delta * count : cur - delta * count);
            }
          }
        }
      }
    }

    if (hidden) return null;
    return { ...base, name, hidden: false, characteristics: chars };
  }

  function evalRule(
    base: Rule,
    extraMods: Modifier[],
    extraModGroups: ModifierGroup[],
    linkHidden?: boolean
  ): Rule | null {
    let hidden = Boolean(linkHidden || base.hidden);
    let name = base.name;
    let description = base.description;

    const activeMods = [
      ...collectActiveModifiers(base.modifiers, base.modifierGroups, ctx),
      ...collectActiveModifiers(extraMods, extraModGroups, ctx),
    ];

    for (const { mod } of activeMods) {
      if (mod.field === 'hidden' && mod.type === 'set') {
        hidden = mod.value === 'true';
      } else if (mod.field === 'name') {
        if (mod.type === 'set') name = mod.value;
        else if (mod.type === 'append') name = `${name}${mod.value}`;
      } else if (mod.field === 'description') {
        if (mod.type === 'set') description = mod.value;
        else if (mod.type === 'append') description = `${description}${mod.value}`;
      }
    }

    if (hidden) return null;
    return { ...base, name, description, hidden: false };
  }

  for (const p of def.profiles) {
    const res = evalProfile(p, [], []);
    if (res) profiles.push(res);
  }
  for (const r of def.rules) {
    const res = evalRule(r, [], []);
    if (res) rules.push(res);
  }
  for (const il of def.infoLinks) {
    if (il.type === 'profile' && bundle.profiles[il.targetId]) {
      const res = evalProfile(bundle.profiles[il.targetId], il.modifiers, il.modifierGroups, il.hidden);
      if (res) profiles.push(res);
    } else if (il.type === 'rule' && bundle.rules[il.targetId]) {
      const res = evalRule(bundle.rules[il.targetId], il.modifiers, il.modifierGroups, il.hidden);
      if (res) rules.push(res);
    }
  }

  return { profiles, rules };
}

export function findEntryDefinition(
  sel: RosterSelection,
  parentResolved: ResolvedCatalogEntry | null,
  bundle: FactionBundle
): ResolvedCatalogEntry | null {
  if (parentResolved) {
    const allEntries: SelectionEntry[] = [...parentResolved.selectionEntries];
    const allLinks: EntryLink[] = [...parentResolved.entryLinks];

    const groupQueue: SelectionEntryGroup[] = [...parentResolved.selectionEntryGroups];
    const visitedGroups = new Set<string>();

    for (const el of parentResolved.entryLinks) {
      if (el.type === 'selectionEntryGroup' && bundle.sharedGroups[el.targetId]) {
        groupQueue.push(bundle.sharedGroups[el.targetId]);
      }
    }

    while (groupQueue.length > 0) {
      const g = groupQueue.pop()!;
      if (visitedGroups.has(g.id)) continue;
      visitedGroups.add(g.id);

      allEntries.push(...g.selectionEntries);
      allLinks.push(...g.entryLinks);

      for (const sub of g.selectionEntryGroups) {
        groupQueue.push(sub);
      }
      for (const el of g.entryLinks) {
        if (el.type === 'selectionEntryGroup' && bundle.sharedGroups[el.targetId]) {
          groupQueue.push(bundle.sharedGroups[el.targetId]);
        }
      }
    }

    if (sel.linkId) {
      const foundLink = allLinks.find((l) => l.id === sel.linkId);
      if (foundLink) {
        const res = resolveEntry(foundLink, bundle);
        if (res) return res;
      }
    }

    const foundDirect = allEntries.find((e) => e.id === sel.targetEntryId);
    if (foundDirect) return resolveEntry(foundDirect, bundle);

    const foundLinkByTarget = allLinks.find(
      (l) => l.type === 'selectionEntry' && l.targetId === sel.targetEntryId
    );
    if (foundLinkByTarget) {
      const res = resolveEntry(foundLinkByTarget, bundle);
      if (res) return res;
    }
  } else if (sel.linkId) {
    const rootLink = bundle.rootLinks.find((l) => l.id === sel.linkId);
    if (rootLink) {
      const res = resolveEntry(rootLink, bundle);
      if (res) return res;
    }
  }

  const shared = bundle.sharedEntries[sel.targetEntryId];
  if (shared) return resolveEntry(shared, bundle);

  const rootEntry = bundle.rootEntries.find((e) => e.id === sel.targetEntryId);
  if (rootEntry) return resolveEntry(rootEntry, bundle);

  const rootLink = bundle.rootLinks.find(
    (l) => l.id === sel.entryId || l.targetId === sel.targetEntryId
  );
  if (rootLink) return resolveEntry(rootLink, bundle);

  return null;
}

export function evaluateRoster(
  roster: Roster,
  system: SystemIndex['gameSystem'],
  bundles: Record<string, FactionBundle>
): EvaluatedRoster {
  const pointsByInstance = new Map<string, number>();
  const pointsByForce = new Map<string, number>();
  let totalRosterPoints = 0;

  let evaluatedSelections: Record<string, EvaluatedSelection> = {};
  let evaluatedForces: Record<string, EvaluatedForce> = {};
  const issues: ValidationIssue[] = [];

  for (let pass = 0; pass < 2; pass++) {
    evaluatedSelections = {};
    evaluatedForces = {};
    totalRosterPoints = 0;
    if (pass === 1) issues.length = 0;

    for (const force of roster.forces) {
      const bundle = bundles[force.factionId];
      const forceEntry = findForceEntry(system.forceEntries, force.forceEntryId);
      if (!bundle || !forceEntry) continue;

      let forcePoints = 0;
      const categoryPoints: Record<string, number> = {};
      const categoryCounts: Record<string, number> = {};
      const categoryLimits: EvaluatedForce['categoryLimits'] = {};

      const constraintValues = new Map<string, number>();
      for (const cl of forceEntry.categoryLinks) {
        for (const c of cl.constraints) {
          constraintValues.set(c.id, c.value);
        }
      }

      if (pass === 1) {
        const forceCtx: EvalContext = {
          roster,
          force,
          ancestors: [],
          bundle,
          pointsByInstance,
          pointsByForce,
          totalRosterPoints: roster.pointsLimit,
        };
        const activeMods: Array<{ mod: Modifier; count: number }> = [
          ...collectActiveModifiers(forceEntry.modifiers, forceEntry.modifierGroups, forceCtx),
          ...forceEntry.categoryLinks.flatMap((cl) =>
            collectActiveModifiers(cl.modifiers, cl.modifierGroups, forceCtx)
          ),
        ];
        for (const { mod, count } of activeMods) {
          const prev = constraintValues.get(mod.field);
          if (prev !== undefined) {
            const delta = Number(mod.value) || 0;
            if (mod.type === 'set') constraintValues.set(mod.field, delta);
            if (mod.type === 'increment') constraintValues.set(mod.field, prev + delta * count);
            if (mod.type === 'decrement') constraintValues.set(mod.field, prev - delta * count);
          }
        }
      }

      for (const cl of forceEntry.categoryLinks) {
        const lim: EvaluatedForce['categoryLimits'][string] = {};
        for (const c of cl.constraints) {
          const val = constraintValues.get(c.id) ?? c.value;
          if (c.field === 'selections' && c.scope === 'force') {
            if (c.type === 'min') lim.min = val;
            if (c.type === 'max') lim.max = val;
          } else if (c.field === PTS_COST_ID && c.percentValue) {
            if (c.type === 'min') lim.minPercent = val;
            if (c.type === 'max') lim.maxPercent = val;
          }
        }
        categoryLimits[cl.targetId] = lim;
      }

      function evalSelection(
        sel: RosterSelection,
        parentResolved: ResolvedCatalogEntry | null,
        ancestors: RosterSelection[]
      ): EvaluatedSelection {
        const def = findEntryDefinition(sel, parentResolved, bundle);
        const ctx: EvalContext = {
          roster,
          force,
          ancestors,
          current: sel,
          primaryCategoryId: sel.primaryCategoryId,
          bundle,
          pointsByInstance,
          pointsByForce,
          totalRosterPoints,
        };

        let name = def?.name ?? sel.targetEntryId;
        let unitPoints = def?.basePoints ?? 0;
        let hidden = def?.hidden ?? false;
        const catSet = new Set<string>(def?.categoryLinks.map((c) => c.targetId) ?? []);
        if (sel.primaryCategoryId) catSet.add(sel.primaryCategoryId);

        if (def) {
          const activeMods = collectActiveModifiers(def.modifiers, def.modifierGroups, ctx);
          for (const { mod, count } of activeMods) {
            if (mod.field === PTS_COST_ID) {
              const v = Number(mod.value) || 0;
              if (mod.type === 'set') unitPoints = v;
              else if (mod.type === 'increment') unitPoints += v * count;
              else if (mod.type === 'decrement') unitPoints -= v * count;
            } else if (mod.field === 'name') {
              if (mod.type === 'set') name = mod.value;
              else if (mod.type === 'append') name = `${name}${mod.value}`;
            } else if (mod.field === 'hidden') {
              if (mod.type === 'set') hidden = mod.value === 'true';
            } else if (mod.field === 'category') {
              if (mod.type === 'add') catSet.add(mod.value);
              else if (mod.type === 'remove') catSet.delete(mod.value);
            }
          }
        }

        const childMap: Record<string, EvaluatedSelection> = {};
        let childrenPoints = 0;
        for (const child of sel.selections) {
          const evChild = evalSelection(child, def, [...ancestors, sel]);
          childMap[child.instanceId] = evChild;
          childrenPoints += evChild.totalPoints;
        }

        const totalPoints = unitPoints * sel.count + childrenPoints;
        pointsByInstance.set(sel.instanceId, totalPoints);

        const { profiles, rules } = def
          ? resolveProfilesAndRulesForDef(def, ctx, bundle)
          : { profiles: [], rules: [] };

        return {
          instanceId: sel.instanceId,
          name,
          type: def?.type ?? 'upgrade',
          count: sel.count,
          unitPoints,
          totalPoints,
          hidden,
          categoryIds: Array.from(catSet),
          primaryCategoryId: sel.primaryCategoryId,
          profiles,
          rules,
          children: childMap,
        };
      }

      for (const topSel of force.selections) {
        const ev = evalSelection(topSel, null, []);
        evaluatedSelections[topSel.instanceId] = ev;
        forcePoints += ev.totalPoints;

        for (const catId of new Set(ev.categoryIds)) {
          categoryCounts[catId] = (categoryCounts[catId] ?? 0) + ev.count;
          categoryPoints[catId] = (categoryPoints[catId] ?? 0) + ev.totalPoints;
        }
      }

      pointsByForce.set(force.id, forcePoints);
      totalRosterPoints += forcePoints;

      evaluatedForces[force.id] = {
        id: force.id,
        name: forceEntry.name,
        factionId: bundle.id,
        factionName: bundle.name,
        totalPoints: forcePoints,
        categoryPoints,
        categoryCounts,
        categoryLimits,
      };

      if (pass === 1) {
        for (const [catId, lim] of Object.entries(categoryLimits)) {
          const catName = system.categories[catId]?.name ?? catId;
          const cnt = categoryCounts[catId] ?? 0;
          const pts = categoryPoints[catId] ?? 0;

          if (lim.min !== undefined && cnt < lim.min) {
            issues.push({
              id: `${force.id}-${catId}-min`,
              severity: 'error',
              scopeName: `${forceEntry.name} (${catName})`,
              message: `Mindestens ${lim.min} Auswahl(en) erforderlich (aktuell: ${cnt}).`,
              forceId: force.id,
            });
          }
          if (lim.max !== undefined && lim.max >= 0 && cnt > lim.max) {
            issues.push({
              id: `${force.id}-${catId}-max`,
              severity: 'error',
              scopeName: `${forceEntry.name} (${catName})`,
              message: `Maximal ${lim.max} Auswahl(en) erlaubt (aktuell: ${cnt}).`,
              forceId: force.id,
            });
          }
          if (lim.maxPercent !== undefined && roster.pointsLimit > 0) {
            const pct = (pts / roster.pointsLimit) * 100;
            if (pct > lim.maxPercent) {
              issues.push({
                id: `${force.id}-${catId}-pct`,
                severity: 'error',
                scopeName: `${forceEntry.name} (${catName})`,
                message: `Maximal ${lim.maxPercent}% der Punktzahl erlaubt (aktuell: ${pts} Pkt = ${pct.toFixed(1)}%).`,
                forceId: force.id,
              });
            }
          }
        }
      }
    }
  }

  if (totalRosterPoints > roster.pointsLimit) {
    issues.unshift({
      id: 'roster-points-limit',
      severity: 'error',
      scopeName: roster.name,
      message: `Punktelimit überschritten: ${totalRosterPoints} / ${roster.pointsLimit} Pkt.`,
    });
  }

  return {
    totalPoints: totalRosterPoints,
    forces: evaluatedForces,
    selections: evaluatedSelections,
    issues,
  };
}

export function findForceEntry(forceEntries: ForceEntry[], id: string): ForceEntry | undefined {
  for (const fe of forceEntries) {
    if (fe.id === id) return fe;
    const nested = findForceEntry(fe.forceEntries, id);
    if (nested) return nested;
  }
  return undefined;
}
// ENDE rosterEngine.ts