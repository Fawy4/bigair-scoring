import { fitWithin, PHOTO_MAX_BYTES, PHOTO_MAX_SIDE } from "./image";

export class PhotoError extends Error {
  constructor(public kind: "not-image" | "too-big") {
    super(kind);
  }
}

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));

/**
 * Runs in the rider's phone: shrinks a photo to at most 1200 px on the long side and saves it as a JPEG under 2 MB, so the upload is
 * small even on a slow beach connection. Orientation from the camera is respected. Browser only.
 */
export async function preparePhoto(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new PhotoError("not-image");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoError("not-image");
  }
  let side = PHOTO_MAX_SIDE;
  for (let round = 0; round < 4; round++) {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, side);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PhotoError("not-image");
    ctx.fillStyle = "#fff"; // a transparent PNG would turn black in a JPEG
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    for (const quality of [0.85, 0.72, 0.6, 0.45]) {
      const blob = await toBlob(canvas, quality);
      if (blob && blob.size <= PHOTO_MAX_BYTES) return blob;
    }
    side = Math.round(side * 0.7);
  }
  throw new PhotoError("too-big");
}
