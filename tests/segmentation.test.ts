import { describe, expect, it } from 'vitest';
import { connectedComponents } from '@/engine/segmentation/components';
import { mergeIslands } from '@/engine/segmentation/islandMerge';
import { modeFilter } from '@/engine/segmentation/modeFilter';
import type { LabelMap, OKLab } from '@/engine/types';

function field(width: number, height: number, fill = 0): LabelMap {
  return { width, height, labels: new Uint16Array(width * height).fill(fill) };
}
const colors: OKLab[] = [[0.9, 0, 0], [0.88, 0.01, 0], [0.1, 0, 0]]; // 0 and 1 similar, 2 very dark

describe('region cleanup', () => {
  it('counts 4-connected components', () => {
    const m = field(6, 6);
    m.labels[0] = 1; m.labels[7] = 1; // diagonal pixels: separate components
    const cc = connectedComponents(m.labels, 6, 6);
    expect(cc.count).toBe(3);
  });
  it('merges a low-contrast speck into its surroundings', () => {
    const m = field(30, 30);
    m.labels[15 * 30 + 15] = 1; m.labels[15 * 30 + 16] = 1;
    const r = mergeIslands(m, { labelColors: colors, minAreaPx: 12, keepContrastDeltaE: 0.3, maxRegions: 100 });
    expect(r.regionCount).toBe(1);
    expect(Array.from(new Set(r.map.labels))).toEqual([0]);
  });
  it('keeps a small high-contrast feature (the catchlight rule)', () => {
    const m = field(30, 30);
    for (let y = 14; y < 17; y++) for (let x = 14; x < 17; x++) m.labels[y * 30 + x] = 2; // 9 px dark dot
    const r = mergeIslands(m, { labelColors: colors, minAreaPx: 20, keepContrastDeltaE: 0.3, maxRegions: 100 });
    expect(r.regionCount).toBe(2);
  });
  it('drops a small feature that fails the contrast floor', () => {
    const m = field(30, 30);
    m.labels[15 * 30 + 15] = 2; // 1 px, below minArea/4
    const r = mergeIslands(m, { labelColors: colors, minAreaPx: 20, keepContrastDeltaE: 0.3, maxRegions: 100 });
    expect(r.regionCount).toBe(1);
  });
  it('region budget raises the threshold until the count fits', () => {
    const m = field(40, 40);
    // 16 dark 3×3 dots, all high contrast: would all be kept without a budget.
    for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++)
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) m.labels[(gy * 10 + 2 + y) * 40 + gx * 10 + 2 + x] = 2;
    const free = mergeIslands(m, { labelColors: colors, minAreaPx: 4, keepContrastDeltaE: 0.3, maxRegions: 100 });
    expect(free.regionCount).toBe(17);
    const budget = mergeIslands(m, { labelColors: colors, minAreaPx: 4, keepContrastDeltaE: 0.3, maxRegions: 5 });
    expect(budget.regionCount).toBeLessThanOrEqual(5);
  });
  it('mode filter removes salt-and-pepper without moving a straight edge', () => {
    const m = field(20, 20);
    for (let i = 0; i < 400; i++) if (i % 20 >= 10) m.labels[i] = 1;
    m.labels[5 * 20 + 3] = 1; m.labels[12 * 20 + 15] = 0;
    const f = modeFilter(m, 2, 2);
    for (let i = 0; i < 400; i++) expect(f.labels[i]).toBe(i % 20 >= 10 ? 1 : 0);
  });
});
