import { MASKED_LABEL, type LabelMap, type ThreadPalette, type WorkingImage } from '../types';

export interface AssignOptions {
  /**
   * Anti-aliased ramp pixels choose among the threads of the flat pixels
   * within this radius instead of the whole palette, so an edge between two
   * fills is stitched as one of them and never as a third colour. 0 disables.
   */
  rampRadiusPx?: number;
}

/** Nearest palette thread per pixel in OKLab. */
export function assignLabels(img: WorkingImage, palette: ThreadPalette, opts: AssignOptions = {}): LabelMap {
  const n = img.width * img.height;
  const labels = new Uint16Array(n);
  const k = palette.entries.length;
  const cent = new Float32Array(k * 3);
  palette.entries.forEach((e, j) => {
    cent[j * 3] = e.thread.oklab[0];
    cent[j * 3 + 1] = e.thread.oklab[1];
    cent[j * 3 + 2] = e.thread.oklab[2];
  });
  for (let i = 0; i < n; i++) {
    if (img.mask && img.mask[i] === 0) { labels[i] = MASKED_LABEL; continue; }
    const L = img.oklab[i * 3], a = img.oklab[i * 3 + 1], b = img.oklab[i * 3 + 2];
    let best = 0, bestD = Infinity;
    for (let j = 0; j < k; j++) {
      const dL = cent[j * 3] - L, da = cent[j * 3 + 1] - a, db = cent[j * 3 + 2] - b;
      const d = dL * dL + da * da + db * db;
      if (d < bestD) { bestD = d; best = j; }
    }
    labels[i] = best;
  }
  const R = opts.rampRadiusPx ?? 0;
  if (R > 0 && img.ramp && k > 1) {
    const { width, height } = img;
    const out = new Uint16Array(labels);
    const seen = new Uint8Array(k);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (!img.ramp[i] || labels[i] === MASKED_LABEL) continue;
        seen.fill(0);
        let any = false;
        for (let dy = -R; dy <= R; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -R; dx <= R; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            const j = yy * width + xx;
            if (img.ramp[j] || labels[j] === MASKED_LABEL) continue;
            seen[labels[j]] = 1; any = true;
          }
        }
        if (!any) continue;
        const L = img.oklab[i * 3], a = img.oklab[i * 3 + 1], b = img.oklab[i * 3 + 2];
        let best = -1, bestD = Infinity;
        for (let j = 0; j < k; j++) {
          if (!seen[j]) continue;
          const dL = cent[j * 3] - L, da = cent[j * 3 + 1] - a, db = cent[j * 3 + 2] - b;
          const d = dL * dL + da * da + db * db;
          if (d < bestD) { bestD = d; best = j; }
        }
        out[i] = best;
      }
    }
    return { width, height, labels: out };
  }
  return { width: img.width, height: img.height, labels };
}

/** Applies palette merges: every pixel of `from` becomes `to`. */
export function remapLabels(map: LabelMap, remap: Map<number, number>): LabelMap {
  if (remap.size === 0) return map;
  const labels = new Uint16Array(map.labels.length);
  for (let i = 0; i < labels.length; i++) {
    const l = map.labels[i];
    labels[i] = l === MASKED_LABEL ? l : (remap.get(l) ?? l);
  }
  return { width: map.width, height: map.height, labels };
}
