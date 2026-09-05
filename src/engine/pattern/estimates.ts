import type { EffortEstimate, LineLayer, RegionGraph, StrandCount } from '../types';
import { polylineLength } from '../vector/simplify';

/** Rough footprint of one long-and-short stitch, mm², by strand count. */
const STITCH_FOOTPRINT_MM2: Record<StrandCount, number> = { 1: 1.05, 2: 2.1, 3: 3.2, 6: 6.0 };
const STITCH_LENGTH_MM = 3;
/** A back or stem stitch advances about this far. */
const LINE_STITCH_MM = 2.5;

/** Everything here is approximate and the UI says so. */
export function estimateEffort(graph: RegionGraph, threadCount: number, strands: StrandCount, lines: LineLayer = { strokes: [] }): EffortEstimate {
  let areaMm2 = 0;
  let ringLenPx = 0;
  for (const r of graph.regions) {
    areaMm2 += r.areaMm2;
    for (const ring of r.rings) ringLenPx += polylineLength(ring) + Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y);
  }
  // Internal boundaries are counted from both sides; the outer border once.
  const boundaryMm = (ringLenPx * graph.mmPerPx) / 2;
  const fill = areaMm2 / STITCH_FOOTPRINT_MM2[strands];
  const edges = (boundaryMm / STITCH_LENGTH_MM) * 0.5;
  const lineMm = lines.strokes.reduce((s, l) => s + l.lengthMm, 0);
  const stitchesApprox = Math.round((fill + edges + lineMm / LINE_STITCH_MM) / 50) * 50;
  const regionCount = graph.regions.length;
  const norm = (v: number, max: number) => Math.log1p(Math.max(0, v)) / Math.log1p(max);
  const score = Math.round(100 * Math.min(1, 0.35 * norm(regionCount, 400) + 0.3 * norm(stitchesApprox, 200000) + 0.2 * (threadCount / 40) + 0.15 * norm(boundaryMm, 5000)));
  const lineThreads = new Set(lines.strokes.map((l) => l.thread.number)).size;
  return { regionCount, threadCount, colorChanges: regionCount + lines.strokes.length, boundaryMm, areaMm2, lineMm, stitchesApprox, score: Math.min(100, score + Math.round(lineThreads * 0.5)) };
}
