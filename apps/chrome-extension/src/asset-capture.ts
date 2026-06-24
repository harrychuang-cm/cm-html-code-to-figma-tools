import { createEmptyDiagnostics, materialIconAssetSourceForNode } from "@figma-capture/capture-schema";

export const FALLBACK_TAGS = new Set(["canvas", "iframe", "video"]);
const RASTER_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

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
  let vectorIndex = 0;
  let iconIndex = 0;
  let fallbackIndex = 0;
  const pendingAssets = [];
  const missingAssetIds = new Set();

  function recordMissingAssetDiagnostic(node, reason) {
    if (!missingAssetIds.has(node.sourceNodeId)) {
      diagnostics.counts.missingAssets += 1;
      diagnostics.missingAssets.push(node.sourceNodeId);
      missingAssetIds.add(node.sourceNodeId);
    }
    diagnostics.warnings.push(`${node.sourceNodeId}: ${reason}`);
  }

  function recordMissingAsset(node, assetName, reason, extra = {}) {
    recordMissingAssetDiagnostic(node, reason);
    assets[assetName] = encodeJsonBytes({
      kind: "missing-visual-asset",
      sourceNodeId: node.sourceNodeId,
      reason,
      ...extra
    });
  }

  function storeAssetBytes(node, assetName, bytes, assetKind, source) {
    assets[assetName] = toUint8Array(bytes);
    node.assetRef = assetName;
    node.attributes = {
      ...(node.attributes ?? {}),
      assetKind,
      ...(source?.assetRole ? { assetRole: source.assetRole } : {}),
      ...(source?.url || source?.assetSource ? { assetSource: source.url ?? source.assetSource } : {}),
      ...(source?.iconFontLigature ? { iconFontLigature: source.iconFontLigature } : {})
    };
  }

  function storeAssetSource(node, source, namePrefix, fallbackExtension) {
    const assetKind = source.assetKind;
    const extension = normalizeAssetExtension(source.extension ?? fallbackExtension ?? "png");
    let assetName = `assets/${namePrefix}-${source.index}.${extension}`;
    let sourceMapEntry = null;

    function updateAssetName(nextAssetName) {
      if (!nextAssetName || nextAssetName === assetName) {
        return;
      }
      assetName = nextAssetName;
      node.assetRef = assetName;
      if (sourceMapEntry) {
        sourceMapEntry.assetRef = assetName;
      }
    }

    if (!source.url && !source.bytes) {
      node.assetRef = assetName;
      recordMissingAsset(node, assetName, source.missingReason ?? "missing asset source");
      sourceNodeMap.push({ sourceNodeId: node.sourceNodeId, assetRef: assetName });
      return;
    }

    node.assetRef = assetName;
    sourceMapEntry = { sourceNodeId: node.sourceNodeId, assetRef: assetName };
    sourceNodeMap.push(sourceMapEntry);

    if (source.bytes) {
      storeAssetBytes(node, assetName, source.bytes, assetKind, source);
      return;
    }

    if (source.url?.startsWith("data:")) {
      try {
        storeAssetBytes(node, assetName, decodeDataUrl(source.url), assetKind, source);
      } catch (error) {
        recordMissingAsset(node, assetName, "data URL decode failed", {
          src: source.url,
          error: error?.message ?? String(error)
        });
      }
      return;
    }

    if (options.assetResolver) {
      pendingAssets.push(Promise.resolve()
        .then(() => options.assetResolver({
          url: source.url,
          sourceNodeId: node.sourceNodeId,
          assetKind
        }))
        .then((resolved) => {
          const resolvedBytes = resolved?.bytes ?? resolved;
          const contentType = resolved?.contentType ?? "";
          const resolvedKind = assetKindFromContentType(contentType) ?? assetKind;
          const normalizedBytes = toUint8Array(resolvedBytes);
          if (shouldRasterizeFetchedImageAsset(source, normalizedBytes, contentType)) {
            return Promise.resolve(rasterizeFetchedImageAsset(node, source, normalizedBytes, contentType, options))
              .then((bytes) => {
                const rasterBytes = normalizeFallbackBytes(bytes);
                if (rasterBytes.length > 0 && !isTransparentPlaceholder(rasterBytes)) {
                  updateAssetName(`assets/${namePrefix}-${source.index}.png`);
                  storeAssetBytes(node, assetName, rasterBytes, "raster", source);
                  return;
                }
                node.attributes.assetKind = resolvedKind;
                storeAssetBytes(node, assetName, normalizedBytes, resolvedKind, source);
              });
          }
          node.attributes.assetKind = resolvedKind;
          storeAssetBytes(node, assetName, normalizedBytes, resolvedKind, source);
        })
        .catch((error) => {
          recordMissingAsset(node, assetName, "asset fetch failed", {
            src: source.url,
            error: error?.message ?? String(error)
          });
        }));
      return;
    }

    recordMissingAsset(node, assetName, "asset resolver unavailable", { src: source.url });
  }

  traverse(capture.root, (node) => {
    if (node.tagName === "img") {
      imageIndex += 1;
      storeAssetSource(node, imageSourceForNode(node, imageIndex), "image", "png");
    } else if (needsRasterFallback(node)) {
      fallbackIndex += 1;
      const fallbackName = `assets/fallback-${fallbackIndex}.png`;
      const reason = fallbackReason(node);
      const fallbackBytes = fallbackAssetBytes(node, options);
      node.fallbackRef = fallbackName;
      if (isPromiseLike(fallbackBytes)) {
        assets[fallbackName] = TRANSPARENT_PNG;
        pendingAssets.push(Promise.resolve(fallbackBytes)
          .then((bytes) => {
            assets[fallbackName] = normalizeFallbackBytes(bytes);
            if (isClosedShadowHostNode(node) && isTransparentPlaceholder(assets[fallbackName])) {
              recordMissingAssetDiagnostic(node, "closed shadow root crop unavailable");
            }
          }));
      } else {
        assets[fallbackName] = normalizeFallbackBytes(fallbackBytes);
        if (isClosedShadowHostNode(node) && isTransparentPlaceholder(assets[fallbackName])) {
          recordMissingAssetDiagnostic(node, "closed shadow root crop unavailable");
        }
      }
      diagnostics.counts.fallbacks += 1;
      diagnostics.fallbackReasons.push({ sourceNodeId: node.sourceNodeId, reason });
      diagnostics.warnings.push(`${node.sourceNodeId}: ${reason}`);
      sourceNodeMap.push({ sourceNodeId: node.sourceNodeId, fallbackRef: fallbackName });
    } else if (node.tagName === "svg" && node.attributes?.svgMarkup) {
      vectorIndex += 1;
      storeAssetSource(node, {
        index: vectorIndex,
        bytes: encodeTextBytes(node.attributes.svgMarkup),
        extension: "svg",
        assetKind: "svg"
      }, "vector", "svg");
    } else {
      const materialIconSource = materialIconAssetSourceForNode(node);
      if (materialIconSource) {
        iconIndex += 1;
        storeAssetSource(node, {
          ...materialIconSource,
          index: iconIndex
        }, "icon-font", "svg");
      } else if (canUseCssImageAsset(node)) {
        const cssSource = cssImageSourceForNode(node);
        if (cssSource) {
          iconIndex += 1;
          storeAssetSource(node, {
            ...cssSource,
            index: iconIndex
          }, "icon", "png");
        }
      }
    }

    for (const [property, value] of Object.entries(node.styles ?? {})) {
      if (property === "filter" || (typeof value === "string" && value.includes("backdrop-filter"))) {
        diagnostics.counts.unsupportedStyles += 1;
        diagnostics.unsupportedStyles.push(`${node.sourceNodeId}.${property}`);
      }
    }
  });

  if (pendingAssets.length > 0) {
    return Promise.all(pendingAssets).then(() => createResult());
  }

  return createResult();

  function createResult() {
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
}

