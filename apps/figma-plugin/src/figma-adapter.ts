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
          const svgNode = figmaApi.createNodeFromSvg(decodeUtf8(imageBytes));
          applyNodeBasics(svgNode, model);
          svgNode.name = model.name;
          svgNode.locked = Boolean(model.locked);
          writeNodeMetadata(svgNode, "assetRef", model.assetRef);
          writeNodeMetadata(svgNode, "assetKind", "svg");
          return svgNode;
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

      const requestedFont = fontNameFromStyle(model.style?.text);
      const loadedFont = await loadFontWithFallback(figmaApi, requestedFont, fallbackFont);
      if (loadedFont.substituted) {
        fontSubstitutions.push({
          sourceNodeId: model.sourceNodeId,
          requested: requestedFont,
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

  return {
    createdNodes,
    loadedFonts,
    root: { children: [] },
    async loadFontAsync(fontName) {
      loadedFonts.push(fontName);
      if (unavailableFamilies.has(fontName.family)) {
        throw new Error(`Missing font ${fontName.family}`);
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

export async function loadFontWithFallback(figmaApi, requestedFont, fallbackFont = DEFAULT_FALLBACK_FONT) {
  try {
    await figmaApi.loadFontAsync(requestedFont);
    return { fontName: requestedFont, substituted: false };
  } catch {
    await figmaApi.loadFontAsync(fallbackFont);
    return { fontName: fallbackFont, substituted: true };
  }
}

export function fontNameFromStyle(textStyle = {}) {
  return {
    family: parseFontFamily(textStyle.fontFamily) || DEFAULT_FALLBACK_FONT.family,
    style: parseFontStyle(textStyle.fontWeight)
  };
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

function createImagePlaceholderNode(figmaApi, model) {
  const node = figmaApi.createRectangle();
  applyNodeBasics(node, model);
  node.name = `${model.name} / Placeholder`;
  node.locked = Boolean(model.locked);
  applyImagePlaceholderStyle(node);
  return node;
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
    .map(cssColorToPaint)
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

function parseFontFamily(value = "") {
  return String(value)
    .split(",")[0]
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

function parseFontStyle(fontWeight = "") {
  const weight = Number.parseInt(String(fontWeight), 10);
  return Number.isFinite(weight) && weight >= 600 ? "Bold" : "Regular";
}

function parseCssColor(value) {
  if (typeof value !== "string" || value.length === 0 || value === "transparent") {
    return null;
  }

  const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgb) {
    return null;
  }
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
