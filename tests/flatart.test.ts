import { describe, expect, it } from 'vitest';
import { Pipeline } from '@/engine/pipeline';
import { getDmcLibrary } from '@/engine/threads/dmc';
import { deriveEngineParams } from '@/engine/embroidery/params';
import { buildPatternSvg } from '@/engine/export/svg';
import type { PipelineResult, Point } from '@/engine/types';
import { FLAT_DIMS, FLAT_SETTINGS, FLAT_W, FULL_CROP, NO_EDITS, TEXT_ART, textArtRaster } from './fixtures';

const lib = getDmcLibrary();
const source = textArtRaster();
let cached: PipelineResult | null = null;
const run = () => (cached ??= new Pipeline(lib).run({ sourceId: 'text', source, crop: FULL_CROP, dimensions: FLAT_DIMS, settings: FLAT_SETTINGS, paletteEdits: NO_EDITS }));
const at = (res: PipelineResult, x: number, y: number) => res.graph.regions[res.graph.regionMap[y * FLAT_W + x]];
const strokeLen = (paths: Point[][]) => paths.reduce((s, p) => s + p.reduce((l, q, i) => (i ? l + Math.hypot(q.x - p[i - 1].x, q.y - p[i - 1].y) : 0), 0), 0);
const segDist = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
const pathDist = (paths: Point[][], p: Point) => Math.min(...paths.flatMap((path) => path.slice(1).map((b, i) => segDist(p, path[i], b))));

