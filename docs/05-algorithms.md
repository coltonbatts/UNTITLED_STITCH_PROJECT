# 05 · Algorithm choices

Each decision is judged by "does it produce a better embroidery plan?"

## Colour space: OKLab for decisions, CIELAB/CIEDE2000 for reporting

OKLab (Ottosson 2020) is perceptually uniform enough for clustering, cheap
(two matrix multiplies and a cube root), and hue-linear, which matters when
we merge palette colours: CIELAB's blue hue bend can merge a blue with a
purple. Euclidean distance in OKLab is the working ΔE. CIEDE2000 is
implemented for the inspector ("ΔE 2.3 from source") because artists and
printers know that scale.

## Pre-smoothing: bilateral, scaled to the minimum feature

A Gaussian blur at the minimum-feature scale (tried first) softened the
subject's edges as much as the background texture. A bilateral filter in
OKLab (spatial σ ≈ 0.15–0.5 × minimum feature, range σ = 0.06) flattens
grass and fur grain into masses while the eye, nose, and silhouette stay
crisp. On the sample retriever at 150 mm this took the default result from
341 regions with 251 leader-line labels to 164 regions with 72, with a
visibly more coherent background. Cost: ~150 ms at 600 px.

## Palette: DMC-projected k-means, not quantise-then-snap

Quantising to N free colours and snapping each to DMC afterwards fails in two
common ways: two free centroids snap to the same thread (palette collapses),
and a centroid between two threads snaps to one that is far from the pixels
it represents. Projecting the centroid onto the nearest **unused** thread at
every iteration keeps the palette a real set of threads and lets Lloyd
iterations re-balance pixels against real threads.

* Initialisation is deterministic: k-means++ seeded with a fixed xorshift
  PRNG, over a deterministic sub-sample (stride) of pixels.
* Pixel weight = 1 + contrastWeight × normalised local contrast, so a small
  bright highlight ringed by dark fur pulls a centroid toward it.
* Lightness axis is scaled by `lightnessWeight` (default 1.4) in the merge
  step only, protecting value structure.
* Locked threads are fixed centroids. After convergence, threads whose
  pairwise weighted ΔE is below `mergeDeltaE` are merged (smaller share into
  larger); freed slots are not refilled, so *Colour fidelity* really does
  reduce the count.

Alternatives considered: median cut (fast, poor with skewed distributions),
Wu's quantiser (excellent in RGB, not perceptual), octree (order dependent).
Libraries considered: `image-q` (large, RGB-centric, non-deterministic
options), `quantize` (RGB median cut). Neither can accept a fixed candidate
set.

## Line layer: top-hat candidates, median cross-check, skeleton

Thin strokes are found with a morphological top-hat on L: a closing (dark
strokes) and an opening (light strokes) with a square window just wider than
the maximum line width; the difference to the original is the response. Two
failure modes needed guards. A closing also fills the *gap* between two
nearby specks, so the ground between them lights up as a dark feature; a
candidate must therefore also differ from the local median, which sparse
specks cannot move. And the curved parts of a thick ring respond at the
window's corners; a candidate must be bounded by the opposite value on at
least 80 % of its rim, which a fragment of a ring's edge is not.

Each candidate component is measured on its core (response above half the
peak, i.e. without the anti-aliased fringe): the chamfer maximum gates the
width coarsely, then the skeleton gives the exact figure as area ÷ centre-line
length, because the chamfer maximum under-reads even widths by a pixel.
Skeletons come from Zhang–Suen thinning followed by a redundancy pass (a
pixel whose foreground neighbours already form one 8-connected group is
dropped; this is what turns the two-pixel knots Zhang–Suen leaves on
diagonals into clean arcs), spur pruning at about the stroke width, and a
walk of the skeleton graph split at junctions. A stroke is one or two long
paths; a speck cluster is many short ones and is erased instead. Stroke
colour is the response-weighted mean of the core, since anti-aliasing always
pulls a thin stroke toward its ground.

Lifted pixels (plus a one-pixel rim) are inpainted layer by layer from the
outside in with the mean of known 8-neighbours. Alternatives considered:
Canny/Hough (straight lines only), ridge filters such as Frangi (tuned for
vessels, scale-space cost), a learned text detector (not deterministic, DOM
or WASM dependency).

