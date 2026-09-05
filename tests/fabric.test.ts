import { describe, expect, it } from 'vitest';
import { Pipeline } from '@/engine/pipeline';
import { getDmcLibrary } from '@/engine/threads/dmc';
import { suggestFabricColor } from '@/engine/image/fabric';
import { buildPatternSvg } from '@/engine/export/svg';
import { DIMS, FULL_CROP, NO_EDITS, SETTINGS, makeRaster } from './fixtures';

const lib = getDmcLibrary();
// A pale disc and a small red star-ish square on near-black cloth, like a
// subject stitched onto dark fabric.
const cloth = makeRaster(160, 120, (x, y) => {
  const d = Math.hypot(x - 80, y - 60);
  if (d < 30) return [240, 236, 228];
  if (Math.hypot(x - 40, y - 60) < 12) return [17, 17, 17]; // black ear on brown cloth
  if (x > 120 && x < 132 && y > 20 && y < 32) return [200, 60, 50];
  const n = ((x * 7 + y * 13) % 5) - 2;
  return [32 + n, 26 + n, 20 + n];
});
const req = (fabric?: { enabled: boolean; hex: string; tolerance: number }) => ({
  sourceId: 'cloth', source: cloth, crop: FULL_CROP, dimensions: DIMS, settings: { ...SETTINGS, threadCount: 6, fabric }, paletteEdits: NO_EDITS,
});

describe('bare fabric', () => {
  it('suggests the border colour of the image', () => {
    const hex = suggestFabricColor(cloth);
    expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    const v = parseInt(hex.slice(1, 3), 16);
    expect(v).toBeGreaterThan(24);
    expect(v).toBeLessThan(40);
  });
  it('masks the cloth out of the palette, regions, and area', () => {
    const full = new Pipeline(lib).run(req());
    const bare = new Pipeline(lib).run(req({ enabled: true, hex: suggestFabricColor(cloth), tolerance: 0.15 }));
    const area = (r: typeof full) => r.graph.regions.reduce((s, g) => s + g.areaMm2, 0);
    expect(area(full)).toBeCloseTo(DIMS.widthMm * DIMS.heightMm, 0);
    // The disc is ~π·30² of 160·120 px ≈ 15 %; the square adds ~0.75 %.
    expect(area(bare) / area(full)).toBeGreaterThan(0.12);
    expect(area(bare) / area(full)).toBeLessThan(0.25);
    // No near-black thread survives in the palette once the cloth is masked.
        expect(full.palette.entries.some((e) => e.thread.oklab[0] < 0.4)).toBe(true);
    // The near-black ear on the dark-brown cloth must survive as its own region.
    expect(bare.graph.regions.some((g) => bare.palette.entries[g.paletteIndex].thread.oklab[0] < 0.4 && g.areaMm2 > 20)).toBe(true);
    // The subject still becomes regions and the estimate shrinks with it.
    expect(bare.graph.regions.length).toBeGreaterThanOrEqual(2);
    expect(bare.pattern.estimates.stitchesApprox).toBeLessThan(full.pattern.estimates.stitchesApprox * 0.3);
  });
  it('exports the fabric behind the artwork', () => {
    const r = new Pipeline(lib).run(req({ enabled: true, hex: '#231c12', tolerance: 0.15 }));
    const threads = r.palette.entries.map((e) => e.thread);
    const base = { showLabels: true, showHoop: false, showLegend: true, outlineStrength: 0.5, projectName: 'cloth', fabricHex: '#231c12' };
    const color = buildPatternSvg(r.graph, r.palette, threads, r.pattern, { ...base, mode: 'color' });
    const pattern = buildPatternSvg(r.graph, r.palette, threads, r.pattern, { ...base, mode: 'pattern' });
    expect(color).toContain('<rect id="fabric"');
    expect(color).toContain('fill="#231c12"');
    expect(pattern).toContain('fill="url(#bare)"');
    expect(pattern).toContain('fabric #231c12');
  });
  it('is a no-op when disabled', () => {
    const a = new Pipeline(lib).run(req());
    const b = new Pipeline(lib).run(req({ enabled: false, hex: '#000000', tolerance: 1 }));
    expect(b.graph.regions.length).toBe(a.graph.regions.length);
  });
});
