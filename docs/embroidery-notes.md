# Embroidery-specific observations

Collected while designing the engine. Each is either implemented, designed
for, or an open question (see 06).

* **Value beats hue.** A portrait stitched with slightly wrong hues but right
  values still reads; the reverse does not. Hence the lightness weight in
  palette merging and the plan for an L-only view.
* **The eye highlight rule.** The most important region in an animal
  portrait is often the smallest. Pure area thresholds delete it. We keep
  small regions whose contrast against all neighbours is high.
* **Regions are plans, not fills.** Long-and-short stitch crosses boundaries
  on purpose. The pattern's lines mean "the colour changes about here", so
  they should be light and the labels clear; heavy outlines would be misread
  as split-stitch outlines.
* **Boundaries must agree.** If the SVG has slivers between regions, the
  artist sees phantom regions. This drove the shared-arc vectoriser.
* **Physical size is a parameter of the algorithm**, not of the export. The
  same photo at 100 mm and 300 mm should produce different region maps.
* **Colour changes cost more than stitches.** Re-threading and travelling
  are the slow parts. The effort estimate counts regions and colour
  adjacency, not just area.
* **Narrow shapes are traps.** A region thinner than two stitch widths
  cannot be filled with long-and-short; it becomes a line of stitches.
  → *Implemented:* the width test routes such regions to the line layer.
* **Direction is content.** Fur, hair, and petals have flow; skin has planes.
  The data model reserves a per-region stitch guide for this.
* **Blends are regions too.** A/B alternation zones are how needle painters
  actually transition. The model reserves a blend spec so a zone can be a
  first-class region with two threads.

## Learned from a finished piece (papillon with winged rider on dark cloth, 2026-09-04)

Reverse-engineered from a photograph of a completed embroidery the artist is
about to stitch again. What it shows about her practice, and what it did to
the engine:

* **The cloth is a colour, not a region.** The dark-brown ground is bare
  fabric; nothing is stitched there. Treating every pixel as stitchable
  wasted most of the palette and region budget on the background.
  → *Implemented:* the **Fabric** section. A fabric colour (suggested from
  the image border) plus a tight tolerance masks those pixels out of the
  palette, segmentation, pattern, and estimate. The rim between subject and
  cloth is eroded by one pixel so the anti-aliased halo never becomes a
  thread. Black ears on dark-brown cloth are only ~0.05 OKLab apart, which
  is why the tolerance range is deliberately narrow.
* **Sparse palette, flat fills.** Roughly eight threads: white, black, two
  reds, gold, olive, a pale skin tone, dark brown. Source art is
  illustration, not photography, so *Colour fidelity* high and *Thread
  colours* around 8 is the right starting point. → *Implemented:* the
  "Flat art" preset (no pre-blur, no mode filter, no smoothing, sparse
  palette, 8 threads).
* **Line work rides on top of fills.** Wing veins, the text, and the star
  outlines are single-thread stem/back stitch drawn over satin or
  long-and-short. Our engine only knows fills; thin dark strokes either
  vanish (too narrow) or become garbage slivers. → *Open, V1:* a line layer:
  detect thin high-contrast strokes, emit them as stroked paths with a
  suggested stitch, and remove them from the fill before segmentation.
  → *Implemented 2026-09-05:* `src/engine/lines/`. Strokes up to two stitch
  widths are lifted before segmentation, inpainted out of the fills, and
  emitted as stroked paths with a thread, width, and back/stem suggestion.
* **Direction is visible in every fill.** The papillon's fur, the hair, and
  the wings all read as directional long stitches. Confirms the V2
  structure-tensor stitch-flow plan; for flat art a per-region "direction
  arrow" the artist sets by hand would already help.
* **Lettering is a separate object.** Hand-lettered text is one stem-stitch
  line; it should be exported as a path, not regions. → *Implemented* for
  strokes up to two stitch widths; heavier lettering stays a fill with its
  counters and corners preserved (counter rule, pinned corners).
* **Anti-aliasing is not a colour.** A rasterised edge between two flat
  fills is a one-pixel blend that nobody stitches; treated as its own thread
  it becomes a rim around every letter. → *Implemented:* ramp mask, halo
  dissolve, and ramp pixels assigned to a neighbouring flat colour.
