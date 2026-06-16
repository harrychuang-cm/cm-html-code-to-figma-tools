import {
  packFigcapture,
  packMultiCaptureFigcapture,
  readFigcaptureFiles
} from "@figma-capture/capture-schema";
import { captureVisualAssets } from "./asset-capture.ts";
import { createManifestFromCapture } from "./capture-core.ts";

const SOURCE_SCREENSHOT_TILE_PREFIX = "assets/source-screenshot/tile-";
const SOURCE_SCREENSHOT_TILE_MAX_CSS_HEIGHT = 1800;
const SOURCE_SCREENSHOT_TILE_MAX_BITMAP_DIMENSION = 4096;

export async function buildCapturePackageData(capture, screenshotDataUrl, options = {}) {
  const fallbackRasterProvider = options.fallbackRasterProvider ??
    createScreenshotCropFallbackProvider(screenshotDataUrl, screenshotFallbackBoundsForCapture(capture));
  const imageRasterProvider = options.imageRasterProvider ?? createImageAssetRasterProvider();
  const assetResult = await captureVisualAssets(capture, {
    ...options,
    fallbackRasterProvider,
    imageRasterProvider
  });
  const sourceScreenshotTiles = await createSourceScreenshotTileAssets(assetResult.capture, screenshotDataUrl);
  const figmaPlan = createInitialFigmaPlan(assetResult.capture, assetResult.sourceNodeMap);
  return {
    manifest: createManifestFromCapture(assetResult.capture, {
      generatorVersion: options.generatorVersion ?? "0.1.0",
      deviceLabel: options.deviceLabel
    }),
    capture: assetResult.capture,
    figmaPlan,
    diagnostics: assetResult.diagnostics,
    screenshot: dataUrlToBytes(screenshotDataUrl),
    assets: {
      ...assetResult.assets,
      ...sourceScreenshotTiles
    }
  };
}

function screenshotFallbackBoundsForCapture(capture = {}) {
  if (capture.captureMode === "full-page") {
    const documentWidth = Number(capture.documentWidth ?? 0);
    const documentHeight = Number(capture.documentHeight ?? 0);
    if (documentWidth > 0 && documentHeight > 0) {
      return {
        width: documentWidth,
        height: documentHeight
      };
    }
  }
  return capture.viewport;
}

async function createSourceScreenshotTileAssets(capture = {}, screenshotDataUrl) {
  if (capture.captureMode !== "full-page") {
    return {};
  }
  const bounds = screenshotFallbackBoundsForCapture(capture);
  const documentWidth = Number(bounds?.width ?? 0);
  const documentHeight = Number(bounds?.height ?? 0);
  const tileHeight = sourceScreenshotTileCssHeight(capture);
  if (documentWidth <= 0 || documentHeight <= tileHeight) {
    return {};
  }

  const cropProvider = createScreenshotCropFallbackProvider(screenshotDataUrl, bounds);
  const tiles = {};
  let index = 0;
  for (let y = 0; y < documentHeight; y += tileHeight) {
    const height = Math.min(tileHeight, documentHeight - y);
    const bytes = await cropProvider({
      rect: {
        x: 0,
        y,
        width: documentWidth,
        height
      }
    });
    if (!bytes || bytes.length === 0) {
      return {};
    }
    tiles[`${SOURCE_SCREENSHOT_TILE_PREFIX}${String(index).padStart(4, "0")}.png`] = bytes;
    index += 1;
  }
  return tiles;
}

function sourceScreenshotTileCssHeight(capture = {}) {
  const dpr = Number(capture.viewport?.devicePixelRatio ?? 1);
  const maxCssHeightForBitmap = dpr > 0
    ? Math.floor(SOURCE_SCREENSHOT_TILE_MAX_BITMAP_DIMENSION / dpr)
    : SOURCE_SCREENSHOT_TILE_MAX_CSS_HEIGHT;
  return Math.max(1, Math.min(SOURCE_SCREENSHOT_TILE_MAX_CSS_HEIGHT, maxCssHeightForBitmap));
}

