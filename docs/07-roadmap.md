# 07 · Roadmap

## V0 (this milestone): import → DMC palette → regions → SVG pattern

* Image import (JPG/PNG/WebP), crop-free positioning, physical size + hoop.
* DMC-projected palette, Fidelity, Complexity, Colour fidelity, Minimum detail readout.
* Cleanup, region graph, shared-arc vectorisation.
* Views: Original, Threads, Regions, Pattern; hold-to-compare.
* Palette inspector: swatch, number, name, share, replace, lock, merge.
* Exports: SVG, PNG, thread list. Print via browser.
* Local persistence (IndexedDB), undo/redo.
* Bare-fabric background: fabric colour + tolerance masks unstitched cloth (added after studying a finished piece; see embroidery-notes).
* Engine tests with synthetic fixtures.

## V1: an artist can work from it

* Crop and rotate tool on the canvas.
* Line layer: thin high-contrast strokes (veins, lettering, outlines) as stroked paths over the fills, not fill regions.
* Flat-art preset: no pre-blur, exact colour, hard edges, ~8 threads.
* Eyedropper on the canvas for the fabric colour (today: border median or a colour input).
* Region-level thread override and region merge by clicking the canvas.
* Width-based narrow-region cleanup.
* Presets: Portrait, Animal, Botanical, Landscape, Flat.
* "Threads I own" preference weighting.
* PDF export with legend and project sheet.
* Anchor/Madeira libraries (data only).

## V2: needle-painting intelligence

* Structure-tensor stitch-flow field per region; flow lines in the pattern.
* Blend zones between adjacent threads (A → A/B → B) as first-class regions.
* Value-structure view (L only) and a "squint" preview.
* Strand-count suggestions from region size and detail.
* Edge-aware pre-segmentation (SLIC-like superpixels) as an optional stage.

## V3: optional assistance

* Optional local ML for subject masking (background removal) behind a
  clearly labelled, off-by-default switch.
* Kit mode: repeatable patterns, thread quantities in skeins.
