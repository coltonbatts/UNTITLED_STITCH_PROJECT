// Small binary-mask utilities shared by the line layer. All deterministic,
// raster order, no allocation surprises.

export interface MaskComponents {
  count: number;
  /** Component id per pixel, -1 where the mask is 0. */
  comp: Int32Array;
  area: Int32Array;
  bbox: Array<{ x0: number; y0: number; x1: number; y1: number }>;
}

/** 8-connected components of a binary mask (strokes run diagonally). */
export function maskComponents(mask: Uint8Array, width: number, height: number): MaskComponents {
  const n = width * height;
  const comp = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  const areas: number[] = [];
  const bbox: MaskComponents['bbox'] = [];
  let count = 0;
  for (let start = 0; start < n; start++) {
    if (!mask[start] || comp[start] !== -1) continue;
    const id = count++;
    let sp = 0, area = 0;
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    stack[sp++] = start;
    comp[start] = id;
    while (sp > 0) {
      const i = stack[--sp];
      area++;
      const x = i % width, y = (i - x) / width;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width || (dx === 0 && dy === 0)) continue;
          const j = yy * width + xx;
          if (mask[j] && comp[j] === -1) { comp[j] = id; stack[sp++] = j; }
        }
      }
    }
    areas.push(area);
    bbox.push({ x0, y0, x1: x1 + 1, y1: y1 + 1 });
  }
  return { count, comp, area: Int32Array.from(areas), bbox };
}

/** Chamfer (3-4) distance from each mask pixel to the nearest zero pixel; outside the image counts as zero. Boundary pixels read 0.5. */
export function maskDistance(mask: Uint8Array, width: number, height: number): Float32Array {
  const n = width * height;
  const d = new Float32Array(n);
  const INF = 1e9;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!mask[i]) { d[i] = 0; continue; }
    const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - width] || !mask[i + width];
    d[i] = edge ? 0.5 : INF;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    let v = d[i];
    if (v === 0) continue;
    if (x > 0) v = Math.min(v, d[i - 1] + 1);
    if (y > 0) {
      v = Math.min(v, d[i - width] + 1);
      if (x > 0) v = Math.min(v, d[i - width - 1] + 1.4142);
      if (x < width - 1) v = Math.min(v, d[i - width + 1] + 1.4142);
    }
    d[i] = v;
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x;
    let v = d[i];
    if (v === 0) continue;
    if (x < width - 1) v = Math.min(v, d[i + 1] + 1);
    if (y < height - 1) {
      v = Math.min(v, d[i + width] + 1);
      if (x < width - 1) v = Math.min(v, d[i + width + 1] + 1.4142);
      if (x > 0) v = Math.min(v, d[i + width - 1] + 1.4142);
    }
    d[i] = v;
  }
  return d;
}

/** Grows the mask by one pixel (8-neighbourhood). */
export function dilate8(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!mask[i]) continue;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= height) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < width) out[yy * width + xx] = 1;
      }
    }
  }
  return out;
}

/** Separable square min/max filter on one float plane, edge-clamped. Radius r → window 2r+1. */
export function squareFilter(plane: Float32Array, width: number, height: number, r: number, op: 'min' | 'max'): Float32Array {
  const isMin = op === 'min';
  const tmp = new Float32Array(plane.length);
  const out = new Float32Array(plane.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const x0 = x - r < 0 ? 0 : x - r, x1 = x + r >= width ? width - 1 : x + r;
      let v = plane[row + x0];
      if (isMin) { for (let k = x0 + 1; k <= x1; k++) { const u = plane[row + k]; if (u < v) v = u; } }
      else { for (let k = x0 + 1; k <= x1; k++) { const u = plane[row + k]; if (u > v) v = u; } }
      tmp[row + x] = v;
    }
  }
  for (let y = 0; y < height; y++) {
    const y0 = y - r < 0 ? 0 : y - r, y1 = y + r >= height ? height - 1 : y + r;
    for (let x = 0; x < width; x++) {
      let v = tmp[y0 * width + x];
      if (isMin) { for (let k = y0 + 1; k <= y1; k++) { const u = tmp[k * width + x]; if (u < v) v = u; } }
      else { for (let k = y0 + 1; k <= y1; k++) { const u = tmp[k * width + x]; if (u > v) v = u; } }
      out[y * width + x] = v;
    }
  }
  return out;
}

/**
 * Median of a (2r+1)² window at one pixel, from a plane quantised to 0–255.
 * Only evaluated where a top-hat responded, so a histogram per call is cheap.
 * Robust to sparse specks: unlike a closing or opening, the median between
 * two nearby specks is still the ground.
 */
export function medianAt(q: Uint8Array, width: number, height: number, x: number, y: number, r: number, hist: Int32Array): number {
  hist.fill(0);
  let count = 0;
  for (let dy = -r; dy <= r; dy++) {
    const yy = Math.min(height - 1, Math.max(0, y + dy)) * width;
    for (let dx = -r; dx <= r; dx++) { hist[q[yy + Math.min(width - 1, Math.max(0, x + dx))]]++; count++; }
  }
  let acc = 0, m = 0;
  for (; m < 255; m++) { acc += hist[m]; if (acc * 2 >= count) break; }
  return m / 255;
}
