import { describe, expect, it } from 'vitest';
import { Pipeline } from '@/engine/pipeline';
import { getDmcLibrary } from '@/engine/threads/dmc';
import { workingResolution } from '@/engine/image/physical';
import { buildPatternSvg } from '@/engine/export/svg';
import { buildThreadListText } from '@/engine/export/threadList';
import { DIMS, FULL_CROP, NO_EDITS, SETTINGS, sceneRaster } from './fixtures';

const lib = getDmcLibrary();
const source = sceneRaster(160, 120);
const req = (over: Partial<typeof SETTINGS> = {}, edits = NO_EDITS) => ({
  sourceId: 'scene', source, crop: FULL_CROP, dimensions: DIMS, settings: { ...SETTINGS, ...over }, paletteEdits: edits,
});

describe('physical scaling', () => {
  it('derives working resolution from millimetres', () => {
    const r = workingResolution({ widthMm: 150, heightMm: 100, strands: 1 }, 4);
    expect(r.width).toBe(600);
    expect(r.height).toBe(400);
    expect(r.mmPerPx).toBeCloseTo(0.25, 6);
  });
  it('region areas in mm² sum to the physical area', () => {
    const res = new Pipeline(lib).run(req());
    const total = res.graph.regions.reduce((s, r) => s + r.areaMm2, 0);
    expect(total).toBeCloseTo(DIMS.widthMm * DIMS.heightMm, 0);
  });
});

describe('end-to-end pipeline', () => {
  it('produces the requested palette size, regions, and a pattern', () => {
    const res = new Pipeline(lib).run(req({ threadCount: 8 }));
    expect(res.palette.entries.length).toBeLessThanOrEqual(8);
    expect(res.palette.entries.length).toBeGreaterThanOrEqual(4);
    expect(res.graph.regions.length).toBeGreaterThan(2);
    expect(res.pattern.legend.length).toBeGreaterThan(0);
    expect(res.pattern.labels.some((l) => l.tier === 'dmc')).toBe(true);
    for (const r of res.graph.regions) expect(r.pathD.length).toBeGreaterThan(0);
  });
  it('is deterministic across fresh pipelines', () => {
    const a = new Pipeline(lib).run(req({ threadCount: 10, fidelity: 0.7, complexity: 0.6 }));
    const b = new Pipeline(lib).run(req({ threadCount: 10, fidelity: 0.7, complexity: 0.6 }));
    expect(a.palette.entries.map((e) => e.thread.number)).toEqual(b.palette.entries.map((e) => e.thread.number));
    expect(Buffer.from(a.labelMap.labels.buffer).equals(Buffer.from(b.labelMap.labels.buffer))).toBe(true);
    expect(a.graph.regions.map((r) => r.pathD)).toEqual(b.graph.regions.map((r) => r.pathD));
    expect(a.pattern.labels).toEqual(b.pattern.labels);
  });
  it('lower complexity yields fewer regions', () => {
    const relaxed = new Pipeline(lib).run(req({ complexity: 0.05 }));
    const intense = new Pipeline(lib).run(req({ complexity: 0.95 }));
    expect(relaxed.graph.regions.length).toBeLessThan(intense.graph.regions.length);
  });
  it('locked threads survive a recompute and merges relabel regions', () => {
    const p = new Pipeline(lib);
    const first = p.run(req({ threadCount: 6 }));
    const keep = first.palette.entries[0].thread.number;
    const second = p.run(req({ threadCount: 5 }, { locked: [keep], replacements: {}, merges: {} }));
    expect(second.palette.entries.some((e) => e.thread.number === keep && e.locked)).toBe(true);
    const from = second.palette.entries[1].thread.number;
    const into = second.palette.entries[0].thread.number;
    const merged = p.run(req({ threadCount: 5 }, { locked: [keep], replacements: {}, merges: { [from]: into } }));
    const fromIdx = merged.palette.entries.findIndex((e) => e.thread.number === from);
    expect(merged.graph.regions.some((r) => r.paletteIndex === fromIdx)).toBe(false);
  });
  it('replacements change the printed thread but not the geometry', () => {
    const p = new Pipeline(lib);
    const base = p.run(req({ threadCount: 6 }));
    const gen = base.palette.entries[0].thread.number;
    const rep = p.run(req({ threadCount: 6 }, { locked: [], replacements: { [gen]: '3799' }, merges: {} }));
    expect(rep.graph.regions.map((r) => r.pathD)).toEqual(base.graph.regions.map((r) => r.pathD));
    expect(rep.pattern.legend.some((l) => l.thread.number === '3799')).toBe(true);
  });
  it('caches stages: a pattern-only change is fast', () => {
    const p = new Pipeline(lib);
    p.run(req());
    const again = p.run(req({ outlineStrength: 0.9 }));
    expect(again.timingsMs.palette).toBeUndefined();
    expect(again.timingsMs.segment).toBeUndefined();
  });
  it('exports well-formed SVG and a consolidated thread list', () => {
    const p = new Pipeline(lib);
    const res = p.run(req());
    const eff = p.effectiveThreads(res.palette, NO_EDITS);
    const svg = buildPatternSvg(res.graph, res.palette, eff, res.pattern, { mode: 'pattern', showLabels: true, showHoop: false, showLegend: true, outlineStrength: 0.5, projectName: 'Scene' });
    expect(svg.startsWith('<?xml')).toBe(true);
    expect((svg.match(/<path /g) ?? []).length).toBe(res.graph.regions.length);
    expect(svg).toContain('data-dmc=');
    expect(svg.trim().endsWith('</svg>')).toBe(true);
    const list = buildThreadListText(res.pattern.legend, 'Scene');
    const numbers = list.split('\n').filter((l) => l.startsWith('DMC ')).map((l) => l.split(/\s+/)[1]);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});
