export const STITCH_FAILED_CATEGORY = "screenshot-failed";

export async function stitchScreenshotSegments(segments, options = {}) {
  const documentWidth = Number(options.documentWidth ?? 0);
  const documentHeight = Number(options.documentHeight ?? 0);
  const devicePixelRatio = Number(options.devicePixelRatio ?? 1) || 1;
  const createCanvas = options.createCanvas ?? defaultCreateCanvas;
  const createBitmap = options.createBitmap ?? defaultCreateBitmap;

  if (!Array.isArray(segments) || segments.length === 0) {
    throw stitchError("No screenshot segments to stitch");
  }
  if (documentWidth <= 0 || documentHeight <= 0) {
    throw stitchError("Document dimensions are required for stitching");
  }

  const canvasWidth = Math.round(documentWidth * devicePixelRatio);
  const canvasHeight = Math.round(documentHeight * devicePixelRatio);
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const context = canvas?.getContext?.("2d");
  if (!context?.drawImage) {
    throw stitchError("Canvas 2d context is unavailable for stitching");
  }

  for (const segment of segments) {
    const bitmap = await createBitmap(segment.dataUrl);
    if (!bitmap) {
      throw stitchError("Screenshot segment could not be decoded");
    }
    context.drawImage(bitmap, 0, Math.round(Number(segment.scrollY ?? 0) * devicePixelRatio));
    bitmap.close?.();
  }

  if (typeof canvas.convertToBlob !== "function") {
    throw stitchError("Canvas blob conversion is unavailable for stitching");
  }
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return blobToDataUrl(blob);
}

function defaultCreateCanvas(width, height) {
  if (typeof globalThis.OffscreenCanvas !== "function") {
    throw stitchError("OffscreenCanvas is unavailable for stitching");
  }
  return new globalThis.OffscreenCanvas(width, height);
}

async function defaultCreateBitmap(dataUrl) {
  if (typeof globalThis.createImageBitmap !== "function" || typeof globalThis.fetch !== "function") {
    throw stitchError("Image decoding APIs are unavailable for stitching");
  }
  const response = await globalThis.fetch(dataUrl);
  const blob = await response.blob();
  return globalThis.createImageBitmap(blob);
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  const base64 = typeof globalThis.btoa === "function"
    ? globalThis.btoa(binary)
    : Buffer.from(bytes).toString("base64");
  return `data:image/png;base64,${base64}`;
}

function stitchError(message) {
  const error = new Error(message);
  error.category = STITCH_FAILED_CATEGORY;
  return error;
}
