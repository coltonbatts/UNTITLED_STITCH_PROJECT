// Width test on the cleaned label map. A region whose inscribed width is
// below two stitch widths cannot be filled with long-and-short; if it also
// contrasts strongly with everything around it and is long enough to be a
// mark, it is a line and moves to the line layer. Its pixels are refilled
// from the surrounding labels so the fills stay whole.
import type { LabelMap, OKLab, RawStroke } from '../types';
import { componentAdjacency, connectedComponents } from '../segmentation/components';
import { distanceToBoundary } from '../regions/distance';
import { pathsLength, skeletonPaths } from './skeleton';
import { MASKED_LABEL } from '../types';

export interface ThinLiftOptions {
  labelColors: OKLab[];
  maxWidthPx: number;
  minLengthPx: number;
  /** The region must differ from every neighbour by at least this ΔE. */
  keepContrastDeltaE: number;
  /** Working-image OKLab planes; when given, a lifted stroke takes the image colour under it rather than its label's thread. */
  oklab?: Float32Array;
}

export interface ThinLiftResult {
  map: LabelMap;
  strokes: RawStroke[];
}

function dist(a: OKLab, b: OKLab): number {
  const dL = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

/** Onion-peel label fill: a lifted pixel takes the most common label among its known 4-neighbours (ties → lowest). */
export function inpaintLabels(labels: Uint16Array, width: number, height: number, holes: Uint8Array, labelCount: number): void {
  const known = new Uint8Array(holes.length);
  let remaining = 0;
  for (let i = 0; i < holes.length; i++) { known[i] = holes[i] ? 0 : 1; if (holes[i]) remaining++; }
  const next = new Uint16Array(labels.length);
  const counts = new Uint16Array(labelCount);
  const fill: number[] = [];
  for (let iter = 0; iter < 256 && remaining > 0; iter++) {
    fill.length = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (known[i]) continue;
      counts.fill(0);
      let any = false;
      const take = (j: number) => { if (known[j] && labels[j] !== MASKED_LABEL) { counts[labels[j]]++; any = true; } };
      if (x > 0) take(i - 1); if (x < width - 1) take(i + 1); if (y > 0) take(i - width); if (y < height - 1) take(i + width);
      if (!any) continue;
      let best = 0;
      for (let l = 1; l < labelCount; l++) if (counts[l] > counts[best]) best = l;
      next[i] = best;
      fill.push(i);
    }
    if (fill.length === 0) break;
    for (const i of fill) { labels[i] = next[i]; known[i] = 1; }
    remaining -= fill.length;
  }
}

export function liftThinRegions(map: LabelMap, opts: ThinLiftOptions): ThinLiftResult {
  const { width, height } = map;
  const labels = new Uint16Array(map.labels);
  const cc = connectedComponents(labels, width, height);
  const adj = componentAdjacency(cc.comp, width, height, cc.count);
  const d = distanceToBoundary(cc.comp, width, height);
  const maxD = new Float32Array(cc.count);
  const x0 = new Int32Array(cc.count).fill(width), y0 = new Int32Array(cc.count).fill(height);
  const x1 = new Int32Array(cc.count).fill(-1), y1 = new Int32Array(cc.count).fill(-1);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, c = cc.comp[i];
    if (c < 0) continue;
    if (d[i] > maxD[c]) maxD[c] = d[i];
    if (x < x0[c]) x0[c] = x; if (x + 1 > x1[c]) x1[c] = x + 1; if (y < y0[c]) y0[c] = y; if (y + 1 > y1[c]) y1[c] = y + 1;
  }
  const lifted = new Uint8Array(labels.length);
  const strokes: RawStroke[] = [];
  for (let c = 0; c < cc.count; c++) {
    const gateWidth = maxD[c] * 2; // coarse: under-reads even widths by a pixel
    if (gateWidth > opts.maxWidthPx) continue;
    const extent = Math.hypot(x1[c] - x0[c], y1[c] - y0[c]);
    if (extent < opts.minLengthPx) continue;
    if (adj.start[c] === adj.start[c + 1]) continue; // nothing to refill from
    const mine = opts.labelColors[cc.label[c]];
    let minDe = Infinity;
    for (let p = adj.start[c]; p < adj.start[c + 1]; p++) minDe = Math.min(minDe, dist(mine, opts.labelColors[cc.label[adj.ids[p]]]));
    if (minDe < opts.keepContrastDeltaE) continue;
    const bw = x1[c] - x0[c] + 2, bh = y1[c] - y0[c] + 2;
    const crop = new Uint8Array(bw * bh);
    for (let y = y0[c]; y < y1[c]; y++) for (let x = x0[c]; x < x1[c]; x++) if (cc.comp[y * width + x] === c) crop[(y - y0[c] + 1) * bw + (x - x0[c] + 1)] = 1;
    const paths = skeletonPaths(crop, bw, bh, Math.max(2, gateWidth + 1)).map((p) => p.map((q) => ({ x: q.x + x0[c] - 1, y: q.y + y0[c] - 1 })));
    const lengthPx = pathsLength(paths);
    const longest = Math.max(0, ...paths.map((p) => pathsLength([p])));
    if (paths.length === 0 || longest < opts.minLengthPx || paths.length > 1 + lengthPx / opts.minLengthPx) continue;
    const widthPx = cc.area[c] / lengthPx;
    if (widthPx > opts.maxWidthPx + 0.25) continue;
    let color: OKLab = [...mine] as OKLab;
    if (opts.oklab) {
      let sL = 0, sa = 0, sb = 0, cnt = 0;
      for (let y = y0[c]; y < y1[c]; y++) for (let x = x0[c]; x < x1[c]; x++) {
        const i = y * width + x;
        if (cc.comp[i] !== c) continue;
        sL += opts.oklab[i * 3]; sa += opts.oklab[i * 3 + 1]; sb += opts.oklab[i * 3 + 2]; cnt++;
      }
      if (cnt > 0) color = [sL / cnt, sa / cnt, sb / cnt];
    }
    strokes.push({ paths, widthPx, lengthPx, oklab: color, source: 'region' });
    for (let y = y0[c]; y < y1[c]; y++) for (let x = x0[c]; x < x1[c]; x++) { const i = y * width + x; if (cc.comp[i] === c) lifted[i] = 1; }
  }
  if (strokes.length > 0) inpaintLabels(labels, width, height, lifted, opts.labelColors.length);
  return { map: { width, height, labels }, strokes };
}
