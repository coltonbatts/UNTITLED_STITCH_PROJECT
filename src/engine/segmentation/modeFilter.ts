import { MASKED_LABEL, type LabelMap } from '../types';

/**
 * Majority vote in a circular window. Erases features narrower than about
 * 2·radius while leaving straight boundaries alone. Ties keep the current
 * label when it is among the winners, else the lowest label index (stable).
 */
export function modeFilter(map: LabelMap, radius: number, labelCount: number): LabelMap {
  if (radius < 1) return map;
  const { width, height, labels } = map;
  const out = new Uint16Array(labels.length);
  const offsets: Array<[number, number]> = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) offsets.push([dx, dy]);
    }
  }
  const counts = new Uint32Array(labelCount + 1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const cur = labels[i];
      if (cur === MASKED_LABEL) { out[i] = cur; continue; }
      counts.fill(0);
      for (const [dx, dy] of offsets) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const l = labels[yy * width + xx];
        if (l !== MASKED_LABEL) counts[l]++;
      }
      let best = cur, bestC = counts[cur];
      for (let l = 0; l < labelCount; l++) {
        if (counts[l] > bestC) { bestC = counts[l]; best = l; }
      }
      out[i] = best;
    }
  }
  return { width, height, labels: out };
}
