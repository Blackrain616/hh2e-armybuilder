import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';

const DATA_DIR = path.resolve('data-raw');
const REPORT_FILE = path.resolve('analysis-report.json');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false, // IDs und Strings (z.B. "3+") unverändert lassen
  trimValues: true,
});

function incrementCounter(map: Record<string, number>, key: string | undefined) {
  const k = key || '(leer)';
  map[k] = (map[k] || 0) + 1;
}

function asArray<T>(val: T | T[] | undefined): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

interface CatalogueSummary {
  file: string;
  kind: 'gst' | 'cat';
  id: string;
  name: string;
  revision: string;
  gameSystemId?: string;
  linksToCatalogues: Array<{ name: string; targetId: string; importRootEntries: string }>;
  sizeKB: number;
}

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`Fehler: Ordner "${DATA_DIR}" nicht gefunden.`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.gst') || f.endsWith('.cat'))
    .sort();

  if (files.length === 0) {
    console.error(`Keine .gst oder .cat Dateien in "${DATA_DIR}" gefunden!`);
    process.exit(1);
  }

  console.log(`Gefundene Dateien: ${files.length}. Starte Analyse...\n`);

  const catalogues: CatalogueSummary[] = [];
  const stats = {
    costTypes: new Map<string, string>(),
    tagCounts: {} as Record<string, number>,
    modifierTypes: {} as Record<string, number>,
    modifierFields: {} as Record<string, number>,
    conditionTypes: {} as Record<string, number>,
    conditionScopes: {} as Record<string, number>,
    conditionFields: {} as Record<string, number>,
    conditionGroupTypes: {} as Record<string, number>,
    constraintTypes: {} as Record<string, number>,
    constraintScopes: {} as Record<string, number>,
    constraintFields: {} as Record<string, number>,
    repeatScopes: {} as Record<string, number>,
    repeatFields: {} as Record<string, number>,
  };

  function walkNode(node: unknown, currentTag: string) {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      for (const item of node) {
        walkNode(item, currentTag);
      }
      return;
    }

    const obj = node as Record<string, unknown>;
    if (currentTag) {
      incrementCounter(stats.tagCounts, currentTag);
    }

    // Relevante Regel-Konstrukte erfassen
    if (currentTag === 'costType') {
      const id = String(obj['@_id'] ?? '');
      const name = String(obj['@_name'] ?? '');
      if (id) stats.costTypes.set(id, name);
    } else if (currentTag === 'modifier') {
      incrementCounter(stats.modifierTypes, obj['@_type'] as string);
      incrementCounter(stats.modifierFields, obj['@_field'] as string);
    } else if (currentTag === 'condition') {
      incrementCounter(stats.conditionTypes, obj['@_type'] as string);
      incrementCounter(stats.conditionScopes, obj['@_scope'] as string);
      incrementCounter(stats.conditionFields, obj['@_field'] as string);
    } else if (currentTag === 'conditionGroup') {
      incrementCounter(stats.conditionGroupTypes, obj['@_type'] as string);
    } else if (currentTag === 'constraint') {
      incrementCounter(stats.constraintTypes, obj['@_type'] as string);
      incrementCounter(stats.constraintScopes, obj['@_scope'] as string);
      incrementCounter(stats.constraintFields, obj['@_field'] as string);
    } else if (currentTag === 'repeat') {
      incrementCounter(stats.repeatScopes, obj['@_scope'] as string);
      incrementCounter(stats.repeatFields, obj['@_field'] as string);
    }

    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('@_') || key === '#text' || key === '?xml') continue;
      walkNode(value, key);
    }
  }

  for (const file of files) {
    const fullPath = path.join(DATA_DIR, file);
    const xml = fs.readFileSync(fullPath, 'utf8');
    const sizeKB = Math.round(Buffer.byteLength(xml, 'utf8') / 1024);
    const parsed = parser.parse(xml) as Record<string, any>;

    const isGst = Boolean(parsed.gameSystem);
    const root = isGst ? parsed.gameSystem : parsed.catalogue;

    if (!root) {
      console.warn(`Warnung: "${file}" hat kein <gameSystem> oder <catalogue> Root-Tag.`);
      continue;
    }

    const catLinks = asArray(root.catalogueLinks?.catalogueLink).map((link: any) => ({
      name: String(link['@_name'] ?? ''),
      targetId: String(link['@_targetId'] ?? ''),
      importRootEntries: String(link['@_importRootEntries'] ?? 'false'),
    }));

    catalogues.push({
      file,
      kind: isGst ? 'gst' : 'cat',
      id: String(root['@_id'] ?? ''),
      name: String(root['@_name'] ?? ''),
      revision: String(root['@_revision'] ?? ''),
      gameSystemId: root['@_gameSystemId'] ? String(root['@_gameSystemId']) : undefined,
      linksToCatalogues: catLinks,
      sizeKB,
    });

    walkNode(parsed, '');
  }

  // Prüfen, ob alle verlinkten Kataloge auch vorhanden sind
  const availableIds = new Set(catalogues.map((c) => c.id));
  const missingLinks: Array<{ sourceFile: string; missingName: string; missingId: string }> = [];

  for (const cat of catalogues) {
    for (const link of cat.linksToCatalogues) {
      if (!availableIds.has(link.targetId)) {
        missingLinks.push({
          sourceFile: cat.file,
          missingName: link.name,
          missingId: link.targetId,
        });
      }
    }
  }

  const report = {
    summary: {
      totalFiles: catalogues.length,
      gstCount: catalogues.filter((c) => c.kind === 'gst').length,
      catCount: catalogues.filter((c) => c.kind === 'cat').length,
      totalSizeKB: catalogues.reduce((sum, c) => sum + c.sizeKB, 0),
      missingCatalogueLinks: missingLinks,
    },
    costTypes: Object.fromEntries(stats.costTypes),
    catalogues,
    mechanicsUsed: {
      modifierTypes: stats.modifierTypes,
      modifierFields: stats.modifierFields,
      conditionTypes: stats.conditionTypes,
      conditionScopes: stats.conditionScopes,
      conditionFields: stats.conditionFields,
      conditionGroupTypes: stats.conditionGroupTypes,
      constraintTypes: stats.constraintTypes,
      constraintScopes: stats.constraintScopes,
      constraintFields: stats.constraintFields,
      repeatScopes: stats.repeatScopes,
      repeatFields: stats.repeatFields,
    },
    tagCounts: stats.tagCounts,
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');

  // Kompakte Konsolenausgabe
  console.log('=== ÜBERSICHT ===');
  console.log(`Dateien gesamt: ${report.summary.totalFiles} (${report.summary.gstCount} .gst, ${report.summary.catCount} .cat)`);
  console.log(`Gesamtgröße XML: ${(report.summary.totalSizeKB / 1024).toFixed(2)} MB`);
  console.log('Punkte-/Kosten-Typen:', report.costTypes);

  if (missingLinks.length > 0) {
    console.log('\n⚠️ FEHLENDE KATALOG-VERKNÜPFUNGEN:');
    console.table(missingLinks);
  } else {
    console.log('\n✅ Alle Katalog-Verknüpfungen (catalogueLinks) sind vollständig vorhanden!');
  }

  console.log('\n=== VERWENDETE MODIFIER-TYPEN ===');
  console.log(stats.modifierTypes);

  console.log('\n=== VERWENDETE CONDITION-TYPEN & SCOPES ===');
  console.log('Typen:', stats.conditionTypes);
  console.log('Scopes:', stats.conditionScopes);

  console.log('\n=== VERWENDETE CONSTRAINT-TYPEN & SCOPES ===');
  console.log('Typen:', stats.constraintTypes);
  console.log('Scopes:', stats.constraintScopes);

  console.log(`\nVollständiger Bericht gespeichert unter: ${REPORT_FILE}`);
}

main();