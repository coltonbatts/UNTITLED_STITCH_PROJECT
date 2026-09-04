# 01 · Product vision

**Needlepaint** turns a photograph into a plan a human can needle-paint with
DMC floss. It is an instrument for an artist who already knows how to
embroider, not a generator that pretends the hard part is done.

## The job to be done

An artist looks at a reference photo and, over several hours, decides:

1. which masses of colour and value actually carry the likeness,
2. which DMC threads approximate them,
3. where the boundaries between masses go,
4. where detail is worth the stitches and where it is noise,
5. how the stitches should flow across each mass.

Today that is done with squinting, tracing paper, and a floss card. The
software's job is to make each decision **visible, adjustable, and reversible**,
and to do the mechanical parts (colour distance, contour tracing, area
accounting, shopping lists) exactly.

## What "good" means here

We optimise the **embroidery plan**, not the image reconstruction. Concretely
the objective is a balance of:

| Dimension        | Question the engine asks                                             |
| ---------------- | -------------------------------------------------------------------- |
| Likeness         | Does the region map still read as the subject at arm's length?       |
| Value structure  | Are the light/dark relationships preserved even where hue drifts?    |
| Colour accuracy  | Are the chosen threads perceptually close to what matters?           |
| Stitchability    | Is every region large enough and simple enough to be filled by hand? |
| Effort           | How many regions, colour changes, and stitches does this cost?       |
| Physical size    | Does a 1 mm feature exist at this hoop size, or is it a wish?        |
| Artistic control | Can the artist override every automatic decision without a fight?    |

A pixel-accurate posterisation with 3,000 regions fails this test. A 12-region
plan that still looks like the dog passes it.

## Product principles

* **The image dominates.** One large canvas, a narrow rail, a contextual
  inspector, a thread tray. No dashboard, no marketing, no chat.
* **Direct manipulation.** Every control changes the artwork immediately. The
  controls are named for what an embroiderer thinks about (Fidelity,
  Complexity, Thread colours, Minimum detail), not for algorithm parameters.
* **Deterministic and local.** Same image, same settings, same result. All
  processing runs in the browser. No account, no upload, no model call.
* **Non-destructive.** Settings and palette edits are data; the source image
  is never modified. Every edit is undoable.
* **Honest.** Estimates are labelled approximate. A feature that cannot work
  yet does not have a button.
* **SVG is canonical.** The pattern is real geometry with stable identifiers
  and metadata, so it can be edited in Illustrator, Affinity, or Inkscape.

## Who it is for

A single needle-painting artist working on portraits, animals, botanicals, and
photographic subjects at typical hoop sizes (10–30 cm). Later: small studios
that sell kits and need repeatable patterns and thread lists.

## Non-goals (for now)

* Machine-embroidery digitising (stitch files, PES/DST).
* Cross-stitch grids. (The engine could feed one; the product is not that.)
* Cloud sync, sharing, marketplaces.
* "Generate art" features. The source image is the artist's.
