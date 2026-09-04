import type { LegendRow } from '../types';

/** Human-readable shopping list. Duplicates are already consolidated by legend rows. */
export function buildThreadListText(legend: LegendRow[], projectName: string): string {
  const rows = legend.slice().sort((a, b) => b.areaMm2 - a.areaMm2);
  const lines = [`${projectName} — DMC thread list`, ''];
  for (const row of rows) {
    const share = Math.round(row.share * 100);
    lines.push(`DMC ${row.thread.number.padEnd(6)} ${row.thread.name.padEnd(34)} ~${share}% of area, ${row.regionCount} region${row.regionCount === 1 ? '' : 's'}`);
  }
  lines.push('', `${rows.length} colours. Area shares are approximate.`);
  return lines.join('\n') + '\n';
}

export function buildThreadListCsv(legend: LegendRow[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = ['legend_index,dmc,name,hex,regions,area_mm2,share'];
  for (const row of legend) {
    lines.push([row.index, esc(row.thread.number), esc(row.thread.name), row.thread.hex, row.regionCount, row.areaMm2.toFixed(1), row.share.toFixed(4)].join(','));
  }
  return lines.join('\n') + '\n';
}
