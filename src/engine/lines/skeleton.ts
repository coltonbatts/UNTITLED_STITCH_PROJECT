// Centre lines of a binary mask: Zhang–Suen thinning, staircase removal,
// spur pruning, then a walk of the skeleton graph into polylines split at
// junctions. Deterministic: raster order everywhere.
import type { Point } from '../types';
import { simplifyPolyline } from '../vector/simplify';

const NB = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]] as const; // P2..P9 clockwise from north

/** Zhang–Suen thinning. Returns a new mask that is (mostly) one pixel wide and 8-connected. */
export function thin(mask: Uint8Array, width: number, height: number): Uint8Array {
  const a = new Uint8Array(mask);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : a[y * width + x]);
  const del: number[] = [];
  for (let iter = 0; iter < 64; iter++) {
    let changed = 0;
    for (let sub = 0; sub < 2; sub++) {
      del.length = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (!a[i]) continue;
        const p = NB.map(([dx, dy]) => at(x + dx, y + dy));
        const b = p.reduce((s, v) => s + v, 0);
        if (b < 2 || b > 6) continue;
        let trans = 0;
        for (let k = 0; k < 8; k++) if (p[k] === 0 && p[(k + 1) % 8] === 1) trans++;
        if (trans !== 1) continue;
        // p[0]=N p[2]=E p[4]=S p[6]=W
        const ok = sub === 0 ? (p[0] * p[2] * p[4] === 0 && p[2] * p[4] * p[6] === 0) : (p[0] * p[2] * p[6] === 0 && p[0] * p[4] * p[6] === 0);
        if (ok) del.push(i);
      }
      for (const i of del) a[i] = 0;
      changed += del.length;
    }
    if (changed === 0) break;
  }
  // Zhang–Suen leaves two-pixel knots on diagonals. A pixel whose foreground
  // neighbours already form one 8-connected group among themselves (and that
  // is not an endpoint) adds nothing: drop it. Sequential, so connectivity is
  // preserved at every step.
  const nbOf = (x: number, y: number): number[] => {
    const out: number[] = [];
    for (let k = 0; k < 8; k++) if (at(x + NB[k][0], y + NB[k][1])) out.push(k);
    return out;
  };
  const oneGroup = (ks: number[]): boolean => {
    // Union neighbours that are 8-adjacent to each other (by their offsets).
    const parent = ks.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const [ax, ay] = NB[ks[i]], [bx, by] = NB[ks[j]];
      if (Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1) parent[find(i)] = find(j);
    }
    const root = find(0);
    return ks.every((_, i) => find(i) === root);
  };
  for (let round = 0; round < 4; round++) {
    let removed = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!a[i]) continue;
      const ks = nbOf(x, y);
      if (ks.length < 2 || !oneGroup(ks)) continue;
      a[i] = 0; removed++;
    }
    if (removed === 0) break;
  }
  return a;
}

function degreeMap(skel: Uint8Array, width: number, height: number): Uint8Array {
  const deg = new Uint8Array(skel.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!skel[i]) continue;
    let d = 0;
    for (const [dx, dy] of NB) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < width && yy < height && skel[yy * width + xx]) d++;
    }
    deg[i] = d;
  }
  return deg;
}

/** Removes end branches shorter than `maxLen` pixels that hang off a junction. Mutates and returns the skeleton. */
export function pruneSpurs(skel: Uint8Array, width: number, height: number, maxLen: number): Uint8Array {
  for (let round = 0; round < 3; round++) {
    const deg = degreeMap(skel, width, height);
    let removed = 0;
    for (let start = 0; start < skel.length; start++) {
      if (!skel[start] || deg[start] !== 1) continue;
      const path = [start];
      let prev = -1, cur = start;
      let hitJunction = false;
      while (path.length <= maxLen) {
        const x = cur % width, y = (cur - x) / width;
        let next = -1;
        for (const [dx, dy] of NB) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const j = yy * width + xx;
          if (skel[j] && j !== prev && j !== cur && !path.includes(j)) { next = j; break; }
        }
        if (next < 0) break;
        if (deg[next] >= 3) { hitJunction = true; break; }
        prev = cur; cur = next; path.push(cur);
      }
      if (hitJunction && path.length <= maxLen) { for (const i of path) skel[i] = 0; removed++; }
    }
    if (removed === 0) break;
  }
  return skel;
}

/** Walks the skeleton into pixel-index chains split at junctions; closed loops become one chain. */
export function traceSkeleton(skel: Uint8Array, width: number, height: number): number[][] {
  const deg = degreeMap(skel, width, height);
  const visited = new Set<number>(); // edge keys
  const key = (a: number, b: number) => (a < b ? a * skel.length + b : b * skel.length + a);
  const neighbours = (i: number): number[] => {
    const x = i % width, y = (i - x) / width;
    const out: number[] = [];
    for (const [dx, dy] of NB) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < width && yy < height && skel[yy * width + xx]) out.push(yy * width + xx);
    }
    return out;
  };
  const chains: number[][] = [];
  const walk = (from: number, to: number) => {
    const chain = [from, to];
    visited.add(key(from, to));
    let prev = from, cur = to;
    while (deg[cur] === 2) {
      const nb = neighbours(cur);
      const next = nb[0] === prev ? nb[1] : nb[0];
      if (next === undefined || visited.has(key(cur, next))) break;
      visited.add(key(cur, next));
      chain.push(next);
      prev = cur; cur = next;
      if (cur === from) break;
    }
    chains.push(chain);
  };
  for (let i = 0; i < skel.length; i++) {
    if (!skel[i] || deg[i] === 2 || deg[i] === 0) continue;
    for (const nb of neighbours(i)) if (!visited.has(key(i, nb))) walk(i, nb);
  }
  // Pure cycles: no node at all.
  for (let i = 0; i < skel.length; i++) {
    if (!skel[i] || deg[i] !== 2) continue;
    const nb = neighbours(i);
    if (nb.every((n) => visited.has(key(i, n)))) continue;
    const start = nb.find((n) => !visited.has(key(i, n)))!;
    walk(i, start);
  }
  return chains;
}

/**
 * Centre-line polylines of a mask in pixel-centre coordinates, simplified.
 * `spurLen` removes thinning artefacts shorter than about the stroke width.
 */
export function skeletonPaths(mask: Uint8Array, width: number, height: number, spurLen = 3, tolerancePx = 0.7): Point[][] {
  const skel = pruneSpurs(thin(mask, width, height), width, height, Math.max(1, Math.round(spurLen)));
  const chains = traceSkeleton(skel, width, height);
  return chains
    .map((chain) => simplifyPolyline(chain.map((i) => ({ x: (i % width) + 0.5, y: Math.floor(i / width) + 0.5 })), tolerancePx))
    .filter((p) => p.length >= 2);
}

export function pathsLength(paths: Point[][]): number {
  let l = 0;
  for (const p of paths) for (let i = 1; i < p.length; i++) l += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return l;
}
