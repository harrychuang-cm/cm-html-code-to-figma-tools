import { createEmptyDiagnostics } from "@figma-capture/capture-schema";

export const FALLBACK_TAGS = new Set(["canvas", "iframe", "video"]);

export const TRANSPARENT_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5,
  0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
]);

export function captureVisualAssets(capture, options = {}) {
  const assets = {};
  const diagnostics = createEmptyDiagnostics({
    status: "success",
    warnings: [],
    counts: {
      fallbacks: 0,
      missingAssets: 0,
      unsupportedStyles: 0
    },
    fallbackReasons: [],
    missingAssets: [],
    unsupportedStyles: [],
    autoLayoutCandidates: []
  });
  const sourceNodeMap = [];
  let imageIndex = 0;
  let fallbackIndex = 0;

  traverse(capture.root, (node) => {
    if (node.tagName === "img") {
      imageIndex += 1;
      const extension = extensionFromSource(node.attributes.src) ?? "png";
      const assetName = `assets/image-${imageIndex}.${extension}`;
      node.assetRef = assetName;
      sourceNodeMap.push({ sourceNodeId: node.sourceNodeId, assetRef: assetName });

      if (node.attributes.src) {
        assets[assetName] = bytesFromImageSource(node.attributes.src);
      } else {
        diagnostics.counts.missingAssets += 1;
        diagnostics.missingAssets.push(node.sourceNodeId);
        assets[assetName] = encodeJsonBytes({
          kind: "missing-image-source",
          sourceNodeId: node.sourceNodeId
        });
      }
    } else if (needsRasterFallback(node)) {
      fallbackIndex += 1;
      const fallbackName = `assets/fallback-${fallbackIndex}.png`;
      const reason = fallbackReason(node);
      node.fallbackRef = fallbackName;
      assets[fallbackName] = options.fallbackRasterProvider?.(node) ?? TRANSPARENT_PNG;
      diagnostics.counts.fallbacks += 1;
      diagnostics.fallbackReasons.push({ sourceNodeId: node.sourceNodeId, reason });
      diagnostics.warnings.push(`${node.sourceNodeId}: ${reason}`);
      sourceNodeMap.push({ sourceNodeId: node.sourceNodeId, fallbackRef: fallbackName });
    }

    for (const [property, value] of Object.entries(node.styles ?? {})) {
      if (property === "filter" || (typeof value === "string" && value.includes("backdrop-filter"))) {
        diagnostics.counts.unsupportedStyles += 1;
        diagnostics.unsupportedStyles.push(`${node.sourceNodeId}.${property}`);
      }
    }
  });

  if (diagnostics.counts.fallbacks > 0 || diagnostics.counts.missingAssets > 0 || diagnostics.counts.unsupportedStyles > 0) {
    diagnostics.status = "warning";
  }

  return {
    capture,
    assets,
    diagnostics,
    sourceNodeMap
  };
}

export function needsRasterFallback(node) {
  if (FALLBACK_TAGS.has(node.tagName)) {
    return true;
  }
  return node.tagName === "svg" && isComplexSvg(node);
}

export function fallbackReason(node) {
  if (node.tagName === "canvas") {
    return "canvas fallback";
  }
  if (node.tagName === "iframe") {
    return "iframe fallback";
  }
  if (node.tagName === "video") {
    return "video fallback";
  }
  if (node.tagName === "svg") {
    return "complex svg fallback";
  }
  return "unsupported visual fallback";
}

function traverse(node, visit) {
  visit(node);
  for (const child of node.children ?? []) {
    traverse(child, visit);
  }
}

function isComplexSvg(node) {
  return (node.children?.length ?? 0) > 0 || node.attributes?.role === "img" || Boolean(node.textContent);
}

function extensionFromSource(src = "") {
  if (src.startsWith("data:image/png")) {
    return "png";
  }
  if (src.startsWith("data:image/jpeg")) {
    return "jpg";
  }
  if (src.startsWith("data:image/webp")) {
    return "webp";
  }
  const match = src.split("?")[0].match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase();
}

function bytesFromImageSource(src) {
  if (src.startsWith("data:")) {
    return decodeDataUrl(src);
  }
  return encodeJsonBytes({
    kind: "external-image-reference",
    src
  });
}

function decodeDataUrl(src) {
  const base64 = src.split(",")[1] ?? "";
  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

function encodeJsonBytes(value) {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}