describe('flat art and lettering', () => {
  it('flat preset disables blur, mode filter and smoothing', () => {
    const p = deriveEngineParams(FLAT_SETTINGS, FLAT_DIMS);
    expect(p.preBlurSigmaMm).toBe(0);
    expect(p.modeRadiusMm).toBe(0);
    expect(p.smoothingPasses).toBe(0);
    expect(p.lineMaxWidthMm).toBeCloseTo(0.8, 6); // two 1-strand stitch widths
  });

  it('thin strokes become lines with their length intact and leave no fill behind', () => {
    const res = run();
    const A = TEXT_ART;
    const want = [
      { len: Math.hypot(A.thinStroke.to.x - A.thinStroke.from.x, A.thinStroke.to.y - A.thinStroke.from.y), width: A.thinStroke.width, mid: { x: 85, y: 20 } },
      { len: Math.hypot(A.thickStroke.to.x - A.thickStroke.from.x, A.thickStroke.to.y - A.thickStroke.from.y), width: A.thickStroke.width, mid: { x: 85, y: 55 } },
    ];
    for (const w of want) {
      // The stroke passing closest to the expected midpoint.
      const near = res.lines.strokes
        .map((s) => ({ s, d: pathDist(s.paths, w.mid) }))
        .sort((a, b) => a.d - b.d)[0];
      expect(near, 'a stroke near the drawn line').toBeDefined();
      expect(near.d).toBeLessThan(2);
      const len = strokeLen(near.s.paths);
      expect(len).toBeGreaterThan(w.len * 0.85);
      expect(len).toBeLessThan(w.len * 1.15);
      expect(near.s.widthPx).toBeGreaterThan(w.width - 1);
      expect(near.s.widthPx).toBeLessThan(w.width + 1);
      expect(near.s.widthMm).toBeCloseTo(near.s.widthPx * res.working.mmPerPx, 6);
      expect(near.s.thread.number).toBe('310');
      expect(['back', 'stem']).toContain(near.s.stitch);
    }
    // Under the strokes the fill is paper, not a black sliver.
    const paper = at(res, 5, 5).paletteIndex;
    expect(at(res, 85, 20).paletteIndex).toBe(paper);
    expect(at(res, 85, 55).paletteIndex).toBe(paper);
    expect(res.pattern.lineLegend.length).toBeGreaterThan(0);
    expect(res.pattern.estimates.lineMm).toBeGreaterThan(0);
  });

  it('letter counters stay distinct paper-coloured regions inside their rings', () => {
    const res = run();
    const paper = at(res, 5, 5);
    const A = TEXT_ART;
    const ring = at(res, A.ring.cx + A.ring.rInner + 4, A.ring.cy);
    const counter = at(res, A.ring.cx, A.ring.cy);
    expect(ring.paletteIndex).not.toBe(paper.paletteIndex);
    expect(counter.paletteIndex).toBe(paper.paletteIndex);
    expect(counter.id).not.toBe(paper.id);
    expect(counter.enclosedBy).toBe(ring.id);
    const [top, bottom] = A.eight.map((e) => at(res, e.cx, e.cy));
    expect(top.paletteIndex).toBe(paper.paletteIndex);
    expect(bottom.paletteIndex).toBe(paper.paletteIndex);
    expect(top.id).not.toBe(bottom.id);
    expect(top.id).not.toBe(paper.id);
  });

  it('no palette entry is a halo: none has most of its pixels on anti-aliased edges', () => {
    const res = run();
    const { labels } = res.rawLabelMap;
    const total = new Float64Array(res.palette.entries.length), onEdge = new Float64Array(res.palette.entries.length);
    for (let i = 0; i < labels.length; i++) { total[labels[i]]++; if (res.working.ramp[i]) onEdge[labels[i]]++; }
    for (let j = 0; j < total.length; j++) if (total[j] > 0) expect(onEdge[j] / total[j], `entry ${res.palette.entries[j].thread.number}`).toBeLessThan(0.8);
    // The red/blue edge is stitched as red or blue, nothing in between.
    const red = at(res, 230, 150).paletteIndex, blue = at(res, 230, 210).paletteIndex;
    expect(red).not.toBe(blue);
    for (let x = 170; x < 290; x += 7) expect([red, blue]).toContain(res.labelMap.labels[180 * FLAT_W + x]);
    expect(res.palette.entries.length).toBeLessThanOrEqual(6);
  });

  it('specks narrower than a stitch vanish into the textured ground', () => {
    const res = run();
    const F = TEXT_ART.speckField;
    const ids = new Set<number>();
    for (let y = F.y0 + 2; y < F.y1 - 2; y++) for (let x = F.x0 + 2; x < F.x1 - 2; x++) ids.add(res.graph.regionMap[y * FLAT_W + x]);
    expect(ids.size).toBe(1);
  });

  it('hard corners survive vectorisation', () => {
    const res = run();
    const A = TEXT_ART;
    const serif = at(res, 30, 126);
    const nearest = Math.min(...serif.rings.flat().map((p) => Math.hypot(p.x - A.serif.corner.x, p.y - A.serif.corner.y)));
    expect(nearest).toBeLessThan(1.0);
    const inner = Math.min(...serif.rings.flat().map((p) => Math.hypot(p.x - 40, p.y - 132)));
    expect(inner).toBeLessThan(1.0);
  });

  it('exports the line layer as stroked paths, apart from the regions', () => {
    const res = run();
    const p = new Pipeline(lib);
    const svg = buildPatternSvg(res.graph, res.palette, p.effectiveThreads(res.palette, NO_EDITS), res.pattern, { mode: 'pattern', showLabels: true, showHoop: false, showLegend: true, outlineStrength: 0.5, projectName: 'Text' }, res.lines);
    expect(svg).toContain('id="lines"');
    expect((svg.match(/data-line=/g) ?? []).length).toBe(res.lines.strokes.length);
    expect((svg.match(/data-region=/g) ?? []).length).toBeGreaterThanOrEqual(res.graph.regions.length);
    expect(svg).toContain('data-stitch=');
  });

  it('is deterministic', () => {
    const a = run();
    const b = new Pipeline(lib).run({ sourceId: 'text', source, crop: FULL_CROP, dimensions: FLAT_DIMS, settings: FLAT_SETTINGS, paletteEdits: NO_EDITS });
    expect(b.lines.strokes.map((s) => [s.thread.number, s.widthMm, s.lengthMm, s.paths])).toEqual(a.lines.strokes.map((s) => [s.thread.number, s.widthMm, s.lengthMm, s.paths]));
    expect(Buffer.from(a.labelMap.labels.buffer).equals(Buffer.from(b.labelMap.labels.buffer))).toBe(true);
  });
});
