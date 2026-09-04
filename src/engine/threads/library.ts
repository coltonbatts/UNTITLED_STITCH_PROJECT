import type { RGB, ThreadColor, ThreadLibrary } from '../types';
import { rgbToLab, rgbToOklab, rgbToHex } from '../color';

export interface ThreadDatasetRecord {
  number: string;
  name: string;
  rgb: RGB;
  hex?: string;
}

export interface ThreadDataset {
  library: string;
  displayName: string;
  version: string;
  colors: ThreadDatasetRecord[];
}

/** Builds a ThreadLibrary from a dataset. Lab/OKLab are derived, never stored. */
export function buildThreadLibrary(dataset: ThreadDataset): ThreadLibrary {
  const threads: ThreadColor[] = dataset.colors.map((c) => ({
    library: dataset.library,
    number: c.number,
    name: c.name,
    rgb: [c.rgb[0], c.rgb[1], c.rgb[2]],
    hex: c.hex ?? rgbToHex(c.rgb),
    lab: rgbToLab(c.rgb),
    oklab: rgbToOklab(c.rgb),
  }));
  const byNumber = new Map<string, ThreadColor>();
  const oklabFlat = new Float32Array(threads.length * 3);
  threads.forEach((t, i) => {
    byNumber.set(t.number, t);
    oklabFlat[i * 3] = t.oklab[0];
    oklabFlat[i * 3 + 1] = t.oklab[1];
    oklabFlat[i * 3 + 2] = t.oklab[2];
  });
  return { id: dataset.library, displayName: dataset.displayName, version: dataset.version, threads, byNumber, oklabFlat };
}
