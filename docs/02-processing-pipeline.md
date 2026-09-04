# 02 · Processing pipeline

Every stage is a pure function of typed inputs, runs in a Web Worker, and is
cached by a hash of only the inputs it depends on. Changing *Outline strength*
recomputes nothing; changing *Thread colours* recomputes from stage 3 onward.

```
SourceImage ─┐
Crop/Size ───┴─▶ 1 PREPARE ─▶ WorkingImage (bounded px, mm-per-px, OKLab planes, edge weight)
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
Outline, labels, hoop              ▼
                              6 PATTERN ─▶ Pattern (labelled SVG, legend, estimates)
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
* Compute a local-contrast map (gradient magnitude of L) used to weight small
  high-contrast features (an eye highlight) during palette extraction.

## 2 · Palette (DMC-constrained)

Not "quantise to N RGB colours then snap". Instead, **projected k-means in
OKLab**: centroids are updated as weighted means, then projected onto the
nearest unused DMC colour every iteration. The palette is therefore always a
set of real threads and the assignment error is measured against those
threads, not against an unreachable ideal.

* Locked threads are fixed centroids: they take part in assignment but are
  never moved.
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
* Apply palette edits: merges remap labels.
* **Mode filter** with a radius derived from *Minimum detail* in mm removes
  salt-and-pepper and anything narrower than the radius.
* **Island merge**: connected components (4-connected) smaller than the minimum
  area are absorbed into the neighbour with the best combination of shared
  boundary and colour similarity, smallest first, until stable. A small
  component survives only if its contrast against every neighbour is high and
  it is at least a quarter of the minimum area (the eye-highlight rule).

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
* Emit one `<path>` per region with `evenodd` fill and stable ids.

## 6 · Pattern

* Boundaries stroked at *Outline strength*, regions tinted faintly or white.
* Labels: DMC number if the inscribed circle fits the text at print scale;
  a compact region number with a legend if a smaller label fits; otherwise
  a leader line from the pole to the nearest free spot.
* Hoop circle, physical dimensions, scale bar.
* Estimates (labelled approximate): regions, colour changes, boundary length,
  area, stitch count.

## Caching and interactivity

The worker keeps the last result of each stage keyed by a structural hash of
its inputs. The UI debounces slider drags (~60 ms) and shows the previous
result until the new one lands. Palette *replacement* (same regions, different
thread) is a UI-only recolour and costs nothing.
