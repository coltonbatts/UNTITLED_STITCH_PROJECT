// Bare-fabric background. Many embroidered pieces are a subject stitched onto
// coloured cloth with nothing stitched around it. Pixels close to the fabric
// colour are masked out of every later stage, so the palette, regions, and
// estimates describe only what gets stitched. See docs/embroidery-notes.md.
import type { FabricSettings, OKLab, RasterRGBA, WorkingImage } from '../types';
import { hexToRgb, rgbToHex, rgbToOklab } from '../color';

/**
 * Maps the 0–1 tolerance slider to an OKLab distance. Kept tight on purpose:
 * black fur on dark-brown cloth is only ~0.05 apart and must stay stitched.
 * 0 ≈ scanner noise on flat cloth, 1 ≈ a whole value step.
 */
export function fabricToleranceDeltaE(tolerance: number): number {
  return 0.015 + Math.max(0, Math.min(1, tolerance)) * 0.2;
}

export const DEFAULT_FABRIC_TOLERANCE = 0.15;

/**
 * Suggests the fabric colour from the image border: the median RGB of a thin
 * frame of pixels. Robust to a subject touching one edge.
 */
export function suggestFabricColor(raster: RasterRGBA): string {
  const { width, height, rgba } = raster;
  const band = Math.max(1, Math.round(Math.min(width, height) * 0.03));
  const ch: number[][] = [[], [], []];
  const take = (x: number, y: number) => {
    const p = (y * width + x) * 4;
    if (rgba[p + 3] < 128) return;
    ch[0].push(rgba[p]); ch[1].push(rgba[p + 1]); ch[2].push(rgba[p + 2]);
  };
  const step = Math.max(1, Math.floor((width * height) / 40000));
  for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
    if (x < band || y < band || x >= width - band || y >= height - band) take(x, y);
  }
  if (ch[0].length === 0) return '#000000';
  const med = (a: number[]) => { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
  return rgbToHex([med(ch[0]), med(ch[1]), med(ch[2])]);
}

/** Binary majority filter over a (2r+1)² window via an integral image; removes speckle narrower than ~2·radius. */
function majority(mask: Uint8Array<ArrayBuffer>, width: number, height: number, radius: number): Uint8Array<ArrayBuffer> {
  if (radius < 1) return mask;
  const W = width + 1;
  const integral = new Int32Array(W * (height + 1));
  for (let y = 1; y <= height; y++) {
    let row = 0;
    for (let x = 1; x <= width; x++) {
      row += mask[(y - 1) * width + (x - 1)];
      integral[y * W + x] = integral[(y - 1) * W + x] + row;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(width, x + radius + 1);
      const on = integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0];
      out[y * width + x] = on * 2 >= (y1 - y0) * (x1 - x0) ? 1 : 0;
    }
  }
  return out;
}

/**
 * Peels one pixel off the stitched area. The anti-aliased rim between subject
 * and cloth is a blend of both colours; without this it becomes a halo that
 * steals a palette slot for a thread nobody stitches.
 */
function erode(mask: Uint8Array<ArrayBuffer>, width: number, height: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!mask[i]) continue;
    const l = x > 0 ? mask[i - 1] : 1, r = x < width - 1 ? mask[i + 1] : 1;
    const u = y > 0 ? mask[i - width] : 1, d = y < height - 1 ? mask[i + width] : 1;
    out[i] = l & r & u & d;
  }
  return out;
}

/**
 * Returns a copy of the working image whose mask excludes fabric-coloured
 * pixels (combined with any existing alpha mask). Untouched when disabled.
 */
export function applyFabricMask(img: WorkingImage, fabric: FabricSettings | undefined, minFeaturePx: number): WorkingImage {
  if (!fabric?.enabled) return img;
  const target: OKLab = rgbToOklab(hexToRgb(fabric.hex));
  const tol = fabricToleranceDeltaE(fabric.tolerance);
  const tol2 = tol * tol;
  const n = img.width * img.height;
  let mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const dL = img.oklab[i * 3] - target[0], da = img.oklab[i * 3 + 1] - target[1], db = img.oklab[i * 3 + 2] - target[2];
    mask[i] = dL * dL + da * da + db * db > tol2 ? 1 : 0;
  }
  mask = majority(mask, img.width, img.height, Math.min(4, Math.round(minFeaturePx / 2)));
  mask = erode(mask, img.width, img.height);
  if (img.mask) for (let i = 0; i < n; i++) mask[i] &= img.mask[i];
  return { ...img, mask };
}
