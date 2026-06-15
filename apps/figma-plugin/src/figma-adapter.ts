export const DEFAULT_FALLBACK_FONT = { family: "Inter", style: "Regular" };

const LINEAR_GRADIENT_TO_RIGHT_TRANSFORM = [
  [1, 0, 0],
  [0, 1, 0]
];
const LINEAR_GRADIENT_TO_BOTTOM_TRANSFORM = [
  [0, 1, 0],
  [-1, 0, 1]
];

export function createFigmaApiAdapter(figmaApi = globalThis.figma, options = {}) {
  const assets = options.assets ?? {};
  const fallbackFont = options.fallbackFont ?? DEFAULT_FALLBACK_FONT;
  const screenshotBytes = options.screenshot ? toUint8Array(options.screenshot) : null;
  const viewport = options.viewport ?? {};
  const fontSubstitutions = [];
  let screenshotImageHash = null;

  function getScreenshotImageHash() {
    if (!screenshotBytes || screenshotBytes.length === 0) {
      return null;
    }
    if (!screenshotImageHash) {
      screenshotImageHash = figmaApi.createImage(screenshotBytes).hash;
    }
    return screenshotImageHash;
  }

  return {
    fontSubstitutions,

    createFrame(model) {
      const frame = figmaApi.createFrame();
      applyNodeBasics(frame, model);
      frame.name = model.name;
      frame.clipsContent = true;
      frame.fills = [];
      return frame;
    },

    createImageLayer(model) {
      const bytes = model.bytes ?? assets[model.assetRef] ?? new Uint8Array();
      const imageBytes = toUint8Array(bytes);
      let fallbackReason = model.fallbackReason;
      if (isSvgAsset(model, imageBytes) && typeof figmaApi.createNodeFromSvg === "function") {
        try {
          return createSvgImageLayer(figmaApi, model, imageBytes);
        } catch (error) {
          fallbackReason = model.fallbackReason ?? "svg import failed";
          const node = createImagePlaceholderNode(figmaApi, model);
          writeNodeMetadata(node, "assetRef", model.assetRef);
          writeNodeMetadata(node, "fallbackReason", fallbackReason);
          writeNodeMetadata(node, "imageImportError", error instanceof Error ? error.message : String(error));
          return node;
        }
      }

      const node = figmaApi.createRectangle();
      applyNodeBasics(node, model);
      node.name = model.name;
      node.locked = Boolean(model.locked);
      writeNodeMetadata(node, "assetRef", model.assetRef);
      let canUseScreenshotCropFallback = false;
      if (isSupportedRasterImage(imageBytes)) {
        const aspectMismatchFallbackReason = screenshotCropReasonForMismatchedRaster(model, imageBytes);
        if (aspectMismatchFallbackReason) {
          const screenshotFallback = createScreenshotCropFallbackLayer(figmaApi, model, {
            fallbackReason: aspectMismatchFallbackReason,
            screenshotBytes,
            viewport,
            getScreenshotImageHash
          });
          if (screenshotFallback) {
            return screenshotFallback;
          }
        }
        try {
          const imageHash = figmaApi.createImage(imageBytes).hash;
          node.fills = [{
            type: "IMAGE",
            scaleMode: "FILL",
            imageHash
          }];
          writeNodeMetadata(node, "fallbackReason", fallbackReason);
          writeNodeMetadata(node, "imageHash", imageHash);
          return node;
        } catch (error) {
          canUseScreenshotCropFallback = true;
          fallbackReason = model.fallbackReason ?? "image decode failed";
          writeNodeMetadata(node, "imageImportError", error instanceof Error ? error.message : String(error));
        }
      } else {
        fallbackReason = model.fallbackReason ?? (imageBytes.length > 0 ? "external or unsupported image asset" : "missing image asset");
        canUseScreenshotCropFallback = true;
      }
      if (canUseScreenshotCropFallback) {
        const screenshotFallback = createScreenshotCropFallbackLayer(figmaApi, model, {
          fallbackReason,
          screenshotBytes,
          viewport,
          getScreenshotImageHash
        });
        if (screenshotFallback) {
          return screenshotFallback;
        }
      }
      node.name = `${model.name} / Placeholder`;
      applyImagePlaceholderStyle(node);
      writeNodeMetadata(node, "fallbackReason", fallbackReason);
      return node;
    },

    async createTextLayer(model) {
      const node = figmaApi.createText();
      applyNodeBasics(node, model);
      node.name = model.name;

      const requestedFonts = fontNamesFromStyle(model.style?.text, fallbackFont, model.text);
      const loadedFont = await loadFontWithFallback(figmaApi, requestedFonts, fallbackFont);
      if (loadedFont.substituted) {
        fontSubstitutions.push({
          sourceNodeId: model.sourceNodeId,
          requested: loadedFont.requested,
          requestedStack: loadedFont.requestedStack,
          attempted: loadedFont.attempted,
          used: loadedFont.fontName
        });
      }

      node.fontName = loadedFont.fontName;
      node.characters = model.text ?? "";
      const fontSize = model.style?.text?.fontSize;
      if (fontSize > 0) {
        node.fontSize = fontSize;
      }
      const lineHeight = parseCssNumber(model.style?.text?.lineHeight);
      if (lineHeight > 0) {
        try {
          node.lineHeight = {
            unit: "PIXELS",
            value: lineHeight
          };
        } catch {
          // Line-height is a fidelity improvement, not a hard import dependency.
        }
      }
      const colorPaint = cssColorToPaint(model.style?.text?.color);
      const textFills = (model.style?.text?.fills ?? [])
        .map(cssFillToPaint)
        .filter(Boolean);
      if (textFills.length > 0) {
        node.fills = textFills;
      } else if (colorPaint) {
        node.fills = [colorPaint];
      }
      applyTextAlignment(node, model.style?.text?.textAlign);
      applyTextResizeAndLayoutSizing(node, model);
      return node;
    },

    createRectLayer(model) {
      const node = figmaApi.createRectangle();
      applyNodeBasics(node, model);
      node.name = model.name;
      applyVisualStyle(node, model.style);
      return node;
    },

    createFrameLayer(model) {
      const frame = figmaApi.createFrame();
      applyNodeBasics(frame, model);
      frame.name = model.name;
      frame.clipsContent = Boolean(model.clipsContent);
      applyVisualStyle(frame, model.style);
      applyAutoLayout(frame, model.autoLayout);
      return frame;
    },

    createAutoLayoutFrame(model) {
      const frame = figmaApi.createFrame();
      applyNodeBasics(frame, model);
      frame.name = model.name;
      applyAutoLayout(frame, {
        applied: true,
        layoutMode: model.layoutMode,
        itemSpacing: 0,
        paddingLeft: 0,
        paddingRight: 0,
        paddingTop: 0,
        paddingBottom: 0
      });
      frame.fills = [];
      writeNodeMetadata(frame, "confidence", model.confidence);
      writeNodeMetadata(frame, "pattern", model.pattern);
      return frame;
    },

    appendChild(parent, child, model) {
      parent.appendChild(child);
      applyPostAppendChildLayout(child, model);
    }
  };
}

