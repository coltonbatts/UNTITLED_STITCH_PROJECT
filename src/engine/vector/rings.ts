// Assembles each region's closed rings from oriented arcs. Region on the
// left of travel; at ambiguous junctions take the leftmost turn so the ring
// hugs the region. See docs/05-algorithms.md.
import type { Point } from '../types';
import type { Arc } from './arcs';
import { signedArea } from './simplify';

interface Oriented {
  arc: Arc;
  forward: boolean;
  start: number;
  end: number;
}

function rawDirAtStart(o: Oriented): Point {
  const p = o.arc.points;
  const a = o.forward ? p[0] : p[p.length - 1];
  const b = o.forward ? p[1] : p[p.length - 2];
  return { x: b.x - a.x, y: b.y - a.y };
}
function rawDirAtEnd(o: Oriented): Point {
  const p = o.arc.points;
  const a = o.forward ? p[p.length - 2] : p[1];
  const b = o.forward ? p[p.length - 1] : p[0];
  return { x: b.x - a.x, y: b.y - a.y };
}

/**
 * Returns rings per region id as lists of oriented arc references, using the
 * simplified geometry supplied in `simplified` (same index as arcs).
 */
export function assembleRings(arcs: Arc[], simplified: Point[][], regionCount: number): Point[][][] {
  const perRegion: Oriented[][] = Array.from({ length: regionCount }, () => []);
  for (const arc of arcs) {
    if (arc.left >= 0) perRegion[arc.left].push({ arc, forward: true, start: arc.startVertex, end: arc.endVertex });
    if (arc.right >= 0) perRegion[arc.right].push({ arc, forward: false, start: arc.endVertex, end: arc.startVertex });
  }
  const result: Point[][][] = [];
  for (let r = 0; r < regionCount; r++) {
    const list = perRegion[r];
    const byStart = new Map<number, Oriented[]>();
    for (const o of list) {
      const arr = byStart.get(o.start);
      if (arr) arr.push(o); else byStart.set(o.start, [o]);
    }
    const used = new Set<Oriented>();
    const rings: Point[][] = [];
    for (const first of list) {
      if (used.has(first)) continue;
      const chain: Oriented[] = [first];
      used.add(first);
      let cur = first;
      let guard = 0;
      while (cur.end !== first.start && guard++ < 1_000_000) {
        const cands = (byStart.get(cur.end) ?? []).filter((o) => !used.has(o));
        if (cands.length === 0) break;
        let next = cands[0];
        if (cands.length > 1) {
          const din = rawDirAtEnd(cur);
          let best = Infinity;
          for (const c of cands) {
            const dout = rawDirAtStart(c);
            // y-down coordinates: a left turn has negative cross product.
            const cross = din.x * dout.y - din.y * dout.x;
            const dot = din.x * dout.x + din.y * dout.y;
            const key = cross < 0 ? -2 : cross > 0 ? 2 : dot > 0 ? 0 : 1;
            if (key < best) { best = key; next = c; }
          }
        }
        chain.push(next);
        used.add(next);
        cur = next;
      }
      const ring: Point[] = [];
      for (const o of chain) {
        const pts = simplified[o.arc.id];
        const seq = o.forward ? pts : pts.slice().reverse();
        for (let i = 0; i < seq.length - 1; i++) ring.push(seq[i]);
      }
      if (ring.length >= 3) rings.push(ring);
    }
    // Outer ring first (largest absolute area).
    rings.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
    result.push(rings);
  }
  return result;
}