## Halo suppression

Anti-aliased edges are the reason flat art grew a "lighter-brown rim" thread
around dark letters: contrast weighting was designed for catchlights but
boosted every edge pixel too. A ramp mask (steep OKLab gradient, not the core
of a small feature, not lifted) now separates the two. Ramp samples get a
fixed low weight in k-means; a thread whose samples are mostly ramps after
convergence is dissolved; and at assignment time a ramp pixel may only take a
thread present among the flat pixels within two pixels of it. On a photograph
this raises the raw assignment error slightly (ramps no longer get their own
best-fit colour) and leaves the cleaned error unchanged, see 06.

## Cleanup: mode filter then island merge in mm²

A mode filter of radius r on a label map is a deterministic majority vote
that erases features narrower than about 2r without touching straight
boundaries. Radius comes from *Minimum detail* in millimetres. Then
connected components are merged smallest-first into the neighbour maximising
`sharedBoundary / (0.05 + ΔE)`, with union-find inside a pass so chains of
specks collapse together. A **region budget** (from *Complexity*) then raises
the area threshold by 1.5× until the count fits. The "keep if contrast is high" rule is what
preserves catchlights and nostrils that a pure area rule would delete.

The mode-filter radius is its own parameter rather than half the minimum
feature: the two were coupled, and any stroke thinner than the minimum
feature was erased before segmentation saw it. Two topological rules run
before the area rule. The **counter rule**: an island with exactly one
neighbour, whose label that neighbour also touches elsewhere, is a hole (the
inside of an O, the loops of an 8) and is kept; area says nothing about it.
The **width test** (after merging): a region whose inscribed width from the
distance transform is under two stitch widths, that contrasts with every
neighbour, and whose skeleton is long enough to be a mark, is a line and
moves to the line layer with its pixels refilled from the surroundings.
Low-contrast slivers are left to the area rule as before.

## Vectorisation: crack-edge arcs with shared simplification

Tracers such as potrace and ImageTracer trace each colour independently,
so simplifying one region opens gaps against its neighbour. For a pattern
where the boundary *is* the instruction, that is unacceptable. We build the
planar graph of pixel edges between different labels, cut it at junction
vertices (degree ≠ 2) into arcs, simplify and smooth each arc once with
endpoints pinned, then reassemble rings per region. This is the TopoJSON
approach applied to a raster. Douglas–Peucker tolerance follows *Fidelity*;
Chaikin corner cutting (1–2 passes) turns pixel staircases into something
that looks drawn. Vertices turning by at least 80° after simplification are
treated like endpoints and pinned: a serif or a box corner stays a corner,
while staircases (turns of 45–90° on one-pixel steps have already been
simplified away) still round off. The flat-art preset uses zero passes.

Libraries considered: `potrace` (GPL, single colour), `imagetracerjs`
(per-colour, gaps), `d3-contour` (marching squares on scalar fields, would
need a per-label pass and suffers the same gap problem), `simplify-js` (30
lines, we wrote our own to control the endpoint pinning).

## Label placement: raster pole of inaccessibility

We already have a label map; a two-pass chamfer distance transform gives,
for every region, the interior point farthest from any boundary and the
inscribed radius. That radius, in print millimetres, decides the label tier:
full DMC number, compact index, or leader line. This is deterministic and
avoids polygon-based polylabel iteration.

## Effort estimate

`stitches ≈ areaMm² / stitchFootprintMm²(strands) + boundaryMm / stitchLengthMm`.
Footprint per strand count is a rough table (1 strand ≈ 0.35 mm wide × 3 mm
long, 2 strands ≈ 0.6 mm wide). The score blends region count, colour
changes, boundary length, and stitch count into 0–100 for the *Complexity*
readout. Everything here is labelled approximate in the UI.

## Determinism

No `Math.random`, no `Date`, no worker-order dependence. All iteration over
pixels is in raster order; all iteration over regions is by stable id.
`tests/determinism.test.ts` runs the full pipeline twice on a fixture and
compares byte-for-byte.
