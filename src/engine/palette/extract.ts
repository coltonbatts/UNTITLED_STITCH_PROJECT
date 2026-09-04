// DMC-projected k-means in OKLab. See docs/05-algorithms.md.
import type { OKLab, PaletteEntry, ThreadColor, ThreadLibrary, ThreadPalette, WorkingImage } from '../types';
import { nearestThreadIndex } from '../threads/match';
import { oklabDistanceWeighted } from '../color';
import { makePrng } from './prng';

export interface ExtractOptions {
  threadCount: number;
  locked: ThreadColor[];
  contrastWeight: number;
  lightnessWeight: number;
  mergeDeltaE: number;
  /** Sample every Nth pixel for clustering; assignment still uses all pixels. */
  sampleStride?: number;
  maxIterations?: number;
  seed?: number;
}

interface Samples {
  lab: Float32Array; // 3 per sample
  w: Float32Array;
  count: number;
}

function collectSamples(img: WorkingImage, stride: number, contrastWeight: number): Samples {
  const n = img.width * img.height;
  const cap = Math.ceil(n / stride) + 1;
  const lab = new Float32Array(cap * 3);
  const w = new Float32Array(cap);
  let count = 0;
  for (let i = 0; i < n; i += stride) {
    if (img.mask && img.mask[i] === 0) continue;
    lab[count * 3] = img.oklab[i * 3];
    lab[count * 3 + 1] = img.oklab[i * 3 + 1];
    lab[count * 3 + 2] = img.oklab[i * 3 + 2];
    w[count] = 1 + contrastWeight * img.contrast[i];
    count++;
  }
  return { lab, w, count };
}

