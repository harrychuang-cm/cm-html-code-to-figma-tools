export const DEFAULT_FALLBACK_FONT = { family: "Inter", style: "Regular" };

export function createFigmaApiAdapter(figmaApi = globalThis.figma, options = {}) {
  const assets = options.assets ?? {};
  const fallbackFont = options.fallbackFont ?? DEFAULT_FALLBACK_FONT;
  const fontSubstitutions = [];

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
      if (isSupportedRasterImage(imageBytes)) {
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
          fallbackReason = model.fallbackReason ?? "image decode failed";
          writeNodeMetadata(node, "imageImportError", error instanceof Error ? error.message : String(error));
        }
      } else {
        fallbackReason = model.fallbackReason ?? (imageBytes.length > 0 ? "external or unsupported image asset" : "missing image asset");
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

      const requestedFonts = fontNamesFromStyle(model.style?.text, fallbackFont);
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
      if (colorPaint) {
        node.fills = [colorPaint];
      }
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

    appendChild(parent, child) {
      parent.appendChild(child);
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

export function fontNamesFromStyle(textStyle = {}, fallbackFont = DEFAULT_FALLBACK_FONT) {
  const requestedStyle = parseFontStyle(textStyle.fontWeight, textStyle.fontStyle);
  const families = parseFontFamilyStack(textStyle.fontFamily)
    .filter((family) => !isGenericFontFamily(family));
  const candidates = [];

  for (const family of families) {
    candidates.push({ family, style: requestedStyle });
    if (requestedStyle !== "Regular") {
      candidates.push({ family, style: "Regular" });
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
  let reverseStops = false;
  const first = parts[0].trim().toLowerCase();
  if (isCssGradientDirection(first)) {
    stops = parts.slice(1);
    reverseStops = first === "to left" || first === "270deg" || first === "-90deg";
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

  const gradientStops = reverseStops
    ? parsedStops
      .map((stop) => ({ ...stop, position: round(1 - stop.position) }))
      .sort((a, b) => a.position - b.position)
    : parsedStops;

  return {
    type: "GRADIENT_LINEAR",
    gradientTransform: [
      [1, 0, 0],
      [0, 1, 0]
    ],
    gradientStops
  };
}

export function isSupportedRasterImage(bytes) {
  const imageBytes = toUint8Array(bytes);
  return isPng(imageBytes) || isJpeg(imageBytes) || isGif(imageBytes) || isWebp(imageBytes);
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

function cssGradientStop(value, index, total) {
  const source = String(value ?? "").trim();
  const colorMatch = source.match(/^(transparent|rgba?\([^)]+\)|#[0-9a-f]{3,8})/i);
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

function createSvgImageLayer(figmaApi, model, imageBytes) {
  const svgText = decodeUtf8(imageBytes);
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

  if (style.strokes?.length > 0) {
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
    node.effects = style.effects.map(() => ({
      type: "DROP_SHADOW",
      color: { r: 0, g: 0, b: 0, a: 0.16 },
      offset: { x: 0, y: 4 },
      radius: 12,
      spread: 0,
      visible: true,
      blendMode: "NORMAL"
    }));
  }
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

function isJpeg(bytes) {
  return bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff;
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

function parseFontStyle(fontWeight = "", fontStyle = "") {
  const weight = Number.parseInt(String(fontWeight), 10);
  const bold = Number.isFinite(weight) && weight >= 600;
  const italic = /italic|oblique/i.test(String(fontStyle));
  if (bold && italic) {
    return "Bold Italic";
  }
  if (bold) {
    return "Bold";
  }
  return italic ? "Italic" : "Regular";
}

function parseCssColor(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  if (value === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(",").map((part) => Number.parseFloat(part.trim()));
    if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) {
      return null;
    }
    return {
      r: clamp(parts[0], 0, 255),
      g: clamp(parts[1], 0, 255),
      b: clamp(parts[2], 0, 255),
      a: clamp(parts[3] ?? 1, 0, 1)
    };
  }

  const hex = value.match(/^#([0-9a-f]{3,8})$/i);
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