export function needsRasterFallback(node) {
  if (node.tagName === "iframe") {
    return (node.children ?? []).length === 0;
  }
  if (FALLBACK_TAGS.has(node.tagName)) {
    return true;
  }
  if (isClosedShadowHostNode(node)) {
    return true;
  }
  return node.tagName === "svg" && needsSvgRasterFallback(node);
}

export function isClosedShadowHostNode(node) {
  return node.attributes?.["data-closed-shadow-root"] === "true";
}

function fallbackAssetBytes(node, options) {
  const directBytes = directCanvasAssetBytes(node);
  if (directBytes && !isTransparentPlaceholder(directBytes)) {
    return directBytes;
  }
  const fallbackBytes = directBytes ?? TRANSPARENT_PNG;
  if (!options.fallbackRasterProvider) {
    return fallbackBytes;
  }
  return Promise.resolve()
    .then(() => options.fallbackRasterProvider(node))
    .then((bytes) => {
      const normalized = normalizeFallbackBytes(bytes);
      return normalized.length > 0 && !isTransparentPlaceholder(normalized)
        ? normalized
        : fallbackBytes;
    })
    .catch(() => fallbackBytes);
}

function directCanvasAssetBytes(node) {
  if (node.tagName === "canvas" && typeof node.attributes?.canvasDataUrl === "string") {
    try {
      return decodeDataUrl(node.attributes.canvasDataUrl);
    } catch {
      // Keep the import path stable; diagnostics already record this as a canvas fallback.
    }
  }
  return null;
}

function normalizeFallbackBytes(bytes) {
  const normalized = toUint8Array(bytes);
  return normalized.length > 0 ? normalized : TRANSPARENT_PNG;
}

