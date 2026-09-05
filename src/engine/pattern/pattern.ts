import type { EmbroideryDimensions, LegendRow, LineLayer, LineLegendRow, Pattern, RegionGraph, ThreadColor, ThreadPalette } from '../types';
import { placeLabels } from './labels';
import { estimateEffort } from './estimates';

/**
 * Builds the printable pattern model. `effectiveThreads[i]` is the thread the
 * artist will actually stitch palette entry i with (after replacements).
 */
export function buildPattern(graph: RegionGraph, palette: ThreadPalette, effectiveThreads: ThreadColor[], dims: EmbroideryDimensions, lines: LineLayer = { strokes: [] }): Pattern {
  const widthMm = graph.width * graph.mmPerPx;
  const heightMm = graph.height * graph.mmPerPx;
  const regionCount = new Int32Array(palette.entries.length);
  const areaByPalette = new Float64Array(palette.entries.length);
  let total = 0;
  for (const r of graph.regions) {
    regionCount[r.paletteIndex]++;
    areaByPalette[r.paletteIndex] += r.areaMm2;
    total += r.areaMm2;
  }
  const legend: LegendRow[] = [];
  const legendIndexByPalette = new Map<number, number>();
  palette.entries.forEach((_, i) => {
    if (regionCount[i] === 0) return;
    const index = legend.length + 1;
    legendIndexByPalette.set(i, index);
    legend.push({ index, paletteIndex: i, thread: effectiveThreads[i], regionCount: regionCount[i], areaMm2: areaByPalette[i], share: total > 0 ? areaByPalette[i] / total : 0 });
  });
  const labels = placeLabels(graph, {
    widthMm, heightMm,
    fullText: (p) => effectiveThreads[p].number,
    indexText: (p) => String(legendIndexByPalette.get(p) ?? '?'),
  });
  // Line work gets its own legend so the fill legend stays a fill legend.
  const lineRows = new Map<string, LineLegendRow>();
  for (const s of lines.strokes) {
    const key = `${s.thread.number}|${s.stitch}`;
    const row = lineRows.get(key) ?? { thread: s.thread, stitch: s.stitch, strokeCount: 0, lengthMm: 0 };
    row.strokeCount++; row.lengthMm += s.lengthMm;
    lineRows.set(key, row);
  }
  const lineLegend = Array.from(lineRows.values()).sort((a, b) => b.lengthMm - a.lengthMm || a.thread.number.localeCompare(b.thread.number));
  const estimates = estimateEffort(graph, legend.length, dims.strands, lines);
  return { widthMm, heightMm, mmPerPx: graph.mmPerPx, labels, legend, lineLegend, hoop: dims.hoop, estimates };
}