export async function buildConfirmedExportPackage(capture, screenshotDataUrl, options = {}) {
  const packageData = await buildCapturePackageData(capture, screenshotDataUrl, options);
  const bytes = packFigcapture(packageData);

  return {
    filename: `${safeName(packageData.capture.title || "capture")}-${packageData.manifest.viewportWidth}x${packageData.manifest.viewportHeight}.figcapture`,
    bytes,
    packageData
  };
}

export async function buildMultiCaptureExportPackage(breakpoints, options = {}) {
  if (!Array.isArray(breakpoints) || breakpoints.length === 0) {
    throw new Error("At least one breakpoint capture is required to build an export package");
  }

  const captures = [];
  for (const breakpoint of breakpoints) {
    const packageData = await buildCapturePackageData(breakpoint.capture, breakpoint.screenshotDataUrl, {
      ...options,
      deviceLabel: breakpoint.label ?? options.deviceLabel
    });
    if (breakpoint.truncationWarning) {
      packageData.diagnostics.warnings.push(breakpoint.truncationWarning);
    }
    const width = breakpoint.width ?? packageData.manifest.viewportWidth;
    captures.push({
      width,
      label: breakpoint.label ?? `${width}`,
      packageData
    });
  }

  const bytes = packMultiCaptureFigcapture({ captures });
  const title = captures[0].packageData.capture.title || "capture";
  const widthsLabel = captures.map((entry) => entry.width).join("-");

  return {
    filename: `${safeName(title)}-${widthsLabel}.figcapture`,
    bytes,
    packageData: { captures }
  };
}

export async function downloadFigcaptureArchive(chromeApi, exportPackage) {
  if (!chromeApi?.downloads?.download) {
    throw new Error("Chrome downloads API is unavailable");
  }

  const url = bytesToDataUrl(exportPackage.bytes, "application/octet-stream");
  return chromeApi.downloads.download({
    url,
    filename: exportPackage.filename,
    conflictAction: "uniquify",
    saveAs: true
  });
}

export function createInitialFigmaPlan(capture, sourceNodeMap = []) {
  const nodes = [];
  traverse(capture.root, (node) => {
    nodes.push({
      id: `plan-${node.sourceNodeId}`,
      type: planTypeForNode(node),
      sourceNodeId: node.sourceNodeId,
      rect: node.rect,
      confidence: node.fallbackRef ? 0.5 : 1
    });
  });

  const size = `${capture.viewport.width}x${capture.viewport.height}`;
  const title = capture.title || titleFromUrl(capture.sourceUrl);

  return {
    planVersion: "1.0.0",
    frames: [
      {
        id: "frame-source",
        role: "Source Screenshot",
        name: `${title} / ${size} / Source Screenshot`,
        nodes: []
      },
      {
        id: "frame-accurate",
        role: "Editable Accurate",
        name: `${title} / ${size} / Editable Accurate`,
        nodes
      }
    ],
    sourceNodeMap
  };
}

export function inspectArchiveFileNames(bytes) {
  return Object.keys(readFigcaptureFiles(bytes)).sort();
}

