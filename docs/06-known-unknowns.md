# 06 · Known unknowns and embroidery-specific problems

Things we cannot settle from a desk. Each needs stitched samples.

## Colour

1. **Screen swatch vs thread.** The dataset is an approximation of dyed
   cotton on a monitor. How far off is it under daylight, and is the error
   systematic (e.g. too saturated)? A calibration pass with a physical card
   could yield a per-thread correction table.
2. **Optical mixing of adjacent threads.** Two threads stitched in alternating
   long-and-short blend to a colour that is not the mean of their RGB. Is the
   OKLab midpoint a good enough predictor for a blend zone?
3. **Sheen and direction.** The same thread reads lighter or darker depending
   on stitch angle versus light. Should value targets be biased?

## Structure

4. **Minimum region size that is actually stitchable** depends on strand
   count and the artist. Our default (2–3 mm² at 1 strand) is a guess.
5. **Narrow regions.** Implemented as the width test (two stitch widths at
   the current strand count, from a table of guessed stitch widths: 0.4 mm
   at one strand, 0.6 at two, 0.8 at three, 1.2 at six). Open: whether those
   widths are right, and whether a *low-contrast* thin sliver should also be
   lifted or merged rather than left to the area rule as it is now.
6. **Islands inside islands.** The pattern draws them; does an artist want
   the enclosing region drawn as a ring, or filled and over-stitched?
7. **Fur direction.** Structure-tensor orientation is a well-known
   deterministic estimator, but fur has hierarchical direction (tufts within
   flow). What sampling density is useful on paper?

## Interaction

8. **Which control do artists actually reach for first?** We bet on Thread
   colours then Complexity. Fidelity may be too abstract.
9. **Region-level overrides.** "This region should be 310, not 3799" is the
   most common manual fix. It needs an override model that survives
   recomputation (keyed by position, not id). Not in V0.
10. **Label density on paper.** At A4 for a 200 mm piece, how many labels
    before the pattern is unreadable?

## Fabric

14. **Fabric tolerance is a guess.** 0.015–0.215 OKLab, default 0.045. Black
    fur on dark-brown cloth sits at ~0.05, so the default must stay below
    that; scanner/photo noise on flat cloth sits around 0.03. Needs checking
    on real photographs of cloth, which are never flat.
15. **One-pixel erosion of the stitched area** removes the anti-aliased halo
    but also shaves 0.25 mm off every subject edge at 4 px/mm. Probably
    invisible in thread; verify.

## Flat art and lettering

16. **Strokes that differ in hue but not lightness** (red text on an
    equally light green) are invisible to the line detector, which works on
    L only. A chroma-aware top-hat is possible but was not needed by the
    samples we have.
17. **Small dense glyphs.** A figure "8" three millimetres tall has counters
    the closing fills, so the whole glyph is one blob wider than a line and
    falls back to the fill path, where it becomes a few tiny regions. Text
    below about 4 mm x-height is unstitchable either way; the question is
    whether the pattern should mark it "lettering, freehand" rather than
    draw the fragments.
18. **Anti-aliased small text is grey, not black.** A 2 px stroke rendered
    by a rasteriser rarely contains a fully-dark pixel, so lifted strokes
    from small captions snap to a grey thread. We snap to a palette thread
    within ΔE 0.2 and take the response-weighted core colour; a stroke still
    reads lighter than the artist drew it. Perhaps line colour should default
    to the darkest palette thread on the stroke's side of the ground.
19. **Textured grounds split into two threads.** Paper texture of ±5/255
    spans 0.035 in L, and the DMC set has browns 0.037 apart, so k-means
    with spare slots splits a flat ground in two. The flat preset merges
    threads closer than 0.05–0.16 (by *Colour fidelity*), which folds these
    back together but also loses a deliberate pair of close tones. A
    statistical merge (cluster overlap rather than thread distance) would be
    better and is not written.
20. **Short strokes on photographs.** At default settings the retriever
    grows eleven lines of 1.5–6 mm (whisker-sized). Whether an artist wants
    a 2 mm back stitch called out, or a minimum line length nearer 4 mm, is
    a stitched-sample question. The minimum is 1.5 mm.
21. **Line stitch suggestion** is a width rule only (back stitch up to about
    1.25 stitch widths, stem beyond). Real choice depends on curvature and
    on what the line sits on.

## Technical

11. **Working resolution.** 4 px/mm is enough for 1 mm features; is it too
    coarse for eyes at large hoop sizes? Adaptive resolution per region is
    possible later.
12. **WebP with alpha / masked backgrounds.** Masked pixels are labelled
    0xFFFF and excluded, but the UI for masking does not exist yet.
13. **Very large palettes (40) with small images** converge slowly; cap
    iterations and document.

## Measured when the line layer and halo suppression landed (2026-09-05)

Sample retriever at defaults, decoded to BMP with `sips` and run through
`scripts/bench-retriever.ts` (the browser decodes the JPEG slightly
differently, so its numbers differ: 210 regions, 15 threads there).

| | before | after |
|---|---|---|
| regions | 186 | 192 |
| threads | 15 | 14 |
| lines | 0 | 11 (1.5–6 mm) |
| mean ΔE, raw assignment | 0.036 | 0.042 |
| mean ΔE, cleaned map | 0.061 | 0.063 |
| prepare stage | 180 ms | ~250 ms |

Eight of the fifteen threads survived unchanged; the rest moved to
neighbouring DMC numbers. The raw error rises because ramp pixels now take a
neighbouring flat colour instead of their own best fit, which is the point;
the cleaned error, which is what gets stitched, is within noise.

Synthetic flat art (`tests/fixtures.ts`, `textArtRaster`) and a canvas-drawn
VHS label in the browser: strokes of 2–3 px come out as lines with length
within 2 % and width within 0.3 px; counters in O and 8 survive; the
red/blue edge produces no third thread; specks vanish; serif corners stay
within a pixel. A 22 px caption (1.7 mm x-height at 150 mm) comes out as
grey back-stitch lines, legible in places, see 17 and 18.

## Observed on the sample retriever (150 mm, 16 threads, defaults)

* Default settings produce ~160 regions; at *Complexity* 20 % about 90–110.
  Roughly a fifth of regions are too small for even an index label and get
  a leader line. Whether artists want those regions at all, or want them
  merged into a "detail as you see fit" note, needs a stitched sample.
* Full recompute takes ~1.2 s at 600 px (bilateral ~0.4 s, segmentation
  ~0.55 s). Slider drags feel deliberate rather than fluid. A lower-resolution
  preview while dragging, then a full pass on release, is the obvious next
  step if that matters in practice.
* Locking a thread re-runs palette extraction with that thread as a fixed
  centroid, which can shuffle the other threads. Artists may expect a lock to
  freeze everything else too; that would need a "lock the whole palette"
  mode where recompute only re-assigns pixels.
* The background of a pet photograph is where most regions go. A
  subject/background split (even a manual rough mask) would let the
  background take a far larger minimum feature size than the face.
