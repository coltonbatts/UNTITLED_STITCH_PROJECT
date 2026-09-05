// Stage orchestration with per-stage caching. Each stage is a pure function;
// the cache is keyed by a structural key of exactly the inputs it depends on.
import type {
  CropRect, EmbroideryDimensions, EngineParams, OKLab, PaletteEdits, PipelineResult, ProcessingSettings,
  RasterRGBA, ThreadColor, ThreadLibrary, ThreadPalette, WorkingImage, LabelMap, RegionGraph,
} from './types';
import { deriveEngineParams } from './embroidery/params';
import { cropRotate, resample } from './image/resample';
import { workingResolution } from './image/physical';
import { buildWorkingImage } from './image/working';
import { adjustRaster, IDENTITY_ADJUST } from './image/adjust';
import { applyFabricMask } from './image/fabric';
import { extractPalette } from './palette/extract';
import { assignLabels, remapLabels } from './segmentation/assign';
import { modeFilter } from './segmentation/modeFilter';
import { mergeIslands } from './segmentation/islandMerge';
import { buildRegionGraph } from './regions/graph';
import { vectorizeRegions } from './vector/vectorize';
import { buildPattern } from './pattern/pattern';

export interface PipelineRequest {
  sourceId: string;
  source: RasterRGBA;
  crop: CropRect;
  dimensions: EmbroideryDimensions;
  settings: ProcessingSettings;
  paletteEdits: PaletteEdits;
}

interface Stage<T> { key: string; value: T }

export class Pipeline {
  private raster?: Stage<RasterRGBA>;
  private adjusted?: Stage<RasterRGBA>;
  private working?: Stage<WorkingImage>;
  private masked?: Stage<WorkingImage>;
  private palette?: Stage<ThreadPalette>;
  private segment?: Stage<{ raw: LabelMap; clean: LabelMap }>;
  private graph?: Stage<RegionGraph>;

  constructor(private readonly library: ThreadLibrary) {}

  /** Thread each palette entry is stitched with, after replacements. */
  effectiveThreads(palette: ThreadPalette, edits: PaletteEdits): ThreadColor[] {
    return palette.entries.map((e) => {
      const rep = edits.replacements[e.thread.number];
      return (rep && this.library.byNumber.get(rep)) || e.thread;
    });
  }

