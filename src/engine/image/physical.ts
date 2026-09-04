import type { CropRect, EmbroideryDimensions } from '../types';

export const MIN_WORK_EDGE = 256;
export const MAX_WORK_EDGE = 1200;

/** Pixel size of the cropped source after rotation. */
export function croppedSourceSize(srcW: number, srcH: number, crop: CropRect): { width: number; height: number } {
  const w = Math.max(1, Math.round(srcW * crop.w));
  const h = Math.max(1, Math.round(srcH * crop.h));
  return crop.rotation === 90 || crop.rotation === 270 ? { width: h, height: w } : { width: w, height: h };
}

/**
 * Working resolution from physical size. The engine reasons in millimetres, so
 * the same photo at 100 mm and 300 mm gets a different pixel budget and a
 * different region map.
 */
export function workingResolution(
  dims: EmbroideryDimensions,
  pxPerMm: number,
): { width: number; height: number; mmPerPx: number } {
  const longMm = Math.max(dims.widthMm, dims.heightMm);
  let longPx = longMm * pxPerMm;
  longPx = Math.max(MIN_WORK_EDGE, Math.min(MAX_WORK_EDGE, longPx));
  const mmPerPx = longMm / longPx;
  const width = Math.max(1, Math.round(dims.widthMm / mmPerPx));
  const height = Math.max(1, Math.round(dims.heightMm / mmPerPx));
  return { width, height, mmPerPx };
}

/** Keeps heightMm in step with the image aspect when width changes. */
export function fitDimensionsToAspect(widthMm: number, aspect: number): { widthMm: number; heightMm: number } {
  return { widthMm, heightMm: widthMm / aspect };
}