export function createMockFigmaApi(options = {}) {
  const createdNodes = [];
  const loadedFonts = [];
  const unavailableFamilies = new Set(options.unavailableFamilies ?? []);
  const unavailableFonts = new Set(
    (options.unavailableFonts ?? []).map((fontName) => fontKey(fontName))
  );

  return {
    createdNodes,
    loadedFonts,
    root: { children: [] },
    async loadFontAsync(fontName) {
      loadedFonts.push(fontName);
      if (unavailableFamilies.has(fontName.family) || unavailableFonts.has(fontKey(fontName))) {
        throw new Error(`Missing font ${fontLabel(fontName)}`);
      }
    },
    createFrame() {
      return createMockNode("FRAME", createdNodes);
    },
    createRectangle() {
      return createMockNode("RECTANGLE", createdNodes);
    },
    createText() {
      return createMockNode("TEXT", createdNodes);
    },
    createImage(bytes) {
      return {
        hash: `hash-${toUint8Array(bytes).length}`
      };
    },
    createNodeFromSvg(svg) {
      const node = createMockNode("VECTOR", createdNodes);
      node.svg = svg;
      return node;
    }
  };

}

export async function loadFontWithFallback(figmaApi, requestedFonts, fallbackFont = DEFAULT_FALLBACK_FONT) {
  const requestedStack = normalizeFontCandidates(requestedFonts, fallbackFont);
  const candidates = dedupeFontNames([...requestedStack, fallbackFont]);
  const attempted = [];

  for (const fontName of candidates) {
    attempted.push(fontName);
    try {
      await figmaApi.loadFontAsync(fontName);
      return {
        fontName,
        requested: requestedStack[0] ?? fallbackFont,
        requestedStack,
        attempted: [...attempted],
        substituted: !sameFontName(fontName, requestedStack[0] ?? fallbackFont)
      };
    } catch {
      // Try the next CSS font-family candidate before falling back to Inter.
    }
  }

  await figmaApi.loadFontAsync(fallbackFont);
  return {
    fontName: fallbackFont,
    requested: requestedStack[0] ?? fallbackFont,
    requestedStack,
    attempted: [...attempted, fallbackFont],
    substituted: !sameFontName(fallbackFont, requestedStack[0] ?? fallbackFont)
  };
}

export function fontNameFromStyle(textStyle = {}) {
  return fontNamesFromStyle(textStyle)[0];
}

export function fontNamesFromStyle(textStyle = {}, fallbackFont = DEFAULT_FALLBACK_FONT, textContent = "") {
  const requestedStyles = fontStyleCandidatesFromCss(textStyle.fontWeight, textStyle.fontStyle);
  const families = preferFontFamiliesForText(
    parseFontFamilyStack(textStyle.fontFamily)
      .filter((family) => !isGenericFontFamily(family)),
    textContent
  );
  const candidates = [];

  for (const style of requestedStyles) {
    for (const family of families) {
      candidates.push({ family, style });
    }
  }

  return normalizeFontCandidates(candidates, fallbackFont);
}

export function cssColorToPaint(value) {
  const color = parseCssColor(value);
  if (!color) {
    return null;
  }
  return {
    type: "SOLID",
    color: {
      r: color.r / 255,
      g: color.g / 255,
      b: color.b / 255
    },
    opacity: color.a
  };
}

function cssFillToPaint(value) {
  return cssLinearGradientToPaint(value) ?? cssColorToPaint(value);
}

function cssLinearGradientToPaint(value) {
  const args = extractCssFunctionArgs(value, ["linear-gradient", "repeating-linear-gradient"]);
  if (!args) {
    return null;
  }
  const parts = splitCssArguments(args);
  if (parts.length < 2) {
    return null;
  }

  let stops = parts;
  let direction = "to bottom";
  const first = parts[0].trim().toLowerCase();
  if (isCssGradientDirection(first)) {
    stops = parts.slice(1);
    direction = normalizeCssGradientDirection(first);
  }
  if (stops.length < 2) {
    return null;
  }

  const parsedStops = stops
    .map((stop, index) => cssGradientStop(stop, index, stops.length))
    .filter(Boolean);
  if (parsedStops.length < 2) {
    return null;
  }

  const gradientStops = shouldReverseCssGradientStops(direction)
    ? parsedStops
      .map((stop) => ({ ...stop, position: round(1 - stop.position) }))
      .sort((a, b) => a.position - b.position)
    : parsedStops;

  return {
    type: "GRADIENT_LINEAR",
    gradientTransform: cssGradientTransform(direction),
    gradientStops
  };
}