  run(req: PipelineRequest, onProgress?: (stage: string) => void): PipelineResult {
    const timings: Record<string, number> = {};
    const time = <T,>(name: string, fn: () => T): T => {
      onProgress?.(name);
      const t0 = performance.now();
      const v = fn();
      timings[name] = Math.round((performance.now() - t0) * 10) / 10;
      return v;
    };
    const params: EngineParams = deriveEngineParams(req.settings, req.dimensions);
    const res = workingResolution(req.dimensions, params.workPxPerMm);

    // 1a. crop + resample (depends on source, crop, physical size)
    const rasterKey = JSON.stringify([req.sourceId, req.crop, res.width, res.height]);
    if (this.raster?.key !== rasterKey) {
      this.raster = { key: rasterKey, value: time('resample', () => resample(cropRotate(req.source, req.crop), res.width, res.height)) };
      this.adjusted = undefined;
    }
    // 1b. global colour grading (depends on hue / saturation / lightness)
    const adj = req.settings.colorAdjust ?? IDENTITY_ADJUST;
    const adjustKey = rasterKey + JSON.stringify([adj.hue, adj.saturation, adj.lightness]);
    if (this.adjusted?.key !== adjustKey) {
      const raster = this.raster.value;
      this.adjusted = { key: adjustKey, value: time('adjust', () => adjustRaster(raster, adj)) };
      this.working = undefined;
    }
    // 1c. OKLab planes, contrast, pre-blur (depends on fidelity)
    const workingKey = adjustKey + JSON.stringify([params.preBlurSigmaMm, res.mmPerPx]);
    if (this.working?.key !== workingKey) {
      const raster = this.adjusted.value;
      this.working = { key: workingKey, value: time('prepare', () => buildWorkingImage(raster, res.mmPerPx, params.preBlurSigmaMm)) };
      this.masked = undefined;
    }
    // 1d. bare-fabric mask (depends on fabric colour / tolerance)
    const fab = req.settings.fabric;
    const maskKey = workingKey + JSON.stringify(fab?.enabled ? [fab.hex, fab.tolerance, params.minFeatureMm] : null);
    if (this.masked?.key !== maskKey) {
      const base = this.working.value;
      this.masked = { key: maskKey, value: time('fabric', () => applyFabricMask(base, fab, params.minFeatureMm / res.mmPerPx)) };
      this.palette = undefined;
    }
    const working = this.masked.value;

    // 2. palette (depends on thread count, fidelity weights, colour fidelity, locks)
    const locked = req.paletteEdits.locked.map((n) => this.library.byNumber.get(n)).filter((t): t is ThreadColor => !!t);
    const paletteKey = workingKey + JSON.stringify([req.settings.threadCount, params.contrastWeight, params.lightnessWeight, params.mergeDeltaE, locked.map((t) => t.number)]);
    if (this.palette?.key !== paletteKey) {
      this.palette = { key: paletteKey, value: time('palette', () => extractPalette(working, this.library, {
        threadCount: req.settings.threadCount, locked,
        contrastWeight: params.contrastWeight, lightnessWeight: params.lightnessWeight, mergeDeltaE: params.mergeDeltaE,
      })) };
      this.segment = undefined;
    }
    const palette = this.palette.value;

    // 3. assignment + merges + cleanup (depends on complexity params, merges)
    const mergeMap = new Map<number, number>();
    palette.entries.forEach((e, i) => {
      let target = req.paletteEdits.merges[e.thread.number];
      const seen = new Set<string>([e.thread.number]);
      while (target && !seen.has(target)) {
        seen.add(target);
        const next = req.paletteEdits.merges[target];
        if (!next) break;
        target = next;
      }
      if (!target) return;
      const j = palette.entries.findIndex((x) => x.thread.number === target);
      if (j >= 0 && j !== i) mergeMap.set(i, j);
    });
    const labelColors: OKLab[] = palette.entries.map((e) => e.thread.oklab);
    const minAreaPx = params.minAreaMm2 / (res.mmPerPx * res.mmPerPx);
    const modeRadius = Math.max(0, Math.min(6, Math.round(params.minFeatureMm / res.mmPerPx / 2)));
    const segmentKey = paletteKey + JSON.stringify([Array.from(mergeMap.entries()), minAreaPx, modeRadius, params.keepContrastDeltaE, params.maxRegions]);
    if (this.segment?.key !== segmentKey) {
      this.segment = { key: segmentKey, value: time('segment', () => {
        const raw = remapLabels(assignLabels(working, palette), mergeMap);
        let map = modeFilter(raw, modeRadius, palette.entries.length);
        map = mergeIslands(map, { labelColors, minAreaPx, keepContrastDeltaE: params.keepContrastDeltaE, maxRegions: params.maxRegions }).map;
        return { raw, clean: map };
      }) };
      this.graph = undefined;
    }
    const { raw: rawLabelMap, clean: labelMap } = this.segment.value;

    // 4 + 5. region graph and vectors (depends on simplification)
    const simplifyPx = params.simplifyToleranceMm / res.mmPerPx;
    const graphKey = segmentKey + JSON.stringify([simplifyPx, params.smoothingPasses]);
    if (this.graph?.key !== graphKey) {
      this.graph = { key: graphKey, value: time('vectorize', () => {
        const g = buildRegionGraph(labelMap, res.mmPerPx, labelColors);
        return vectorizeRegions(g, { simplifyTolerancePx: simplifyPx, smoothingPasses: params.smoothingPasses });
      }) };
    }
    const graph = this.graph.value;

    // 6. pattern (cheap, not cached; depends on replacements)
    const effective = this.effectiveThreads(palette, req.paletteEdits);
    const pattern = time('pattern', () => buildPattern(graph, palette, effective, req.dimensions));

    return {
      working: { width: working.width, height: working.height, mmPerPx: working.mmPerPx, rgba: working.rgba },
      palette, rawLabelMap, labelMap, graph, pattern, params, timingsMs: timings,
    };
  }
}
