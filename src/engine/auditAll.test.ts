import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FactionBundle, SystemIndex } from '../types/data';
import type { Roster, RosterSelection } from '../types/roster';
import { getVisibleRootEntriesForForce } from './rosterActions';
import { evaluateRoster, findEntryDefinition, instantiateSelection, type ResolvedCatalogEntry } from './rosterEngine';

describe('Vollprüfung aller 29 Horus-Heresy-Fraktionen', () => {
  const indexPath = path.resolve('public/data/index.json');
  const systemIndex: SystemIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

  it('instanziiert und evaluiert jede sichtbare Einheit in allen 29 Fraktionen fehlerfrei', () => {
    const crusadeFoc =
      systemIndex.gameSystem.forceEntries.find((f) => f.name.includes('Crusade')) ??
      systemIndex.gameSystem.forceEntries[0];

    let totalUnitsChecked = 0;
    const unresolvedChildren: string[] = [];
    const nanUnits: string[] = [];
    const zeroPointCombatUnits: string[] = [];

    const ignoredZeroNames = [
      'Allegiance',
      'Expanded Army List Profiles:',
      'The Rewards Of Treachery',
      'Blackshield Oaths',
      'Provenances of War',
    ];

    for (const faction of systemIndex.factions) {
      const bundle: FactionBundle = JSON.parse(
        fs.readFileSync(path.resolve('public/data', faction.file), 'utf8')
      );

      const roster: Roster = {
        id: `audit-${faction.id}`,
        name: `Audit ${faction.name}`,
        pointsLimit: 100000,
        forces: [
          {
            id: 'force-1',
            forceEntryId: crusadeFoc.id,
            factionId: bundle.id,
            selections: [],
          },
        ],
      };

      const visible = getVisibleRootEntriesForForce(
        roster,
        roster.forces[0],
        bundle,
        systemIndex.gameSystem
      );

      function checkChildrenResolved(
        sel: RosterSelection,
        parentDef: ResolvedCatalogEntry | null,
        unitLabel: string
      ) {
        const def = findEntryDefinition(sel, parentDef, bundle);
        if (!def) {
          unresolvedChildren.push(`${faction.name} -> ${unitLabel} -> Kind-ID ${sel.targetEntryId}`);
          return;
        }
        for (const child of sel.selections) {
          checkChildrenResolved(child, def, unitLabel);
        }
      }

      for (const item of visible) {
        totalUnitsChecked++;
        const sel = instantiateSelection(item.resolved, bundle, {
          primaryCategoryId: item.primaryCategoryId,
        });
        checkChildrenResolved(sel, null, item.resolved.name);

        if (!Number.isFinite(item.points) || item.points < 0) {
          nanUnits.push(`${faction.name} -> ${item.resolved.name}: ${item.points}`);
        }

        const catName = systemIndex.gameSystem.categories[item.primaryCategoryId]?.name ?? '';
        const isConfigCat =
          catName.includes('Allegiance') ||
          catName.includes('Rite of War') ||
          catName.includes('Expanded') ||
          catName.includes('Oaths') ||
          catName.includes('Treachery') ||
          catName.includes('Provenances') ||
          ignoredZeroNames.some((n) => item.resolved.name.includes(n));

        if (
          (item.resolved.type === 'unit' || item.resolved.type === 'model') &&
          item.points === 0 &&
          !isConfigCat
        ) {
          zeroPointCombatUnits.push(`${faction.name} -> ${item.resolved.name} [${catName}]`);
        }

        roster.forces[0].selections.push(sel);
      }

      const evaluated = evaluateRoster(roster, systemIndex.gameSystem, { [bundle.id]: bundle });
      if (!Number.isFinite(evaluated.totalPoints)) {
        nanUnits.push(`${faction.name} -> Gesamt-Roster NaN`);
      }

      for (const sel of roster.forces[0].selections) {
        const ev = evaluated.selections[sel.instanceId];
        if (!ev || !Number.isFinite(ev.totalPoints)) {
          nanUnits.push(`${faction.name} -> Evaluated ${sel.targetEntryId} NaN`);
        }
      }
    }

    console.log(`\n📊 Audit abgeschlossen: ${totalUnitsChecked} Einheiten über ${systemIndex.factions.length} Fraktionen geprüft.`);
    console.log(`   Unaufgelöste Kinder: ${unresolvedChildren.length}`);
    console.log(`   Ungültige Punkte (NaN/<0): ${nanUnits.length}`);
    console.log(`   Kampf-Einheiten mit 0 Pkt: ${zeroPointCombatUnits.length}`);
    if (zeroPointCombatUnits.length > 0) {
      console.log('   Beispiele (0 Pkt):', zeroPointCombatUnits.slice(0, 15));
    }

    expect(totalUnitsChecked).toBeGreaterThan(500);
    expect(unresolvedChildren).toEqual([]);
    expect(nanUnits).toEqual([]);
  });
});
// ENDE auditAll.test.ts