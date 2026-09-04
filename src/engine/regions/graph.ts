import type { LabelMap, OKLab, Region, RegionGraph } from '../types';
import { componentAdjacency, connectedComponents, neighborsOf } from '../segmentation/components';
import { distanceToBoundary } from './distance';

/**
 * Builds the RegionGraph from a cleaned label map. Region ids are assigned by
 * area rank (0 = largest) so printed numbers read sensibly. Rings and path
 * data are filled in by the vector stage.
 */
export function buildRegionGraph(map: LabelMap, mmPerPx: number, labelColors: OKLab[]): RegionGraph {
  const { width, height, labels } = map;
  const cc = connectedComponents(labels, width, height);
  const order = Array.from({ length: cc.count }, (_, i) => i).sort((a, b) => cc.area[b] - cc.area[a] || a - b);
  const rank = new Int32Array(cc.count);
  order.forEach((c, r) => { rank[c] = r; });
  const regionMap = new Int32Array(labels.length);
  for (let i = 0; i < regionMap.length; i++) regionMap[i] = cc.comp[i] < 0 ? -1 : rank[cc.comp[i]];

  const n = cc.count;
  const sumX = new Float64Array(n), sumY = new Float64Array(n);
  const x0 = new Int32Array(n).fill(width), y0 = new Int32Array(n).fill(height);
  const x1 = new Int32Array(n).fill(-1), y1 = new Int32Array(n).fill(-1);
  const dist = distanceToBoundary(regionMap, width, height);
  const poleD = new Float32Array(n).fill(-1);
  const poleI = new Int32Array(n).fill(-1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const r = regionMap[i];
      if (r < 0) continue;
      sumX[r] += x + 0.5; sumY[r] += y + 0.5;
      if (x < x0[r]) x0[r] = x; if (x + 1 > x1[r]) x1[r] = x + 1;
      if (y < y0[r]) y0[r] = y; if (y + 1 > y1[r]) y1[r] = y + 1;
      if (dist[i] > poleD[r]) { poleD[r] = dist[i]; poleI[r] = i; }
    }
  }
  const adj = componentAdjacency(regionMap, width, height, n);
  const areaByRank = new Int32Array(n);
  for (let c = 0; c < cc.count; c++) areaByRank[rank[c]] = cc.area[c];
  const labelByRank = new Uint16Array(n);
  for (let c = 0; c < cc.count; c++) labelByRank[rank[c]] = cc.label[c];

  const regions: Region[] = [];
  const mm2 = mmPerPx * mmPerPx;
  for (let r = 0; r < n; r++) {
    const area = areaByRank[r];
    const neighbors = neighborsOf(adj, r)
      .map(({ id, shared }) => ({ id, sharedBoundaryPx: shared }))
      .sort((a, b) => b.sharedBoundaryPx - a.sharedBoundaryPx || a.id - b.id);
    let contrastSum = 0, contrastW = 0;
    const mine = labelColors[labelByRank[r]];
    for (const nb of neighbors) {
      const other = labelColors[labelByRank[nb.id]];
      const dL = mine[0] - other[0], da = mine[1] - other[1], db = mine[2] - other[2];
      contrastSum += Math.sqrt(dL * dL + da * da + db * db) * nb.sharedBoundaryPx;
      contrastW += nb.sharedBoundaryPx;
    }
    const meanContrast = contrastW > 0 ? contrastSum / contrastW : 0;
    const pi = poleI[r];
    regions.push({
      id: r,
      paletteIndex: labelByRank[r],
      pixelArea: area,
      areaMm2: area * mm2,
      bbox: { x0: x0[r], y0: y0[r], x1: x1[r], y1: y1[r] },
      centroid: { x: sumX[r] / area, y: sumY[r] / area },
      pole: pi >= 0 ? { x: (pi % width) + 0.5, y: Math.floor(pi / width) + 0.5, radiusPx: poleD[r] } : { x: 0, y: 0, radiusPx: 0 },
      neighbors,
      enclosedBy: neighbors.length === 1 ? neighbors[0].id : undefined,
      importance: Math.min(1, meanContrast / 0.25),
      rings: [],
      pathD: '',
    });
  }
  return { width, height, mmPerPx, regions, regionMap };
}
