import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FactionBundle, SystemIndex } from '../types/data';
import type { Roster } from '../types/roster';
import { getVisibleRootEntriesForForce } from './rosterActions';
import { evaluateRoster, instantiateSelection } from './rosterEngine';

describe('Horus Heresy 2e Regel-Engine', () => {
  const indexPath = path.resolve('public/data/index.json');
  const systemIndex: SystemIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

  it('lädt das Grundsystem und alle 29 Fraktionen', () => {
    expect(systemIndex.gameSystem.name).toContain('Horus Heresy');
    expect(systemIndex.factions.length).toBe(29);
  });

  it('berechnet Tactical Squad (100), Heavy Support Squad (100) & Kratos (300) und filtert versteckte Regeln', () => {
    const sohMeta = systemIndex.factions.find((f) => f.name.includes('Sons of Horus')) ?? systemIndex.factions[0];
    const bundle: FactionBundle = JSON.parse(
      fs.readFileSync(path.resolve('public/data', sohMeta.file), 'utf8')
    );
    const crusadeFoc =
      systemIndex.gameSystem.forceEntries.find((f) => f.name.includes('Crusade')) ??
      systemIndex.gameSystem.forceEntries[0];

    const baseRoster: Roster = {
      id: 'test-roster',
      name: 'Test',
      pointsLimit: 3000,
      forces: [{ id: 'force-1', forceEntryId: crusadeFoc.id, factionId: bundle.id, selections: [] }],
    };

    const visible = getVisibleRootEntriesForForce(
      baseRoster,
      baseRoster.forces[0],
      bundle,
      systemIndex.gameSystem
    );

    const tac = visible.find((v) => v.resolved.name === 'Tactical Squad')!;
    const hss = visible.find((v) => v.resolved.name === 'Heavy Support Squad')!;
    const kratos = visible.find((v) => v.resolved.name === 'Kratos Squadron')!;

    expect(tac.points).toBe(100);
    expect(hss.points).toBe(100);
    expect(kratos.points).toBe(300);

    const tacSel = instantiateSelection(tac.resolved, bundle, {
      primaryCategoryId: tac.primaryCategoryId,
      roster: baseRoster,
      force: baseRoster.forces[0],
    });
    baseRoster.forces[0].selections.push(tacSel);

    const evaluated = evaluateRoster(baseRoster, systemIndex.gameSystem, { [bundle.id]: bundle });
    const ruleNames = evaluated.selections[tacSel.instanceId].rules.map((r) => r.name);

    expect(ruleNames).not.toContain('Outflank');
    expect(ruleNames).not.toContain('Support Squad');
  });

  it('berechnet Dark Angels Tactical Support Squad (85) und Tarantula Sentry Gun Battery (50) exakt', () => {
    const daMeta = systemIndex.factions.find((f) => f.name.includes('Dark Angels'))!;
    const bundle: FactionBundle = JSON.parse(
      fs.readFileSync(path.resolve('public/data', daMeta.file), 'utf8')
    );
    const crusadeFoc =
      systemIndex.gameSystem.forceEntries.find((f) => f.name.includes('Crusade')) ??
      systemIndex.gameSystem.forceEntries[0];

    const baseRoster: Roster = {
      id: 'test-da',
      name: 'Test DA',
      pointsLimit: 3000,
      forces: [{ id: 'force-1', forceEntryId: crusadeFoc.id, factionId: bundle.id, selections: [] }],
    };

    const visible = getVisibleRootEntriesForForce(
      baseRoster,
      baseRoster.forces[0],
      bundle,
      systemIndex.gameSystem
    );

    const tss = visible.find((v) => v.resolved.name === 'Tactical Support Squad')!;
    const tar = visible.find((v) => v.resolved.name === 'Tarantula Sentry Gun Battery')!;

    console.log('Dark Angels Punkte:', { TacticalSupportSquad: tss.points, Tarantula: tar.points });

    expect(tss.points).toBe(85);
    expect(tar.points).toBe(50);
  });
});
// ENDE engine.test.ts