// Crack-edge topology: the planar graph of pixel edges between different
// regions, cut into arcs at junction vertices. Each arc knows the region on
// its left and right, so a boundary is simplified exactly once and both
// neighbouring regions share the identical polyline. See docs/05-algorithms.md.
import type { Point } from '../types';

export interface Arc {
  id: number;
  /** Lattice vertices (integer corner coordinates), start → end. */
  points: Point[];
  left: number;
  right: number;
  startVertex: number;
  endVertex: number;
}

const OUTSIDE = -1;

export function traceArcs(regionMap: Int32Array, width: number, height: number): Arc[] {
  const VW = width + 1; // vertices per row
  const region = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? OUTSIDE : regionMap[y * width + x]);
  // Horizontal edge h(x,y): between vertices (x,y)-(x+1,y), separates pixel (x,y-1) above and (x,y) below.
  // Vertical edge v(x,y): between vertices (x,y)-(x,y+1), separates pixel (x-1,y) left and (x,y) right.
  const hEdge = new Uint8Array(width * (height + 1));
  const vEdge = new Uint8Array((width + 1) * height);
  const degree = new Uint8Array(VW * (height + 1));
  for (let y = 0; y <= height; y++) {
    for (let x = 0; x < width; x++) {
      if (region(x, y - 1) !== region(x, y)) {
        hEdge[y * width + x] = 1;
        degree[y * VW + x]++;
        degree[y * VW + x + 1]++;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x <= width; x++) {
      if (region(x - 1, y) !== region(x, y)) {
        vEdge[y * VW + x] = 1;
        degree[y * VW + x]++;
        degree[(y + 1) * VW + x]++;
      }
    }
  }
  const hVisited = new Uint8Array(hEdge.length);
  const vVisited = new Uint8Array(vEdge.length);
  const arcs: Arc[] = [];

  // Walk from vertex (x,y) along edge (kind, dir). Returns when the next
  // vertex is a junction (degree != 2) or we return to the start.
  // dir: 0=east,1=south,2=west,3=north.
  const step = (x: number, y: number, dir: number): [number, number] =>
    dir === 0 ? [x + 1, y] : dir === 1 ? [x, y + 1] : dir === 2 ? [x - 1, y] : [x, y - 1];
  const edgeFor = (x: number, y: number, dir: number): { kind: 'h' | 'v'; idx: number } | null => {
    switch (dir) {
      case 0: return x < width && hEdge[y * width + x] ? { kind: 'h', idx: y * width + x } : null;
      case 2: return x > 0 && hEdge[y * width + x - 1] ? { kind: 'h', idx: y * width + x - 1 } : null;
      case 1: return y < height && vEdge[y * VW + x] ? { kind: 'v', idx: y * VW + x } : null;
      default: return y > 0 && vEdge[(y - 1) * VW + x] ? { kind: 'v', idx: (y - 1) * VW + x } : null;
    }
  };
  const isVisited = (e: { kind: 'h' | 'v'; idx: number }) => (e.kind === 'h' ? hVisited[e.idx] : vVisited[e.idx]) === 1;
  const visit = (e: { kind: 'h' | 'v'; idx: number }) => { if (e.kind === 'h') hVisited[e.idx] = 1; else vVisited[e.idx] = 1; };

  // Left/right regions for an edge traversed from (x,y) in dir.
  const sides = (x: number, y: number, dir: number): [number, number] => {
    switch (dir) {
      case 0: return [region(x, y - 1), region(x, y)]; // east: left = above
      case 2: return [region(x - 1, y), region(x - 1, y - 1)]; // west: left = below
      case 1: return [region(x, y), region(x - 1, y)]; // south: left = east
      default: return [region(x - 1, y - 1), region(x, y - 1)]; // north: left = west
    }
  };

  const walk = (sx: number, sy: number, sdir: number) => {
    const first = edgeFor(sx, sy, sdir);
    if (!first || isVisited(first)) return;
    const [left, right] = sides(sx, sy, sdir);
    const points: Point[] = [{ x: sx, y: sy }];
    let x = sx, y = sy, dir = sdir;
    let e: { kind: 'h' | 'v'; idx: number } | null = first;
    for (;;) {
      visit(e!);
      [x, y] = step(x, y, dir);
      points.push({ x, y });
      const deg = degree[y * VW + x];
      if (deg !== 2 || (x === sx && y === sy)) break;
      // Continue along the only other edge.
      let next: { kind: 'h' | 'v'; idx: number } | null = null;
      let ndir = -1;
      for (let d = 0; d < 4; d++) {
        if (d === (dir + 2) % 4) continue;
        const cand = edgeFor(x, y, d);
        if (cand) { next = cand; ndir = d; break; }
      }
      if (!next || isVisited(next)) break;
      e = next;
      dir = ndir;
    }
    arcs.push({ id: arcs.length, points, left, right, startVertex: sy * VW + sx, endVertex: y * VW + x });
  };

  // Arcs starting at junctions, in raster order of vertex then direction.
  for (let y = 0; y <= height; y++) {
    for (let x = 0; x <= width; x++) {
      const deg = degree[y * VW + x];
      if (deg === 0 || deg === 2) continue;
      for (let d = 0; d < 4; d++) walk(x, y, d);
    }
  }
  // Remaining closed loops with no junctions (isolated islands).
  for (let y = 0; y <= height; y++) {
    for (let x = 0; x < width; x++) {
      if (hEdge[y * width + x] && !hVisited[y * width + x]) walk(x, y, 0);
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x <= width; x++) {
      if (vEdge[y * VW + x] && !vVisited[y * VW + x]) walk(x, y, 1);
    }
  }
  return arcs;
}
