import type { Point, RegionGraph } from '../types';
import { traceArcs } from './arcs';
import { chaikin, simplifyPolyline } from './simplify';
import { assembleRings } from './rings';
import { ringsToPathD } from './svgPath';

export interface VectorizeOptions {
  simplifyTolerancePx: number;
  smoothingPasses: number;
}

/** Fills `rings` and `pathD` on every region of the graph. Returns the same graph object. */
export function vectorizeRegions(graph: RegionGraph, opts: VectorizeOptions): RegionGraph {
  const arcs = traceArcs(graph.regionMap, graph.width, graph.height);
  const simplified: Point[][] = arcs.map((a) => {
    const s = simplifyPolyline(a.points, opts.simplifyTolerancePx);
    return chaikin(s, opts.smoothingPasses);
  });
  const rings = assembleRings(arcs, simplified, graph.regions.length);
  for (const region of graph.regions) {
    region.rings = rings[region.id] ?? [];
    region.pathD = ringsToPathD(region.rings);
  }
  return graph;
}