async function rasterizeFetchedImageAsset(node, source, bytes, contentType, options) {
  const providerSource = {
    ...source,
    sourceNodeId: node.sourceNodeId
  };
  if (typeof options.imageRasterProvider === "function") {
    try {
      const rasterized = normalizeFallbackBytes(await options.imageRasterProvider(providerSource, bytes, contentType));
      if (rasterized.length > 0 && !isTransparentPlaceholder(rasterized)) {
        return rasterized;
      }
    } catch {
      // Fall through to screenshot crop fallback when direct image decoding is unavailable.
    }
  }
  if (typeof options.fallbackRasterProvider === "function") {
    try {
      return await options.fallbackRasterProvider(node);
    } catch {
      return null;
    }
  }
  return null;
}

function shouldRasterizeFetchedImageAsset(source, bytes, contentType = "") {
  if (source.assetKind !== "raster") {
    return false;
  }
  return isWebpBytes(bytes) || /\bimage\/webp\b/i.test(contentType);
}

function isWebpBytes(bytes) {
  const normalized = toUint8Array(bytes);
  return normalized.length >= 12 &&
    normalized[0] === 0x52 &&
    normalized[1] === 0x49 &&
    normalized[2] === 0x46 &&
    normalized[3] === 0x46 &&
    normalized[8] === 0x57 &&
    normalized[9] === 0x45 &&
    normalized[10] === 0x42 &&
    normalized[11] === 0x50;
}

function isTransparentPlaceholder(bytes) {
  const normalized = toUint8Array(bytes);
  if (normalized.length !== TRANSPARENT_PNG.length) {
    return false;
  }
  return TRANSPARENT_PNG.every((value, index) => normalized[index] === value);
}

function isPromiseLike(value) {
  return value && typeof value.then === "function";
}

export function fallbackReason(node) {
  if (isClosedShadowHostNode(node)) {
    return "closed shadow root fallback";
  }
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

const SVG_CONTAINER_TAGS = new Set(["a", "g", "svg", "switch", "symbol"]);
const SVG_NON_RENDERING_TAGS = new Set([
  "clippath",
  "defs",
  "desc",
  "filter",
  "lineargradient",
  "marker",
  "mask",
  "metadata",
  "pattern",
  "radialgradient",
  "script",
  "style",
  "title"
]);
const SVG_TEXT_TAGS = new Set(["text", "textpath", "tspan"]);
const SVG_HIGH_RISK_TAGS = new Set(["foreignobject", "script", "iframe", "canvas", "video"]);
const COMPLEX_SVG_VISUAL_NODE_THRESHOLD = 4;

function needsSvgRasterFallback(node) {
  if (!node.attributes?.svgMarkup) {
    return isComplexSvg(node);
  }
  return hasHighRiskSvgFeature(node);
}

function hasHighRiskSvgFeature(node) {
  const markup = String(node.attributes?.svgMarkup ?? "");
  if (/<\s*(?:foreignObject|script|iframe|canvas|video)\b/i.test(markup) || /\son[a-z]+\s*=/i.test(markup)) {
    return true;
  }
  return svgTreeHasHighRiskFeature(node);
}

function svgTreeHasHighRiskFeature(node) {
  const tagName = String(node.tagName ?? "").toLowerCase();
  if (SVG_HIGH_RISK_TAGS.has(tagName)) {
    return true;
  }
  for (const attribute of Object.keys(node.attributes ?? {})) {
    if (/^on[a-z]+$/i.test(attribute)) {
      return true;
    }
  }
  return (node.children ?? []).some((child) => svgTreeHasHighRiskFeature(child));
}

function isComplexSvg(node) {
  if (node.attributes?.role === "img" || Boolean(node.textContent)) {
    return true;
  }
  const stats = svgDescendantStats(node);
  return stats.textNodes > 0 || stats.visualNodes > COMPLEX_SVG_VISUAL_NODE_THRESHOLD;
}

function svgDescendantStats(node) {
  const stats = { textNodes: 0, visualNodes: 0 };
  for (const child of node.children ?? []) {
    collectSvgDescendantStats(child, stats);
  }
  return stats;
}

function collectSvgDescendantStats(node, stats) {
  const tagName = String(node.tagName ?? "").toLowerCase();
  if (SVG_TEXT_TAGS.has(tagName)) {
    stats.textNodes += 1;
    stats.visualNodes += 1;
  } else if (!SVG_CONTAINER_TAGS.has(tagName) && !SVG_NON_RENDERING_TAGS.has(tagName)) {
    stats.visualNodes += 1;
  }
  for (const child of node.children ?? []) {
    collectSvgDescendantStats(child, stats);
  }
}

function imageSourceForNode(node, index) {
  const src = imageSourceCandidates(node)
    .find((candidate) => candidate && !isTransparentPlaceholderSource(candidate)) ||
    imageSourceCandidates(node).find(Boolean) ||
    "";
  const assetSrc = assetSourceFromImageUrl(src);
  const extension = extensionFromSource(assetSrc) ?? extensionFromSource(src) ?? "png";
  return {
    index,
    url: assetSrc,
    extension,
    assetKind: extension === "svg" ? "svg" : "raster",
    missingReason: "missing image source"
  };
}

function imageSourceCandidates(node) {
  const attributes = node.attributes ?? {};
  return [
    attributes.currentSrc,
    attributes.src,
    attributes["data-src"],
    attributes["data-original"],
    attributes["data-lazy-src"],
    firstSrcsetUrl(attributes.srcset),
    firstSrcsetUrl(attributes["data-srcset"])
  ].map((value) => typeof value === "string" ? value.trim() : "");
}

function firstSrcsetUrl(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "";
  }
  const firstCandidate = value.split(",").map((item) => item.trim()).find(Boolean) ?? "";
  return firstCandidate.split(/\s+/)[0] ?? "";
}

