import { createAutoLayoutNodeModels } from "./auto-layout.ts";
import {
  createEditableLayoutNodeModels,
  summarizeAutoLayoutModels,
  summarizeSemanticNamingModels
} from "./layout-tree.ts";
import { createSemanticNameMap } from "./semantic-naming.ts";

export const FRAME_ROLES = [
  "Source Screenshot",
  "Editable Accurate"
];

export const FRAME_GAP = 80;

const SOURCE_SCREENSHOT_TILE_PREFIX = "assets/source-screenshot/tile-";

export function createFrameModels(packageData, options = {}) {
  const size = captureFrameSize(packageData.manifest);
  const width = size.width;
  const height = size.height;
  const originX = options.originX ?? 0;
  const title = packageData.capture.title || titleFromUrl(packageData.manifest.sourceUrl);

  return FRAME_ROLES.map((role, index) => ({
    role,
    name: `${title} / ${width}x${height} / ${role}`,
    width,
    height,
    x: originX + index * (width + FRAME_GAP),
    y: 0
  }));
}

export function captureFrameSize(manifest = {}) {
  if (manifest.captureMode === "full-page" && manifest.documentWidth > 0 && manifest.documentHeight > 0) {
    return { width: manifest.documentWidth, height: manifest.documentHeight };
  }
  return { width: manifest.viewportWidth, height: manifest.viewportHeight };
}

export function renderThreeFrames(adapter, packageData, options = {}) {
  const models = createFrameModels(packageData, options);
  const frames = models.map((model) => adapter.createFrame(model));
  const sourceFrame = frames[0];
  const screenshotLayers = createSourceScreenshotLayerModels(packageData)
    .map((model) => adapter.createImageLayer(model));

  for (const screenshotLayer of screenshotLayers) {
    adapter.appendChild(sourceFrame, screenshotLayer);
  }
  const editableResult = renderEditableAccurate(adapter, frames[1], packageData);

  return {
    frames,
    sourceScreenshotLayer: screenshotLayers[0],
    sourceScreenshotLayers: screenshotLayers,
    autoLayoutFrameEnabled: false,
    autoLayoutSummary: editableResult.autoLayoutSummary,
    semanticNamingSummary: editableResult.semanticNamingSummary
  };
}

export async function renderThreeFramesAsync(adapter, packageData, options = {}) {
  const models = createFrameModels(packageData, options);
  const frames = await Promise.all(models.map((model) => maybeAsync(adapter.createFrame(model))));
  const sourceFrame = frames[0];
  const screenshotLayers = [];
  for (const model of createSourceScreenshotLayerModels(packageData)) {
    screenshotLayers.push(await maybeAsync(adapter.createImageLayer(model)));
  }

  for (const screenshotLayer of screenshotLayers) {
    adapter.appendChild(sourceFrame, screenshotLayer);
  }
  const editableResult = await renderEditableAccurateAsync(adapter, frames[1], packageData);

  return {
    frames,
    sourceScreenshotLayer: screenshotLayers[0],
    sourceScreenshotLayers: screenshotLayers,
    autoLayoutFrameEnabled: false,
    autoLayoutSummary: editableResult.autoLayoutSummary,
    semanticNamingSummary: editableResult.semanticNamingSummary,
    fontSubstitutions: adapter.fontSubstitutions ?? []
  };
}

function createSourceScreenshotLayerModels(packageData) {
  const tiled = createSourceScreenshotTileLayerModels(packageData);
  if (tiled.length > 0) {
    return tiled;
  }
  const size = captureFrameSize(packageData.manifest);
  return [{
    name: "Source screenshot",
    bytes: packageData.screenshot,
    x: 0,
    y: 0,
    width: size.width,
    height: size.height,
    locked: true
  }];
}