export function isSupportedRasterImage(bytes) {
  const imageBytes = toUint8Array(bytes);
  return isPng(imageBytes) || isJpeg(imageBytes) || isGif(imageBytes) || isWebp(imageBytes);
}

function screenshotCropReasonForMismatchedRaster(model, bytes) {
  const objectFit = String(model.style?.objectFit ?? model.styles?.objectFit ?? "").trim().toLowerCase();
  if (objectFit !== "contain" && objectFit !== "scale-down") {
    return "";
  }
  const rect = model.rect ?? {
    x: model.x ?? 0,
    y: model.y ?? 0,
    width: model.width ?? 0,
    height: model.height ?? 0
  };
  const rectWidth = Number(rect.width) || 0;
  const rectHeight = Number(rect.height) || 0;
  const intrinsic = rasterIntrinsicSize(bytes);
  if (!intrinsic || rectWidth <= 0 || rectHeight <= 0 || intrinsic.width <= 0 || intrinsic.height <= 0) {
    return "";
  }
  const rectAspect = rectWidth / rectHeight;
  const intrinsicAspect = intrinsic.width / intrinsic.height;
  if (!aspectRatiosDiffer(rectAspect, intrinsicAspect, 0.25)) {
    return "";
  }
  return `asset aspect ratio mismatch (${intrinsic.width}x${intrinsic.height} asset for ${round(rectWidth)}x${round(rectHeight)} rendered rect)`;
}

function rasterIntrinsicSize(bytes) {
  const imageBytes = toUint8Array(bytes);
  if (isPng(imageBytes)) {
    return pngIntrinsicSize(imageBytes);
  }
  if (isJpeg(imageBytes)) {
    return jpegIntrinsicSize(imageBytes);
  }
  if (isGif(imageBytes)) {
    return gifIntrinsicSize(imageBytes);
  }
  return null;
}

function aspectRatiosDiffer(a, b, tolerance) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
    return false;
  }
  return Math.abs(a - b) / Math.max(a, b) > tolerance;
}

function createMockNode(type, createdNodes) {
  const node = {
    type,
    name: "",
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    layoutSizingHorizontal: "",
    layoutSizingVertical: "",
    layoutPositioning: "",
    layoutGrow: 0,
    children: [],
    resize(width, height) {
      this.width = width;
      this.height = height;
    },
    appendChild(child) {
      this.children.push(child);
    },
    setPluginData(key, value) {
      this.pluginData = this.pluginData ?? {};
      this.pluginData[key] = value;
    }
  };
  createdNodes.push(node);
  return node;
}

function extractCssFunctionArgs(value, names) {
  const source = String(value ?? "");
  const lower = source.toLowerCase();
  for (const name of names) {
    const start = lower.indexOf(`${name}(`);
    if (start < 0) {
      continue;
    }
    let depth = 0;
    for (let index = start + name.length; index < source.length; index += 1) {
      const char = source[index];
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          return source.slice(start + name.length + 1, index);
        }
      }
    }
  }
  return "";
}

