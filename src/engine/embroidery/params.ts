// Translates what the artist sets (Fidelity, Complexity, Thread colours,
// Colour fidelity, Minimum detail, preset) into engine parameters. This is
// the only place that knowledge lives. See docs/02 and docs/05.
import type { EmbroideryDimensions, EngineParams, Preset, ProcessingSettings, StrandCount } from '../types';

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));

export const DEFAULT_WORK_PX_PER_MM = 4;

/** Approximate width of one stitch by strand count, mm. Two of these is the narrowest fill worth long-and-short. */
export const STITCH_WIDTH_MM: Record<StrandCount, number> = { 1: 0.4, 2: 0.6, 3: 0.8, 6: 1.2 };

export function deriveEngineParams(settings: ProcessingSettings, dims: EmbroideryDimensions): EngineParams {
  const f = settings.fidelity;
  const c = settings.complexity;
  const cf = settings.colorFidelity;
  const flat = settings.preset === 'flat';
  const minFeatureMm = settings.minDetailMm ?? (flat ? 1.0 : lerp(3.2, 0.8, c));
  const stitchWidthMm = STITCH_WIDTH_MM[dims.strands] ?? STITCH_WIDTH_MM[1];
  const base: EngineParams = {
    workPxPerMm: DEFAULT_WORK_PX_PER_MM,
    // Edge-preserving smoothing at the scale of the smallest feature we keep:
    // texture finer than that is noise to an embroiderer. Detailed keeps more.
    preBlurSigmaMm: minFeatureMm * lerp(0.5, 0.15, f),
    // Detailed: small high-contrast features pull centroids toward them.
    contrastWeight: lerp(0.4, 2.5, f),
    lightnessWeight: 1.4,
    // Exact colour: only near-identical threads merge; Fewer threads: merge liberally.
    mergeDeltaE: lerp(0.10, 0.012, cf),
    minFeatureMm,
    minAreaMm2: minFeatureMm * minFeatureMm,
    keepContrastDeltaE: lerp(0.38, 0.2, f),
    maxRegions: Math.round(lerp(40, 400, c)),
    simplifyToleranceMm: lerp(0.55, 0.14, f),
    smoothingPasses: 2,
    modeRadiusMm: minFeatureMm / 2,
    cornerAngleDeg: 80,
    rampWeight: 0.35,
    haloMaxRampShare: 0.7,
    lineMaxWidthMm: 2 * stitchWidthMm,
    lineMinLengthMm: 1.5,
    lineContrast: lerp(0.3, 0.16, f),
    speckMaxWidthMm: 0.5,
  };
  if (!flat) return base;
  // Flat art: the image already is the plan. No pre-blur (it would erase thin
  // strokes), no mode filter, no corner cutting, a palette that merges
  // near-duplicates rather than splitting noisy flat colours, and a lower
  // contrast floor so letter counters and small marks survive.
  return {
    ...base,
    preBlurSigmaMm: 0,
    modeRadiusMm: 0,
    smoothingPasses: 0,
    // Flat colours are deliberately distinct; two threads this close are one colour plus noise.
    mergeDeltaE: lerp(0.16, 0.05, cf),
    keepContrastDeltaE: 0.12,
    simplifyToleranceMm: Math.min(base.simplifyToleranceMm, 0.2),
    lineContrast: 0.16,
    contrastWeight: 0.4,
  };
}

/**
 * Artist-facing values a preset implies. Only these five controls change;
 * anything a preset does to engine behaviour lives in deriveEngineParams.
 */
export const PRESET_SETTINGS: Record<Exclude<Preset, 'custom'>, Pick<ProcessingSettings, 'threadCount' | 'fidelity' | 'complexity' | 'colorFidelity'> & { minDetailMm?: number }> = {
  portrait: { threadCount: 18, fidelity: 0.6, complexity: 0.5, colorFidelity: 0.6 },
  animal: { threadCount: 16, fidelity: 0.55, complexity: 0.55, colorFidelity: 0.6 },
  botanical: { threadCount: 14, fidelity: 0.6, complexity: 0.45, colorFidelity: 0.65 },
  landscape: { threadCount: 20, fidelity: 0.4, complexity: 0.4, colorFidelity: 0.5 },
  flat: { threadCount: 8, fidelity: 0.9, complexity: 0.6, colorFidelity: 0.95 },
};

export const PRESET_LABELS: Record<Preset, string> = {
  portrait: 'Portrait', animal: 'Animal', botanical: 'Botanical', landscape: 'Landscape', flat: 'Flat art', custom: 'Custom',
};

export function presetSettings(settings: ProcessingSettings, preset: Preset): ProcessingSettings {
  if (preset === 'custom') return { ...settings, preset };
  const p = PRESET_SETTINGS[preset];
  return { ...settings, threadCount: p.threadCount, fidelity: p.fidelity, complexity: p.complexity, colorFidelity: p.colorFidelity, minDetailMm: p.minDetailMm, preset };
}

export const DEFAULT_SETTINGS: ProcessingSettings = {
  threadCount: 16,
  fidelity: 0.5,
  complexity: 0.5,
  colorFidelity: 0.6,
  outlineStrength: 0.5,
  colorAdjust: { hue: 0, saturation: 0, lightness: 0 },
  preset: 'custom',
};

export const DEFAULT_DIMENSIONS: EmbroideryDimensions = {
  widthMm: 150,
  heightMm: 150,
  hoop: { kind: 'round', diameterMm: 180 },
  strands: 1,
};
