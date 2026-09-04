# 03 · Architecture

## Stack and why

| Choice                    | Why                                                                          |
| ------------------------- | ---------------------------------------------------------------------------- |
| TypeScript, strict        | Typed domain model is the point; the engine is math over typed arrays.       |
| Vite + React 19           | Fast dev loop, first-class Web Worker bundling, no framework lock on engine. |
| Web Worker for the engine | Sliders stay interactive while a 600 px image is re-segmented.               |
| Canvas for raster         | Decode, crop, resample, preview. Only in `image/` and the UI.                |
| SVG for geometry          | Canonical, editable, printable. Pattern is real paths, not a raster.        |
| Vitest                    | Engine tests run in Node with no DOM; fixtures are synthetic arrays.         |
| No state library          | A 120-line store with undo history is smaller than any dependency.           |
| No geometry/quantiser lib | See `05-algorithms.md`: shared-arc topology and DMC-projected k-means are not what off-the-shelf tracers do. |

## Layers

```
src/
  engine/                pure, DOM-free, testable in Node
    color/               sRGB ↔ linear ↔ CIELAB ↔ OKLab, ΔE (OKLab, CIEDE2000)
    threads/             ThreadColor, ThreadLibrary, DMC loader, nearest-thread search
    image/               WorkingImage, physical dimensions, resampling, contrast map
    palette/             DMC-projected k-means, merge-by-ΔE, locks
    segmentation/        labelling, mode filter, connected components, island merge
    regions/             RegionGraph construction, distance transform, poles
    vector/              crack-edge graph → arcs → simplify/smooth → rings → SVG d
    pattern/             label placement tiers, legend, hoop, scale bar, estimates
    embroidery/          Fidelity/Complexity → engine parameters, effort estimates
    export/              SVG document, thread list text/CSV, PNG via canvas (UI side)
    pipeline.ts          stage orchestration + per-stage cache
    worker.ts            message protocol wrapper around pipeline
  app/                   store (state + undo), persistence (IndexedDB), worker client
  ui/                    React components, styles; no algorithms
  data/dmc/              generated dataset (never hand edited)
```

Rules:

* `engine/**` never imports from `app/` or `ui/` and never touches `document`.
  `image/decode.ts` is the one file that uses canvas APIs and it is only
  called from the main thread.
* Domain objects are plain serialisable data (typed arrays allowed) so they
  cross the worker boundary and persist without adapters.
* Every stage function is `(inputs) => output` with no hidden state. The
  cache lives in `pipeline.ts`, not in the stages.
* UI components receive derived view models; they never call engine code
  directly except through the worker client.

## State

`app/store.ts` holds one `ProjectState`: source image reference, crop,
dimensions, `ProcessingSettings`, `PaletteEdits`, view settings, and the
latest `PipelineResult`. Settings and palette edits are on the undo stack;
view settings and results are not. Persistence writes the project and the
source image blob to IndexedDB on every committed change.

## Worker protocol

`{ type: 'run', requestId, project }` → `{ type: 'result', requestId, stageTimings, result }`
or `{ type: 'progress', stage }`. Requests are coalesced: a newer request
cancels the pending one. Results carry typed arrays as transferables.

## Extension points designed in

* **Thread libraries**: `ThreadLibrary` is an interface; DMC is one instance.
* **Owned threads**: `PaletteEdits.preferred` is reserved; the palette stage
  accepts a preference weighting.
* **Segmentation**: stage 3 takes a `LabelMap`; a future edge-aware or
  AI-assisted segmenter produces the same type.
* **Stitch guidance**: `Region.stitch` is an optional typed field (angle, flow
  samples, strand count, blend partner). Stage 4 can be extended to fill it
  from a structure tensor without changing stages 5–7.
* **Blend zones**: a `Region` may declare `blend: { threads: [a, b], ratio }`;
  the pattern renderer already treats fill as a function of the region, not a
  single thread.
