# 02 · Processing pipeline

Every stage is a pure function of typed inputs, runs in a Web Worker, and is
cached by a hash of only the inputs it depends on. Changing *Outline strength*
recomputes nothing; changing *Thread colours* recomputes from stage 3 onward.

```
SourceImage ─┐
Crop/Size ───┴─▶ 1 PREPARE ─▶ WorkingImage (bounded px, mm-per-px, OKLab planes, edge weight,
                                   │          ramp mask) + thin strokes lifted off the image
                                   │
Fidelity, Colours, ColourFidelity, │ locked threads
                                   ▼
                              2 PALETTE ─▶ ThreadPalette (N DMC entries + OKLab centroids)
                                   │
Complexity, palette merges         ▼
                              3 SEGMENT ─▶ LabelMap (Uint16 per px) → cleanup (mode filter, island merge)
                                   │
                                   ▼
                              4 REGIONS ─▶ RegionGraph (components, areas mm², neighbours, poles)
                                   │
Fidelity                           ▼
                              5 VECTORISE ─▶ shared-arc topology → simplified rings → SVG paths
                                   │
                              5b LINES ─▶ LineLayer (lifted strokes + fills that failed the width test,
                                   │       each with a thread, width in mm, stem/back stitch)
Outline, labels, hoop              ▼
                              6 PATTERN ─▶ Pattern (labelled SVG, legend, line legend, estimates)
                                   │
                                   ▼
                              7 EXPORT ─▶ SVG · PNG · thread list · (PDF later)
```

## 1 · Prepare

* Decode JPG/PNG/WebP with the browser (`createImageBitmap`), apply crop and
  rotation on a canvas.
* Choose a **working resolution** from the physical size: target
  `workPxPerMm` (default 4 px/mm, so a 150 mm piece is 600 px wide), clamped
  so the long edge is 256–1200 px. Everything downstream reasons in
  millimetres via `mmPerPx`.
* Convert to linear sRGB → OKLab float planes once.
* **Line lift.** Thin high-contrast strokes (lettering, outlines, veins) are
  detected with a morphological top-hat cross-checked against the local
  median, measured (width along the centre line, extent, bounded on both
  sides by the ground), skeletonised, and removed from the image: their
  pixels are inpainted from the surrounding colour so the fills underneath
  stay whole. Thin features too short to be a mark are specks and are erased
  the same way. The width limit is two stitch widths at the current strand
  count (0.8 mm at one strand). See `src/engine/lines/`.
* Compute a local-contrast map (gradient magnitude of L) used to weight small
  high-contrast features (an eye highlight) during palette extraction, and a
  **ramp mask**: pixels with a steep OKLab gradient that are not the core of a
  small feature. A ramp pixel is the anti-aliased blend between two fills,
  never a colour anyone stitches.

## 2 · Palette (DMC-constrained)

Not "quantise to N RGB colours then snap". Instead, **projected k-means in
OKLab**: centroids are updated as weighted means, then projected onto the
nearest unused DMC colour every iteration. The palette is therefore always a
set of real threads and the assignment error is measured against those
threads, not against an unreachable ideal.

* Locked threads are fixed centroids: they take part in assignment but are
  never moved.
* Ramp pixels get a small fixed sample weight instead of the contrast boost,
  so edge blends cannot pull a centroid. After convergence, a thread whose
  samples are mostly ramps is a **halo** (the colour of a transition) and is
  dissolved; its pixels fall to the neighbouring flat colours.
* *Colour fidelity ↔ simplicity* sets a ΔE threshold below which two palette
  threads are merged. Lightness difference is weighted more heavily than
  chroma, so a merge never collapses two distinct values into one.
* Before clustering, an **edge-preserving bilateral filter** flattens texture
  finer than the minimum feature size (grass, fur noise, sensor grain) while
  keeping the edges between colour masses. Its spatial radius scales with
  *Minimum detail*; *Fidelity* reduces it and raises the weight given to
  high-contrast pixels.

## 3 · Segment and clean

* Assign every working pixel to the nearest palette thread (OKLab distance).
  A ramp pixel chooses only among the threads of the flat pixels within two
  pixels of it, so an edge between two fills is stitched as one of them.
* Apply palette edits: merges remap labels.
* **Mode filter** with its own radius parameter (half of *Minimum detail* by
  default, zero for flat art) removes salt-and-pepper and anything narrower
  than the radius.
* **Island merge**: connected components (4-connected) smaller than the minimum
  area are absorbed into the neighbour with the best combination of shared
  boundary and colour similarity, smallest first, until stable. A small
  component survives only if its contrast against every neighbour is high and
  it is at least a quarter of the minimum area (the eye-highlight rule).
  **Counter rule:** an island with a single neighbour, coloured like something
  that neighbour also touches, is a hole through it (the inside of an O) and
  is kept whatever its area.
* **Width test**: a region whose inscribed width is under two stitch widths,
  that contrasts with every neighbour and is long enough to be a mark, cannot
  be filled with long-and-short. It moves to the line layer and its pixels
  are refilled from the surrounding labels.

## 4 · Regions

Build the `RegionGraph`: one node per component with pixel and mm² area,
bounding box, centroid, neighbours with shared boundary length, enclosing
region (a region with exactly one neighbour is an island in it), and the
**pole of inaccessibility** from a distance transform (best label position and
inscribed radius).

## 5 · Vectorise

* Trace the **crack edges** between differently labelled pixels into a planar
  graph. Split it at junctions into **arcs**, each knowing its left and right
  region. Simplify (Douglas–Peucker) and smooth (Chaikin) each arc **once** with
  endpoints pinned, then assemble every region's rings from its arcs. Shared
  boundaries are therefore identical on both sides: no slivers, no overlaps.
  Vertices turning by 80° or more are real corners (serifs, box edges) and
  are pinned through smoothing; the flat-art preset smooths nothing at all.
* Emit one `<path>` per region with `evenodd` fill and stable ids.

## 5b · Line layer

Strokes lifted in stage 1 and thin regions from stage 3 are given a thread
(the nearest palette thread within ΔE 0.2, else the nearest DMC thread), a
width in millimetres, and a suggested stitch: back stitch when the width is
about one stitch, stem stitch when wider. They are kept apart from regions so
the fill legend and the region count stay honest; the pattern carries a
separate line legend and the estimate counts their length.

## 6 · Pattern

* Boundaries stroked at *Outline strength*, regions tinted faintly or white.
  Line work is drawn over the fills at its real width in its thread colour.
* Labels: DMC number if the inscribed circle fits the text at print scale;
  a compact region number with a legend if a smaller label fits; otherwise
  a leader line from the pole to the nearest free spot.
* Hoop circle, physical dimensions, scale bar.
* Estimates (labelled approximate): regions, colour changes, boundary length,
  area, stitch count.

## Presets

Presets set the five artist-facing controls (`PRESET_SETTINGS`) and nothing
else the artist can see. What a preset means to the engine lives in
`deriveEngineParams` alone. Only *Flat art* changes engine behaviour: no
pre-blur, no mode filter, no smoothing passes, a palette merge range that
folds noisy flat colours together rather than splitting them, and a lower
contrast floor so small marks and counters survive.

## Caching and interactivity

The worker keeps the last result of each stage keyed by a structural hash of
its inputs. The UI debounces slider drags (~60 ms) and shows the previous
result until the new one lands. Palette *replacement* (same regions, different
thread) is a UI-only recolour and costs nothing.