function assetSourceFromImageUrl(src) {
  const normalized = String(src || "").trim().replace(/&amp;/g, "&");
  return originalUrlFromNuxtIpxSource(normalized) || normalized;
}

function originalUrlFromNuxtIpxSource(src) {
  const markerIndex = src.indexOf("/_ipx/");
  if (markerIndex < 0) {
    return "";
  }

  const payload = src.slice(markerIndex + "/_ipx/".length);
  const rawProtocolIndex = payload.search(/https?:\/\//i);
  if (rawProtocolIndex >= 0) {
    return payload.slice(rawProtocolIndex);
  }

  const encodedProtocolIndex = payload.search(/https?%3A%2F%2F/i);
  if (encodedProtocolIndex >= 0) {
    return decodeUriComponentSafe(payload.slice(encodedProtocolIndex));
  }

  return "";
}

function decodeUriComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isTransparentPlaceholderSource(src) {
  const normalized = String(src || "").trim();
  if (!normalized.startsWith("data:image/")) {
    return false;
  }
  if (normalized.startsWith("data:image/gif")) {
    return normalized.includes("R0lGODlhAQABA") ||
      normalized.includes("R0lGODlhAQABAI") ||
      normalized.length <= 160;
  }
  if (normalized.startsWith("data:image/png")) {
    return normalized === bytesToDataUrl(TRANSPARENT_PNG, "image/png");
  }
  return false;
}

function cssImageSourceForNode(node) {
  const url = firstCssImageUrl(
    node.styles?.content,
    node.styles?.maskImage,
    node.styles?.webkitMaskImage,
    node.styles?.backgroundImage
  );
  if (!url) {
    return null;
  }
  const extension = extensionFromSource(url) ?? "png";
  return {
    url,
    extension,
    assetKind: extension === "svg" ? "svg" : "raster",
    assetRole: "css-background"
  };
}

function canUseCssImageAsset(node) {
  return node.tagName !== "img" &&
    node.tagName !== "svg" &&
    !node.textContent &&
    Boolean(firstCssImageUrl(
      node.styles?.content,
      node.styles?.maskImage,
      node.styles?.webkitMaskImage,
      node.styles?.backgroundImage
    ));
}

export function firstCssImageUrl(...values) {
  for (const value of values) {
    if (typeof value !== "string" || value.length === 0 || value === "none") {
      continue;
    }
    const match = value.match(/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/i);
    if (match) {
      return (match[1] || match[2] || match[3] || "").trim();
    }
  }
  return null;
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
  if (src.startsWith("data:image/gif")) {
    return "gif";
  }
  if (src.startsWith("data:image/svg+xml")) {
    return "svg";
  }
  const match = src.split("?")[0].match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase();
}

function normalizeAssetExtension(extension) {
  const normalized = String(extension || "png").toLowerCase();
  if (normalized === "jpeg") {
    return "jpg";
  }
  if (normalized === "svg" || RASTER_EXTENSIONS.has(normalized)) {
    return normalized;
  }
  return "png";
}

function assetKindFromContentType(contentType = "") {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("image/svg+xml")) {
    return "svg";
  }
  if (normalized.startsWith("image/")) {
    return "raster";
  }
  return null;
}

function decodeDataUrl(src) {
  const commaIndex = src.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("Invalid data URL");
  }
  const metadata = src.slice(0, commaIndex);
  const payload = src.slice(commaIndex + 1);
  if (!metadata.includes(";base64")) {
    return encodeTextBytes(decodeURIComponent(payload));
  }
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

function encodeJsonBytes(value) {
  return encodeTextBytes(`${JSON.stringify(value, null, 2)}\n`);
}

function encodeTextBytes(value) {
  return new TextEncoder().encode(String(value));
}
