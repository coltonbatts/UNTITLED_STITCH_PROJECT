import { MASKED_LABEL, type LabelMap, type ThreadPalette, type WorkingImage } from '../types';

/** Nearest palette thread per pixel in OKLab. */
export function assignLabels(img: WorkingImage, palette: ThreadPalette): LabelMap {
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
