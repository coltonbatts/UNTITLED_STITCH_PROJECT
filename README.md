# Needlepaint

A planning instrument for hand embroidery / needle painting: import a
photograph, reduce it to a DMC floss palette, generate clean vector regions,
and export a printable pattern with DMC labels and a thread list.

Everything runs locally in the browser. No account, no upload, no AI service.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine tests (vitest, Node, synthetic fixtures)
npm run build      # typecheck + production bundle
npm run dmc:build  # regenerate src/data/dmc/dmc-floss.json from data/dmc
```

## Read first

* `docs/01-product-vision.md` — what this is and is not
* `docs/02-processing-pipeline.md` — the seven stages
* `docs/03-architecture.md` — layers and rules
* `docs/04-domain-model.md` — the typed objects
* `docs/05-algorithms.md` — why each algorithm, and what was rejected
* `docs/06-known-unknowns.md` — what needs stitched samples to settle
* `docs/07-roadmap.md` — V0 → V3
* `docs/embroidery-notes.md` — craft observations that shaped the engine
* `data/dmc/PROVENANCE.md` — where the colour numbers come from

## Layout

```
src/engine   pure TypeScript engine (no DOM), tested in tests/
src/app      store, worker client, persistence, controller
src/ui       React interface
src/data     generated DMC dataset
```
