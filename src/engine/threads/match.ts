import type { OKLab, ThreadColor, ThreadLibrary } from '../types';

/**
 * Index of the nearest thread in OKLab, optionally skipping a set of indices.
 * Returns -1 only if every thread is excluded.
 */
export function nearestThreadIndex(
  library: ThreadLibrary,
  L: number,
  a: number,
  b: number,
  exclude?: Set<number>,
  lightnessWeight = 1,
): number {
  const flat = library.oklabFlat;
  const n = library.threads.length;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    if (exclude && exclude.has(i)) continue;
    const dL = (flat[i * 3] - L) * lightnessWeight;
    const da = flat[i * 3 + 1] - a;
    const db = flat[i * 3 + 2] - b;
    const d = dL * dL + da * da + db * db;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function nearestThread(library: ThreadLibrary, oklab: OKLab): ThreadColor {
  return library.threads[nearestThreadIndex(library, oklab[0], oklab[1], oklab[2])];
}

/** Threads sorted by distance from an OKLab colour, closest first. */
export function rankThreads(library: ThreadLibrary, oklab: OKLab, limit = 12): Array<{ thread: ThreadColor; distance: number }> {
  const out = library.threads.map((thread) => {
    const dL = thread.oklab[0] - oklab[0];
    const da = thread.oklab[1] - oklab[1];
    const db = thread.oklab[2] - oklab[2];
    return { thread, distance: Math.sqrt(dL * dL + da * da + db * db) };
  });
  out.sort((x, y) => x.distance - y.distance || x.thread.number.localeCompare(y.thread.number));
  return out.slice(0, limit);
}
