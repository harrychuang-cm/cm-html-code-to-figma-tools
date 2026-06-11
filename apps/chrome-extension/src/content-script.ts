(() => {
  const runtimeFlag = "__figcaptureContentRuntimeRegistered";
  if (globalThis[runtimeFlag]) {
    return;
  }
  globalThis[runtimeFlag] = true;

  const CAPTURE_DOM_MESSAGE = "FIGCAPTURE_COLLECT_DOM";
  const DEFAULT_STYLE_PROPERTIES = [
    "display",
    "position",
    "boxSizing",
    "width",
    "height",
    "backgroundColor",
    "backgroundImage",
    "backgroundClip",
    "webkitBackgroundClip",
    "color",
    "webkitTextFillColor",
    "fontFamily",
    "fontSize",
    "fontStyle",
    "fontWeight",
    "lineHeight",
    "whiteSpace",
    "verticalAlign",
    "textAlign",
    "letterSpacing",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderTopStyle",
    "borderRightStyle",
    "borderBottomStyle",
    "borderLeftStyle",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
    "borderTopLeftRadius",
    "borderTopRightRadius",
    "borderBottomRightRadius",
    "borderBottomLeftRadius",
    "outlineWidth",
    "outlineStyle",
    "outlineColor",
    "outlineOffset",
    "boxShadow",
    "opacity",
    "objectFit",
    "transform",
    "transformOrigin",
    "maskImage",
    "webkitMaskImage",
    "overflow",
    "overflowX",
    "overflowY",
    "maxWidth",
    "maxHeight",
    "textOverflow",
    "gap",
    "rowGap",
    "columnGap",
    "alignItems",
    "justifyContent",
    "flexDirection",
    "gridTemplateColumns",
    "gridTemplateRows",
    "zIndex",
    "visibility",
    "content",
    "top",
    "right",
    "bottom",
    "left"
  ];

  chrome?.runtime?.onMessage?.addListener?.((message, _sender, sendResponse) => {
    if (message?.type !== CAPTURE_DOM_MESSAGE) {
      return false;
    }

    try {
      sendResponse({
        status: "success",
        capture: captureVisibleViewportFromDocument()
      });
    } catch (error) {
      sendResponse({
        status: "error",
        error: {
          category: "capture-failed",
          message: error?.message ?? "DOM capture failed"
        }
      });
    }

    return true;
  });

  function captureVisibleViewportFromDocument(documentRef = document, windowRef = window) {
    const viewport = {
      width: windowRef.innerWidth,
      height: windowRef.innerHeight,
      devicePixelRatio: windowRef.devicePixelRatio || 1,
      scrollX: windowRef.scrollX || 0,
      scrollY: windowRef.scrollY || 0
    };
    const rootElement = documentRef.body ?? documentRef.documentElement;
    const rawRoot = snapshotDomElement(rootElement, windowRef);

    return captureElementTree(rawRoot, viewport, {
      sourceUrl: documentRef.location?.href ?? windowRef.location?.href ?? "about:blank",
      title: documentRef.title ?? "",
      captureTimestamp: new Date().toISOString()
    });
  }

  function captureElementTree(inputRoot, viewport, options = {}) {
    return {
      sourceUrl: options.sourceUrl ?? "about:blank",
      title: options.title ?? "",
      captureTimestamp: options.captureTimestamp ?? new Date().toISOString(),
      viewport: {
        width: viewport.width,
        height: viewport.height,
        devicePixelRatio: viewport.devicePixelRatio ?? 1,
        scrollX: viewport.scrollX ?? 0,
        scrollY: viewport.scrollY ?? 0
      },
      root: normalizeElement(inputRoot, "dom-1", viewport, true, { clipToViewport: true })
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
      children
    };
  }

  function snapshotDomElement(element, windowRef, containingBlockRect = null) {
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
    addPlaceholderMetadata(element, tagName, attributes, styles, windowRef);
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
        ...Array.from(element.children ?? []).map((child) => snapshotDomElement(child, windowRef, nextContainingBlockRect)),
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
    const textContent = cssContentText(styles.content);
    const rect = inferPseudoRect(pseudoName, ownerRect, containingBlockRect, styles, textContent);
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    return {
      tagName: pseudoName,
      nodeType: "pseudo",
      textContent,
      rect,
      styles,
      attributes: { "data-pseudo": pseudoName },
      children: []
    };
  }

  function safePseudoComputedStyle(element, pseudoName, windowRef) {
    try {
      return windowRef.getComputedStyle(element, pseudoName);
    } catch (error) {
      return null;
    }
  }

  function addPlaceholderMetadata(element, tagName, attributes, styles, windowRef) {
    if (!isTextInputElement(tagName)) {
      return;
    }

    const placeholder = typeof element.getAttribute === "function"
      ? element.getAttribute("placeholder")
      : element.placeholder;
    if (typeof placeholder === "string" && placeholder.length > 0) {
      attributes.placeholder = placeholder;
    }
    if (typeof element.value === "string" && element.value.length > 0) {
      attributes["data-has-value"] = "true";
    }

    const placeholderStyle = safePseudoComputedStyle(element, "::placeholder", windowRef);
    const placeholderColor = placeholderStyle?.color;
    if (typeof placeholderColor === "string" && placeholderColor.length > 0) {
      styles.placeholderColor = placeholderColor;
    }
  }

  function isTextInputElement(tagName) {
    const normalized = String(tagName ?? "").toLowerCase();
    return normalized === "input" || normalized === "textarea";
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
      cssContentText(styles.content).length > 0 ||
      visibleCssGradient(styles.backgroundImage) ||
      visibleCssImage(styles) ||
      visibleBorder(styles) ||
      visibleOutline(styles) ||
      visibleShadow(styles.boxShadow);
  }

  function inferPseudoRect(pseudoName, ownerRect, containingBlockRect, styles, textContent = "") {
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

    if (width <= 0 && textContent) {
      width = estimatePseudoTextWidth(textContent, styles);
    }
    if (height <= 0 && textContent) {
      height = estimatePseudoTextHeight(styles);
    }
    if (width <= 0 && hasLeft && hasRight) {
      width = Math.max(0, parent.width - left - right);
    }
    if (height <= 0 && hasTop && hasBottom) {
      height = Math.max(0, parent.height - top - bottom);
    }

    if (!hasLeft && !hasRight && !hasTop && !hasBottom && width > 0 && height > 0 && shouldUseStaticPseudoPosition(styles, position)) {
      const owner = normalizeRect(ownerRect);
      return {
        x: round(pseudoName === "::before" ? owner.x : owner.x + Math.max(0, owner.width - width)),
        y: round(owner.y + Math.max(0, (owner.height - height) / 2)),
        width: round(width),
        height: round(height)
      };
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

  function shouldUseStaticPseudoPosition(styles, position) {
    const display = cssKeyword(styles.display);
    return display === "inline" ||
      display === "inline-block" ||
      display === "inline-flex" ||
      ((visibleCssImage(styles) || cssContentText(styles.content).length > 0) && (position === "absolute" || position === "fixed"));
  }

  function cssContentText(value) {
    const content = String(value ?? "").trim();
    if (!content || content === "none" || content === "normal") {
      return "";
    }
    if (hasCssImageUrl(content)) {
      return "";
    }
    const matches = Array.from(content.matchAll(/(["'])((?:\\.|(?!\1).)*)\1/g));
    if (matches.length === 0) {
      return "";
    }
    return matches.map((match) => decodeCssString(match[2])).join("");
  }

  function decodeCssString(value) {
    return String(value ?? "")
      .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
      .replace(/\\(.)/g, "$1");
  }

  function estimatePseudoTextWidth(textContent, styles) {
    const fontSize = parseCssNumber(styles.fontSize) || 16;
    const letterSpacing = parseCssNumber(styles.letterSpacing);
    const characterCount = Array.from(String(textContent)).length;
    return round(Math.max(1, (characterCount * fontSize * 0.56) + Math.max(0, characterCount - 1) * letterSpacing));
  }

  function estimatePseudoTextHeight(styles) {
    const lineHeight = parseCssNumber(styles.lineHeight);
    const fontSize = parseCssNumber(styles.fontSize) || 16;
    return round(Math.max(1, lineHeight || fontSize * 1.2));
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
    return visibleBorderSide(styles.borderTopWidth, styles.borderTopColor, styles.borderTopStyle) ||
      visibleBorderSide(styles.borderRightWidth, styles.borderRightColor, styles.borderRightStyle) ||
      visibleBorderSide(styles.borderBottomWidth, styles.borderBottomColor, styles.borderBottomStyle) ||
      visibleBorderSide(styles.borderLeftWidth, styles.borderLeftColor, styles.borderLeftStyle);
  }

  function visibleBorderSide(width, color, style) {
    const normalizedStyle = typeof style === "string" ? style.trim().toLowerCase() : "";
    return parseCssNumber(width) > 0 &&
      visibleColor(color) &&
      normalizedStyle !== "none" &&
      normalizedStyle !== "hidden";
  }

  function visibleOutline(styles) {
    return visibleBorderSide(styles.outlineWidth, styles.outlineColor, styles.outlineStyle);
  }

  function visibleCssImage(styles) {
    return hasCssImageUrl(styles.content) ||
      hasCssImageUrl(styles.backgroundImage) ||
      hasCssImageUrl(styles.maskImage) ||
      hasCssImageUrl(styles.webkitMaskImage);
  }

  function visibleCssGradient(value) {
    return typeof value === "string" &&
      /(?:^|,)\s*(?:repeating-)?linear-gradient\(/i.test(value);
  }

  function hasCssImageUrl(value) {
    return typeof value === "string" &&
      value.length > 0 &&
      value !== "none" &&
      /url\((?:"[^"]+"|'[^']+'|[^)]*)\)/i.test(value);
  }

  function visibleShadow(value) {
    return typeof value === "string" && value.length > 0 && value !== "none";
  }

  function isRectInViewport(rect, viewport) {
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

  function normalizeRect(rect) {
    return {
      x: round(rect.x ?? rect.left ?? 0),
      y: round(rect.y ?? rect.top ?? 0),
      width: round(rect.width ?? 0),
      height: round(rect.height ?? 0)
    };
  }

  function clampRectToViewport(rect, viewport) {
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

  function round(value) {
    return Math.round(Number(value) * 100) / 100;
  }
})();
