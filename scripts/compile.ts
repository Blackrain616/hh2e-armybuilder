import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import type {
  CategoryEntry,
  CategoryLink,
  Condition,
  ConditionGroup,
  Constraint,
  Cost,
  EntryLink,
  FactionBundle,
  ForceEntry,
  InfoLink,
  Modifier,
  ModifierGroup,
  Profile,
  ProfileType,
  Repeat,
  Rule,
  SelectionEntry,
  SelectionEntryGroup,
  SystemIndex,
} from '../src/types/data';

const DATA_RAW_DIR = path.resolve('data-raw');
const OUT_DIR = path.resolve('public/data');
const OUT_FACTIONS_DIR = path.join(OUT_DIR, 'factions');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  trimValues: true,
});

function asArray<T>(val: T | T[] | undefined): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function asBool(val: unknown): boolean {
  return val === 'true' || val === true;
}

function asNum(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function parseCosts(node: any): Cost[] {
  return asArray(node?.costs?.cost).map((c: any) => ({
    name: String(c['@_name'] ?? ''),
    typeId: String(c['@_typeId'] ?? ''),
    value: asNum(c['@_value'], 0),
  }));
}

function parseConditions(node: any): Condition[] {
  return asArray(node?.conditions?.condition).map((c: any) => ({
    type: c['@_type'],
    value: asNum(c['@_value'], 0),
    field: String(c['@_field'] ?? ''),
    scope: String(c['@_scope'] ?? ''),
    ...(c['@_childId'] ? { childId: String(c['@_childId']) } : {}),
    ...(c['@_shared'] !== undefined ? { shared: asBool(c['@_shared']) } : {}),
    ...(c['@_includeChildSelections'] !== undefined
      ? { includeChildSelections: asBool(c['@_includeChildSelections']) }
      : {}),
    ...(c['@_includeChildForces'] !== undefined
      ? { includeChildForces: asBool(c['@_includeChildForces']) }
      : {}),
    ...(c['@_percentValue'] !== undefined ? { percentValue: asBool(c['@_percentValue']) } : {}),
  }));
}

function parseConditionGroups(node: any): ConditionGroup[] {
  return asArray(node?.conditionGroups?.conditionGroup).map((g: any) => ({
    type: g['@_type'] === 'or' ? 'or' : 'and',
    conditions: parseConditions(g),
    conditionGroups: parseConditionGroups(g),
  }));
}

function parseRepeats(node: any): Repeat[] {
  return asArray(node?.repeats?.repeat).map((r: any) => ({
    value: asNum(r['@_value'], 1),
    repeats: asNum(r['@_repeats'], 1),
    field: String(r['@_field'] ?? ''),
    scope: String(r['@_scope'] ?? ''),
    ...(r['@_childId'] ? { childId: String(r['@_childId']) } : {}),
    ...(r['@_shared'] !== undefined ? { shared: asBool(r['@_shared']) } : {}),
    ...(r['@_roundUp'] !== undefined ? { roundUp: asBool(r['@_roundUp']) } : {}),
    ...(r['@_includeChildSelections'] !== undefined
      ? { includeChildSelections: asBool(r['@_includeChildSelections']) }
      : {}),
    ...(r['@_includeChildForces'] !== undefined
      ? { includeChildForces: asBool(r['@_includeChildForces']) }
      : {}),
    ...(r['@_percentValue'] !== undefined ? { percentValue: asBool(r['@_percentValue']) } : {}),
  }));
}

function parseModifiers(node: any): Modifier[] {
  return asArray(node?.modifiers?.modifier).map((m: any) => ({
    type: m['@_type'],
    field: String(m['@_field'] ?? ''),
    value: String(m['@_value'] ?? ''),
    conditions: parseConditions(m),
    conditionGroups: parseConditionGroups(m),
    repeats: parseRepeats(m),
  }));
}

function parseModifierGroups(node: any): ModifierGroup[] {
  return asArray(node?.modifierGroups?.modifierGroup).map((mg: any) => ({
    conditions: parseConditions(mg),
    conditionGroups: parseConditionGroups(mg),
    repeats: parseRepeats(mg),
    modifiers: parseModifiers(mg),
    modifierGroups: parseModifierGroups(mg),
  }));
}

function parseConstraints(node: any): Constraint[] {
  return asArray(node?.constraints?.constraint).map((c: any) => ({
    id: String(c['@_id'] ?? ''),
    type: c['@_type'] === 'min' ? 'min' : 'max',
    value: asNum(c['@_value'], 0),
    field: String(c['@_field'] ?? ''),
    scope: String(c['@_scope'] ?? ''),
    ...(c['@_shared'] !== undefined ? { shared: asBool(c['@_shared']) } : {}),
    ...(c['@_percentValue'] !== undefined ? { percentValue: asBool(c['@_percentValue']) } : {}),
    ...(c['@_includeChildSelections'] !== undefined
      ? { includeChildSelections: asBool(c['@_includeChildSelections']) }
      : {}),
    ...(c['@_includeChildForces'] !== undefined
      ? { includeChildForces: asBool(c['@_includeChildForces']) }
      : {}),
  }));
}

function parseCategoryLinks(node: any): CategoryLink[] {
  return asArray(node?.categoryLinks?.categoryLink).map((cl: any) => ({
    id: String(cl['@_id'] ?? ''),
    name: String(cl['@_name'] ?? ''),
    targetId: String(cl['@_targetId'] ?? ''),
    primary: asBool(cl['@_primary']),
    constraints: parseConstraints(cl),
    modifiers: parseModifiers(cl),
    modifierGroups: parseModifierGroups(cl),
  }));
}

function parseInfoLinks(node: any): InfoLink[] {
  return asArray(node?.infoLinks?.infoLink).map((il: any) => ({
    id: String(il['@_id'] ?? ''),
    name: String(il['@_name'] ?? ''),
    targetId: String(il['@_targetId'] ?? ''),
    type: il['@_type'],
    ...(asBool(il['@_hidden']) ? { hidden: true } : {}),
    modifiers: parseModifiers(il),
    modifierGroups: parseModifierGroups(il),
  }));
}

function parseProfile(p: any): Profile {
  return {
    id: String(p['@_id'] ?? ''),
    name: String(p['@_name'] ?? ''),
    typeId: String(p['@_typeId'] ?? ''),
    typeName: String(p['@_typeName'] ?? ''),
    ...(asBool(p['@_hidden']) ? { hidden: true } : {}),
    ...(p['@_publicationId'] ? { publicationId: String(p['@_publicationId']) } : {}),
    ...(p['@_page'] ? { page: String(p['@_page']) } : {}),
    characteristics: asArray(p?.characteristics?.characteristic).map((ch: any) => ({
      name: String(ch['@_name'] ?? ''),
      typeId: String(ch['@_typeId'] ?? ''),
      value: String(ch['#text'] ?? ''),
    })),
    modifiers: parseModifiers(p),
    modifierGroups: parseModifierGroups(p),
  };
}

function parseRule(r: any): Rule {
  return {
    id: String(r['@_id'] ?? ''),
    name: String(r['@_name'] ?? ''),
    ...(asBool(r['@_hidden']) ? { hidden: true } : {}),
    ...(r['@_publicationId'] ? { publicationId: String(r['@_publicationId']) } : {}),
    ...(r['@_page'] ? { page: String(r['@_page']) } : {}),
    description: String(r.description ?? ''),
    modifiers: parseModifiers(r),
    modifierGroups: parseModifierGroups(r),
  };
}

function parseEntryLink(el: any): EntryLink {
  return {
    id: String(el['@_id'] ?? ''),
    name: String(el['@_name'] ?? ''),
    targetId: String(el['@_targetId'] ?? ''),
    type: el['@_type'] === 'selectionEntryGroup' ? 'selectionEntryGroup' : 'selectionEntry',
    ...(asBool(el['@_hidden']) ? { hidden: true } : {}),
    ...(asBool(el['@_collective']) ? { collective: true } : {}),
    ...(el['@_import'] !== undefined ? { import: asBool(el['@_import']) } : {}),
    costs: parseCosts(el),
    constraints: parseConstraints(el),
    categoryLinks: parseCategoryLinks(el),
    infoLinks: parseInfoLinks(el),
    profiles: asArray(el?.profiles?.profile).map(parseProfile),
    rules: asArray(el?.rules?.rule).map(parseRule),
    modifiers: parseModifiers(el),
    modifierGroups: parseModifierGroups(el),
  };
}

function parseSelectionEntry(se: any): SelectionEntry {
  return {
    id: String(se['@_id'] ?? ''),
    name: String(se['@_name'] ?? ''),
    type: se['@_type'] || 'upgrade',
    ...(asBool(se['@_hidden']) ? { hidden: true } : {}),
    ...(asBool(se['@_collective']) ? { collective: true } : {}),
    ...(se['@_import'] !== undefined ? { import: asBool(se['@_import']) } : {}),
    ...(se['@_publicationId'] ? { publicationId: String(se['@_publicationId']) } : {}),
    ...(se['@_page'] ? { page: String(se['@_page']) } : {}),
    costs: parseCosts(se),
    constraints: parseConstraints(se),
    categoryLinks: parseCategoryLinks(se),
    infoLinks: parseInfoLinks(se),
    profiles: asArray(se?.profiles?.profile).map(parseProfile),
    rules: asArray(se?.rules?.rule).map(parseRule),
    modifiers: parseModifiers(se),
    modifierGroups: parseModifierGroups(se),
    selectionEntries: asArray(se?.selectionEntries?.selectionEntry).map(parseSelectionEntry),
    selectionEntryGroups: asArray(se?.selectionEntryGroups?.selectionEntryGroup).map(parseSelectionEntryGroup),
    entryLinks: asArray(se?.entryLinks?.entryLink).map(parseEntryLink),
  };
}

function parseSelectionEntryGroup(sg: any): SelectionEntryGroup {
  return {
    id: String(sg['@_id'] ?? ''),
    name: String(sg['@_name'] ?? ''),
    ...(asBool(sg['@_hidden']) ? { hidden: true } : {}),
    ...(asBool(sg['@_collective']) ? { collective: true } : {}),
    ...(sg['@_import'] !== undefined ? { import: asBool(sg['@_import']) } : {}),
    ...(sg['@_defaultSelectionEntryId'] ? { defaultSelectionEntryId: String(sg['@_defaultSelectionEntryId']) } : {}),
    constraints: parseConstraints(sg),
    categoryLinks: parseCategoryLinks(sg),
    infoLinks: parseInfoLinks(sg),
    profiles: asArray(sg?.profiles?.profile).map(parseProfile),
    rules: asArray(sg?.rules?.rule).map(parseRule),
    modifiers: parseModifiers(sg),
    modifierGroups: parseModifierGroups(sg),
    selectionEntries: asArray(sg?.selectionEntries?.selectionEntry).map(parseSelectionEntry),
    selectionEntryGroups: asArray(sg?.selectionEntryGroups?.selectionEntryGroup).map(parseSelectionEntryGroup),
    entryLinks: asArray(sg?.entryLinks?.entryLink).map(parseEntryLink),
  };
}

function parseForceEntry(fe: any): ForceEntry {
  return {
    id: String(fe['@_id'] ?? ''),
    name: String(fe['@_name'] ?? ''),
    ...(asBool(fe['@_hidden']) ? { hidden: true } : {}),
    categoryLinks: parseCategoryLinks(fe),
    constraints: parseConstraints(fe),
    modifiers: parseModifiers(fe),
    modifierGroups: parseModifierGroups(fe),
    forceEntries: asArray(fe?.forceEntries?.forceEntry).map(parseForceEntry),
  };
}

function parseCategoryEntry(ce: any): CategoryEntry {
  return {
    id: String(ce['@_id'] ?? ''),
    name: String(ce['@_name'] ?? ''),
    ...(asBool(ce['@_hidden']) ? { hidden: true } : {}),
    constraints: parseConstraints(ce),
    modifiers: parseModifiers(ce),
    modifierGroups: parseModifierGroups(ce),
  };
}

interface ParsedCatalogue {
  id: string;
  name: string;
  revision: string;
  isLibrary: boolean;
  catalogueLinks: Array<{ targetId: string; importRootEntries: boolean }>;
  rootEntries: SelectionEntry[];
  rootLinks: EntryLink[];
  sharedEntries: SelectionEntry[];
  sharedGroups: SelectionEntryGroup[];
  sharedProfiles: Profile[];
  sharedRules: Rule[];
}

function main() {
  fs.mkdirSync(OUT_FACTIONS_DIR, { recursive: true });

  const files = fs.readdirSync(DATA_RAW_DIR).filter((f) => f.endsWith('.gst') || f.endsWith('.cat'));

  const globalEntries = new Map<string, SelectionEntry>();
  const globalGroups = new Map<string, SelectionEntryGroup>();
  const globalProfiles = new Map<string, Profile>();
  const globalRules = new Map<string, Rule>();
  const categories: Record<string, CategoryEntry> = {};
  const publications: Record<string, string> = {};
  const costTypes: Array<{ id: string; name: string }> = [];
  const profileTypes: ProfileType[] = [];
  const forceEntries: ForceEntry[] = [];

  let gstMeta = { id: '', name: '', revision: '' };
  let gstRootEntries: SelectionEntry[] = [];
  let gstRootLinks: EntryLink[] = [];
  const parsedCatalogues = new Map<string, ParsedCatalogue>();

  function indexEntryRecursively(entry: SelectionEntry) {
    globalEntries.set(entry.id, entry);
    entry.profiles.forEach((p) => globalProfiles.set(p.id, p));
    entry.rules.forEach((r) => globalRules.set(r.id, r));
    entry.selectionEntries.forEach(indexEntryRecursively);
    entry.selectionEntryGroups.forEach(indexGroupRecursively);
  }

  function indexGroupRecursively(group: SelectionEntryGroup) {
    globalGroups.set(group.id, group);
    group.profiles.forEach((p) => globalProfiles.set(p.id, p));
    group.rules.forEach((r) => globalRules.set(r.id, r));
    group.selectionEntries.forEach(indexEntryRecursively);
    group.selectionEntryGroups.forEach(indexGroupRecursively);
  }

  function indexRawRulesAndProfiles(node: unknown, currentTag = '') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) indexRawRulesAndProfiles(item, currentTag);
      return;
    }
    const obj = node as Record<string, any>;
    if (currentTag === 'rule' && obj['@_id']) {
      const r = parseRule(obj);
      globalRules.set(r.id, r);
    } else if (currentTag === 'profile' && obj['@_id']) {
      const p = parseProfile(obj);
      globalProfiles.set(p.id, p);
    }
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('@_') || k === '#text' || k === '?xml') continue;
      indexRawRulesAndProfiles(v, k);
    }
  }

  // 1. Alle Dateien einlesen und global indexieren
  for (const file of files) {
    const xml = fs.readFileSync(path.join(DATA_RAW_DIR, file), 'utf8');
    const parsed = parser.parse(xml) as Record<string, any>;
    const isGst = Boolean(parsed.gameSystem);
    const root = isGst ? parsed.gameSystem : parsed.catalogue;
    if (!root) continue;

    indexRawRulesAndProfiles(root);

    for (const pub of asArray(root.publications?.publication)) {
      publications[String(pub['@_id'])] = String(pub['@_name'] ?? '');
    }
    for (const ct of asArray(root.costTypes?.costType)) {
      costTypes.push({ id: String(ct['@_id']), name: String(ct['@_name'] ?? '') });
    }
    for (const pt of asArray(root.profileTypes?.profileType)) {
      profileTypes.push({
        id: String(pt['@_id']),
        name: String(pt['@_name'] ?? ''),
        characteristics: asArray(pt?.characteristicTypes?.characteristicType).map((c: any) => ({
          id: String(c['@_id']),
          name: String(c['@_name'] ?? ''),
        })),
      });
    }
    for (const ce of asArray(root.categoryEntries?.categoryEntry)) {
      const cat = parseCategoryEntry(ce);
      categories[cat.id] = cat;
    }
    for (const fe of asArray(root.forceEntries?.forceEntry)) {
      forceEntries.push(parseForceEntry(fe));
    }

    const sharedEntries = asArray(root.sharedSelectionEntries?.selectionEntry).map(parseSelectionEntry);
    const sharedGroups = asArray(root.sharedSelectionEntryGroups?.selectionEntryGroup).map(parseSelectionEntryGroup);
    const sharedProfiles = asArray(root.sharedProfiles?.profile).map(parseProfile);
    const sharedRules = asArray(root.sharedRules?.rule).map(parseRule);
    const rootEntries = asArray(root.selectionEntries?.selectionEntry).map(parseSelectionEntry);
    const rootLinks = asArray(root.entryLinks?.entryLink).map(parseEntryLink);

    sharedEntries.forEach(indexEntryRecursively);
    sharedGroups.forEach(indexGroupRecursively);
    rootEntries.forEach(indexEntryRecursively);
    sharedProfiles.forEach((p) => globalProfiles.set(p.id, p));
    sharedRules.forEach((r) => globalRules.set(r.id, r));
    asArray(root.profiles?.profile).map(parseProfile).forEach((p) => globalProfiles.set(p.id, p));
    asArray(root.rules?.rule).map(parseRule).forEach((r) => globalRules.set(r.id, r));

    if (isGst) {
      gstMeta = {
        id: String(root['@_id'] ?? ''),
        name: String(root['@_name'] ?? ''),
        revision: String(root['@_revision'] ?? ''),
      };
      gstRootEntries = rootEntries;
      gstRootLinks = rootLinks;
    } else {
      const id = String(root['@_id'] ?? '');
      parsedCatalogues.set(id, {
        id,
        name: String(root['@_name'] ?? ''),
        revision: String(root['@_revision'] ?? ''),
        isLibrary: asBool(root['@_library']),
        catalogueLinks: asArray(root.catalogueLinks?.catalogueLink).map((l: any) => ({
          targetId: String(l['@_targetId'] ?? ''),
          importRootEntries: asBool(l['@_importRootEntries']),
        })),
        rootEntries,
        rootLinks,
        sharedEntries,
        sharedGroups,
        sharedProfiles,
        sharedRules,
      });
    }
  }

  // 2. Pro spielbarer Fraktion ein dedupliziertes JSON-Paket erzeugen
  const factionList: SystemIndex['factions'] = [];
  const unresolvedTargets = new Set<string>();

  for (const cat of parsedCatalogues.values()) {
    const collectedRootEntries: SelectionEntry[] = [];
    const collectedRootLinks: EntryLink[] = [];
    const visitedCats = new Set<string>();

    function collectCatalogRoots(catId: string) {
      if (visitedCats.has(catId)) return;
      visitedCats.add(catId);
      const c = parsedCatalogues.get(catId);
      if (!c) return;

      collectedRootEntries.push(...c.rootEntries);
      collectedRootLinks.push(...c.rootLinks);

      for (const link of c.catalogueLinks) {
        if (link.importRootEntries) {
          collectCatalogRoots(link.targetId);
        }
      }
    }

    collectCatalogRoots(cat.id);

    if (cat.isLibrary || (collectedRootEntries.length === 0 && collectedRootLinks.length === 0)) {
      console.log(`⏭️  Überspringe Bibliothek: ${cat.name}`);
      continue;
    }

    // Systemweite .gst Root-Auswahlen (Allegiance, Expanded Army Lists, Fortifications) mit aufnehmen
    collectedRootEntries.push(...gstRootEntries);
    collectedRootLinks.push(...gstRootLinks);

    const bundleSharedEntries: Record<string, SelectionEntry> = {};
    const bundleSharedGroups: Record<string, SelectionEntryGroup> = {};
    const bundleProfiles: Record<string, Profile> = {};
    const bundleRules: Record<string, Rule> = {};

    const visitedEntryIds = new Set<string>();
    const visitedGroupIds = new Set<string>();

    function resolveInfoLinks(links: InfoLink[]) {
      for (const il of links) {
        if (il.type === 'profile') {
          const p = globalProfiles.get(il.targetId);
          if (p) bundleProfiles[p.id] = p;
          else unresolvedTargets.add(`profile:${il.targetId} (${il.name})`);
        } else if (il.type === 'rule') {
          const r = globalRules.get(il.targetId);
          if (r) bundleRules[r.id] = r;
          else unresolvedTargets.add(`rule:${il.targetId} (${il.name})`);
        }
      }
    }

    function resolveEntryLinks(links: EntryLink[]) {
      for (const el of links) {
        resolveInfoLinks(el.infoLinks);
        if (el.type === 'selectionEntry') {
          const target = globalEntries.get(el.targetId);
          if (target) {
            bundleSharedEntries[target.id] = target;
            traverseEntry(target);
          } else {
            unresolvedTargets.add(`selectionEntry:${el.targetId} (${el.name})`);
          }
        } else {
          const target = globalGroups.get(el.targetId);
          if (target) {
            bundleSharedGroups[target.id] = target;
            traverseGroup(target);
          } else {
            unresolvedTargets.add(`selectionEntryGroup:${el.targetId} (${el.name})`);
          }
        }
      }
    }

    function traverseEntry(entry: SelectionEntry) {
      if (visitedEntryIds.has(entry.id)) return;
      visitedEntryIds.add(entry.id);
      resolveInfoLinks(entry.infoLinks);
      resolveEntryLinks(entry.entryLinks);
      entry.selectionEntries.forEach(traverseEntry);
      entry.selectionEntryGroups.forEach(traverseGroup);
    }

    function traverseGroup(group: SelectionEntryGroup) {
      if (visitedGroupIds.has(group.id)) return;
      visitedGroupIds.add(group.id);
      resolveInfoLinks(group.infoLinks);
      resolveEntryLinks(group.entryLinks);
      group.selectionEntries.forEach(traverseEntry);
      group.selectionEntryGroups.forEach(traverseGroup);
    }

    collectedRootEntries.forEach(traverseEntry);
    resolveEntryLinks(collectedRootLinks);

    const bundle: FactionBundle = {
      id: cat.id,
      name: cat.name,
      revision: cat.revision,
      rootEntries: collectedRootEntries,
      rootLinks: collectedRootLinks,
      sharedEntries: bundleSharedEntries,
      sharedGroups: bundleSharedGroups,
      profiles: bundleProfiles,
      rules: bundleRules,
    };

    const fileName = `${cat.id}.json`;
    const jsonStr = JSON.stringify(bundle);
    fs.writeFileSync(path.join(OUT_FACTIONS_DIR, fileName), jsonStr, 'utf8');
    const sizeKB = Math.round(Buffer.byteLength(jsonStr, 'utf8') / 1024);

    factionList.push({
      id: cat.id,
      name: cat.name,
      revision: cat.revision,
      file: `factions/${fileName}`,
      sizeKB,
    });
  }

  factionList.sort((a, b) => a.name.localeCompare(b.name));

  const systemIndex: SystemIndex = {
    gameSystem: {
      ...gstMeta,
      costTypes,
      profileTypes,
      categories,
      forceEntries,
      publications,
    },
    factions: factionList,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(systemIndex), 'utf8');
  const indexKB = Math.round(fs.statSync(path.join(OUT_DIR, 'index.json')).size / 1024);

  console.log(`\n✅ Kompilierung abgeschlossen!`);
  console.log(`   System-Index: public/data/index.json (${indexKB} KB)`);
  console.log(`   Spielbare Fraktionen: ${factionList.length}`);

  if (unresolvedTargets.size > 0) {
    console.log(`\n⚠️  Nicht aufgelöste Ziel-IDs (${unresolvedTargets.size}):`);
    console.log(Array.from(unresolvedTargets).slice(0, 20));
  }
}

main();