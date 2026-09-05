// Absorbs components smaller than the minimum stitchable area into the
// neighbour that shares the most boundary and the closest colour, smallest
// first, until stable. A region budget then raises the threshold until the
// count fits. See docs/05-algorithms.md.
import type { LabelMap, OKLab } from '../types';
import { componentAdjacency, connectedComponents } from './components';

export interface IslandMergeOptions {
  /** OKLab colour per label index (the thread colours). */
  labelColors: OKLab[];
  minAreaPx: number;
  /** A small region survives if its ΔE to every neighbour exceeds this. */
  keepContrastDeltaE: number;
  maxRegions: number;
  maxPasses?: number;
}

export interface IslandMergeResult {
  map: LabelMap;
  regionCount: number;
  /** The minimum area actually used after the region budget was applied. */
  effectiveMinAreaPx: number;
}

function dist(a: OKLab, b: OKLab): number {
  const dL = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

function mergePass(labels: Uint16Array, width: number, height: number, opts: IslandMergeOptions, minAreaPx: number): { changed: number; count: number } {
  const cc = connectedComponents(labels, width, height);
  const adj = componentAdjacency(cc.comp, width, height, cc.count);
  const order = Array.from({ length: cc.count }, (_, i) => i).sort((a, b) => cc.area[a] - cc.area[b] || a - b);
  // Union-find so a chain of small components collapses in one pass.
  const parent = new Int32Array(cc.count);
  for (let i = 0; i < cc.count; i++) parent[i] = i;
  const find = (c: number): number => { while (parent[c] !== c) { parent[c] = parent[parent[c]]; c = parent[c]; } return c; };
  const area = Int32Array.from(cc.area);
  const label = new Uint16Array(cc.label);
  let changed = 0;
  const keepFloor = Math.max(1, Math.floor(minAreaPx / 4));
  const holeFloor = Math.max(2, Math.floor(minAreaPx / 16));
  for (const c of order) {
    if (cc.area[c] >= minAreaPx) break;
    if (find(c) !== c || area[c] >= minAreaPx) continue;
    // The counter rule: an island with a single neighbour, coloured like
    // something that neighbour also touches, is a hole through it (the inside
    // of an O, the loops of an 8). Topology, not area, decides.
    if (cc.area[c] >= holeFloor && adj.start[c + 1] - adj.start[c] === 1) {
      const ring = adj.ids[adj.start[c]];
      let hole = false;
      for (let p = adj.start[ring]; p < adj.start[ring + 1] && !hole; p++) {
        const m = adj.ids[p];
        if (m !== c && cc.label[m] === cc.label[c]) hole = true;
      }
      if (hole) continue;
    }
    const myColor = opts.labelColors[label[c]];
    let best = -1, bestScore = -Infinity, minDe = Infinity;
    for (let p = adj.start[c]; p < adj.start[c + 1]; p++) {
      const n = find(adj.ids[p]);
      if (n === c) continue;
      const d = dist(myColor, opts.labelColors[label[n]]);
      if (d < minDe) minDe = d;
      const score = adj.shared[p] / (0.05 + d);
      if (score > bestScore) { bestScore = score; best = n; }
    }
    if (best < 0) continue;
    // The eye-highlight rule: strong contrast against everything around it
    // and not microscopic → keep.
    if (minDe > opts.keepContrastDeltaE && cc.area[c] >= keepFloor) continue;
    parent[c] = best;
    area[best] += area[c];
    changed++;
  }
  if (changed > 0) {
    for (let i = 0; i < labels.length; i++) {
      const c = cc.comp[i];
      if (c >= 0) labels[i] = label[find(c)];
    }
  }
  return { changed, count: cc.count - changed };
}

export function mergeIslands(map: LabelMap, opts: IslandMergeOptions): IslandMergeResult {
  const labels = new Uint16Array(map.labels);
  const { width, height } = map;
  let minAreaPx = Math.max(1, opts.minAreaPx);
  const maxPasses = opts.maxPasses ?? 8;
  let count = 0;
  for (let budgetRound = 0; budgetRound < 12; budgetRound++) {
    for (let pass = 0; pass < maxPasses; pass++) {
      const r = mergePass(labels, width, height, opts, minAreaPx);
      count = r.count;
      if (r.changed === 0) break;
    }
    count = connectedComponents(labels, width, height).count;
    if (count <= opts.maxRegions) break;
    minAreaPx = Math.ceil(minAreaPx * 1.5);
  }
  return { map: { width, height, labels }, regionCount: count, effectiveMinAreaPx: minAreaPx };
}
