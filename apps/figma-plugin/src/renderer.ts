import { createAutoLayoutNodeModels } from "./auto-layout.ts";

export const FRAME_ROLES = [
  "Source Screenshot",
  "Editable Accurate",
  "Auto Layout Experimental"
];

export function createFrameModels(packageData) {
  const width = packageData.manifest.viewportWidth;
  const height = packageData.manifest.viewportHeight;
  const title = packageData.capture.title || titleFromUrl(packageData.manifest.sourceUrl);

  return FRAME_ROLES.map((role, index) => ({
    role,
    name: `${title} / ${width}x${height} / ${role}`,
    width,
    height,
    x: index * (width + 80),
    y: 0
  }));
}

export function renderThreeFrames(adapter, packageData) {
  const models = createFrameModels(packageData);
  const frames = models.map((model) => adapter.createFrame(model));
  const sourceFrame = frames[0];
  const screenshotLayer = adapter.createImageLayer({
    name: "Source screenshot",
    bytes: packageData.screenshot,
    width: packageData.manifest.viewportWidth,
    height: packageData.manifest.viewportHeight,
    locked: true
  });

  adapter.appendChild(sourceFrame, screenshotLayer);
  renderEditableAccurate(adapter, frames[1], packageData);
  renderAutoLayoutExperimental(adapter, frames[2], packageData);

  return {
    frames,
    sourceScreenshotLayer: screenshotLayer
  };
}

export function renderAutoLayoutExperimental(adapter, frame, packageData) {
  const nodeModels = createAutoLayoutNodeModels(packageData.capture);
  const createdNodes = nodeModels.map((model) => adapter.createAutoLayoutFrame(model));

  for (const node of createdNodes) {
    adapter.appendChild(frame, node);
  }

  return createdNodes;
}

export function renderEditableAccurate(adapter, frame, packageData) {
  const nodeModels = createAccurateNodeModels(packageData);
  const createdNodes = nodeModels.map((model) => createLayerForModel(adapter, model));

  for (const node of createdNodes) {
    adapter.appendChild(frame, node);
  }

  return createdNodes;
}

export function createAccurateNodeModels(packageData) {
  const fallbackReasons = new Map(
    packageData.diagnostics.fallbackReasons.map((item) => [item.sourceNodeId, item.reason])
  );
  const models = [];

  traverse(packageData.capture.root, (node) => {
    if (!isRenderableNode(node)) {
      return;
    }

    models.push({
      id: node.sourceNodeId,
      type: layerTypeForNode(node),
      name: layerNameForNode(node),
      sourceNodeId: node.sourceNodeId,
      rect: node.rect,
      text: node.textContent,
      assetRef: node.assetRef ?? node.fallbackRef ?? null,
      fallbackReason: node.fallbackRef ? fallbackReasons.get(node.sourceNodeId) ?? "raster fallback" : null,
      style: extractVisualStyle(node)
    });
  });

  return models;
}

function createLayerForModel(adapter, model) {
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
        rect: model.rect,
        assetRef: model.assetRef,
        fallbackReason: model.fallbackReason,
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
        rect: model.rect,
        characters: model.text,
        style: model.style
      };
    },
    createRectLayer(model) {
      return {
        type: "RECTANGLE",
        name: model.name,
        sourceNodeId: model.sourceNodeId,
        rect: model.rect,
        style: model.style
      };
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
    appendChild(parent, child) {
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
    visibleBorder(styles) ||
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
    return `Image / ${node.attributes.alt || node.tagName}`;
  }
  return `Shape / ${node.tagName}`;
}

function extractVisualStyle(node) {
  const styles = node.styles ?? {};
  return {
    fills: visibleColor(styles.backgroundColor) ? [styles.backgroundColor] : [],
    strokes: visibleBorder(styles) ? [{
      color: styles.borderTopColor,
      width: parseCssNumber(styles.borderTopWidth)
    }] : [],
    cornerRadius: Math.max(
      parseCssNumber(styles.borderTopLeftRadius),
      parseCssNumber(styles.borderTopRightRadius),
      parseCssNumber(styles.borderBottomRightRadius),
      parseCssNumber(styles.borderBottomLeftRadius)
    ),
    effects: visibleShadow(styles.boxShadow) ? [{ type: "shadow", value: styles.boxShadow }] : [],
    text: node.textContent ? {
      fontFamily: styles.fontFamily ?? "",
      fontSize: parseCssNumber(styles.fontSize),
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

function visibleBorder(styles) {
  return parseCssNumber(styles.borderTopWidth) > 0 && visibleColor(styles.borderTopColor);
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
