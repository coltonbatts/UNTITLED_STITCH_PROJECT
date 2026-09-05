// Domain model. Plain, serialisable data only (typed arrays allowed) so every
// object can cross the worker boundary and be persisted without adapters.
// See docs/04-domain-model.md.

export type RGB = [number, number, number]; // 0–255
export type Lab = [number, number, number]; // CIELAB D65
export type OKLab = [number, number, number];
export interface Point { x: number; y: number }
export interface BBox { x0: number; y0: number; x1: number; y1: number }

// ---------- Threads ----------

export interface ThreadColor {
  library: string; // 'dmc'
  number: string; // '310', 'B5200', 'Ecru'
  name: string;
  rgb: RGB;
  hex: string;
  lab: Lab;
  oklab: OKLab;
}

export interface ThreadLibrary {
  id: string;
  displayName: string;
  version: string;
  threads: ThreadColor[];
  byNumber: Map<string, ThreadColor>;
  /** Flat OKLab triples in the same order as `threads`, for fast search. */
  oklabFlat: Float32Array;
}

// ---------- Project ----------

export interface SourceImage {
  id: string;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface CropRect {
  /** Normalised 0–1 rectangle in source pixel space, applied before rotation. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: 0 | 90 | 180 | 270;
}

export type Hoop =
  | { kind: 'round'; diameterMm: number }
  | { kind: 'rect'; widthMm: number; heightMm: number };

export type StrandCount = 1 | 2 | 3 | 6;

export interface EmbroideryDimensions {
  widthMm: number;
  heightMm: number;
  hoop?: Hoop;
  strands: StrandCount;
}

export type Preset = 'portrait' | 'animal' | 'botanical' | 'landscape' | 'flat' | 'custom';

/** Global colour grading applied to the image before thread matching. */
export interface ColorAdjust {
  hue: number; // degrees, -180..180, rotation in OKLCh
  saturation: number; // -1..1  Grey ↔ Vivid (chroma scale)
  lightness: number; // -1..1  Darker ↔ Lighter
}

/** Bare cloth left unstitched wherever the image is close to its colour. */
export interface FabricSettings {
  enabled: boolean;
  hex: string;
  /** 0–1: how far from the fabric colour still counts as fabric. */
  tolerance: number;
}

export interface ProcessingSettings {
  threadCount: number; // 4–40
  fidelity: number; // 0–1  Simplified ↔ Detailed
  complexity: number; // 0–1  Relaxed ↔ Intense
  colorFidelity: number; // 0–1  Fewer threads ↔ Exact colour
  /** Optional override in mm; when undefined it is derived from complexity. */
  minDetailMm?: number;
  outlineStrength: number; // 0–1, pattern rendering only
  /** Optional so projects saved before it existed still load (identity when absent). */
  colorAdjust?: ColorAdjust;
  /** Optional so older projects load; absent means stitch everything. */
  fabric?: FabricSettings;
  preset: Preset;
}

export interface PaletteEdits {
  /** DMC numbers forced into the palette on recompute. */
  locked: string[];
  /** generated thread number → thread number to stitch with (rendering only). */
  replacements: Record<string, string>;
  /** generated thread number → thread number it is absorbed into (relabels pixels). */
  merges: Record<string, string>;
  /** Reserved: threads the artist owns; the palette stage may prefer them. */
  preferred?: string[];
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  source: SourceImage | null;
  crop: CropRect;
  dimensions: EmbroideryDimensions;
  settings: ProcessingSettings;
  paletteEdits: PaletteEdits;
}

// ---------- Engine parameters (derived, never edited by the artist) ----------

export interface EngineParams {
  workPxPerMm: number;
  preBlurSigmaMm: number;
  contrastWeight: number;
  lightnessWeight: number;
  mergeDeltaE: number;
  minFeatureMm: number;
  minAreaMm2: number;
  keepContrastDeltaE: number;
  maxRegions: number;
  simplifyToleranceMm: number;
  smoothingPasses: number;
}

// ---------- Pipeline data ----------

export interface RasterRGBA {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

export interface WorkingImage {
  width: number;
  height: number;
  mmPerPx: number;
  rgba: Uint8ClampedArray;
  /** OKLab, 3 floats per pixel. */
  oklab: Float32Array;
  /** Local contrast 0–1 (normalised gradient magnitude of L). */
  contrast: Float32Array;
  /** 1 = process, 0 = masked out. Undefined means all pixels are processed. */
  mask?: Uint8Array;
}

export interface PaletteEntry {
  thread: ThreadColor;
  /** Weighted mean OKLab of the pixels this thread represents. */
  centroid: OKLab;
  locked: boolean;
  /** Fraction of processed pixels assigned to this entry, 0–1. */
  pixelShare: number;
}

export interface ThreadPalette {
  entries: PaletteEntry[];
}

export const MASKED_LABEL = 0xffff;

export interface LabelMap {
  width: number;
  height: number;
  /** Palette entry index per pixel, MASKED_LABEL for masked. */
  labels: Uint16Array;
}

export interface StitchGuide {
  angleDeg?: number;
  flow?: Array<{ x: number; y: number; angleDeg: number }>;
  strands?: StrandCount;
  texture?: 'fur' | 'hair' | 'skin' | 'petal' | 'flat' | 'unknown';
}

export interface BlendSpec {
  threads: [string, string];
  ratio: number;
}

export interface Region {
  id: number;
  paletteIndex: number;
  pixelArea: number;
  areaMm2: number;
  bbox: BBox;
  centroid: Point;
  /** Pole of inaccessibility in working pixels, radius = distance to boundary. */
  pole: { x: number; y: number; radiusPx: number };
  neighbors: Array<{ id: number; sharedBoundaryPx: number }>;
  enclosedBy?: number;
  /** 0–1: how much this region's contrast with its neighbours matters. */
  importance: number;
  /** rings[0] is the outer ring; the rest are holes. Working pixel units. */
  rings: Point[][];
  pathD: string;
  stitch?: StitchGuide;
  blend?: BlendSpec;
}

export interface RegionGraph {
  width: number;
  height: number;
  mmPerPx: number;
  regions: Region[];
  /** Region id per pixel, -1 for masked. */
  regionMap: Int32Array;
}

// ---------- Pattern ----------

export type LabelTier = 'dmc' | 'index' | 'leader' | 'none';

export interface PatternLabel {
  regionId: number;
  tier: LabelTier;
  text: string;
  x: number; // mm
  y: number; // mm
  fontMm: number;
  leaderFrom?: Point; // mm, region pole
}

export interface LegendRow {
  index: number; // 1-based, printed on compact labels
  paletteIndex: number;
  thread: ThreadColor;
  regionCount: number;
  areaMm2: number;
  share: number;
}

export interface EffortEstimate {
  regionCount: number;
  threadCount: number;
  colorChanges: number;
  boundaryMm: number;
  areaMm2: number;
  stitchesApprox: number;
  /** 0–100, relative effort. */
  score: number;
}

export interface Pattern {
  widthMm: number;
  heightMm: number;
  mmPerPx: number;
  labels: PatternLabel[];
  legend: LegendRow[];
  hoop?: Hoop;
  estimates: EffortEstimate;
}

export interface PipelineResult {
  working: { width: number; height: number; mmPerPx: number; rgba: Uint8ClampedArray };
  palette: ThreadPalette;
  /** Nearest-thread assignment before cleanup (the Threads view). */
  rawLabelMap: LabelMap;
  /** Cleaned assignment the regions are built from. */
  labelMap: LabelMap;
  graph: RegionGraph;
  pattern: Pattern;
  params: EngineParams;
  timingsMs: Record<string, number>;
}
