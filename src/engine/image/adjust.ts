// Global colour grading of the working raster, applied before thread matching
// so the palette re-picks real DMC threads for the shifted colours. Works in
// OKLCh: hue rotates, chroma scales, lightness shifts; results are gamut-
// clamped back to sRGB.
import type { ColorAdjust, RasterRGBA } from '../types';
import { SRGB_TO_LINEAR, linearRgbToOklab, linearToSrgb, oklabToLinearRgb } from '../color';

export const IDENTITY_ADJUST: ColorAdjust = { hue: 0, saturation: 0, lightness: 0 };

export function isIdentityAdjust(a: ColorAdjust | undefined): boolean {
  return !a || (a.hue === 0 && a.saturation === 0 && a.lightness === 0);
}

/** Chroma multiplier for a saturation setting in -1..1 (−1 → grey, +1 → ×2.5). */
export function chromaScale(saturation: number): number {
  const s = Math.max(-1, Math.min(1, saturation));
  return s < 0 ? 1 + s : 1 + s * 1.5;
}

export function adjustRaster(raster: RasterRGBA, adj: ColorAdjust | undefined): RasterRGBA {
  if (isIdentityAdjust(adj)) return raster;
  const { hue, saturation, lightness } = adj!;
  const { width, height, rgba } = raster;
  const out = new Uint8ClampedArray(rgba.length);
  const rad = (hue * Math.PI) / 180;
  const cosH = Math.cos(rad), sinH = Math.sin(rad);
  const cs = chromaScale(saturation);
  // Lightness slider moves L by up to ±0.3 (a third of the L range), eased so
  // small nudges are gentle.
  const dL = Math.sign(lightness) * Math.pow(Math.abs(Math.max(-1, Math.min(1, lightness))), 1.4) * 0.3;
  for (let p = 0; p < rgba.length; p += 4) {
    const [L, a, b] = linearRgbToOklab(SRGB_TO_LINEAR[rgba[p]], SRGB_TO_LINEAR[rgba[p + 1]], SRGB_TO_LINEAR[rgba[p + 2]]);
    const a2 = (a * cosH - b * sinH) * cs;
    const b2 = (a * sinH + b * cosH) * cs;
    const L2 = Math.max(0, Math.min(1, L + dL));
    const [r, g, bl] = oklabToLinearRgb(L2, a2, b2);
    out[p] = linearToSrgb(Math.max(0, Math.min(1, r)));
    out[p + 1] = linearToSrgb(Math.max(0, Math.min(1, g)));
    out[p + 2] = linearToSrgb(Math.max(0, Math.min(1, bl)));
    out[p + 3] = rgba[p + 3];
  }
  return { width, height, rgba: out };
}
