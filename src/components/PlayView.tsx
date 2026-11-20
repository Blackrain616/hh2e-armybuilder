import { useState } from 'react';
import type { Profile, Rule, SystemIndex } from '../types/data';
import type { EvaluatedRoster, EvaluatedSelection, Roster, RosterSelection } from '../types/roster';

interface PlayViewProps {
  roster: Roster;
  evaluated: EvaluatedRoster;
  system: SystemIndex['gameSystem'];
}

function collectUnitDetails(ev: EvaluatedSelection): { profiles: Profile[]; rules: Rule[] } {
  const profs = new Map<string, Profile>();
  const rules = new Map<string, Rule>();

  function walk(node: EvaluatedSelection) {
    for (const p of node.profiles) {
      if (!p.hidden) profs.set(`${p.name}-${p.typeId}`, p);
    }
    for (const r of node.rules) {
      if (!r.hidden) rules.set(r.id, r);
    }
    Object.values(node.children).forEach(walk);
  }
  walk(ev);

  return { profiles: Array.from(profs.values()), rules: Array.from(rules.values()) };
}

function formatSelectionLines(
  sel: RosterSelection,
  ev: EvaluatedSelection,
  indent = 0
): string[] {
  const prefix = '  '.repeat(indent);
  const countStr = sel.count > 1 ? `${sel.count}x ` : '';
  const ptsStr = ev.totalPoints > 0 && indent === 0 ? ` [${ev.totalPoints} Pkt]` : '';
  const lines = [`${prefix}- ${countStr}${ev.name}${ptsStr}`];
  for (const child of sel.selections) {
    const childEv = ev.children[child.instanceId];
    if (childEv) lines.push(...formatSelectionLines(child, childEv, indent + 1));
  }
  return lines;
}

export function PlayView({ roster, evaluated, system }: PlayViewProps) {
  const [copied, setCopied] = useState(false);

  function copyAsText() {
    const out: string[] = [`++ ${roster.name} (${evaluated.totalPoints} / ${roster.pointsLimit} Pkt) ++`, ''];

    for (const force of roster.forces) {
      const evForce = evaluated.forces[force.id];
      if (!evForce) continue;
      out.push(`== ${evForce.name} (${evForce.factionName}) – ${evForce.totalPoints} Pkt ==`);
      for (const sel of force.selections) {
        const evSel = evaluated.selections[sel.instanceId];
        if (!evSel) continue;
        const catName = sel.primaryCategoryId ? system.categories[sel.primaryCategoryId]?.name : '';
        if (catName) out.push(`[${catName}]`);
        out.push(...formatSelectionLines(sel, evSel, 0));
      }
      out.push('');
    }

    void navigator.clipboard.writeText(out.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <div>
          <h2 className="text-xl font-bold text-amber-400">{roster.name}</h2>
          <p className="text-sm text-zinc-400">
            Spielmodus & Druckansicht •{' '}
            <span className="font-semibold text-zinc-100">
              {evaluated.totalPoints} / {roster.pointsLimit} Pkt
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copyAsText}
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-100 hover:bg-zinc-700"
          >
            {copied ? '✓ Kopiert!' : 'Als Text kopieren'}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded bg-amber-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
          >
            Drucken / PDF
          </button>
        </div>
      </div>

      {roster.forces.map((force) => {
        const evForce = evaluated.forces[force.id];
        if (!evForce) return null;

        return (
          <section key={force.id} className="space-y-4">
            <div className="border-b-2 border-amber-500/70 pb-1">
              <h3 className="text-lg font-bold">
                {evForce.factionName} – {evForce.name}
              </h3>
              <p className="text-sm text-zinc-400 print:text-zinc-700">{evForce.totalPoints} Pkt</p>
            </div>

            {force.selections.map((sel) => {
              const evSel = evaluated.selections[sel.instanceId];
              if (!evSel) return null;
              const catName = sel.primaryCategoryId
                ? system.categories[sel.primaryCategoryId]?.name
                : 'Einheit';
              const { profiles, rules } = collectUnitDetails(evSel);
              const byType = profiles.reduce<Record<string, Profile[]>>((acc, p) => {
                acc[p.typeName || 'Profil'] = acc[p.typeName || 'Profil'] ?? [];
                acc[p.typeName || 'Profil'].push(p);
                return acc;
              }, {});

              return (
                <div
                  key={sel.instanceId}
                  className="break-inside-avoid rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 print:border-zinc-300 print:bg-white"
                >
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <div>
                      <span className="mr-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] font-semibold text-amber-400 print:border print:border-zinc-400 print:bg-transparent print:text-black">
                        {catName}
                      </span>
                      <span className="text-base font-bold">{evSel.name}</span>
                    </div>
                    <span className="text-sm font-bold text-amber-400 print:text-black">
                      {evSel.totalPoints} Pkt
                    </span>
                  </div>

                  {sel.selections.length > 0 && (
                    <ul className="mb-3 space-y-0.5 pl-4 text-xs text-zinc-300 print:text-zinc-800">
                      {sel.selections.map((child) => {
                        const cEv = evSel.children[child.instanceId];
                        if (!cEv) return null;
                        return (
                          <li key={child.instanceId}>
                            • {child.count > 1 ? `${child.count}× ` : ''}
                            {cEv.name}
                            {child.selections.length > 0 && (
                              <span className="text-zinc-400 print:text-zinc-600">
                                {' '}
                                (
                                {child.selections
                                  .map((gc) => {
                                    const gEv = cEv.children[gc.instanceId];
                                    return gEv
                                      ? `${gc.count > 1 ? `${gc.count}× ` : ''}${gEv.name}`
                                      : '';
                                  })
                                  .filter(Boolean)
                                  .join(', ')}
                                )
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {Object.entries(byType).map(([typeName, list]) => (
                    <div key={typeName} className="mt-2 overflow-x-auto">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-zinc-700 text-zinc-400 print:border-zinc-300 print:text-zinc-700">
                            <th className="py-1 pr-2 font-semibold">{typeName}</th>
                            {list[0].characteristics.map((c) => (
                              <th key={c.typeId} className="px-1.5 py-1 font-semibold">
                                {c.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/70 print:divide-zinc-200">
                          {list.map((p) => (
                            <tr key={p.id}>
                              <td className="py-1 pr-2 font-medium">{p.name}</td>
                              {p.characteristics.map((c) => (
                                <td key={c.typeId} className="px-1.5 py-1">
                                  {c.value || '–'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}

                  {rules.length > 0 && (
                    <div className="mt-3 border-t border-zinc-800 pt-2 text-[11px] text-zinc-400 print:border-zinc-300 print:text-zinc-700">
                      <span className="font-semibold text-zinc-300 print:text-black">Regeln: </span>
                      {rules.map((r) => r.name).join(' • ')}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}