export function dataUrlToBytes(dataUrl) {
  const [, payload = ""] = dataUrl.split(",");
  if (typeof atob === "function") {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  return Uint8Array.from(Buffer.from(payload, "base64"));
}

export function createScreenshotCropFallbackProvider(screenshotDataUrl, viewport = {}) {
  let bitmapPromise = null;

  return async function screenshotCropFallback(node) {
    if (
      typeof globalThis.createImageBitmap !== "function" ||
      typeof globalThis.OffscreenCanvas !== "function" ||
      typeof globalThis.Blob !== "function"
    ) {
      return null;
    }

    const bitmap = await getBitmap();
    if (!bitmap?.width || !bitmap?.height) {
      return null;
    }

    const crop = cropRectForBitmap(node?.rect, viewport, bitmap);
    if (crop.width <= 0 || crop.height <= 0) {
      return null;
    }

    const canvas = new globalThis.OffscreenCanvas(crop.width, crop.height);
    const context = canvas.getContext?.("2d");
    if (!context?.drawImage || typeof canvas.convertToBlob !== "function") {
      return null;
    }

    context.drawImage(
      bitmap,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height
    );
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return new Uint8Array(await blob.arrayBuffer());
  };

  function getBitmap() {
    if (!bitmapPromise) {
      bitmapPromise = decodeScreenshotBitmap(screenshotDataUrl);
    }
    return bitmapPromise;
  }
}

export function createImageAssetRasterProvider() {
  return async function imageAssetRasterProvider(_source, bytes, contentType = "") {
    if (
      typeof globalThis.createImageBitmap !== "function" ||
      typeof globalThis.OffscreenCanvas !== "function" ||
      typeof globalThis.Blob !== "function"
    ) {
      return null;
    }

    const imageBytes = toUint8Array(bytes);
    if (imageBytes.length === 0) {
      return null;
    }

    let bitmap = null;
    try {
      const blob = new globalThis.Blob([imageBytes], {
        type: contentType || "image/webp"
      });
      bitmap = await globalThis.createImageBitmap(blob);
      if (!bitmap?.width || !bitmap?.height) {
        return null;
      }

      const canvas = new globalThis.OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext?.("2d");
      if (!context?.drawImage || typeof canvas.convertToBlob !== "function") {
        return null;
      }

      context.drawImage(bitmap, 0, 0);
      const pngBlob = await canvas.convertToBlob({ type: "image/png" });
      return new Uint8Array(await pngBlob.arrayBuffer());
    } catch {
      return null;
    } finally {
      if (typeof bitmap?.close === "function") {
        bitmap.close();
      }
    }
  };
}

async function decodeScreenshotBitmap(screenshotDataUrl) {
  const bytes = dataUrlToBytes(screenshotDataUrl);
  if (bytes.length === 0) {
    return null;
  }
  const blob = new globalThis.Blob([bytes], {
    type: dataUrlMediaType(screenshotDataUrl) || "image/png"
  });
  return globalThis.createImageBitmap(blob);
}

function cropRectForBitmap(rect = {}, viewport = {}, bitmap = {}) {
  const viewportWidth = Number(viewport.width ?? bitmap.width ?? 0);
  const viewportHeight = Number(viewport.height ?? bitmap.height ?? 0);
  const scaleX = viewportWidth > 0 ? bitmap.width / viewportWidth : 1;
  const scaleY = viewportHeight > 0 ? bitmap.height / viewportHeight : 1;
  const left = Math.max(0, Math.round(Number(rect.x ?? 0) * scaleX));
  const top = Math.max(0, Math.round(Number(rect.y ?? 0) * scaleY));
  const right = Math.min(bitmap.width, Math.round((Number(rect.x ?? 0) + Number(rect.width ?? 0)) * scaleX));
  const bottom = Math.min(bitmap.height, Math.round((Number(rect.y ?? 0) + Number(rect.height ?? 0)) * scaleY));

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

function dataUrlMediaType(dataUrl) {
  const match = String(dataUrl).match(/^data:([^;,]+)/);
  return match?.[1] ?? "";
}

function bytesToDataUrl(bytes, type) {
  return `data:${type};base64,${bytesToBase64(bytes)}`;
}

function bytesToBase64(bytes) {
  if (typeof btoa === "function") {
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.slice(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (Array.isArray(value)) {
    return new Uint8Array(value);
  }
  if (value?.buffer instanceof ArrayBuffer) {
    return new Uint8Array(value.buffer, value.byteOffset ?? 0, value.byteLength);
  }
  return new Uint8Array(0);
}

function planTypeForNode(node) {
  if (node.fallbackRef) {
    return "fallback";
  }
  if (node.assetRef || node.tagName === "img") {
    return "image";
  }
  if (node.textContent) {
    return "text";
  }
  return "rect";
}

function traverse(node, visit) {
  visit(node);
  for (const child of node.children ?? []) {
    traverse(child, visit);
  }
}

function titleFromUrl(url) {
  try {
    const parsed = new URL(url);
    const segment = parsed.pathname.split("/").filter(Boolean).at(-1);
    return segment ? capitalize(segment.replaceAll("-", " ")) : parsed.hostname;
  } catch {
    return "Capture";
  }
}

function safeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "capture";
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
