// Translates what the artist sets (Fidelity, Complexity, Thread colours,
// Colour fidelity, Minimum detail) into engine parameters. This is the only
// place that knowledge lives. See docs/02 and docs/05.
import type { EmbroideryDimensions, EngineParams, ProcessingSettings } from '../types';

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));

export const DEFAULT_WORK_PX_PER_MM = 4;

export function deriveEngineParams(settings: ProcessingSettings, _dims: EmbroideryDimensions): EngineParams {
  const f = settings.fidelity;
  const c = settings.complexity;
  const cf = settings.colorFidelity;
  const minFeatureMm = settings.minDetailMm ?? lerp(3.2, 0.8, c);
  return {
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
  };
}

export const DEFAULT_SETTINGS: ProcessingSettings = {
  threadCount: 16,
  fidelity: 0.5,
  complexity: 0.5,
  colorFidelity: 0.6,
  outlineStrength: 0.5,
  preset: 'custom',
};

export const DEFAULT_DIMENSIONS: EmbroideryDimensions = {
  widthMm: 150,
  heightMm: 150,
  hoop: { kind: 'round', diameterMm: 180 },
  strands: 1,
};