function createSourceScreenshotTileLayerModels(packageData) {
  const assets = packageData.assets ?? {};
  const size = captureFrameSize(packageData.manifest);
  const dpr = Number(packageData.manifest?.devicePixelRatio ?? 1) || 1;
  const tileEntries = Object.entries(assets)
    .filter(([name]) => name.startsWith(SOURCE_SCREENSHOT_TILE_PREFIX) && name.endsWith(".png"))
    .sort(([a], [b]) => a.localeCompare(b));
  const models = [];
  let y = 0;

  for (let index = 0; index < tileEntries.length; index += 1) {
    const [assetRef, bytes] = tileEntries[index];
    const intrinsic = pngIntrinsicSize(bytes);
    if (!intrinsic || intrinsic.width <= 0 || intrinsic.height <= 0) {
      return [];
    }
    const height = Math.min(size.height - y, round(intrinsic.height / dpr));
    if (height <= 0) {
      break;
    }
    models.push({
      name: `Source screenshot / Tile ${index + 1}`,
      bytes,
      assetRef,
      x: 0,
      y,
      width: size.width,
      height,
      locked: true
    });
    y = round(y + height);
  }

  return y >= size.height - 1 ? models : [];
}

export function renderAutoLayoutExperimental(adapter, frame, packageData) {
  const nodeModels = createAutoLayoutNodeModels(packageData.capture);
  const createdNodes = nodeModels.map((model) => adapter.createAutoLayoutFrame(model));

  for (const node of createdNodes) {
    adapter.appendChild(frame, node);
  }

  return createdNodes;
}

export async function renderAutoLayoutExperimentalAsync(adapter, frame, packageData) {
  const nodeModels = createAutoLayoutNodeModels(packageData.capture);
  const createdNodes = await Promise.all(nodeModels.map((model) => maybeAsync(adapter.createAutoLayoutFrame(model))));

  for (const node of createdNodes) {
    adapter.appendChild(frame, node);
  }

  return createdNodes;
}

export function renderEditableAccurate(adapter, frame, packageData) {
  const nodeModels = createEditableLayoutNodeModels(packageData);
  const createdNodes = nodeModels.map((model) => createLayerTreeForModel(adapter, model));

  for (let index = 0; index < createdNodes.length; index += 1) {
    adapter.appendChild(frame, createdNodes[index], nodeModels[index]);
  }

  return {
    nodes: createdNodes,
    models: nodeModels,
    autoLayoutSummary: summarizeAutoLayoutModels(nodeModels),
    semanticNamingSummary: summarizeSemanticNamingModels(nodeModels)
  };
}

export async function renderEditableAccurateAsync(adapter, frame, packageData) {
  const nodeModels = createEditableLayoutNodeModels(packageData);
  const createdNodes = [];

  for (const model of nodeModels) {
    createdNodes.push(await createLayerTreeForModelAsync(adapter, model));
  }

  for (let index = 0; index < createdNodes.length; index += 1) {
    adapter.appendChild(frame, createdNodes[index], nodeModels[index]);
  }

  return {
    nodes: createdNodes,
    models: nodeModels,
    autoLayoutSummary: summarizeAutoLayoutModels(nodeModels),
    semanticNamingSummary: summarizeSemanticNamingModels(nodeModels)
  };
}

export function createAccurateNodeModels(packageData) {
  const fallbackReasons = new Map(
    packageData.diagnostics.fallbackReasons.map((item) => [item.sourceNodeId, item.reason])
  );
  const semanticNames = createSemanticNameMap(packageData.capture.root, packageData.capture.viewport).names;
  const models = [];

  traverse(packageData.capture.root, (node) => {
    if (!isRenderableNode(node)) {
      return;
    }

    models.push({
      id: node.sourceNodeId,
      type: layerTypeForNode(node),
      name: semanticNames.get(node.sourceNodeId) ?? layerNameForNode(node),
      sourceNodeId: node.sourceNodeId,
      cssZIndex: numericZIndex(node.styles?.zIndex) !== null ? String(node.styles.zIndex).trim() : undefined,
      rect: node.rect,
      text: node.textContent,
      assetRef: node.assetRef ?? node.fallbackRef ?? null,
      assetKind: assetKindForNode(node),
      fallbackReason: node.fallbackRef ? fallbackReasons.get(node.sourceNodeId) ?? "raster fallback" : null,
      style: extractVisualStyle(node)
    });
  });

  return models;
}

