import type { RasterRGBA, RGB, CropRect, EmbroideryDimensions, PaletteEdits, ProcessingSettings } from '@/engine/types';
import { makePrng } from '@/engine/palette/prng';

export function makeRaster(width: number, height: number, px: (x: number, y: number) => RGB): RasterRGBA {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = px(x, y);
      const i = (y * width + x) * 4;
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
    }
  }
  return { width, height, rgba };
}

/** Four flat quadrants of exact DMC colours. */
export const QUAD_COLORS: Record<string, RGB> = {
  '310': [0, 0, 0],
  'B5200': [255, 255, 255],
  '666': [227, 29, 66],
  '798': [70, 106, 142],
};

export function quadrantRaster(size = 64): RasterRGBA {
  const half = size / 2;
  return makeRaster(size, size, (x, y) =>
    x < half ? (y < half ? QUAD_COLORS['310'] : QUAD_COLORS['666']) : y < half ? QUAD_COLORS['B5200'] : QUAD_COLORS['798'],
  );
}

/**
 * A "portrait-like" synthetic scene: soft background gradient, a dark disc
 * with a tiny bright highlight (the eye), a warm mid band, and seeded noise.
 */
export function sceneRaster(width = 160, height = 120, seed = 7): RasterRGBA {
  const rand = makePrng(seed);
  const noise = new Float32Array(width * height);
  for (let i = 0; i < noise.length; i++) noise[i] = (rand() - 0.5) * 18;
  return makeRaster(width, height, (x, y) => {
    const n = noise[y * width + x];
    const t = x / width;
    let r = 200 - 60 * t, g = 180 - 40 * t, b = 150 - 20 * t; // warm gradient
    const dx = x - width * 0.6, dy = y - height * 0.45;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 22) { r = 40; g = 30; b = 25; } // dark disc (eye)
    if (d < 4 && dx < 0 && dy < 0) { r = 245; g = 245; b = 240; } // catchlight
    if (y > height * 0.75) { r = 120; g = 80; b = 50; } // dark band
    const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + n)));
    return [c(r), c(g), c(b)];
  });
}

export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1, rotation: 0 };
export const DIMS: EmbroideryDimensions = { widthMm: 80, heightMm: 60, strands: 1 };
export const NO_EDITS: PaletteEdits = { locked: [], replacements: {}, merges: {} };
export const SETTINGS: ProcessingSettings = { threadCount: 8, fidelity: 0.5, complexity: 0.5, colorFidelity: 0.6, outlineStrength: 0.5, preset: 'custom' };
