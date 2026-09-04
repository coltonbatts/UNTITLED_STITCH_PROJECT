import { describe, expect, it } from 'vitest';
import { traceArcs } from '@/engine/vector/arcs';
import { assembleRings } from '@/engine/vector/rings';
import { chaikin, signedArea, simplifyPolyline } from '@/engine/vector/simplify';
import { ringsToPathD } from '@/engine/vector/svgPath';
import { buildRegionGraph } from '@/engine/regions/graph';
import { vectorizeRegions } from '@/engine/vector/vectorize';
import type { LabelMap, OKLab } from '@/engine/types';

const colors: OKLab[] = [[0.9, 0, 0], [0.2, 0, 0], [0.5, 0.1, 0]];
const PATH_RE = /^(M-?\d+(\.\d+)? -?\d+(\.\d+)?(L-?\d+(\.\d+)? -?\d+(\.\d+)?)+Z)+$/;

function halves(): LabelMap {
  const labels = new Uint16Array(10 * 8);
  for (let y = 0; y < 8; y++) for (let x = 5; x < 10; x++) labels[y * 10 + x] = 1;
  return { width: 10, height: 8, labels };
}
function island(): LabelMap {
  const labels = new Uint16Array(12 * 12);
  for (let y = 4; y < 8; y++) for (let x = 4; x < 8; x++) labels[y * 12 + x] = 1;
  return { width: 12, height: 12, labels };
}

describe('vectorisation', () => {
  it('two half regions share one identical boundary arc', () => {
    const g = buildRegionGraph(halves(), 1, colors);
    const arcs = traceArcs(g.regionMap, 10, 8);
    const shared = arcs.filter((a) => a.left >= 0 && a.right >= 0);
    expect(shared.length).toBe(1);
    expect(shared[0].points.length).toBe(9); // 8 unit edges
    const rings = assembleRings(arcs, arcs.map((a) => a.points), 2);
    expect(rings[0].length).toBe(1);
    expect(rings[1].length).toBe(1);
    expect(Math.abs(signedArea(rings[0][0]))).toBe(40);
    expect(Math.abs(signedArea(rings[1][0]))).toBe(40);
  });
  it('an island produces a hole in its parent and areas are conserved', () => {
    const g = vectorizeRegions(buildRegionGraph(island(), 1, colors), { simplifyTolerancePx: 0, smoothingPasses: 0 });
    const outer = g.regions[0];
    const inner = g.regions[1];
    expect(outer.rings.length).toBe(2);
    expect(inner.rings.length).toBe(1);
    expect(inner.enclosedBy).toBe(outer.id);
    const outerArea = Math.abs(signedArea(outer.rings[0])) - Math.abs(signedArea(outer.rings[1]));
    expect(outerArea).toBe(144 - 16);
    expect(Math.abs(signedArea(inner.rings[0]))).toBe(16);
    expect(outer.pathD).toMatch(PATH_RE);
    expect(inner.pathD).toMatch(PATH_RE);
  });
  it('simplification pins endpoints and never adds points', () => {
    const stair = Array.from({ length: 20 }, (_, i) => ({ x: Math.floor(i / 2) + (i % 2), y: Math.floor((i + 1) / 2) }));
    const s = simplifyPolyline(stair, 1);
    expect(s[0]).toEqual(stair[0]);
    expect(s[s.length - 1]).toEqual(stair[stair.length - 1]);
    expect(s.length).toBeLessThan(stair.length);
    const c = chaikin(s, 2);
    expect(c[0]).toEqual(stair[0]);
    expect(c[c.length - 1]).toEqual(stair[stair.length - 1]);
  });
  it('emits valid path data', () => {
    expect(ringsToPathD([[{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }]])).toBe('M0 0L4 0L4 4Z');
  });
  it('handles a diagonal self-touching region without losing area', () => {
    // U-shape whose arms touch a bump diagonally at one vertex.
    const w = 6, h = 6;
    const labels = new Uint16Array(w * h);
    const set = (x: number, y: number, v: number) => { labels[y * w + x] = v; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, 0);
    // Region 1: pixels forming an L with a diagonal touch.
    set(1, 1, 1); set(1, 2, 1); set(1, 3, 1); set(2, 3, 1); set(3, 3, 1); set(3, 2, 1); set(2, 1, 1);
    const g = vectorizeRegions(buildRegionGraph({ width: w, height: h, labels }, 1, colors), { simplifyTolerancePx: 0, smoothingPasses: 0 });
    let total = 0;
    for (const r of g.regions) {
      total += Math.abs(signedArea(r.rings[0])) - r.rings.slice(1).reduce((s, ring) => s + Math.abs(signedArea(ring)), 0);
    }
    expect(total).toBe(w * h);
  });
});
