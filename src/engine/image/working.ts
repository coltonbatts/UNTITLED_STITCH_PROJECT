import type { RasterRGBA, WorkingImage } from '../types';
import { SRGB_TO_LINEAR, linearRgbToOklab } from '../color';

function gaussianKernel(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 2.5));
  const k = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return k;
}

/** Separable Gaussian blur on a 3-channel float plane, edge-clamped. */
export function blurPlanes3(data: Float32Array, width: number, height: number, sigma: number): Float32Array {
  if (sigma <= 0.05) return data;
  const k = gaussianKernel(sigma);
  const r = (k.length - 1) / 2;
  const tmp = new Float32Array(data.length);
  const out = new Float32Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let s0 = 0, s1 = 0, s2 = 0;
      for (let i = -r; i <= r; i++) {
        const xx = Math.min(width - 1, Math.max(0, x + i));
        const w = k[i + r];
        const p = (y * width + xx) * 3;
        s0 += data[p] * w;
        s1 += data[p + 1] * w;
        s2 += data[p + 2] * w;
      }
      const o = (y * width + x) * 3;
      tmp[o] = s0; tmp[o + 1] = s1; tmp[o + 2] = s2;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let s0 = 0, s1 = 0, s2 = 0;
      for (let i = -r; i <= r; i++) {
        const yy = Math.min(height - 1, Math.max(0, y + i));
        const w = k[i + r];
        const p = (yy * width + x) * 3;
        s0 += tmp[p] * w;
        s1 += tmp[p + 1] * w;
        s2 += tmp[p + 2] * w;
      }
      const o = (y * width + x) * 3;
      out[o] = s0; out[o + 1] = s1; out[o + 2] = s2;
    }
  }
  return out;
}

/**
 * Bilateral filter on OKLab planes: smooths texture within a colour mass while
 * keeping edges between masses. sigmaS in px, sigmaR in OKLab units.
 */
export function bilateralPlanes3(data: Float32Array, width: number, height: number, sigmaS: number, sigmaR: number): Float32Array {
  if (sigmaS <= 0.3) return data;
  const r = Math.min(3, Math.max(1, Math.ceil(sigmaS * 1.5)));
  const spatial = new Float32Array((2 * r + 1) * (2 * r + 1));
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) spatial[(dy + r) * (2 * r + 1) + dx + r] = Math.exp(-(dx * dx + dy * dy) / (2 * sigmaS * sigmaS));
  // Range weight lookup over squared colour distance.
  const LUT_N = 512, lutMax = (sigmaR * 4) ** 2;
  const lut = new Float32Array(LUT_N + 1);
  for (let i = 0; i <= LUT_N; i++) lut[i] = Math.exp(-((i / LUT_N) * lutMax) / (2 * sigmaR * sigmaR));
  const out = new Float32Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = (y * width + x) * 3;
      const L0 = data[c], a0 = data[c + 1], b0 = data[c + 2];
      let sL = 0, sa = 0, sb = 0, sw = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const p = (yy * width + xx) * 3;
          const dL = data[p] - L0, da = data[p + 1] - a0, db = data[p + 2] - b0;
          const d2 = dL * dL + da * da + db * db;
          if (d2 >= lutMax) continue;
          const w = spatial[(dy + r) * (2 * r + 1) + dx + r] * lut[Math.floor((d2 / lutMax) * LUT_N)];
          sL += data[p] * w; sa += data[p + 1] * w; sb += data[p + 2] * w; sw += w;
        }
      }
      out[c] = sL / sw; out[c + 1] = sa / sw; out[c + 2] = sb / sw;
    }
  }
  return out;
}

/** Normalised gradient magnitude of L (Sobel), 0–1 with a soft knee. */
export function contrastMap(oklab: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  const L = (x: number, y: number) => oklab[(Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))) * 3];
  let max = 1e-6;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1) - L(x - 1, y - 1) - 2 * L(x - 1, y) - L(x - 1, y + 1);
      const gy = L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1) - L(x - 1, y - 1) - 2 * L(x, y - 1) - L(x + 1, y - 1);
      const m = Math.sqrt(gx * gx + gy * gy);
      out[y * width + x] = m;
      if (m > max) max = m;
    }
  }
  // Soft knee so a few extreme edges do not flatten everything else.
  const knee = max * 0.5;
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, out[i] / knee);
  return out;
}

/**
 * Builds the working image: OKLab planes (optionally pre-blurred to suppress
 * sensor noise and micro-texture), a contrast map, and a mask from alpha.
 */
export function buildWorkingImage(raster: RasterRGBA, mmPerPx: number, preBlurSigmaMm: number): WorkingImage {
  const { width, height, rgba } = raster;
  const n = width * height;
  let oklab: Float32Array = new Float32Array(n * 3);
  let mask: Uint8Array | undefined;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const [L, a, b] = linearRgbToOklab(SRGB_TO_LINEAR[rgba[p]], SRGB_TO_LINEAR[rgba[p + 1]], SRGB_TO_LINEAR[rgba[p + 2]]);
    oklab[i * 3] = L;
    oklab[i * 3 + 1] = a;
    oklab[i * 3 + 2] = b;
    if (rgba[p + 3] < 128) {
      if (!mask) mask = new Uint8Array(n).fill(1);
      mask[i] = 0;
    }
  }
  const contrast = contrastMap(oklab, width, height);
  const sigmaPx = preBlurSigmaMm / mmPerPx;
  if (sigmaPx > 0.3) oklab = bilateralPlanes3(oklab, width, height, sigmaPx, 0.06);
  return { width, height, mmPerPx, rgba, oklab, contrast, mask };
}
