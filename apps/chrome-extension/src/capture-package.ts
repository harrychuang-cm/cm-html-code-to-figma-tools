import {
  packFigcapture,
  packMultiCaptureFigcapture,
  readFigcaptureFiles
} from "@figma-capture/capture-schema";
import { captureVisualAssets } from "./asset-capture.ts";
import { createManifestFromCapture } from "./capture-core.ts";

export async function buildCapturePackageData(capture, screenshotDataUrl, options = {}) {
  const fallbackRasterProvider = options.fallbackRasterProvider ??
    createScreenshotCropFallbackProvider(screenshotDataUrl, capture.viewport);
  const assetResult = await captureVisualAssets(capture, {
    ...options,
    fallbackRasterProvider
  });
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
    assets: assetResult.assets
  };
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
