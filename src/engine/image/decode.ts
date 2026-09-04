// Browser-only: decodes an image file into a bounded RGBA raster. This is the
// single place the engine touches canvas APIs; it must only run on the main
// thread (or a worker with OffscreenCanvas).
import type { RasterRGBA } from '../types';

export const MAX_SOURCE_EDGE = 1600;

export async function decodeImageFile(file: Blob): Promise<RasterRGBA & { originalWidth: number; originalHeight: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SOURCE_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height);
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  bitmap.close();
  return { width, height, rgba: data.data, originalWidth, originalHeight };
}
