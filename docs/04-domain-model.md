# 04 · Domain model

All types live in `src/engine/types.ts` unless noted. Everything is plain data.

```ts
Project
  id, name, createdAt, updatedAt
  source: SourceImage            // { id, fileName, mimeType, width, height } (+ blob in IndexedDB)
  crop: CropRect                 // normalised 0–1 rect + rotation (quarter turns)
  dimensions: EmbroideryDimensions
  settings: ProcessingSettings
  paletteEdits: PaletteEdits
  view: ViewSettings             // not on the undo stack

EmbroideryDimensions
  widthMm, heightMm              // of the cropped image
  hoop?: { diameterMm } | { widthMm, heightMm }
  strands: 1 | 2 | 3 | 6         // used by effort estimates, later by stitch guidance

ProcessingSettings               // what the artist sets
  threadCount: number            // 4–40
  fidelity: number               // 0–1  Simplified ↔ Detailed
  complexity: number             // 0–1  Relaxed ↔ Intense
  colorFidelity: number          // 0–1  Fewer threads ↔ Exact colour
  minDetailMm?: number           // override; otherwise derived from complexity
  outlineStrength: number        // 0–1, pattern rendering only
  colorAdjust?: ColorAdjust      // { hue ±180°, saturation −1..1, lightness −1..1 }; graded before thread matching
  preset: 'portrait' | 'animal' | 'botanical' | 'landscape' | 'flat' | 'custom'

EngineParams                     // derived from settings by embroidery/params.ts
  workPxPerMm, preBlurSigmaPx, contrastWeight, lightnessWeight,
  mergeDeltaE, minFeatureMm, minAreaMm2, keepContrastDeltaE,
  simplifyTolerancePx, smoothingPasses

PaletteEdits                     // keyed by DMC number of the generated slot
  locked: string[]               // threads forced into the palette on recompute
  replacements: Record<string, string>   // generated thread → thread to stitch with
  merges: Record<string, string>         // generated thread → absorbed into thread
  preferred?: string[]           // reserved: "I own these"

ThreadColor                      // one floss
  library: 'dmc', number, name, rgb, hex, lab: [L,a,b], oklab: [L,a,b]

ThreadPalette
  entries: PaletteEntry[]        // { thread, centroid: OKLab, locked, pixelShare }

WorkingImage
  width, height, mmPerPx, oklab: Float32Array (3 per px), rgba: Uint8ClampedArray, contrast: Float32Array

LabelMap
  width, height, labels: Uint16Array   // palette index per px (0xFFFF = masked)

RegionGraph
  regions: Region[]
  adjacency: Map<regionId, Array<{ id, sharedBoundaryPx }>>
  labelMap                       // component id per px
  mmPerPx

Region
  id: number                     // stable within a result: ordered by area desc
  paletteIndex: number
  pixelArea, areaMm2
  bbox, centroid, pole: { x, y, radiusPx }
  neighbors: number[]
  enclosedBy?: number            // island inside this region
  importance: number             // 0–1, contrast-vs-neighbours × log area
  rings: Ring[]                  // rings[0] outer, rest holes; each Ring = points after simplification
  pathD: string
  stitch?: StitchGuide           // reserved, see below
  blend?: BlendSpec              // reserved

StitchGuide (reserved)
  angleDeg?: number              // dominant direction from structure tensor
  flow?: Array<{ x, y, angleDeg }>   // sparse field samples
  strands?: number
  texture?: 'fur' | 'hair' | 'skin' | 'petal' | 'flat' | 'unknown'

BlendSpec (reserved)
  threads: [string, string], ratio: number

Pattern
  widthMm, heightMm, viewBox, regions: PatternRegion[]  // path, fill, label placement tier
  labels: Label[]                // { regionId, x, y, text, tier: 'dmc' | 'number' | 'leader', leader?: [x,y] }
  legend: LegendRow[]            // { index, thread, regionCount, areaMm2, share }
  hoop?, scaleBar, estimates: EffortEstimate

EffortEstimate                   // all approximate, and say so
  regionCount, threadCount, colorChanges, boundaryMm, areaMm2, stitchesApprox, score 0–100
```

## Identity and stability

* `Region.id` is assigned by area rank within one pipeline run, so labels in
  the pattern read "1" for the largest mass. It is **not** stable across
  setting changes; a future edit model will key user overrides by centroid
  proximity rather than by id.
* Palette edits are keyed by DMC number, which is stable across runs. If a
  recompute stops producing that thread, the edit is inert, not broken.