function splitCssArguments(value) {
  const parts = [];
  let depth = 0;
  let start = 0;
  const source = String(value ?? "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      parts.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(source.slice(start).trim());
  return parts.filter(Boolean);
}

function isCssGradientDirection(value) {
  return /^to\s+(?:left|right|top|bottom)$/.test(value) ||
    /^-?\d+(?:\.\d+)?deg$/.test(value);
}

function normalizeCssGradientDirection(value) {
  const source = String(value ?? "").trim().toLowerCase();
  if (source.startsWith("to ")) {
    return source;
  }
  const angleMatch = source.match(/^(-?\d+(?:\.\d+)?)deg$/);
  if (!angleMatch) {
    return "to bottom";
  }
  const normalized = ((Number.parseFloat(angleMatch[1]) % 360) + 360) % 360;
  if (normalized === 0) {
    return "to top";
  }
  if (normalized === 90) {
    return "to right";
  }
  if (normalized === 180) {
    return "to bottom";
  }
  if (normalized === 270) {
    return "to left";
  }
  return "to right";
}

function shouldReverseCssGradientStops(direction) {
  return direction === "to left" || direction === "to top";
}

function cssGradientTransform(direction) {
  const transform = direction === "to top" || direction === "to bottom"
    ? LINEAR_GRADIENT_TO_BOTTOM_TRANSFORM
    : LINEAR_GRADIENT_TO_RIGHT_TRANSFORM;
  return transform.map((row) => [...row]);
}

function cssGradientStop(value, index, total) {
  const source = String(value ?? "").trim();
  const colorMatch = source.match(/^(transparent|rgba?\([^)]+\)|color\([^)]+\)|#[0-9a-f]{3,8})/i);
  if (!colorMatch) {
    return null;
  }
  const color = parseCssColor(colorMatch[1]);
  if (!color) {
    return null;
  }
  const remainder = source.slice(colorMatch[0].length).trim();
  const positionMatch = remainder.match(/(-?[\d.]+)%/);
  const fallbackPosition = total <= 1 ? 0 : index / (total - 1);
  const position = positionMatch
    ? clamp(Number.parseFloat(positionMatch[1]) / 100, 0, 1)
    : fallbackPosition;
  return {
    position: round(position),
    color: {
      r: color.r / 255,
      g: color.g / 255,
      b: color.b / 255,
      a: color.a
    }
  };
}

function createImagePlaceholderNode(figmaApi, model) {
  const node = figmaApi.createRectangle();
  applyNodeBasics(node, model);
  node.name = `${model.name} / Placeholder`;
  node.locked = Boolean(model.locked);
  applyImagePlaceholderStyle(node);
  return node;
}

function createScreenshotCropFallbackLayer(figmaApi, model, options = {}) {
  const absoluteRect = model.absoluteRect;
  const rect = model.rect ?? {
    x: model.x ?? 0,
    y: model.y ?? 0,
    width: model.width ?? 0,
    height: model.height ?? 0
  };
  const viewportWidth = Number(options.viewport?.width ?? 0);
  const viewportHeight = Number(options.viewport?.height ?? 0);
  if (
    !absoluteRect ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return null;
  }

  let imageHash = null;
  try {
    imageHash = options.getScreenshotImageHash?.() ?? null;
  } catch {
    return null;
  }
  if (!imageHash) {
    return null;
  }

  const frame = figmaApi.createFrame();
  applyNodeBasics(frame, model);
  frame.name = `${model.name} / Screenshot Crop`;
  frame.locked = Boolean(model.locked);
  frame.clipsContent = true;
  frame.fills = [];
  writeNodeMetadata(frame, "assetRef", model.assetRef);
  writeNodeMetadata(frame, "fallbackReason", `${options.fallbackReason || "image fallback"}; screenshot crop fallback`);

  const screenshotLayer = figmaApi.createRectangle();
  screenshotLayer.name = "Screenshot crop source";
  screenshotLayer.locked = true;
  const sourceX = Number(absoluteRect.x ?? 0);
  const sourceY = Number(absoluteRect.y ?? 0);
  screenshotLayer.x = sourceX === 0 ? 0 : -sourceX;
  screenshotLayer.y = sourceY === 0 ? 0 : -sourceY;
  if (typeof screenshotLayer.resize === "function") {
    screenshotLayer.resize(viewportWidth, viewportHeight);
  } else {
    screenshotLayer.width = viewportWidth;
    screenshotLayer.height = viewportHeight;
  }
  screenshotLayer.fills = [{
    type: "IMAGE",
    scaleMode: "FILL",
    imageHash
  }];
  writeNodeMetadata(screenshotLayer, "assetRef", model.assetRef);
  writeNodeMetadata(screenshotLayer, "fallbackReason", "screenshot crop source");
  frame.appendChild(screenshotLayer);
  return frame;
}

function createSvgImageLayer(figmaApi, model, imageBytes) {
  const svgText = resolveSvgCurrentColor(decodeUtf8(imageBytes), svgCurrentColor(model));
  const svgNode = figmaApi.createNodeFromSvg(svgText);
  const rect = model.rect ?? {
    x: model.x ?? 0,
    y: model.y ?? 0,
    width: model.width ?? 0,
    height: model.height ?? 0
  };
  const rotation = rotationFromTransform(model.style?.transform ?? model.styles?.transform);
  const intrinsic = svgIntrinsicSize(svgText);
  const fitted = fittedSvgRect(rect, intrinsic, shouldPreserveSvgAspectRatio(svgText));
  const requiresWrapper = rotation !== 0 ||
    fitted.x !== 0 ||
    fitted.y !== 0 ||
    fitted.width !== (rect.width ?? model.width ?? 0) ||
    fitted.height !== (rect.height ?? model.height ?? 0);

  if (!requiresWrapper) {
    applyNodeBasics(svgNode, model);
    svgNode.name = model.name;
    svgNode.locked = Boolean(model.locked);
    writeNodeMetadata(svgNode, "assetRef", model.assetRef);
    writeNodeMetadata(svgNode, "assetKind", "svg");
    return svgNode;
  }

  const frame = figmaApi.createFrame();
  applyNodeBasics(frame, model);
  frame.name = model.name;
  frame.locked = Boolean(model.locked);
  frame.clipsContent = true;
  frame.fills = [];
  writeNodeMetadata(frame, "assetRef", model.assetRef);
  writeNodeMetadata(frame, "assetKind", "svg");

  const placed = rotatedFittedSvgRect(rect, fitted, rotation);
  svgNode.x = placed.x;
  svgNode.y = placed.y;
  if (typeof svgNode.resize === "function") {
    svgNode.resize(fitted.width, fitted.height);
  } else {
    svgNode.width = fitted.width;
    svgNode.height = fitted.height;
  }
  safeSetFigmaProperty(svgNode, "rotation", rotation);
  svgNode.name = `${model.name} / Vector`;
  writeNodeMetadata(svgNode, "assetRef", model.assetRef);
  writeNodeMetadata(svgNode, "assetKind", "svg");
  frame.appendChild(svgNode);
  return frame;
}

function svgCurrentColor(model = {}) {
  return model.style?.color ??
    model.styles?.color ??
    model.style?.text?.color ??
    model.styles?.webkitTextFillColor ??
    "";
}

function resolveSvgCurrentColor(svgText, colorValue) {
  if (!/\bcurrentColor\b/i.test(svgText)) {
    return svgText;
  }
  const color = parseCssColor(colorValue);
  if (!color) {
    return svgText;
  }
  return svgText.replace(/\bcurrentColor\b/gi, cssColorToSvgColor(color));
}

function cssColorToSvgColor(color) {
  const r = Math.round(clamp(color.r, 0, 255));
  const g = Math.round(clamp(color.g, 0, 255));
  const b = Math.round(clamp(color.b, 0, 255));
  const a = clamp(color.a, 0, 1);
  if (a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
  }
  return `rgb(${r}, ${g}, ${b})`;
}

function applyNodeBasics(node, model) {
  const rect = model.rect ?? {
    x: model.x ?? 0,
    y: model.y ?? 0,
    width: model.width ?? 0,
    height: model.height ?? 0
  };
  node.x = rect.x ?? model.x ?? 0;
  node.y = rect.y ?? model.y ?? 0;
  if (typeof node.resize === "function") {
    node.resize(rect.width ?? model.width ?? 0, rect.height ?? model.height ?? 0);
  } else {
    node.width = rect.width ?? model.width ?? 0;
    node.height = rect.height ?? model.height ?? 0;
  }
  writeNodeMetadata(node, "sourceNodeId", model.sourceNodeId);
  writeNodeMetadata(node, "cssZIndex", model.cssZIndex);
  if (model.layoutPositioning) {
    safeSetFigmaProperty(node, "layoutPositioning", model.layoutPositioning);
  }
}

function applyPostAppendChildLayout(child, model = {}) {
  if (model.layoutPositioning) {
    safeSetFigmaProperty(child, "layoutPositioning", model.layoutPositioning);
  }
}

function applyTextResizeAndLayoutSizing(node, model) {
  const textAutoResize = model.textAutoResize ?? "HEIGHT";
  try {
    node.textAutoResize = textAutoResize;
  } catch {
    // Keep the text editable even when a host does not expose auto-resize.
  }

  const layoutSizingHorizontal = model.layoutSizingHorizontal ?? (
    textAutoResize === "WIDTH_AND_HEIGHT" ? "HUG" : "FIXED"
  );
  const layoutSizingVertical = model.layoutSizingVertical ?? "HUG";
  safeSetFigmaProperty(node, "layoutSizingHorizontal", layoutSizingHorizontal);
  safeSetFigmaProperty(node, "layoutSizingVertical", layoutSizingVertical);
  if (layoutSizingHorizontal === "HUG") {
    safeSetFigmaProperty(node, "layoutGrow", 0);
  }
}

function applyTextAlignment(node, textAlign) {
  const horizontal = textAlignHorizontal(textAlign);
  if (horizontal) {
    safeSetFigmaProperty(node, "textAlignHorizontal", horizontal);
  }
}

function textAlignHorizontal(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "center") {
    return "CENTER";
  }
  if (normalized === "right" || normalized === "end") {
    return "RIGHT";
  }
  if (normalized === "left" || normalized === "start") {
    return "LEFT";
  }
  return "";
}