function createLayerForModel(adapter, model) {
  if (model.type === "FRAME") {
    return adapter.createFrameLayer(model);
  }
  if (model.type === "TEXT") {
    return adapter.createTextLayer(model);
  }
  if (model.type === "IMAGE" || model.type === "FALLBACK_IMAGE") {
    return adapter.createImageLayer({
      ...model,
      width: model.rect.width,
      height: model.rect.height,
      locked: false
    });
  }
  return adapter.createRectLayer(model);
}

function createLayerTreeForModel(adapter, model) {
  const node = createLayerForModel(adapter, model);
  for (const childModel of model.children ?? []) {
    adapter.appendChild(node, createLayerTreeForModel(adapter, childModel), childModel);
  }
  return node;
}

async function createLayerTreeForModelAsync(adapter, model) {
  const node = await maybeAsync(createLayerForModel(adapter, model));
  for (const childModel of model.children ?? []) {
    adapter.appendChild(node, await createLayerTreeForModelAsync(adapter, childModel), childModel);
  }
  return node;
}

function maybeAsync(value) {
  return value && typeof value.then === "function" ? value : Promise.resolve(value);
}

function pngIntrinsicSize(bytes) {
  const imageBytes = toUint8Array(bytes);
  if (
    imageBytes.length < 24 ||
    imageBytes[0] !== 0x89 ||
    imageBytes[1] !== 0x50 ||
    imageBytes[2] !== 0x4e ||
    imageBytes[3] !== 0x47 ||
    String.fromCharCode(imageBytes[12], imageBytes[13], imageBytes[14], imageBytes[15]) !== "IHDR"
  ) {
    return null;
  }
  return {
    width: readUint32BigEndian(imageBytes, 16),
    height: readUint32BigEndian(imageBytes, 20)
  };
}

function readUint32BigEndian(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3];
}

