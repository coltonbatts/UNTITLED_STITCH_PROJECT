import { describe, expect, it } from 'vitest';
import { getDmcLibrary } from '@/engine/threads/dmc';
import { buildWorkingImage } from '@/engine/image/working';
import { extractPalette } from '@/engine/palette/extract';
import { quadrantRaster, sceneRaster } from './fixtures';

const lib = getDmcLibrary();
const base = { contrastWeight: 1, lightnessWeight: 1.4, mergeDeltaE: 0.02, sampleStride: 1 };

describe('DMC-projected palette extraction', () => {
  it('recovers the exact threads of a four-colour image', () => {
    const img = buildWorkingImage(quadrantRaster(64), 1, 0);
    const p = extractPalette(img, lib, { ...base, threadCount: 4, locked: [] });
    expect(p.entries.map((e) => e.thread.number).sort()).toEqual(['310', '666', '798', 'B5200']);
    for (const e of p.entries) expect(e.pixelShare).toBeCloseTo(0.25, 1);
  });
  it('never returns more threads than requested and never duplicates a thread', () => {
    const img = buildWorkingImage(sceneRaster(), 0.5, 0.2);
    for (const k of [4, 9, 16]) {
      const p = extractPalette(img, lib, { ...base, threadCount: k, locked: [] });
      expect(p.entries.length).toBeLessThanOrEqual(k);
      expect(p.entries.length).toBeGreaterThanOrEqual(Math.min(k, 4));
      expect(new Set(p.entries.map((e) => e.thread.number)).size).toBe(p.entries.length);
    }
  });
  it('keeps locked threads through recomputation', () => {
    const img = buildWorkingImage(quadrantRaster(64), 1, 0);
    const locked = [lib.byNumber.get('3799')!];
    const p = extractPalette(img, lib, { ...base, threadCount: 4, locked });
    const entry = p.entries.find((e) => e.thread.number === '3799');
    expect(entry).toBeDefined();
    expect(entry!.locked).toBe(true);
    expect(p.entries.length).toBe(4);
  });
  it('colour simplicity merges near-identical threads', () => {
    const img = buildWorkingImage(sceneRaster(), 0.5, 0.2);
    const exact = extractPalette(img, lib, { ...base, threadCount: 16, locked: [], mergeDeltaE: 0.005 });
    const loose = extractPalette(img, lib, { ...base, threadCount: 16, locked: [], mergeDeltaE: 0.12 });
    expect(loose.entries.length).toBeLessThan(exact.entries.length);
  });
  it('is deterministic', () => {
    const img = buildWorkingImage(sceneRaster(), 0.5, 0.2);
    const a = extractPalette(img, lib, { ...base, threadCount: 12, locked: [] });
    const b = extractPalette(img, lib, { ...base, threadCount: 12, locked: [] });
    expect(a.entries.map((e) => [e.thread.number, e.pixelShare])).toEqual(b.entries.map((e) => [e.thread.number, e.pixelShare]));
  });
});