function safeSetFigmaProperty(node, property, value) {
  try {
    node[property] = value;
  } catch {
    // Older or stricter Figma hosts can reject newer layout sizing properties.
  }
}

function writeNodeMetadata(node, key, value) {
  if (value === null || value === undefined || value === "") {
    return;
  }
  if (typeof node.setPluginData === "function") {
    try {
      node.setPluginData(key, String(value));
    } catch {
      // Figma can reject plugin data on some node-like objects; metadata is non-critical.
    }
  }
  try {
    node[key] = value;
  } catch {
    // Real Figma nodes are not extensible; mock nodes can still expose metadata in tests.
  }
}

function applyVisualStyle(node, style = {}) {
  const fills = (style.fills ?? [])
    .map(cssFillToPaint)
    .filter(Boolean);
  node.fills = fills;

  if (style.borderSides?.length > 0) {
    applyBorderSideStrokes(node, style.borderSides);
  } else if (style.strokes?.length > 0) {
    const stroke = style.strokes[0];
    const strokePaint = cssColorToPaint(stroke.color);
    if (strokePaint) {
      node.strokes = [strokePaint];
      node.strokeWeight = stroke.width;
    }
  }

  if (style.cornerRadius > 0) {
    node.cornerRadius = style.cornerRadius;
  }

  if (style.effects?.length > 0) {
    node.effects = style.effects
      .map((effect) => cssShadowToEffect(effect.value))
      .filter(Boolean);
  }
}

function cssShadowToEffect(value) {
  const shadow = firstOuterCssShadow(value);
  if (!shadow) {
    return null;
  }

  const colorValue = extractCssShadowColor(shadow);
  const color = parseCssColor(colorValue) ?? { r: 0, g: 0, b: 0, a: 0.16 };
  const lengthSource = colorValue ? shadow.replace(colorValue, " ") : shadow;
  const lengths = Array.from(lengthSource.matchAll(/-?\d*\.?\d+(?:px)?/gi))
    .map((match) => parseCssNumber(match[0]))
    .filter((number) => Number.isFinite(number));
  if (lengths.length < 2) {
    return null;
  }

  return {
    type: "DROP_SHADOW",
    color: {
      r: color.r / 255,
      g: color.g / 255,
      b: color.b / 255,
      a: color.a
    },
    offset: {
      x: lengths[0],
      y: lengths[1]
    },
    radius: lengths[2] ?? 0,
    spread: lengths[3] ?? 0,
    visible: true,
    blendMode: "NORMAL"
  };
}

function firstOuterCssShadow(value) {
  if (typeof value !== "string" || value.length === 0 || value === "none") {
    return "";
  }
  return splitCssArguments(value)
    .map((shadow) => shadow.trim())
    .find((shadow) => shadow.length > 0 && !/\binset\b/i.test(shadow)) ?? "";
}

function extractCssShadowColor(value) {
  const match = String(value ?? "").match(/rgba?\([^)]+\)|color\([^)]+\)|#[0-9a-f]{3,8}|transparent/i);
  return match ? match[0] : "";
}

function applyBorderSideStrokes(node, borderSides) {
  const [first] = borderSides;
  const strokePaint = cssColorToPaint(first?.color);
  if (!strokePaint) {
    return;
  }

  const weights = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  };
  for (const side of borderSides) {
    weights[side.side] = side.width;
  }

  node.strokes = [strokePaint];
  node.strokeWeight = Math.max(...Object.values(weights));
  safeSetFigmaProperty(node, "strokeAlign", "INSIDE");
  safeSetFigmaProperty(node, "strokeTopWeight", weights.top);
  safeSetFigmaProperty(node, "strokeRightWeight", weights.right);
  safeSetFigmaProperty(node, "strokeBottomWeight", weights.bottom);
  safeSetFigmaProperty(node, "strokeLeftWeight", weights.left);
}

