// Canonical SVG pattern document. Real geometry in millimetres, stable ids,
// per-region metadata, and a legend. Editable in any vector tool.
import type { LineLayer, Pattern, Point, RegionGraph, ThreadColor, ThreadPalette } from '../types';

export interface SvgOptions {
  mode: 'pattern' | 'color';
  showLabels: boolean;
  showHoop: boolean;
  showLegend: boolean;
  outlineStrength: number; // 0–1
  projectName: string;
  /** Fabric colour when the background is left bare; drawn behind the artwork. */
  fabricHex?: string;
  /** Extra JSON stored in <metadata>. */
  metadata?: Record<string, unknown>;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f2 = (v: number) => (Math.round(v * 100) / 100).toString();

export function outlineWidthMm(strength: number): number {
  return 0.08 + strength * 0.32;
}

/** Faint tint for pattern mode so regions are distinguishable when printed in colour but still colourable. */
function tint(t: ThreadColor): string {
  const [r, g, b] = t.rgb;
  const mix = (v: number) => Math.round(255 - (255 - v) * 0.16);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

/** Open polylines as path data (for the line layer). */
export function pathsToD(paths: Point[][]): string {
  return paths.map((p) => p.map((q, i) => `${i === 0 ? 'M' : 'L'}${f2(q.x)} ${f2(q.y)}`).join('')).join('');
}

export function buildPatternSvg(graph: RegionGraph, _palette: ThreadPalette, effectiveThreads: ThreadColor[], pattern: Pattern, opts: SvgOptions, lines: LineLayer = { strokes: [] }): string {
  const W = pattern.widthMm;
  const H = pattern.heightMm;
  const legendW = opts.showLegend ? 58 : 0;
  // Grow the margin so a hoop larger than the artwork is not clipped.
  const hoopOverhang = opts.showHoop && pattern.hoop
    ? (pattern.hoop.kind === 'round' ? Math.max(0, (pattern.hoop.diameterMm - W) / 2, (pattern.hoop.diameterMm - H) / 2)
      : Math.max(0, (pattern.hoop.widthMm - W) / 2, (pattern.hoop.heightMm - H) / 2))
    : 0;
  const margin = 8 + Math.ceil(hoopOverhang);
  const docW = W + margin * 2 + legendW;
  const legendRows = pattern.legend.length + (pattern.lineLegend.length ? pattern.lineLegend.length + 1 : 0);
  const docH = Math.max(H + margin * 2 + 10, opts.showLegend ? legendRows * 5.2 + margin * 2 + 6 : 0);
  const stroke = outlineWidthMm(opts.outlineStrength);
  const s = pattern.mmPerPx;
  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:np="https://needlepaint.app/ns/1" width="${f2(docW)}mm" height="${f2(docH)}mm" viewBox="0 0 ${f2(docW)} ${f2(docH)}" np:version="1">`);
  parts.push(`<title>${esc(opts.projectName)} — needle-painting pattern</title>`);
  const meta = { project: opts.projectName, widthMm: W, heightMm: H, mmPerPx: s, mode: opts.mode, fabric: opts.fabricHex ?? null, legend: pattern.legend.map((l) => ({ index: l.index, dmc: l.thread.number, name: l.thread.name, hex: l.thread.hex, regions: l.regionCount, areaMm2: Math.round(l.areaMm2 * 10) / 10 })), lines: pattern.lineLegend.map((l) => ({ dmc: l.thread.number, name: l.thread.name, hex: l.thread.hex, stitch: l.stitch, strokes: l.strokeCount, lengthMm: Math.round(l.lengthMm * 10) / 10 })), estimates: pattern.estimates, ...(opts.metadata ?? {}) };
  parts.push(`<metadata><np:project>${esc(JSON.stringify(meta))}</np:project></metadata>`);
  parts.push(`<style>text{font-family:Helvetica,Arial,sans-serif;font-weight:600;text-anchor:middle;dominant-baseline:central;fill:#111}.legend text{text-anchor:start}</style>`);
  parts.push(`<rect width="${f2(docW)}" height="${f2(docH)}" fill="#fff"/>`);
  parts.push(`<g id="artwork" transform="translate(${margin} ${margin})">`);
  if (opts.fabricHex) {
    // Colour mode shows the cloth; pattern mode keeps paper white but marks the bare area with a faint hatch so it prints as "leave unstitched".
    if (opts.mode === 'color') parts.push(`<rect id="fabric" width="${f2(W)}" height="${f2(H)}" fill="${esc(opts.fabricHex)}" data-fabric="${esc(opts.fabricHex)}"/>`);
    else parts.push(`<defs><pattern id="bare" width="2" height="2" patternUnits="userSpaceOnUse"><path d="M0 2L2 0" stroke="#bbb" stroke-width="0.12"/></pattern></defs><rect id="fabric" width="${f2(W)}" height="${f2(H)}" fill="url(#bare)" data-fabric="${esc(opts.fabricHex)}"/>`);
  }
  parts.push(`<g id="regions" transform="scale(${s})" fill-rule="evenodd" stroke-linejoin="round">`);
  for (const r of graph.regions) {
    const t = effectiveThreads[r.paletteIndex];
    const fill = opts.mode === 'color' ? t.hex : tint(t);
    const st = opts.mode === 'color' ? 'none' : '#1a1a1a';
    parts.push(`<path id="region-${r.id}" d="${r.pathD}" fill="${fill}" stroke="${st}" stroke-width="${f2(stroke / s)}" data-region="${r.id}" data-dmc="${esc(t.number)}" data-name="${esc(t.name)}" data-area-mm2="${f2(r.areaMm2)}" data-legend="${pattern.legend.find((l) => l.paletteIndex === r.paletteIndex)?.index ?? ''}"/>`);
  }
  parts.push(`</g>`);
  if (lines.strokes.length) {
    // Line work rides on top of the fills: real width, thread colour, one path per stroke.
    parts.push(`<g id="lines" transform="scale(${s})" fill="none" stroke-linecap="round" stroke-linejoin="round">`);
    for (const l of lines.strokes) {
      parts.push(`<path id="line-${l.id}" d="${pathsToD(l.paths)}" stroke="${l.thread.hex}" stroke-width="${f2(Math.max(l.widthMm, 0.3) / s)}" data-line="${l.id}" data-dmc="${esc(l.thread.number)}" data-name="${esc(l.thread.name)}" data-stitch="${l.stitch}" data-width-mm="${f2(l.widthMm)}" data-length-mm="${f2(l.lengthMm)}"/>`);
    }
    parts.push(`</g>`);
  }
  if (opts.showLabels && opts.mode === 'pattern') {
    parts.push(`<g id="labels">`);
    for (const l of pattern.labels) {
      if (l.tier === 'none') continue;
      if (l.tier === 'leader' && l.leaderFrom) {
        parts.push(`<line x1="${f2(l.leaderFrom.x)}" y1="${f2(l.leaderFrom.y)}" x2="${f2(l.x)}" y2="${f2(l.y)}" stroke="#1a1a1a" stroke-width="0.12"/>`);
        parts.push(`<circle cx="${f2(l.leaderFrom.x)}" cy="${f2(l.leaderFrom.y)}" r="0.25" fill="#1a1a1a"/>`);
      }
      const cls = l.tier === 'dmc' ? 'dmc' : 'idx';
      const bg = l.tier === 'leader' ? `<rect x="${f2(l.x - l.text.length * l.fontMm * 0.31 - 0.3)}" y="${f2(l.y - l.fontMm * 0.6)}" width="${f2(l.text.length * l.fontMm * 0.62 + 0.6)}" height="${f2(l.fontMm * 1.2)}" fill="#fff" stroke="#1a1a1a" stroke-width="0.1"/>` : '';
      parts.push(`${bg}<text class="${cls}" x="${f2(l.x)}" y="${f2(l.y)}" font-size="${f2(l.fontMm)}" data-region="${l.regionId}">${esc(l.text)}</text>`);
    }
    parts.push(`</g>`);
  }
  if (opts.showHoop && pattern.hoop) {
    const h = pattern.hoop;
    if (h.kind === 'round') parts.push(`<circle id="hoop" cx="${f2(W / 2)}" cy="${f2(H / 2)}" r="${f2(h.diameterMm / 2)}" fill="none" stroke="#888" stroke-width="0.2" stroke-dasharray="1.2 0.8"/>`);
    else parts.push(`<rect id="hoop" x="${f2((W - h.widthMm) / 2)}" y="${f2((H - h.heightMm) / 2)}" width="${f2(h.widthMm)}" height="${f2(h.heightMm)}" fill="none" stroke="#888" stroke-width="0.2" stroke-dasharray="1.2 0.8"/>`);
  }
  // Scale bar and dimensions.
  const barLen = W >= 100 ? 50 : W >= 40 ? 20 : 10;
  const by = H + 5;
  parts.push(`<g id="scale"><line x1="0" y1="${f2(by)}" x2="${f2(barLen)}" y2="${f2(by)}" stroke="#111" stroke-width="0.25"/><line x1="0" y1="${f2(by - 1)}" x2="0" y2="${f2(by + 1)}" stroke="#111" stroke-width="0.25"/><line x1="${f2(barLen)}" y1="${f2(by - 1)}" x2="${f2(barLen)}" y2="${f2(by + 1)}" stroke="#111" stroke-width="0.25"/><text x="${f2(barLen / 2)}" y="${f2(by + 2.6)}" font-size="2.2">${barLen} mm</text>`);
  parts.push(`<text x="${f2(W / 2)}" y="${f2(by + 2.6)}" font-size="2.2" style="font-weight:400">${f2(W)} × ${f2(H)} mm · ${graph.regions.length} regions · ${pattern.legend.length} colours${lines.strokes.length ? ` · ${lines.strokes.length} lines` : ''}${opts.fabricHex ? ` · fabric ${esc(opts.fabricHex)}` : ''}</text></g>`);
  parts.push(`</g>`);
  if (opts.showLegend) {
    parts.push(`<g id="legend" class="legend" transform="translate(${f2(W + margin * 2)} ${margin})">`);
    parts.push(`<text x="0" y="0" font-size="2.6">${esc(opts.projectName)}</text>`);
    pattern.legend.forEach((row, i) => {
      const y = 5 + i * 5.2;
      parts.push(`<rect x="0" y="${f2(y - 2)}" width="4" height="4" fill="${row.thread.hex}" stroke="#333" stroke-width="0.1"/>`);
      parts.push(`<text x="5.5" y="${f2(y)}" font-size="2.1">${row.index}</text>`);
      parts.push(`<text x="10" y="${f2(y)}" font-size="2.1">DMC ${esc(row.thread.number)}</text>`);
      parts.push(`<text x="22" y="${f2(y)}" font-size="1.8" style="font-weight:400">${esc(row.thread.name)}</text>`);
    });
    if (pattern.lineLegend.length) {
      const y0 = 5 + pattern.legend.length * 5.2 + 2;
      parts.push(`<text x="0" y="${f2(y0)}" font-size="2.2">Lines</text>`);
      pattern.lineLegend.forEach((row, i) => {
        const y = y0 + 5.2 + i * 5.2;
        parts.push(`<line x1="0" y1="${f2(y)}" x2="4" y2="${f2(y)}" stroke="${row.thread.hex}" stroke-width="0.8" stroke-linecap="round"/>`);
        parts.push(`<text x="5.5" y="${f2(y)}" font-size="2.1">DMC ${esc(row.thread.number)}</text>`);
        parts.push(`<text x="19" y="${f2(y)}" font-size="1.8" style="font-weight:400">${row.stitch} stitch · ${Math.round(row.lengthMm)} mm</text>`);
      });
    }
    parts.push(`</g>`);
  }
  parts.push(`</svg>`);
  return parts.join('\n');
}
