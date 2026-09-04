import type { PaletteEdits, ThreadColor, ThreadLibrary, ThreadPalette } from '@/engine/types';

/** Thread each palette entry is stitched with after replacements (mirrors Pipeline.effectiveThreads). */
export function effectiveThreads(palette: ThreadPalette, edits: PaletteEdits, lib: ThreadLibrary): ThreadColor[] {
  return palette.entries.map((e) => (edits.replacements[e.thread.number] && lib.byNumber.get(edits.replacements[e.thread.number])) || e.thread);
}

/** Paints a label map into RGBA using per-label colours. Masked pixels are transparent. */
export function paintLabels(labels: Uint16Array, colors: ThreadColor[], out: Uint8ClampedArray): void {
  const lut = new Uint8ClampedArray(colors.length * 3);
  colors.forEach((c, i) => { lut[i * 3] = c.rgb[0]; lut[i * 3 + 1] = c.rgb[1]; lut[i * 3 + 2] = c.rgb[2]; });
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    const o = i * 4;
    if (l >= colors.length) { out[o + 3] = 0; continue; }
    out[o] = lut[l * 3]; out[o + 1] = lut[l * 3 + 1]; out[o + 2] = lut[l * 3 + 2]; out[o + 3] = 255;
  }
}

export const fmtMm = (v: number) => (v >= 100 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString());
export const fmtInt = (v: number) => Math.round(v).toLocaleString();
