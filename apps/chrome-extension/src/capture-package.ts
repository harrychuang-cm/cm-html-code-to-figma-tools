import {
  packFigcapture,
  readFigcaptureFiles
} from "@figma-capture/capture-schema";
import { captureVisualAssets } from "./asset-capture.ts";
import { createManifestFromCapture } from "./capture-core.ts";

export function buildConfirmedExportPackage(capture, screenshotDataUrl, options = {}) {
  const assetResult = captureVisualAssets(capture, options);
  const figmaPlan = createInitialFigmaPlan(assetResult.capture, assetResult.sourceNodeMap);
  const packageData = {
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
  const bytes = packFigcapture(packageData);

  return {
    filename: `${safeName(assetResult.capture.title || "capture")}-${packageData.manifest.viewportWidth}x${packageData.manifest.viewportHeight}.figcapture`,
    bytes,
    packageData
  };
}

export async function downloadFigcaptureArchive(chromeApi, exportPackage) {
  if (!chromeApi?.downloads?.download) {
    throw new Error("Chrome downloads API is unavailable");
  }

  const url = bytesToObjectUrl(exportPackage.bytes, "application/zip");
  return chromeApi.downloads.download({
    url,
    filename: exportPackage.filename,
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
      },
      {
        id: "frame-autolayout",
        role: "Auto Layout Experimental",
        name: `${title} / ${size} / Auto Layout Experimental`,
        nodes: nodes.map((node) => ({ ...node, confidence: Math.min(node.confidence, 0.8) }))
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

function bytesToObjectUrl(bytes, type) {
  if (typeof URL !== "undefined" && typeof Blob !== "undefined") {
    return URL.createObjectURL(new Blob([bytes], { type }));
  }
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
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
