import { describe, expect, it } from 'vitest';
import { detectStrokes } from '@/engine/lines/detect';
import { liftThinRegions } from '@/engine/lines/thin';
import { pathsLength, skeletonPaths } from '@/engine/lines/skeleton';
import { buildWorkingImage } from '@/engine/image/working';
import { mergeIslands } from '@/engine/segmentation/islandMerge';
import { chaikin } from '@/engine/vector/simplify';
import type { LabelMap, OKLab } from '@/engine/types';
import { INK, PAPER, paintShapes } from './fixtures';

const field = (w: number, h: number, fill = 0): LabelMap => ({ width: w, height: h, labels: new Uint16Array(w * h).fill(fill) });
const colors: OKLab[] = [[0.95, 0, 0], [0.1, 0, 0], [0.93, 0.01, 0]];

describe('line layer', () => {
  it('lifts a thin dark stroke off a flat ground and fills paper under it', () => {
    const raster = paintShapes(80, 40, () => PAPER, [
      { kind: 'stroke', points: [{ x: 10, y: 20 }, { x: 70, y: 20 }], width: 2, color: INK },
      { kind: 'rect', x0: 30, y0: 30, x1: 32, y1: 32, color: INK }, // a 2 px speck
    ]);
    const img = buildWorkingImage(raster, 0.25, 0);
    const det = detectStrokes(img.oklab, 80, 40, { maxWidthPx: 3.2, minLengthPx: 6, contrast: 0.16, speckMaxWidthPx: 2 });
    expect(det.strokes.length).toBe(1);
    const s = det.strokes[0];
    expect(s.widthPx).toBeGreaterThan(1.2);
    expect(s.widthPx).toBeLessThan(3);
    expect(s.lengthPx).toBeGreaterThan(52);
    expect(s.lengthPx).toBeLessThan(66);
    expect(s.oklab[0]).toBeLessThan(0.3);
    // Both the stroke and the speck are erased from the fill image.
    expect(det.oklab[(20 * 80 + 40) * 3]).toBeGreaterThan(0.9);
    expect(det.oklab[(31 * 80 + 31) * 3]).toBeGreaterThan(0.9);
    // Lifted pixels are flagged so later stages can ignore them.
    expect(det.lifted[20 * 80 + 40]).toBe(1);
    expect(det.lifted[5 * 80 + 5]).toBe(0);
  });

  it('leaves a wide feature to the fill path', () => {
    const raster = paintShapes(60, 60, () => PAPER, [{ kind: 'rect', x0: 10, y0: 10, x1: 50, y1: 50, color: INK }]);
    const img = buildWorkingImage(raster, 0.25, 0);
    const det = detectStrokes(img.oklab, 60, 60, { maxWidthPx: 3.2, minLengthPx: 6, contrast: 0.16, speckMaxWidthPx: 2 });
    expect(det.strokes.length).toBe(0);
    expect(det.oklab[(30 * 60 + 30) * 3]).toBeLessThan(0.1);
  });

  it('skeletonises a ring into one closed path', () => {
    const w = 40, h = 40;
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.hypot(x + 0.5 - 20, y + 0.5 - 20); if (d <= 12 && d >= 9.5) mask[y * w + x] = 1; }
    const paths = skeletonPaths(mask, w, h);
    const total = pathsLength(paths);
    expect(paths.length).toBeLessThanOrEqual(2);
    expect(total).toBeGreaterThan(2 * Math.PI * 10.75 * 0.85);
    expect(total).toBeLessThan(2 * Math.PI * 10.75 * 1.1);
    for (const p of paths.flat()) expect(Math.abs(Math.hypot(p.x - 20, p.y - 20) - 10.75)).toBeLessThan(1.6);
  });

  it('routes a thin high-contrast region to the line layer instead of deleting it', () => {
    const m = field(60, 30);
    for (let x = 8; x < 52; x++) for (let y = 14; y < 16; y++) m.labels[y * 60 + x] = 1; // 2 px × 44 px dark bar
    const r = liftThinRegions(m, { labelColors: colors, maxWidthPx: 3.2, minLengthPx: 6, keepContrastDeltaE: 0.2 });
    expect(r.strokes.length).toBe(1);
    expect(r.strokes[0].source).toBe('region');
    expect(r.strokes[0].widthPx).toBeGreaterThan(1.2);
    expect(r.strokes[0].widthPx).toBeLessThan(3);
    expect(r.strokes[0].lengthPx).toBeGreaterThan(36);
    expect(Array.from(new Set(r.map.labels))).toEqual([0]);
  });

  it('leaves low-contrast thin regions and wide regions alone', () => {
    const m = field(60, 30);
    for (let x = 8; x < 52; x++) for (let y = 14; y < 16; y++) m.labels[y * 60 + x] = 2; // similar colour
    for (let x = 8; x < 20; x++) for (let y = 20; y < 28; y++) m.labels[y * 60 + x] = 1; // 12 × 8 block
    const r = liftThinRegions(m, { labelColors: colors, maxWidthPx: 3.2, minLengthPx: 6, keepContrastDeltaE: 0.2 });
    expect(r.strokes.length).toBe(0);
    expect(r.map.labels).toEqual(m.labels);
  });

  it('keeps a letter counter: an enclosed island coloured like the ring\'s outside', () => {
    const m = field(40, 40);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
      const d = Math.hypot(x + 0.5 - 20, y + 0.5 - 20);
      if (d <= 10 && d > 4) m.labels[y * 40 + x] = 1; // dark ring; inside stays label 0 (~50 px)
    }
    const kept = mergeIslands(m, { labelColors: colors, minAreaPx: 200, keepContrastDeltaE: 0.9, maxRegions: 100 });
    expect(kept.regionCount).toBe(3);
    expect(kept.map.labels[20 * 40 + 20]).toBe(0);
    // Control: the same island in a colour the ring does not border is merged.
    const other = field(40, 40);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
      const d = Math.hypot(x + 0.5 - 20, y + 0.5 - 20);
      if (d <= 10 && d > 4) other.labels[y * 40 + x] = 1; else if (d <= 4) other.labels[y * 40 + x] = 2;
    }
    const merged = mergeIslands(other, { labelColors: colors, minAreaPx: 200, keepContrastDeltaE: 0.9, maxRegions: 100 });
    expect(merged.map.labels[20 * 40 + 20]).toBe(1);
  });

  it('Chaikin smoothing pins sharp corners and still rounds gentle ones', () => {
    const L = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 10 }];
    const sharp = chaikin(L, 2, 80);
    expect(sharp.some((p) => p.x === 10 && p.y === 0)).toBe(true);
    expect(sharp.some((p) => p.x === 10 && p.y === 10)).toBe(true);
    const gentle = [{ x: 0, y: 0 }, { x: 10, y: 1 }, { x: 20, y: 3 }, { x: 30, y: 6 }];
    const smooth = chaikin(gentle, 1, 80);
    expect(smooth.some((p) => p.x === 10 && p.y === 1)).toBe(false);
    const legacy = chaikin(L, 2);
    expect(legacy.some((p) => p.x === 10 && p.y === 0)).toBe(false);
  });
});
