// Label placement tiers. The raster pole of inaccessibility (already on each
// region) tells us the largest circle inside the region; the tier follows
// from whether the text fits in that circle at print scale.
import type { PatternLabel, Point, RegionGraph } from '../types';

export interface LabelOptions {
  widthMm: number;
  heightMm: number;
  /** Text to print for a full label, per palette index (the DMC number). */
  fullText: (paletteIndex: number) => string;
  /** Compact legend index per palette index. */
  indexText: (paletteIndex: number) => string;
  dmcFontMm?: number;
  indexFontMm?: number;
  /** Regions smaller than this get no label at all. */
  minLabelAreaMm2?: number;
}

interface Box { x0: number; y0: number; x1: number; y1: number }

const CHAR_W = 0.62; // approx width/height ratio for a condensed numeral

function textBox(x: number, y: number, text: string, fontMm: number): Box {
  const w = text.length * fontMm * CHAR_W + fontMm * 0.4;
  const h = fontMm * 1.2;
  return { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
}
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const halfDiag = (b: Box) => Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2;

export function placeLabels(graph: RegionGraph, opts: LabelOptions): PatternLabel[] {
  const dmcFont = opts.dmcFontMm ?? 2.4;
  const indexFont = opts.indexFontMm ?? 1.9;
  const minArea = opts.minLabelAreaMm2 ?? 1.5;
  const mm = graph.mmPerPx;
  const placed: Box[] = [];
  const labels: PatternLabel[] = [];
  const bounds: Box = { x0: 0, y0: 0, x1: opts.widthMm, y1: opts.heightMm };
  const inside = (b: Box) => b.x0 >= bounds.x0 && b.y0 >= bounds.y0 && b.x1 <= bounds.x1 && b.y1 <= bounds.y1;

  // Larger regions first so their labels claim space before leaders arrive.
  const regions = graph.regions.slice().sort((a, b) => b.areaMm2 - a.areaMm2 || a.id - b.id);
  const leaders: typeof regions = [];
  for (const r of regions) {
    if (r.areaMm2 < minArea) continue;
    const px = r.pole.x * mm, py = r.pole.y * mm;
    const radius = r.pole.radiusPx * mm;
    const full = opts.fullText(r.paletteIndex);
    const fb = textBox(px, py, full, dmcFont);
    if (halfDiag(fb) + 0.25 <= radius) {
      labels.push({ regionId: r.id, tier: 'dmc', text: full, x: px, y: py, fontMm: dmcFont });
      placed.push(fb);
      continue;
    }
    const idx = opts.indexText(r.paletteIndex);
    const ib = textBox(px, py, idx, indexFont);
    if (halfDiag(ib) + 0.15 <= radius) {
      labels.push({ regionId: r.id, tier: 'index', text: idx, x: px, y: py, fontMm: indexFont });
      placed.push(ib);
      continue;
    }
    leaders.push(r);
  }
  // Leader lines: try eight directions at increasing distance, keep the first
  // spot that does not collide with an existing label and stays on the page.
  const dirs: Point[] = [
    { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: -1 }, { x: -1, y: 1 },
    { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 },
  ].map((d) => { const l = Math.hypot(d.x, d.y); return { x: d.x / l, y: d.y / l }; });
  for (const r of leaders) {
    const px = r.pole.x * mm, py = r.pole.y * mm;
    const idx = opts.indexText(r.paletteIndex);
    let done = false;
    for (let dist = 3; dist <= 12 && !done; dist += 1.5) {
      for (const d of dirs) {
        const lx = px + d.x * dist, ly = py + d.y * dist;
        const b = textBox(lx, ly, idx, indexFont);
        if (!inside(b) || placed.some((p) => overlaps(p, b))) continue;
        labels.push({ regionId: r.id, tier: 'leader', text: idx, x: lx, y: ly, fontMm: indexFont, leaderFrom: { x: px, y: py } });
        placed.push(b);
        done = true;
        break;
      }
    }
    if (!done) labels.push({ regionId: r.id, tier: 'none', text: idx, x: px, y: py, fontMm: indexFont });
  }
  labels.sort((a, b) => a.regionId - b.regionId);
  return labels;
}