export function extractPalette(img: WorkingImage, library: ThreadLibrary, opts: ExtractOptions): ThreadPalette {
  const stride = opts.sampleStride ?? Math.max(1, Math.floor((img.width * img.height) / 60000));
  const maxIter = opts.maxIterations ?? 24;
  const s = collectSamples(img, stride, opts.contrastWeight);
  if (s.count === 0) return { entries: [] };
  const flat = library.oklabFlat;

  // Slot state: thread index per slot, locked flag, alive flag.
  const k = Math.max(1, Math.min(opts.threadCount, library.threads.length));
  const slotThread: number[] = [];
  const slotLocked: boolean[] = [];
  const used = new Set<number>();
  for (const t of opts.locked) {
    const idx = library.threads.indexOf(library.byNumber.get(t.number) ?? t);
    if (idx < 0 || used.has(idx) || slotThread.length >= k) continue;
    slotThread.push(idx);
    slotLocked.push(true);
    used.add(idx);
  }

  // k-means++ initialisation over samples, seeded, then projected to threads.
  const rand = makePrng(opts.seed ?? 1234567);
  const d2 = new Float32Array(s.count).fill(Infinity);
  const updateD2 = (threadIdx: number) => {
    const cL = flat[threadIdx * 3], ca = flat[threadIdx * 3 + 1], cb = flat[threadIdx * 3 + 2];
    for (let i = 0; i < s.count; i++) {
      const dL = s.lab[i * 3] - cL, da = s.lab[i * 3 + 1] - ca, db = s.lab[i * 3 + 2] - cb;
      const d = dL * dL + da * da + db * db;
      if (d < d2[i]) d2[i] = d;
    }
  };
  for (const t of slotThread) updateD2(t);
  while (slotThread.length < k) {
    let total = 0;
    if (slotThread.length === 0) {
      // First centre: weighted by sample weight only.
      for (let i = 0; i < s.count; i++) total += s.w[i];
    } else {
      for (let i = 0; i < s.count; i++) total += s.w[i] * d2[i];
    }
    if (total <= 0) break;
    let r = rand() * total;
    let pick = s.count - 1;
    for (let i = 0; i < s.count; i++) {
      r -= slotThread.length === 0 ? s.w[i] : s.w[i] * d2[i];
      if (r <= 0) { pick = i; break; }
    }
    const t = nearestThreadIndex(library, s.lab[pick * 3], s.lab[pick * 3 + 1], s.lab[pick * 3 + 2], used);
    if (t < 0) break;
    slotThread.push(t);
    slotLocked.push(false);
    used.add(t);
    updateD2(t);
  }

  // Lloyd iterations with projection.
  const assign = new Int32Array(s.count).fill(-1);
  const sumL = new Float64Array(k), sumA = new Float64Array(k), sumB = new Float64Array(k), sumW = new Float64Array(k);
  const alive: boolean[] = slotThread.map(() => true);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = 0;
    sumL.fill(0); sumA.fill(0); sumB.fill(0); sumW.fill(0);
    for (let i = 0; i < s.count; i++) {
      const L = s.lab[i * 3], a = s.lab[i * 3 + 1], b = s.lab[i * 3 + 2];
      let best = -1, bestD = Infinity;
      for (let j = 0; j < slotThread.length; j++) {
        if (!alive[j]) continue;
        const t = slotThread[j];
        const dL = flat[t * 3] - L, da = flat[t * 3 + 1] - a, db = flat[t * 3 + 2] - b;
        const d = dL * dL + da * da + db * db;
        if (d < bestD) { bestD = d; best = j; }
      }
      if (assign[i] !== best) { assign[i] = best; changed++; }
      const w = s.w[i];
      sumL[best] += L * w; sumA[best] += a * w; sumB[best] += b * w; sumW[best] += w;
    }
    if (changed === 0 && iter > 0) break;
    // Project non-locked centroids to the nearest unused thread.
    for (let j = 0; j < slotThread.length; j++) {
      if (!alive[j] || slotLocked[j]) continue;
      if (sumW[j] === 0) { alive[j] = false; used.delete(slotThread[j]); continue; }
      used.delete(slotThread[j]);
      const t = nearestThreadIndex(library, sumL[j] / sumW[j], sumA[j] / sumW[j], sumB[j] / sumW[j], used);
      slotThread[j] = t;
      used.add(t);
    }
  }

  // Final statistics per slot.
  sumL.fill(0); sumA.fill(0); sumB.fill(0); sumW.fill(0);
  let totalW = 0;
  for (let i = 0; i < s.count; i++) {
    const j = assign[i];
    const w = s.w[i];
    sumL[j] += s.lab[i * 3] * w; sumA[j] += s.lab[i * 3 + 1] * w; sumB[j] += s.lab[i * 3 + 2] * w; sumW[j] += w;
    totalW += w;
  }
  let entries: PaletteEntry[] = [];
  for (let j = 0; j < slotThread.length; j++) {
    if (!alive[j]) continue;
    const centroid: OKLab = sumW[j] > 0
      ? [sumL[j] / sumW[j], sumA[j] / sumW[j], sumB[j] / sumW[j]]
      : [...library.threads[slotThread[j]].oklab] as OKLab;
    entries.push({ thread: library.threads[slotThread[j]], centroid, locked: slotLocked[j], pixelShare: sumW[j] / totalW });
  }

  entries = mergeCloseEntries(entries, opts.mergeDeltaE, opts.lightnessWeight);
  // Light to dark: the order artists lay threads out.
  entries.sort((x, y) => y.thread.oklab[0] - x.thread.oklab[0] || x.thread.number.localeCompare(y.thread.number));
  return { entries };
}

/** Merges palette entries closer than the threshold (lightness-weighted), smaller share into larger. */
export function mergeCloseEntries(entries: PaletteEntry[], mergeDeltaE: number, lightnessWeight: number): PaletteEntry[] {
  const list = entries.map((e) => ({ ...e, centroid: [...e.centroid] as OKLab }));
  for (;;) {
    let bi = -1, bj = -1, bd = Infinity;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[i].locked && list[j].locked) continue;
        const d = oklabDistanceWeighted(list[i].thread.oklab, list[j].thread.oklab, lightnessWeight);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    }
    if (bi < 0 || bd >= mergeDeltaE) break;
    // Keep the locked one, else the larger share.
    let keep = bi, drop = bj;
    if (list[bj].locked || (!list[bi].locked && list[bj].pixelShare > list[bi].pixelShare)) { keep = bj; drop = bi; }
    const a = list[keep], b = list[drop];
    const tw = a.pixelShare + b.pixelShare;
    if (tw > 0) {
      a.centroid = [
        (a.centroid[0] * a.pixelShare + b.centroid[0] * b.pixelShare) / tw,
        (a.centroid[1] * a.pixelShare + b.centroid[1] * b.pixelShare) / tw,
        (a.centroid[2] * a.pixelShare + b.centroid[2] * b.pixelShare) / tw,
      ];
    }
    a.pixelShare = tw;
    list.splice(drop, 1);
  }
  return list;
}
