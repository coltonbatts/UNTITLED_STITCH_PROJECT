// Lifts thin high-contrast strokes (lettering, outlines, veins) off the image
// before segmentation. A morphological top-hat on L finds features narrower
// than the structuring element; each candidate is measured (width at half
// contrast, extent) and either becomes a stroke, is erased as a speck, or is
// left to the fill path. Lifted pixels are inpainted with the surrounding
// colour so the fills underneath stay whole. See docs/05-algorithms.md.
import type { OKLab, RawStroke } from '../types';
import { dilate8, maskComponents, maskDistance, medianAt, squareFilter } from './mask';
import { pathsLength, skeletonPaths } from './skeleton';

export interface LineDetectOptions {
  /** Widest feature that is a line rather than a fill, px. */
  maxWidthPx: number;
  /** Shorter thin features are specks, px (bounding-box diagonal). */
  minLengthPx: number;
  /** Minimum L difference between a feature and its surroundings. */
  contrast: number;
  /** Thin features up to this wide and shorter than minLengthPx are erased. */
  speckMaxWidthPx: number;
}

export interface LineDetection {
  strokes: RawStroke[];
  /** OKLab planes with the lifted pixels inpainted. */
  oklab: Float32Array;
  /** 1 where a pixel was lifted (stroke or speck, plus a one-pixel rim). */
  lifted: Uint8Array;
  /** 1 on the core of small dark or light features that were not lifted (they keep their contrast boost). */
  feature: Uint8Array;
}

/** Dark and light top-hat responses of the L plane with a square window of radius r. */
export function topHat(L: Float32Array, width: number, height: number, r: number): { dark: Float32Array; light: Float32Array } {
  const dil = squareFilter(L, width, height, r, 'max');
  const closing = squareFilter(dil, width, height, r, 'min');
  const ero = squareFilter(L, width, height, r, 'min');
  const opening = squareFilter(ero, width, height, r, 'max');
  const dark = new Float32Array(L.length), light = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) { dark[i] = closing[i] - L[i]; light[i] = L[i] - opening[i]; }
  return { dark, light };
}

/** Onion-peel inpainting: each lifted pixel takes the mean of its already-known 8-neighbours, layer by layer. */
export function inpaintPlanes3(data: Float32Array, width: number, height: number, holes: Uint8Array): Float32Array {
  const out = new Float32Array(data);
  const known = new Uint8Array(holes.length);
  let remaining = 0;
  for (let i = 0; i < holes.length; i++) { known[i] = holes[i] ? 0 : 1; if (holes[i]) remaining++; }
  const next = new Float32Array(data.length);
  const fill: number[] = [];
  for (let iter = 0; iter < 64 && remaining > 0; iter++) {
    fill.length = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (known[i]) continue;
      let sL = 0, sa = 0, sb = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width || (dx === 0 && dy === 0)) continue;
          const j = yy * width + xx;
          if (!known[j]) continue;
          sL += out[j * 3]; sa += out[j * 3 + 1]; sb += out[j * 3 + 2]; n++;
        }
      }
      if (n === 0) continue;
      next[i * 3] = sL / n; next[i * 3 + 1] = sa / n; next[i * 3 + 2] = sb / n;
      fill.push(i);
    }
    if (fill.length === 0) break;
    for (const i of fill) { out[i * 3] = next[i * 3]; out[i * 3 + 1] = next[i * 3 + 1]; out[i * 3 + 2] = next[i * 3 + 2]; known[i] = 1; }
    remaining -= fill.length;
  }
  return out;
}

