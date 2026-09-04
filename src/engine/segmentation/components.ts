import { MASKED_LABEL } from '../types';

export interface Components {
  count: number;
  /** Component id per pixel, -1 for masked. */
  comp: Int32Array;
  /** Pixel area per component. */
  area: Int32Array;
  /** Label per component. */
  label: Uint16Array;
}

/** 4-connected components of equal labels, ids assigned in raster order of first pixel. */
export function connectedComponents(labels: Uint16Array, width: number, height: number): Components {
  const n = width * height;
  const comp = new Int32Array(n).fill(-1);
  const areas: number[] = [];
  const compLabel: number[] = [];
  const stack = new Int32Array(n);
  let count = 0;
  for (let start = 0; start < n; start++) {
    if (comp[start] !== -1 || labels[start] === MASKED_LABEL) continue;
    const l = labels[start];
    const id = count++;
    let sp = 0;
    stack[sp++] = start;
    comp[start] = id;
    let area = 0;
    while (sp > 0) {
      const i = stack[--sp];
      area++;
      const x = i % width;
      const y = (i - x) / width;
      if (x > 0) { const j = i - 1; if (comp[j] === -1 && labels[j] === l) { comp[j] = id; stack[sp++] = j; } }
      if (x < width - 1) { const j = i + 1; if (comp[j] === -1 && labels[j] === l) { comp[j] = id; stack[sp++] = j; } }
      if (y > 0) { const j = i - width; if (comp[j] === -1 && labels[j] === l) { comp[j] = id; stack[sp++] = j; } }
      if (y < height - 1) { const j = i + width; if (comp[j] === -1 && labels[j] === l) { comp[j] = id; stack[sp++] = j; } }
    }
    areas.push(area);
    compLabel.push(l);
  }
  return { count, comp, area: Int32Array.from(areas), label: Uint16Array.from(compLabel) };
}

export interface Adjacency {
  /** CSR layout: neighbours of c are ids[start[c]..start[c+1]) with shared edge counts in shared[]. */
  start: Int32Array;
  ids: Int32Array;
  shared: Int32Array;
}

/** Shared boundary length (in pixel edges) between every pair of adjacent components. Deterministic order. */
export function componentAdjacency(comp: Int32Array, width: number, height: number, count: number): Adjacency {
  const pairs = new Map<number, number>();
  const touch = (a: number, b: number) => {
    if (a === b || a < 0 || b < 0) return;
    const key = a < b ? a * count + b : b * count + a;
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x < width - 1) touch(comp[i], comp[i + 1]);
      if (y < height - 1) touch(comp[i], comp[i + width]);
    }
  }
  const degree = new Int32Array(count + 1);
  for (const key of pairs.keys()) { degree[Math.floor(key / count)]++; degree[key % count]++; }
  const start = new Int32Array(count + 1);
  for (let c = 0; c < count; c++) start[c + 1] = start[c] + degree[c];
  const fill = new Int32Array(count);
  const ids = new Int32Array(start[count]);
  const shared = new Int32Array(start[count]);
  for (const [key, n] of pairs) {
    const a = Math.floor(key / count), b = key % count;
    let p = start[a] + fill[a]++; ids[p] = b; shared[p] = n;
    p = start[b] + fill[b]++; ids[p] = a; shared[p] = n;
  }
  return { start, ids, shared };
}

export function neighborsOf(adj: Adjacency, c: number): Array<{ id: number; shared: number }> {
  const out: Array<{ id: number; shared: number }> = [];
  for (let p = adj.start[c]; p < adj.start[c + 1]; p++) out.push({ id: adj.ids[p], shared: adj.shared[p] });
  return out;
}