function applyImagePlaceholderStyle(node) {
  node.fills = [{
    type: "SOLID",
    color: { r: 0.94, g: 0.95, b: 0.97 },
    opacity: 1
  }];
  node.strokes = [{
    type: "SOLID",
    color: { r: 0.64, g: 0.68, b: 0.74 },
    opacity: 1
  }];
  node.strokeWeight = 1;
}

function isSvgAsset(model, bytes) {
  return model.assetKind === "svg" ||
    String(model.assetRef ?? "").toLowerCase().endsWith(".svg") ||
    isSvgBytes(bytes);
}

function isSvgBytes(bytes) {
  const text = decodeUtf8(bytes.slice(0, Math.min(bytes.length, 512))).trimStart();
  return text.startsWith("<svg") || text.includes("<svg");
}

function svgIntrinsicSize(svgText) {
  const viewBox = extractSvgAttribute(svgText, "viewBox");
  if (viewBox) {
    const values = viewBox
      .trim()
      .split(/[\s,]+/)
      .map((value) => Number.parseFloat(value));
    if (values.length >= 4 && Number.isFinite(values[2]) && Number.isFinite(values[3]) && values[2] > 0 && values[3] > 0) {
      return {
        width: values[2],
        height: values[3]
      };
    }
  }

  const width = parseCssNumber(extractSvgAttribute(svgText, "width"));
  const height = parseCssNumber(extractSvgAttribute(svgText, "height"));
  if (width > 0 && height > 0) {
    return { width, height };
  }
  return null;
}

