import type { CropRect, RasterRGBA } from '../types';
import { SRGB_TO_LINEAR, linearToSrgb } from '../color';

/** Crops (normalised rect) and rotates by quarter turns. Pure, no canvas. */
export function cropRotate(src: RasterRGBA, crop: CropRect): RasterRGBA {
  const x0 = Math.round(src.width * crop.x);
  const y0 = Math.round(src.height * crop.y);
  const cw = Math.max(1, Math.round(src.width * crop.w));
  const ch = Math.max(1, Math.round(src.height * crop.h));
  const rotated = crop.rotation === 90 || crop.rotation === 270;
  const ow = rotated ? ch : cw;
  const oh = rotated ? cw : ch;
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = ((y0 + y) * src.width + (x0 + x)) * 4;
      let ox: number, oy: number;
      switch (crop.rotation) {
        case 90: ox = ch - 1 - y; oy = x; break;
        case 180: ox = cw - 1 - x; oy = ch - 1 - y; break;
        case 270: ox = y; oy = cw - 1 - x; break;
        default: ox = x; oy = y;
      }
      const oi = (oy * ow + ox) * 4;
      out[oi] = src.rgba[si];
      out[oi + 1] = src.rgba[si + 1];
      out[oi + 2] = src.rgba[si + 2];
      out[oi + 3] = src.rgba[si + 3];
    }
  }
  return { width: ow, height: oh, rgba: out };
}

/**
 * Area-averaging resample in linear light. Deterministic. Works for both
 * down- and up-scaling (upscaling degrades to bilinear-ish box sampling).
 */
export function resample(src: RasterRGBA, width: number, height: number): RasterRGBA {
  if (src.width === width && src.height === height) return src;
  const out = new Uint8ClampedArray(width * height * 4);
  const sx = src.width / width;
  const sy = src.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = y * sy;
    const y1 = (y + 1) * sy;
    const iy0 = Math.floor(y0);
    const iy1 = Math.min(src.height, Math.ceil(y1));
    for (let x = 0; x < width; x++) {
      const x0 = x * sx;
      const x1 = (x + 1) * sx;
      const ix0 = Math.floor(x0);
      const ix1 = Math.min(src.width, Math.ceil(x1));
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      for (let yy = iy0; yy < iy1; yy++) {
        const wy = Math.min(y1, yy + 1) - Math.max(y0, yy);
        if (wy <= 0) continue;
        for (let xx = ix0; xx < ix1; xx++) {
          const wx = Math.min(x1, xx + 1) - Math.max(x0, xx);
          if (wx <= 0) continue;
          const w = wx * wy;
          const i = (yy * src.width + xx) * 4;
          r += SRGB_TO_LINEAR[src.rgba[i]] * w;
          g += SRGB_TO_LINEAR[src.rgba[i + 1]] * w;
          b += SRGB_TO_LINEAR[src.rgba[i + 2]] * w;
          a += src.rgba[i + 3] * w;
          wsum += w;
        }
      }
      const o = (y * width + x) * 4;
      if (wsum > 0) {
        out[o] = linearToSrgb(r / wsum);
        out[o + 1] = linearToSrgb(g / wsum);
        out[o + 2] = linearToSrgb(b / wsum);
        out[o + 3] = Math.round(a / wsum);
      }
    }
  }
  return { width, height, rgba: out };
}
