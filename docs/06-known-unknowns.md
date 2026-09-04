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
5. **Narrow regions.** A 0.6 mm wide, 20 mm long region passes an area test
   but is a single row of stitches. We need a width test (distance-transform
   maximum below a threshold), not just area.
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

## Technical

11. **Working resolution.** 4 px/mm is enough for 1 mm features; is it too
    coarse for eyes at large hoop sizes? Adaptive resolution per region is
    possible later.
12. **WebP with alpha / masked backgrounds.** Masked pixels are labelled
    0xFFFF and excluded, but the UI for masking does not exist yet.
13. **Very large palettes (40) with small images** converge slowly; cap
    iterations and document.

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
