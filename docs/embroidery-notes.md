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
  Needs a width test (V1).
* **Direction is content.** Fur, hair, and petals have flow; skin has planes.
  The data model reserves a per-region stitch guide for this.
* **Blends are regions too.** A/B alternation zones are how needle painters
  actually transition. The model reserves a blend spec so a zone can be a
  first-class region with two threads.
