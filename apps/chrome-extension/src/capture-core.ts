import { CURRENT_SCHEMA_VERSION } from "@figma-capture/capture-schema";

export const DEFAULT_STYLE_PROPERTIES = [
  "display",
  "position",
  "boxSizing",
  "width",
  "height",
  "backgroundColor",
  "backgroundImage",
  "color",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "whiteSpace",
  "letterSpacing",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
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
  "maskImage",
  "webkitMaskImage",
  "overflow",
  "gap",
  "rowGap",
  "columnGap",
  "alignItems",
  "justifyContent",
  "flexDirection",
  "gridTemplateColumns",
  "gridTemplateRows",
  "visibility",
  "content",
  "top",
  "right",
  "bottom",
  "left"
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
  const root = normalizeElement(inputRoot, "dom-1", viewport, true, {
    clipToViewport: options.clipToViewport !== false
  });

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

export function clampRectToViewport(rect, viewport) {
  const normalized = normalizeRect(rect);
  const left = Math.max(0, normalized.x);
  const top = Math.max(0, normalized.y);
  const right = Math.min(Number(viewport.width ?? 0), normalized.x + normalized.width);
  const bottom = Math.min(Number(viewport.height ?? 0), normalized.y + normalized.height);

  return {
    x: round(left),
    y: round(top),
    width: round(Math.max(0, right - left)),
    height: round(Math.max(0, bottom - top))
  };
}

function normalizeElement(element, sourceNodeId, viewport, forceInclude = false, options = {}) {
  const rawRect = normalizeRect(element.rect ?? {});
  const visible = forceInclude || isRectInViewport(rawRect, viewport);
  const rect = options.clipToViewport && visible
    ? clampRectToViewport(rawRect, viewport)
    : rawRect;
  const children = (element.children ?? [])
    .map((child, index) => normalizeElement(child, `${sourceNodeId}.${index + 1}`, viewport, false, options))
    .filter(Boolean);

  if (!visible && children.length === 0) {
    return null;
  }

  const styles = { ...(element.styles ?? {}) };

  return {
    id: `node-${sourceNodeId.replaceAll(".", "-").replace("dom-", "")}`,
    sourceNodeId: element.sourceNodeId ?? sourceNodeId,
    nodeType: element.nodeType ?? "element",
    tagName: String(element.tagName ?? "div").toLowerCase(),
    textContent: typeof element.textContent === "string"
      ? normalizeDirectTextContent(element.textContent, styles.whiteSpace)
      : "",
    rect,
    styles,
    attributes: { ...(element.attributes ?? {}) },
    ...(element.assetRef ? { assetRef: element.assetRef } : {}),
    ...(element.fallbackRef ? { fallbackRef: element.fallbackRef } : {}),
    children
  };
}

function snapshotDomElement(element, documentRef, windowRef, containingBlockRect = null) {
  const computed = windowRef.getComputedStyle(element);
  const rect = normalizeRect(element.getBoundingClientRect());
  const attributes = {};
  const tagName = element.tagName?.toLowerCase() ?? "div";

  for (const attribute of Array.from(element.attributes ?? [])) {
    if (attribute.name.startsWith("data-") || ["id", "class", "role", "aria-label", "alt", "src", "srcset", "type", "href", "xlink:href"].includes(attribute.name)) {
      attributes[attribute.name] = attribute.value;
    }
  }
  if (tagName === "img" && element.currentSrc) {
    attributes.currentSrc = element.currentSrc;
  }
  if (tagName === "svg" && element.outerHTML) {
    attributes.svgMarkup = element.outerHTML;
  }
  if (tagName === "canvas") {
    const canvasDataUrl = serializeCanvasDataUrl(element);
    if (canvasDataUrl) {
      attributes.canvasDataUrl = canvasDataUrl;
    }
  }

  const styles = pickStyles(computed);
  const nextContainingBlockRect = establishesContainingBlock(styles)
    ? rect
    : containingBlockRect;

  return {
    tagName,
    nodeType: "element",
    textContent: directTextContent(element, styles.whiteSpace),
    rect,
    styles,
    attributes,
    children: [
      ...Array.from(element.children ?? []).map((child) => snapshotDomElement(child, documentRef, windowRef, nextContainingBlockRect)),
      ...snapshotPseudoElements(element, rect, nextContainingBlockRect, windowRef)
    ]
  };
}

function snapshotPseudoElements(element, ownerRect, containingBlockRect, windowRef) {
  return ["::before", "::after"]
    .map((pseudoName) => snapshotPseudoElement(element, pseudoName, ownerRect, containingBlockRect, windowRef))
    .filter(Boolean);
}

function snapshotPseudoElement(element, pseudoName, ownerRect, containingBlockRect, windowRef) {
  const computed = safePseudoComputedStyle(element, pseudoName, windowRef);
  if (!computed) {
    return null;
  }
  const styles = pickStyles(computed);
  if (!isVisiblePseudoElement(styles)) {
    return null;
  }
  const rect = inferPseudoRect(ownerRect, containingBlockRect, styles);
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  return {
    tagName: pseudoName,
    nodeType: "pseudo",
    textContent: "",
    rect,
    styles,
    attributes: { "data-pseudo": pseudoName },
    children: []
  };
}

function safePseudoComputedStyle(element, pseudoName, windowRef) {
  try {
    return windowRef.getComputedStyle(element, pseudoName);
  } catch {
    return null;
  }
}

function isVisiblePseudoElement(styles) {
  const content = String(styles.content ?? "").trim();
  if (
    styles.display === "none" ||
    styles.visibility === "hidden" ||
    styles.opacity === "0" ||
    content === "" ||
    content === "none" ||
    content === "normal"
  ) {
    return false;
  }

  return visibleColor(styles.backgroundColor) ||
    visibleBorder(styles) ||
    visibleShadow(styles.boxShadow);
}

function inferPseudoRect(ownerRect, containingBlockRect, styles) {
  const position = cssKeyword(styles.position);
  const parent = normalizeRect(position === "absolute" || position === "fixed"
    ? (containingBlockRect ?? ownerRect)
    : ownerRect);
  const hasLeft = hasCssNumber(styles.left);
  const hasRight = hasCssNumber(styles.right);
  const hasTop = hasCssNumber(styles.top);
  const hasBottom = hasCssNumber(styles.bottom);
  const left = parseCssNumber(styles.left);
  const right = parseCssNumber(styles.right);
  const top = parseCssNumber(styles.top);
  const bottom = parseCssNumber(styles.bottom);
  let width = parseCssNumber(styles.width);
  let height = parseCssNumber(styles.height);

  if (width <= 0 && hasLeft && hasRight) {
    width = Math.max(0, parent.width - left - right);
  }
  if (height <= 0 && hasTop && hasBottom) {
    height = Math.max(0, parent.height - top - bottom);
  }

  const x = hasLeft
    ? parent.x + left
    : hasRight
      ? parent.x + parent.width - right - width
      : parent.x;
  const y = hasTop
    ? parent.y + top
    : hasBottom
      ? parent.y + parent.height - bottom - height
      : parent.y;

  return {
    x: round(x),
    y: round(y),
    width: round(width),
    height: round(height)
  };
}

function establishesContainingBlock(styles) {
  const position = cssKeyword(styles.position);
  return position.length > 0 && position !== "static";
}

function cssKeyword(value) {
  return String(value ?? "").trim().toLowerCase();
}

function serializeCanvasDataUrl(element) {
  if (typeof element.toDataURL !== "function") {
    return "";
  }
  try {
    const dataUrl = element.toDataURL("image/png");
    return typeof dataUrl === "string" && dataUrl.startsWith("data:image/png")
      ? dataUrl
      : "";
  } catch {
    return "";
  }
}

function directTextContent(element, whiteSpace) {
  const text = Array.from(element.childNodes ?? [])
    .filter((node) => node.nodeType === 3)
    .map((node) => node.textContent ?? "")
    .join("");
  return normalizeDirectTextContent(text, whiteSpace);
}

function normalizeDirectTextContent(text, whiteSpace) {
  const mode = String(whiteSpace || "normal").trim().toLowerCase();
  if (mode === "pre" || mode === "pre-wrap" || mode === "break-spaces") {
    return String(text ?? "");
  }
  if (mode === "pre-line") {
    const lines = String(text ?? "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[ \t\f\r]+/g, " ").trim());
    while (lines.length > 0 && lines[0] === "") {
      lines.shift();
    }
    while (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    return lines.join("\n");
  }
  return String(text ?? "").replace(/[ \t\n\f\r]+/g, " ").trim();
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

function hasCssNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value !== "string") {
    return false;
  }
  return Number.isFinite(Number.parseFloat(value));
}

function parseCssNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value !== "string") {
    return 0;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function visibleColor(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value !== "transparent" &&
    value !== "rgba(0, 0, 0, 0)";
}

function visibleBorder(styles) {
  return parseCssNumber(styles.borderTopWidth) > 0 && visibleColor(styles.borderTopColor) ||
    parseCssNumber(styles.borderRightWidth) > 0 && visibleColor(styles.borderRightColor) ||
    parseCssNumber(styles.borderBottomWidth) > 0 && visibleColor(styles.borderBottomColor) ||
    parseCssNumber(styles.borderLeftWidth) > 0 && visibleColor(styles.borderLeftColor);
}

function visibleShadow(value) {
  return typeof value === "string" && value.length > 0 && value !== "none";
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}
