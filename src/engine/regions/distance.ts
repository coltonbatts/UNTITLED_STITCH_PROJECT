/**
 * Chamfer (3-4) distance to the nearest pixel of a different region or the
 * image border, in pixel units. Two passes, deterministic.
 */
export function distanceToBoundary(regionMap: Int32Array, width: number, height: number): Float32Array {
  const n = width * height;
  const d = new Float32Array(n);
  const INF = 1e9;
  // Seed: boundary pixels get 0 (approximately: half a pixel from the edge).
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const r = regionMap[i];
      const boundary =
        x === 0 || y === 0 || x === width - 1 || y === height - 1 ||
        regionMap[i - 1] !== r || regionMap[i + 1] !== r || regionMap[i - width] !== r || regionMap[i + width] !== r;
      d[i] = boundary ? 0.5 : INF;
    }
  }
  // Forward pass.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - width] + 1);
        if (x > 0) v = Math.min(v, d[i - width - 1] + 1.4142);
        if (x < width - 1) v = Math.min(v, d[i - width + 1] + 1.4142);
      }
      d[i] = v;
    }
  }
  // Backward pass.
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      let v = d[i];
      if (x < width - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < height - 1) {
        v = Math.min(v, d[i + width] + 1);
        if (x < width - 1) v = Math.min(v, d[i + width + 1] + 1.4142);
        if (x > 0) v = Math.min(v, d[i + width - 1] + 1.4142);
      }
      d[i] = v;
    }
  }
  return d;
}
