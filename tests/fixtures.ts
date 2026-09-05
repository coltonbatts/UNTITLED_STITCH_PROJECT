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

// ---------- Flat art / lettering fixtures ----------
// Drawn without a DOM: every shape is a coverage function sampled 4×4 per
// pixel, so edges are anti-aliased exactly the way a rasteriser would do it.

export type Shape =
  | { kind: 'stroke'; points: Array<{ x: number; y: number }>; width: number; color: RGB }
  | { kind: 'ring'; cx: number; cy: number; rOuter: number; rInner: number; color: RGB }
  | { kind: 'rect'; x0: number; y0: number; x1: number; y1: number; color: RGB }
  | { kind: 'poly'; points: Array<{ x: number; y: number }>; color: RGB };

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function pointInPoly(px: number, py: number, pts: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function covers(s: Shape, x: number, y: number): boolean {
  switch (s.kind) {
    case 'stroke': {
      for (let i = 1; i < s.points.length; i++) if (distToSegment(x, y, s.points[i - 1].x, s.points[i - 1].y, s.points[i].x, s.points[i].y) <= s.width / 2) return true;
      return false;
    }
    case 'ring': { const d = Math.hypot(x - s.cx, y - s.cy); return d <= s.rOuter && d >= s.rInner; }
    case 'rect': return x >= s.x0 && x < s.x1 && y >= s.y0 && y < s.y1;
    case 'poly': return pointInPoly(x, y, s.points);
  }
}

/** Paints shapes over a background function with 4×4 supersampled anti-aliasing. Later shapes cover earlier ones. */
export function paintShapes(width: number, height: number, background: (x: number, y: number) => RGB, shapes: Shape[], aa = true): RasterRGBA {
  const SS = aa ? 4 : 1;
  return makeRaster(width, height, (x, y) => {
    let r = 0, g = 0, b = 0;
    const bg = background(x, y);
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
      let c = bg;
      for (const s of shapes) if (covers(s, px, py)) c = s.color;
      r += c[0]; g += c[1]; b += c[2];
    }
    const n = SS * SS;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
}

export const INK: RGB = [0, 0, 0]; // DMC 310
export const PAPER: RGB = [255, 255, 255]; // DMC B5200
export const RED: RGB = [227, 29, 66]; // DMC 666
export const BLUE: RGB = [70, 106, 142]; // DMC 798
export const GROUND: RGB = [120, 90, 60];

/** Physical size for the flat-art fixtures: 320×240 px at 4 px/mm, so the raster is the working image. */
export const FLAT_DIMS: EmbroideryDimensions = { widthMm: 80, heightMm: 60, strands: 1 };
export const FLAT_W = 320;
export const FLAT_H = 240;

/** Where each structure in textArtRaster sits, for assertions. */
export const TEXT_ART = {
  thinStroke: { from: { x: 20, y: 20 }, to: { x: 150, y: 20 }, width: 2 },
  thickStroke: { from: { x: 20, y: 40 }, to: { x: 150, y: 70 }, width: 3 },
  ring: { cx: 200, cy: 50, rOuter: 22, rInner: 14 },
  eight: [{ cx: 268, cy: 32, rOuter: 18, rInner: 11 }, { cx: 268, cy: 66, rOuter: 18, rInner: 11 }],
  serif: { corner: { x: 20, y: 120 }, points: [{ x: 20, y: 120 }, { x: 120, y: 120 }, { x: 120, y: 132 }, { x: 40, y: 132 }, { x: 40, y: 180 }, { x: 20, y: 180 }] },
  red: { x0: 160, y0: 120, x1: 300, y1: 180.5 },
  blue: { x0: 160, y0: 180.5, x1: 300, y1: 232 },
  speckField: { x0: 20, y0: 192, x1: 140, y1: 232, count: 30 },
};

/**
 * Flat graphic art with lettering-like structure: two thin strokes (2 and 3 px),
 * a ring and a figure-eight with counters, a serif corner, a red/blue fill
 * pair whose shared edge is a one-pixel colour ramp, and a textured brown
 * ground with sparse 1–2 px light specks.
 */
export function textArtRaster(seed = 11): RasterRGBA {
  const A = TEXT_ART;
  const rand = makePrng(seed);
  const specks: Shape[] = [];
  // Jittered grid so specks never touch: this is dust, not texture.
  const cols = 10, rows = 3;
  for (let i = 0; i < A.speckField.count; i++) {
    const cx = A.speckField.x0 + 4 + ((i % cols) + 0.5) * ((A.speckField.x1 - A.speckField.x0 - 8) / cols);
    const cy = A.speckField.y0 + 4 + ((Math.floor(i / cols) % rows) + 0.5) * ((A.speckField.y1 - A.speckField.y0 - 8) / rows);
    const x = Math.floor(cx + (rand() - 0.5) * 6), y = Math.floor(cy + (rand() - 0.5) * 6);
    const size = 1 + Math.round(rand());
    specks.push({ kind: 'rect', x0: x, y0: y, x1: x + size, y1: y + size, color: [205, 195, 180] });
  }
  const noise = new Float32Array(FLAT_W * FLAT_H);
  for (let i = 0; i < noise.length; i++) noise[i] = (rand() - 0.5) * 10;
  const background = (x: number, y: number): RGB => {
    if (x >= A.speckField.x0 && x < A.speckField.x1 && y >= A.speckField.y0 && y < A.speckField.y1) {
      const n = noise[y * FLAT_W + x];
      return [GROUND[0] + n, GROUND[1] + n, GROUND[2] + n].map((v) => Math.max(0, Math.min(255, Math.round(v)))) as RGB;
    }
    return PAPER;
  };
  const shapes: Shape[] = [
    { kind: 'stroke', points: [A.thinStroke.from, A.thinStroke.to], width: A.thinStroke.width, color: INK },
    { kind: 'stroke', points: [A.thickStroke.from, A.thickStroke.to], width: A.thickStroke.width, color: INK },
    { kind: 'ring', ...A.ring, color: INK },
    { kind: 'ring', ...A.eight[0], color: INK },
    { kind: 'ring', ...A.eight[1], color: INK },
    { kind: 'poly', points: A.serif.points, color: INK },
    { kind: 'rect', ...A.red, color: RED },
    { kind: 'rect', ...A.blue, color: BLUE },
    ...specks,
  ];
  return paintShapes(FLAT_W, FLAT_H, background, shapes);
}

export const FLAT_SETTINGS: ProcessingSettings = { ...SETTINGS, threadCount: 8, fidelity: 0.9, complexity: 0.6, colorFidelity: 0.95, preset: 'flat' };