function toUint8Array(bytes) {
  if (bytes instanceof Uint8Array) {
    return bytes;
  }
  if (bytes instanceof ArrayBuffer) {
    return new Uint8Array(bytes);
  }
  if (Array.isArray(bytes)) {
    return Uint8Array.from(bytes);
  }
  return new Uint8Array(bytes ?? []);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

export function createMemoryFigmaAdapter() {
  const createdFrames = [];
  const createdImageLayers = [];

  return {
    createdFrames,
    createdImageLayers,
    createFrame(model) {
      const frame = {
        type: "FRAME",
        name: model.name,
        role: model.role,
        x: model.x,
        y: model.y,
        width: model.width,
        height: model.height,
        children: []
      };
      createdFrames.push(frame);
      return frame;
    },
    createImageLayer(model) {
      const layer = {
        type: "IMAGE",
        name: model.name,
        sourceNodeId: model.sourceNodeId,
        cssZIndex: model.cssZIndex,
        rect: model.rect,
        assetRef: model.assetRef,
        assetKind: model.assetKind,
        fallbackReason: model.fallbackReason,
        x: model.x,
        y: model.y,
        width: model.width,
        height: model.height,
        locked: model.locked,
        bytes: model.bytes
      };
      createdImageLayers.push(layer);
      return layer;
    },
    createTextLayer(model) {
      return {
        type: "TEXT",
        name: model.name,
        sourceNodeId: model.sourceNodeId,
        cssZIndex: model.cssZIndex,
        rect: model.rect,
        characters: model.text,
        textAutoResize: model.textAutoResize,
        layoutPositioning: model.layoutPositioning,
        style: model.style
      };
    },
    createRectLayer(model) {
      return {
        type: "RECTANGLE",
        name: model.name,
        sourceNodeId: model.sourceNodeId,
        cssZIndex: model.cssZIndex,
        rect: model.rect,
        layoutPositioning: model.layoutPositioning,
        style: model.style
      };
    },
    createFrameLayer(model) {
      const frame = {
        type: "FRAME",
        name: model.name,
        sourceNodeId: model.sourceNodeId,
        cssZIndex: model.cssZIndex,
        rect: model.rect,
        layoutPositioning: model.layoutPositioning,
        style: model.style,
        layoutMode: model.autoLayout?.applied ? model.autoLayout.layoutMode : "NONE",
        itemSpacing: model.autoLayout?.applied ? model.autoLayout.itemSpacing : 0,
        primaryAxisAlignItems: model.autoLayout?.applied ? model.autoLayout.primaryAxisAlignItems : undefined,
        counterAxisAlignItems: model.autoLayout?.applied ? model.autoLayout.counterAxisAlignItems : undefined,
        paddingLeft: model.autoLayout?.applied ? model.autoLayout.paddingLeft : 0,
        paddingRight: model.autoLayout?.applied ? model.autoLayout.paddingRight : 0,
        paddingTop: model.autoLayout?.applied ? model.autoLayout.paddingTop : 0,
        paddingBottom: model.autoLayout?.applied ? model.autoLayout.paddingBottom : 0,
        skippedReason: model.autoLayout?.skippedReason,
        children: []
      };
      createdFrames.push(frame);
      return frame;
    },
    createAutoLayoutFrame(model) {
      return {
        type: "FRAME",
        name: model.name,
        sourceNodeId: model.sourceNodeId,
        rect: model.rect,
        layoutMode: model.layoutMode,
        confidence: model.confidence,
        pattern: model.pattern,
        children: []
      };
    },
    appendChild(parent, child, model = {}) {
      if (model.layoutPositioning) {
        child.layoutPositioning = model.layoutPositioning;
      }
      parent.children.push(child);
    }
  };
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

function isRenderableNode(node) {
  return Boolean(
    node.textContent ||
    node.assetRef ||
    node.fallbackRef ||
    hasVisualBoxStyle(node.styles)
  );
}

function traverse(node, visit) {
  visit(node);
  for (const child of node.children ?? []) {
    traverse(child, visit);
  }
}

function hasVisualBoxStyle(styles = {}) {
  return Boolean(
    visibleColor(styles.backgroundColor) ||
    cssStrokesFromStyles(styles).length > 0 ||
    borderDecorationSides(styles).length > 0 ||
    visibleShadow(styles.boxShadow) ||
    parseCssNumber(styles.borderTopLeftRadius) > 0 ||
    parseCssNumber(styles.borderTopRightRadius) > 0 ||
    parseCssNumber(styles.borderBottomRightRadius) > 0 ||
    parseCssNumber(styles.borderBottomLeftRadius) > 0
  );
}

function layerTypeForNode(node) {
  if (node.fallbackRef) {
    return "FALLBACK_IMAGE";
  }
  if (node.assetRef || node.tagName === "img") {
    return "IMAGE";
  }
  if (node.textContent) {
    return "TEXT";
  }
  return "RECTANGLE";
}

function layerNameForNode(node) {
  if (node.textContent) {
    return `Text / ${node.textContent.slice(0, 32)}`;
  }
  if (node.fallbackRef) {
    return `Fallback / ${node.tagName}`;
  }
  if (node.assetRef || node.tagName === "img") {
    return assetKindForNode(node) === "svg"
      ? `Vector / ${node.attributes.alt || node.tagName}`
      : `Image / ${node.attributes.alt || node.tagName}`;
  }
  return `Shape / ${node.tagName}`;
}

function assetKindForNode(node) {
  if (node.attributes?.assetKind) {
    return node.attributes.assetKind;
  }
  const ref = node.assetRef ?? node.fallbackRef ?? "";
  if (typeof ref === "string" && ref.toLowerCase().endsWith(".svg")) {
    return "svg";
  }
  return "raster";
}

function numericZIndex(value) {
  const normalized = String(value ?? "").trim();
  if (!/^-?\d+$/.test(normalized)) {
    return null;
  }
  return Number(normalized);
}

function extractVisualStyle(node) {
  const styles = node.styles ?? {};
  return {
    fills: visibleColor(styles.backgroundColor) ? [styles.backgroundColor] : [],
    strokes: cssStrokesFromStyles(styles),
    cornerRadius: Math.max(
      parseCssNumber(styles.borderTopLeftRadius),
      parseCssNumber(styles.borderTopRightRadius),
      parseCssNumber(styles.borderBottomRightRadius),
      parseCssNumber(styles.borderBottomLeftRadius)
    ),
    effects: visibleShadow(styles.boxShadow) ? [{ type: "shadow", value: styles.boxShadow }] : [],
    objectFit: styles.objectFit ?? "",
    transform: styles.transform ?? "",
    transformOrigin: styles.transformOrigin ?? "",
    text: node.textContent ? {
      fontFamily: styles.fontFamily ?? "",
      fontSize: parseCssNumber(styles.fontSize),
      fontStyle: styles.fontStyle ?? "",
      fontWeight: styles.fontWeight ?? "",
      lineHeight: styles.lineHeight ?? "",
      color: styles.color ?? ""
    } : null
  };
}

function visibleColor(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value !== "transparent" &&
    value !== "rgba(0, 0, 0, 0)";
}

function cssStrokesFromStyles(styles = {}) {
  const sides = visibleBorderSides(styles);
  const borderStroke = uniformBorderStrokeFromSides(sides) ?? legacyTopBorderStroke(styles, sides);
  if (borderStroke) {
    return [borderStroke];
  }
  const outlineStroke = cssStrokeSide(styles.outlineWidth, styles.outlineColor, styles.outlineStyle);
  return outlineStroke ? [outlineStroke] : [];
}

function borderDecorationSides(styles = {}) {
  const sides = visibleBorderSides(styles);
  return uniformBorderStrokeFromSides(sides) || legacyTopBorderStroke(styles, sides) ? [] : sides;
}

function uniformBorderStroke(styles = {}) {
  return uniformBorderStrokeFromSides(visibleBorderSides(styles));
}

function uniformBorderStrokeFromSides(sides) {
  if (sides.length !== 4) {
    return null;
  }
  const [first] = sides;
  return sides.every((side) => side.width === first.width && side.color === first.color)
    ? { color: first.color, width: first.width }
    : null;
}

function visibleBorderSides(styles = {}) {
  return [
    { side: "top", ...cssStrokeSide(styles.borderTopWidth, styles.borderTopColor, styles.borderTopStyle) },
    { side: "right", ...cssStrokeSide(styles.borderRightWidth, styles.borderRightColor, styles.borderRightStyle) },
    { side: "bottom", ...cssStrokeSide(styles.borderBottomWidth, styles.borderBottomColor, styles.borderBottomStyle) },
    { side: "left", ...cssStrokeSide(styles.borderLeftWidth, styles.borderLeftColor, styles.borderLeftStyle) }
  ].filter((side) => side.width > 0);
}

function legacyTopBorderStroke(styles = {}, sides = visibleBorderSides(styles)) {
  if (sides.length !== 1 || sides[0].side !== "top") {
    return null;
  }
  const hasExplicitNonTopBorder = [
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderRightStyle",
    "borderBottomStyle",
    "borderLeftStyle",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor"
  ].some((property) => styles[property] !== undefined && styles[property] !== "");
  return hasExplicitNonTopBorder ? null : {
    color: sides[0].color,
    width: sides[0].width
  };
}

function cssStrokeSide(width, color, style) {
  const normalizedStyle = typeof style === "string" ? style.trim().toLowerCase() : "";
  const parsedWidth = parseCssNumber(width);
  if (parsedWidth <= 0 || !visibleColor(color) || normalizedStyle === "none" || normalizedStyle === "hidden") {
    return null;
  }
  return {
    color,
    width: parsedWidth
  };
}

function visibleShadow(value) {
  return typeof value === "string" && value.length > 0 && value !== "none";
}

function parseCssNumber(value) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value !== "string") {
    return 0;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
