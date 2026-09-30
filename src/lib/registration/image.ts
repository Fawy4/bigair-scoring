/** The size a photo is shrunk to so its longest side is at most `max`; never enlarged. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export const PHOTO_MAX_SIDE = 1200;
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