function extractSvgAttribute(svgText, attribute) {
  const match = String(svgText).match(new RegExp(`\\s${attribute}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match ? match[1] : "";
}

function shouldPreserveSvgAspectRatio(svgText) {
  return !/preserveAspectRatio\s*=\s*["']none["']/i.test(String(svgText));
}

function fittedSvgRect(rect, intrinsic, preserveAspectRatio) {
  const width = Math.max(0, Number(rect.width) || 0);
  const height = Math.max(0, Number(rect.height) || 0);
  if (!preserveAspectRatio || !intrinsic || intrinsic.width <= 0 || intrinsic.height <= 0 || width <= 0 || height <= 0) {
    return {
      x: 0,
      y: 0,
      width,
      height
    };
  }
  const scale = Math.min(width / intrinsic.width, height / intrinsic.height);
  const rawFittedWidth = intrinsic.width * scale;
  const rawFittedHeight = intrinsic.height * scale;
  const fittedWidth = round(rawFittedWidth);
  const fittedHeight = round(rawFittedHeight);
  return {
    x: round((width - rawFittedWidth) / 2),
    y: round((height - rawFittedHeight) / 2),
    width: fittedWidth,
    height: fittedHeight
  };
}

function rotatedFittedSvgRect(containerRect, fitted, rotation) {
  const angle = (Number(rotation) || 0) * Math.PI / 180;
  if (Math.abs(angle) < 0.0001) {
    return fitted;
  }

  const width = Number(fitted.width) || 0;
  const height = Number(fitted.height) || 0;
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: 0, y: height },
    { x: width, y: height }
  ].map((point) => ({
    x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: point.x * Math.sin(angle) + point.y * Math.cos(angle)
  }));
  const minX = Math.min(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxX = Math.max(...corners.map((point) => point.x));
  const maxY = Math.max(...corners.map((point) => point.y));
  const rotatedWidth = maxX - minX;
  const rotatedHeight = maxY - minY;
  const targetX = ((Number(containerRect.width) || 0) - rotatedWidth) / 2;
  const targetY = ((Number(containerRect.height) || 0) - rotatedHeight) / 2;

  return {
    ...fitted,
    x: round(targetX - minX),
    y: round(targetY - minY)
  };
}

function rotationFromTransform(transform) {
  const value = String(transform ?? "").trim();
  let match;
  let parts;
  let angle = 0;
  if (!value || value === "none") {
    return 0;
  }

  match = value.match(/^matrix\(([^)]+)\)$/i);
  if (match) {
    parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
    if (parts.length >= 4 && parts.every((part) => Number.isFinite(part))) {
      return normalizeRotation((Math.atan2(parts[1], parts[0]) * 180) / Math.PI);
    }
  }

  match = value.match(/^matrix3d\(([^)]+)\)$/i);
  if (match) {
    parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
    if (parts.length >= 16 && parts.every((part) => Number.isFinite(part))) {
      return normalizeRotation((Math.atan2(parts[1], parts[0]) * 180) / Math.PI);
    }
  }

  match = value.match(/rotate\((-?[\d.]+)(deg|rad|turn)?\)/i);
  if (match) {
    angle = Number.parseFloat(match[1]);
    if (!Number.isFinite(angle)) {
      return 0;
    }
    if (match[2] === "rad") {
      angle = (angle * 180) / Math.PI;
    } else if (match[2] === "turn") {
      angle *= 360;
    }
    return normalizeRotation(angle);
  }

  return 0;
}

function normalizeRotation(angle) {
  const rounded = round(angle);
  if (Math.abs(rounded) < 0.01) {
    return 0;
  }
  if (rounded <= -180) {
    return round(rounded + 360);
  }
  if (rounded > 180) {
    return round(rounded - 360);
  }
  return rounded;
}

function decodeUtf8(bytes) {
  let output = "";
  let index = 0;
  while (index < bytes.length) {
    const first = bytes[index];
    let codePoint;
    if (first < 0x80) {
      output += String.fromCharCode(first);
      index += 1;
    } else if (first >= 0xc0 && first < 0xe0) {
      codePoint = ((first & 0x1f) << 6) | (bytes[index + 1] & 0x3f);
      output += String.fromCharCode(codePoint);
      index += 2;
    } else if (first >= 0xe0 && first < 0xf0) {
      codePoint = ((first & 0x0f) << 12) | ((bytes[index + 1] & 0x3f) << 6) | (bytes[index + 2] & 0x3f);
      output += String.fromCharCode(codePoint);
      index += 3;
    } else {
      codePoint = ((first & 0x07) << 18) | ((bytes[index + 1] & 0x3f) << 12) | ((bytes[index + 2] & 0x3f) << 6) | (bytes[index + 3] & 0x3f);
      codePoint -= 0x10000;
      output += String.fromCharCode(0xd800 + (codePoint >> 10), 0xdc00 + (codePoint & 0x3ff));
      index += 4;
    }
  }
  return output;
}

function applyAutoLayout(frame, autoLayout) {
  if (!autoLayout?.applied) {
    writeNodeMetadata(frame, "autoLayoutSkippedReason", autoLayout?.skippedReason);
    return;
  }
  frame.layoutMode = autoLayout.layoutMode;
  frame.primaryAxisSizingMode = "FIXED";
  frame.counterAxisSizingMode = "FIXED";
  if (autoLayout.primaryAxisAlignItems) {
    frame.primaryAxisAlignItems = autoLayout.primaryAxisAlignItems;
  }
  if (autoLayout.counterAxisAlignItems) {
    frame.counterAxisAlignItems = autoLayout.counterAxisAlignItems;
  }
  frame.itemSpacing = autoLayout.itemSpacing ?? 0;
  frame.paddingLeft = autoLayout.paddingLeft ?? 0;
  frame.paddingRight = autoLayout.paddingRight ?? 0;
  frame.paddingTop = autoLayout.paddingTop ?? 0;
  frame.paddingBottom = autoLayout.paddingBottom ?? 0;
  writeNodeMetadata(frame, "autoLayoutConfidence", autoLayout.confidence);
}

function isPng(bytes) {
  return bytes.length >= 4
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47;
}

function pngIntrinsicSize(bytes) {
  if (bytes.length < 24 || !isPng(bytes)) {
    return null;
  }
  const type = decodeUtf8(bytes.slice(12, 16));
  if (type !== "IHDR") {
    return null;
  }
  return {
    width: readUint32BigEndian(bytes, 16),
    height: readUint32BigEndian(bytes, 20)
  };
}

function isJpeg(bytes) {
  return bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff;
}

function jpegIntrinsicSize(bytes) {
  if (!isJpeg(bytes)) {
    return null;
  }
  let index = 2;
  while (index + 8 < bytes.length) {
    while (index < bytes.length && bytes[index] === 0xff) {
      index += 1;
    }
    const marker = bytes[index];
    index += 1;
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }
    if (index + 2 > bytes.length) {
      return null;
    }
    const segmentLength = readUint16BigEndian(bytes, index);
    if (segmentLength < 2 || index + segmentLength > bytes.length) {
      return null;
    }
    if (isJpegStartOfFrameMarker(marker) && segmentLength >= 7) {
      return {
        height: readUint16BigEndian(bytes, index + 3),
        width: readUint16BigEndian(bytes, index + 5)
      };
    }
    index += segmentLength;
  }
  return null;
}

function isJpegStartOfFrameMarker(marker) {
  return (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf);
}

function isGif(bytes) {
  return bytes.length >= 6
    && bytes[0] === 0x47
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x38
    && (bytes[4] === 0x37 || bytes[4] === 0x39)
    && bytes[5] === 0x61;
}

function gifIntrinsicSize(bytes) {
  if (bytes.length < 10 || !isGif(bytes)) {
    return null;
  }
  return {
    width: readUint16LittleEndian(bytes, 6),
    height: readUint16LittleEndian(bytes, 8)
  };
}

function isWebp(bytes) {
  return bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50;
}

function readUint32BigEndian(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3];
}

function readUint16BigEndian(bytes, offset) {
  return (bytes[offset] << 8) + bytes[offset + 1];
}

function readUint16LittleEndian(bytes, offset) {
  return bytes[offset] + (bytes[offset + 1] << 8);
}

function normalizeFontCandidates(fonts, fallbackFont) {
  const list = Array.isArray(fonts) ? fonts : [fonts];
  const candidates = dedupeFontNames(
    list
      .filter(Boolean)
      .map((fontName) => ({
        family: String(fontName.family ?? "").trim(),
        style: String(fontName.style ?? "Regular").trim() || "Regular"
      }))
      .filter((fontName) => fontName.family.length > 0)
  );
  return candidates.length > 0 ? candidates : [fallbackFont];
}

function dedupeFontNames(fonts) {
  const seen = new Set();
  const unique = [];
  for (const fontName of fonts) {
    const key = fontKey(fontName);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(fontName);
    }
  }
  return unique;
}

function sameFontName(a, b) {
  return fontKey(a) === fontKey(b);
}

function fontKey(fontName) {
  return `${fontName?.family ?? ""}\n${fontName?.style ?? ""}`;
}

function fontLabel(fontName) {
  return `${fontName?.family ?? ""} ${fontName?.style ?? ""}`.trim();
}

function parseFontFamilyStack(value = "") {
  const families = [];
  let current = "";
  let quote = "";
  const source = String(value ?? "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\" && index + 1 < source.length) {
      current += source[index + 1];
      index += 1;
      continue;
    }
    if ((char === "\"" || char === "'") && (!quote || quote === char)) {
      quote = quote ? "" : char;
      current += char;
      continue;
    }
    if (char === "," && !quote) {
      pushFontFamily(families, current);
      current = "";
      continue;
    }
    current += char;
  }

  pushFontFamily(families, current);
  return families;
}

function pushFontFamily(families, value) {
  const family = String(value)
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .trim();
  if (family.length > 0) {
    families.push(family);
  }
}

function isGenericFontFamily(family) {
  return new Set([
    "serif",
    "sans-serif",
    "monospace",
    "cursive",
    "fantasy",
    "system-ui",
    "ui-serif",
    "ui-sans-serif",
    "ui-monospace",
    "ui-rounded",
    "emoji",
    "math",
    "fangsong",
    "-apple-system",
    "blinkmacsystemfont"
  ]).has(String(family).trim().toLowerCase());
}

function preferFontFamiliesForText(families, textContent) {
  if (!containsCjkText(textContent)) {
    return families;
  }
  const preferred = [];
  const remaining = [];
  for (const family of families) {
    if (isCjkFontFamily(family)) {
      preferred.push(family);
    } else {
      remaining.push(family);
    }
  }
  return preferred.length > 0 ? [...preferred, ...remaining] : families;
}

function containsCjkText(value) {
  return /[\u3040-\u30ff\u3100-\u312f\u31a0-\u31bf\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/u.test(String(value ?? ""));
}

function isCjkFontFamily(family) {
  return /noto\s+sans\s+(tc|sc|jp|kr)|source\s+han|pingfang|pingfang\s+tc|microsoft\s+jhenghei|jhenghei|hiragino|heiti|yahei|mingliu|pmingliu|songti|kaiti|cjk/i
    .test(String(family ?? ""));
}

function fontStyleCandidatesFromCss(fontWeight = "", fontStyle = "") {
  const weight = normalizedFontWeight(fontWeight);
  const italic = /italic|oblique/i.test(String(fontStyle));
  if (italic && weight >= 700) {
    return ["Bold Italic", "Regular"];
  }
  if (italic && weight >= 600) {
    return dedupeStrings(["Semi Bold Italic", "Semibold Italic", "Demi Bold Italic", "Bold Italic", "Regular"]);
  }
  if (italic && weight >= 500) {
    return ["Medium Italic", "Regular"];
  }
  if (italic && weight <= 200) {
    return ["Extra Light Italic", "Light Italic", "Italic", "Regular"];
  }
  if (italic && weight <= 300) {
    return ["Light Italic", "Italic", "Regular"];
  }
  if (italic) {
    return ["Italic", "Regular"];
  }
  return fontWeightStyleCandidates(weight);
}

function fontWeightStyleCandidates(weight) {
  if (weight >= 900) {
    return ["Black", "Heavy", "Extra Bold", "ExtraBold", "Bold", "Regular"];
  }
  if (weight >= 800) {
    return ["Extra Bold", "ExtraBold", "Bold", "Regular"];
  }
  if (weight >= 700) {
    return ["Bold", "Regular"];
  }
  if (weight >= 600) {
    return ["Semi Bold", "SemiBold", "Semibold", "Demi Bold", "DemiBold", "Bold", "Regular"];
  }
  if (weight >= 500) {
    return ["Medium", "Regular"];
  }
  if (weight <= 200) {
    return ["Thin", "Extra Light", "ExtraLight", "Light", "Regular"];
  }
  if (weight <= 300) {
    return ["Light", "Regular"];
  }
  return ["Regular"];
}

function normalizedFontWeight(fontWeight) {
  const value = String(fontWeight ?? "").trim().toLowerCase();
  if (value === "bold") {
    return 700;
  }
  if (value === "normal") {
    return 400;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 400;
}

function dedupeStrings(values) {
  return [...new Set(values)];
}

function parseCssColor(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const source = value.trim();
  if (source.toLowerCase() === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const srgb = source.match(/^color\(\s*srgb\s+([^)]+)\)$/i);
  if (srgb) {
    const channels = parseCssFunctionalColorParts(srgb[1], "srgb");
    if (!channels) {
      return null;
    }
    return channels;
  }

  const rgb = source.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const channels = parseCssFunctionalColorParts(rgb[1], "rgb");
    if (!channels) {
      return null;
    }
    return channels;
  }

  const hex = source.match(/^#([0-9a-f]{3,8})$/i);
  if (!hex) {
    return null;
  }
  const expanded = hex[1].length === 3 || hex[1].length === 4
    ? Array.from(hex[1]).map((char) => `${char}${char}`).join("")
    : hex[1];
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
    a: expanded.length >= 8 ? clamp(Number.parseInt(expanded.slice(6, 8), 16) / 255, 0, 1) : 1
  };
}

function parseCssFunctionalColorParts(value, colorSpace) {
  const slashParts = String(value ?? "").trim().split(/\s*\/\s*/);
  const channelsSource = slashParts[0];
  const alphaSource = slashParts[1];
  const parts = channelsSource.includes(",")
    ? channelsSource.split(",").map((part) => part.trim()).filter(Boolean)
    : channelsSource.split(/\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) {
    return null;
  }

  const alpha = alphaSource !== undefined
    ? parseCssAlpha(alphaSource)
    : parts.length > 3
      ? parseCssAlpha(parts[3])
      : 1;
  const channels = parts.slice(0, 3).map((part) => colorSpace === "srgb"
    ? parseCssSrgbChannel(part)
    : parseCssRgbChannel(part));
  if (channels.some((part) => !Number.isFinite(part)) || !Number.isFinite(alpha)) {
    return null;
  }
  return {
    r: clamp(channels[0], 0, 255),
    g: clamp(channels[1], 0, 255),
    b: clamp(channels[2], 0, 255),
    a: clamp(alpha, 0, 1)
  };
}

function parseCssRgbChannel(value) {
  const source = String(value ?? "").trim();
  if (source.endsWith("%")) {
    return clamp(Number.parseFloat(source), 0, 100) * 2.55;
  }
  return Number.parseFloat(source);
}

function parseCssSrgbChannel(value) {
  const source = String(value ?? "").trim();
  if (source.endsWith("%")) {
    return clamp(Number.parseFloat(source), 0, 100) * 2.55;
  }
  return Number.parseFloat(source) * 255;
}

function parseCssAlpha(value) {
  const source = String(value ?? "").trim();
  if (source.endsWith("%")) {
    return Number.parseFloat(source) / 100;
  }
  return Number.parseFloat(source);
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