export function detectStrokes(oklab: Float32Array, width: number, height: number, opts: LineDetectOptions): LineDetection {
  const n = width * height;
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = oklab[i * 3];
  // Window just wide enough to close anything up to maxWidth. Wider windows
  // start to respond to the curved parts of thick rings, which are fills.
  const r = Math.max(1, Math.ceil(opts.maxWidthPx / 2));
  const hat = topHat(L, width, height, r);
  // The top-hat bridges the ground between two nearby specks (a closing fills
  // any dark gap narrower than its window). A feature must also differ from
  // the local median, which sparse specks cannot move.
  const q = new Uint8Array(n);
  for (let i = 0; i < n; i++) q[i] = Math.max(0, Math.min(255, Math.round(L[i] * 255)));
  const hist = new Int32Array(256);
  const medianR = Math.max(2, Math.ceil(opts.maxWidthPx));
  const candidate = new Uint8Array(n);
  const response = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const h = Math.max(hat.dark[i], hat.light[i]);
    response[i] = h;
    if (h <= opts.contrast) continue;
    const median = medianAt(q, width, height, i % width, Math.floor(i / width), medianR, hist);
    if (Math.abs(L[i] - median) > opts.contrast * 0.75) candidate[i] = 1;
  }
  const comps = maskComponents(candidate, width, height);
  // Core = pixels above half the component's peak response: the stroke proper, without its anti-aliased rim.
  const peak = new Float32Array(comps.count);
  for (let i = 0; i < n; i++) { const c = comps.comp[i]; if (c >= 0 && response[i] > peak[c]) peak[c] = response[i]; }
  const core = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const c = comps.comp[i]; if (c >= 0 && response[i] >= 0.5 * peak[c]) core[i] = 1; }
  const dist = maskDistance(core, width, height);
  const maxDist = new Float32Array(comps.count);
  for (let i = 0; i < n; i++) { const c = comps.comp[i]; if (c >= 0 && core[i] && dist[i] > maxDist[c]) maxDist[c] = dist[i]; }

  // Polarity per component (dark or light feature) and the check that it is
  // bounded by the opposite value on every side: a fragment of a thick ring's
  // edge has the ring itself on one side and fails.
  const darkVotes = new Int32Array(comps.count), coreCount = new Int32Array(comps.count), coreL = new Float64Array(comps.count);
  for (let i = 0; i < n; i++) {
    const c = comps.comp[i];
    if (c < 0 || !core[i]) continue;
    coreCount[c]++; coreL[c] += L[i];
    if (hat.dark[i] >= hat.light[i]) darkVotes[c]++;
  }
  const rimOk = new Int32Array(comps.count), rimAll = new Int32Array(comps.count);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (comps.comp[i] >= 0) continue;
    // Which components touch this outside pixel?
    let seenA = -1, seenB = -1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      const c = comps.comp[yy * width + xx];
      if (c < 0 || c === seenA || c === seenB) continue;
      if (seenA < 0) seenA = c; else if (seenB < 0) seenB = c;
    }
    for (const c of [seenA, seenB]) {
      if (c < 0 || coreCount[c] === 0) continue;
      const mean = coreL[c] / coreCount[c];
      const dark = darkVotes[c] * 2 >= coreCount[c];
      rimAll[c]++;
      if (dark ? L[i] >= mean + opts.contrast * 0.5 : L[i] <= mean - opts.contrast * 0.5) rimOk[c]++;
    }
  }

  const lift = new Uint8Array(n);
  const strokes: RawStroke[] = [];
  // Only small features keep their contrast boost later; wider candidates are fills whose rims are ramps.
  const smallFeature = new Uint8Array(n);
  for (let c = 0; c < comps.count; c++) {
    // The chamfer maximum under-reads even widths by a pixel; this is only a coarse gate.
    const gateWidth = maxDist[c] * 2;
    const b = comps.bbox[c];
    if (gateWidth <= opts.maxWidthPx * 1.5) {
      for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) { const i = y * width + x; if (comps.comp[i] === c && core[i]) smallFeature[i] = 1; }
    }
    if (gateWidth > opts.maxWidthPx) continue;
    if (rimAll[c] > 0 && rimOk[c] < rimAll[c] * 0.8) continue; // not a mark on a ground: an edge fragment
    const extent = Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
    let isLine = false;
    if (extent >= opts.minLengthPx) {
      // Skeletonise the core within its bounding box (one pixel of padding).
      const bw = b.x1 - b.x0 + 2, bh = b.y1 - b.y0 + 2;
      const crop = new Uint8Array(bw * bh);
      // Colour from the strongest part of the stroke: anti-aliasing lightens (or darkens) its fringe.
      let sL = 0, sa = 0, sb = 0, sw = 0, cnt = 0;
      for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
        const i = y * width + x;
        if (comps.comp[i] !== c || !core[i]) continue;
        crop[(y - b.y0 + 1) * bw + (x - b.x0 + 1)] = 1;
        const wgt = response[i] * response[i];
        sL += oklab[i * 3] * wgt; sa += oklab[i * 3 + 1] * wgt; sb += oklab[i * 3 + 2] * wgt; sw += wgt; cnt++;
      }
      const paths = skeletonPaths(crop, bw, bh, Math.max(2, gateWidth + 1)).map((p) => p.map((q) => ({ x: q.x + b.x0 - 1, y: q.y + b.y0 - 1 })));
      const lengthPx = pathsLength(paths);
      const longest = Math.max(0, ...paths.map((p) => pathsLength([p])));
      // Mean width along the centre line; a stroke is one or two long paths, a speck cluster is many short ones.
      const widthPx = lengthPx > 0 ? cnt / lengthPx : gateWidth;
      const strokeLike = longest >= opts.minLengthPx && paths.length <= 1 + lengthPx / opts.minLengthPx;
      if (cnt > 0 && sw > 0 && strokeLike && widthPx <= opts.maxWidthPx + 0.25) {
        strokes.push({ paths, widthPx, lengthPx, oklab: [sL / sw, sa / sw, sb / sw] as OKLab, source: 'image' });
        isLine = true;
      }
    }
    // Anything thin that is not a line is noise: paper texture, dust, compression specks.
    const isSpeck = !isLine && gateWidth + 1 <= opts.speckMaxWidthPx + 1;
    if (!isLine && !isSpeck) continue;
    for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) { const i = y * width + x; if (comps.comp[i] === c) lift[i] = 1; }
  }
  // Take the anti-aliased rim with the stroke, then fill from the outside in.
  const lifted = dilate8(lift, width, height);
  const filled = inpaintPlanes3(oklab, width, height, lifted);
  return { strokes, oklab: filled, lifted, feature: smallFeature };
}
