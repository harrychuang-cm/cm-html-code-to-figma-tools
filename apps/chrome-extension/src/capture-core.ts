import { CURRENT_SCHEMA_VERSION } from "@figma-capture/capture-schema";

export const DEFAULT_STYLE_PROPERTIES = [
  "display",
  "position",
  "boxSizing",
  "width",
  "height",
  "backgroundColor",
  "color",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
  "boxShadow",
  "opacity",
  "objectFit",
  "overflow",
  "gap",
  "rowGap",
  "columnGap",
  "alignItems",
  "justifyContent",
  "flexDirection",
  "gridTemplateColumns",
  "gridTemplateRows"
];

export function createManifestFromCapture(capture, options = {}) {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    generatorVersion: options.generatorVersion ?? "0.1.0",
    sourceUrl: capture.sourceUrl,
    captureTimestamp: capture.captureTimestamp,
    viewportWidth: capture.viewport.width,
    viewportHeight: capture.viewport.height,
    devicePixelRatio: capture.viewport.devicePixelRatio,
    scrollX: capture.viewport.scrollX,
    scrollY: capture.viewport.scrollY,
    ...(options.deviceLabel ? { deviceLabel: options.deviceLabel } : {})
  };
}

export function captureElementTree(inputRoot, viewport, options = {}) {
  const timestamp = options.captureTimestamp ?? new Date().toISOString();
  const root = normalizeElement(inputRoot, "dom-1", viewport, true);

  return {
    sourceUrl: options.sourceUrl ?? "about:blank",
    title: options.title ?? "",
    captureTimestamp: timestamp,
    viewport: {
      width: viewport.width,
      height: viewport.height,
      devicePixelRatio: viewport.devicePixelRatio ?? 1,
      scrollX: viewport.scrollX ?? 0,
      scrollY: viewport.scrollY ?? 0
    },
    root
  };
}

export function captureVisibleViewportFromDocument(documentRef = globalThis.document, windowRef = globalThis.window, options = {}) {
  const viewport = {
    width: windowRef.innerWidth,
    height: windowRef.innerHeight,
    devicePixelRatio: windowRef.devicePixelRatio || 1,
    scrollX: windowRef.scrollX || 0,
    scrollY: windowRef.scrollY || 0
  };
  const rootElement = documentRef.body ?? documentRef.documentElement;
  const rawRoot = snapshotDomElement(rootElement, documentRef, windowRef);

  return captureElementTree(rawRoot, viewport, {
    sourceUrl: documentRef.location?.href ?? windowRef.location?.href ?? "about:blank",
    title: documentRef.title ?? "",
    captureTimestamp: options.captureTimestamp,
    deviceLabel: options.deviceLabel
  });
}

export function isRectInViewport(rect, viewport) {
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  return (
    rect.x < viewport.width &&
    rect.x + rect.width > 0 &&
    rect.y < viewport.height &&
    rect.y + rect.height > 0
  );
}

export function normalizeRect(rect) {
  return {
    x: round(rect.x ?? rect.left ?? 0),
    y: round(rect.y ?? rect.top ?? 0),
    width: round(rect.width ?? 0),
    height: round(rect.height ?? 0)
  };
}

function normalizeElement(element, sourceNodeId, viewport, forceInclude = false) {
  const rect = normalizeRect(element.rect ?? {});
  const visible = forceInclude || isRectInViewport(rect, viewport);
  const children = (element.children ?? [])
    .map((child, index) => normalizeElement(child, `${sourceNodeId}.${index + 1}`, viewport, false))
    .filter(Boolean);

  if (!visible && children.length === 0) {
    return null;
  }

  return {
    id: `node-${sourceNodeId.replaceAll(".", "-").replace("dom-", "")}`,
    sourceNodeId: element.sourceNodeId ?? sourceNodeId,
    nodeType: element.nodeType ?? "element",
    tagName: String(element.tagName ?? "div").toLowerCase(),
    textContent: typeof element.textContent === "string" ? element.textContent : "",
    rect,
    styles: { ...(element.styles ?? {}) },
    attributes: { ...(element.attributes ?? {}) },
    ...(element.assetRef ? { assetRef: element.assetRef } : {}),
    ...(element.fallbackRef ? { fallbackRef: element.fallbackRef } : {}),
    children
  };
}

function snapshotDomElement(element, documentRef, windowRef) {
  const computed = windowRef.getComputedStyle(element);
  const rect = normalizeRect(element.getBoundingClientRect());
  const attributes = {};

  for (const attribute of Array.from(element.attributes ?? [])) {
    if (attribute.name.startsWith("data-") || ["id", "class", "role", "aria-label", "alt", "src", "type"].includes(attribute.name)) {
      attributes[attribute.name] = attribute.value;
    }
  }

  return {
    tagName: element.tagName?.toLowerCase() ?? "div",
    nodeType: "element",
    textContent: directTextContent(element),
    rect,
    styles: pickStyles(computed),
    attributes,
    children: Array.from(element.children ?? []).map((child) => snapshotDomElement(child, documentRef, windowRef))
  };
}

function directTextContent(element) {
  return Array.from(element.childNodes ?? [])
    .filter((node) => node.nodeType === 3)
    .map((node) => node.textContent ?? "")
    .join("")
    .trim();
}

function pickStyles(computed) {
  const styles = {};
  for (const property of DEFAULT_STYLE_PROPERTIES) {
    const value = computed[property];
    if (typeof value === "string" && value.length > 0) {
      styles[property] = value;
    }
  }
  return styles;
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}
