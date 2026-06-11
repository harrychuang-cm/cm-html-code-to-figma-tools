export function createEditableLayoutNodeModels(packageData) {
  const fallbackReasons = new Map(
    (packageData.diagnostics?.fallbackReasons ?? []).map((item) => [item.sourceNodeId, item.reason])
  );
  const rootModel = createModel(packageData.capture.root, {
    parentRect: { x: 0, y: 0, width: 0, height: 0 },
    fallbackReasons
  });

  return rootModel ? [rootModel] : [];
}

export function summarizeAutoLayoutModels(models) {
  const applied = [];
  const skipped = [];

  walkModels(models, (model) => {
    if (!model.autoLayout) {
      return;
    }
    if (model.autoLayout.applied) {
      applied.push(model.autoLayout);
      return;
    }
    if (model.autoLayout.skippedReason) {
      skipped.push({
        sourceNodeId: model.sourceNodeId,
        reason: model.autoLayout.skippedReason
      });
    }
  });

  const confidenceValues = applied.map((item) => item.confidence ?? 0);
  return {
    appliedCount: applied.length,
    skippedCount: skipped.length,
    averageConfidence: confidenceValues.length === 0
      ? 0
      : round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length),
    skippedReasons: skipped
  };
}

function createModel(node, context) {
  if (!node) {
    return null;
  }

  const absoluteRect = geometryAdjustedAbsoluteRect(node, normalizeRect(node.rect));
  const rect = relativeRect(absoluteRect, context.parentRect);
  const children = (node.children ?? [])
    .map((child) => createModel(child, {
      parentRect: absoluteRect,
      fallbackReasons: context.fallbackReasons
    }))
    .filter(Boolean);
  const borderDecorations = createBorderDecorationModels(node, rect, absoluteRect);

  if (node.textContent && children.length > 0) {
    const textModel = createDirectTextModel(node, absoluteRect, children);
    const mixedChildren = [
      ...insertMixedContentTextChild(children, textModel, node),
      ...borderDecorations
    ];
    const autoLayout = inferAutoLayout(node, mixedChildren);
    return baseModel(node, "FRAME", rect, absoluteRect, {
      style: extractVisualStyle(node),
      autoLayout,
      clipsContent: shouldClipContent(node),
      children: orderedChildrenForAutoLayout(mixedChildren, autoLayout)
    });
  }

  if (node.textContent) {
    if (isDirectTableCellTextNode(node)) {
      return createTableCellTextModel(node, rect, absoluteRect, borderDecorations);
    }
    const textModel = createTextModel(node, rect, absoluteRect, inferTextAutoResize(node, rect));
    if (hasVisualBoxStyle(node.styles)) {
      const backingPadding = explicitCssPadding(node.styles);
      const shouldUsePaddedBacking = hasPositivePadding(backingPadding);
      const backingTextAutoResize = shouldUsePaddedBacking
        ? inferTextContentAutoResize(node, rect)
        : "HEIGHT";
      const backingTextSizing = textLayoutSizingForAutoResize(backingTextAutoResize);
      const childRect = shouldUsePaddedBacking
        ? contentRectFromPadding(rect, backingPadding)
        : { x: 0, y: 0, width: rect.width, height: rect.height };
      return baseModel(node, "FRAME", rect, absoluteRect, {
        name: `Text Background / ${node.textContent.slice(0, 32)}`,
        style: extractVisualStyle(node),
        autoLayout: shouldUsePaddedBacking && borderDecorations.length === 0
          ? textBackingAutoLayout(backingPadding, backingTextAutoResize)
          : null,
        children: [{
          ...textModel,
          textAutoResize: backingTextAutoResize,
          ...backingTextSizing,
          rect: childRect
        }, ...borderDecorations]
      });
    }
    return textModel;
  }

  if (node.fallbackRef) {
    return baseModel(node, "FALLBACK_IMAGE", rect, absoluteRect, {
      assetRef: node.fallbackRef,
      fallbackReason: context.fallbackReasons.get(node.sourceNodeId) ?? "raster fallback",
      assetKind: assetKindForNode(node),
      style: extractVisualStyle(node),
      children: []
    });
  }

  if (node.assetRef || node.tagName === "img") {
    return baseModel(node, "IMAGE", rect, absoluteRect, {
      assetRef: node.assetRef ?? null,
      assetKind: assetKindForNode(node),
      style: extractVisualStyle(node),
      children: []
    });
  }

  if (children.length > 0) {
    const frameChildren = [...children, ...borderDecorations];
    const autoLayout = inferAutoLayout(node, frameChildren);
    return baseModel(node, "FRAME", rect, absoluteRect, {
      style: extractVisualStyle(node),
      autoLayout,
      clipsContent: shouldClipContent(node),
      children: orderedChildrenForAutoLayout(frameChildren, autoLayout)
    });
  }

  if (!isRenderableNode(node)) {
    return null;
  }

  if (borderDecorations.length > 0) {
    return baseModel(node, "FRAME", rect, absoluteRect, {
      style: extractVisualStyle(node),
      autoLayout: null,
      clipsContent: shouldClipContent(node),
      children: borderDecorations
    });
  }

  return baseModel(node, "RECTANGLE", rect, absoluteRect, {
    style: extractVisualStyle(node),
    children: []
  });
}

function createBorderDecorationModels(node, rect, absoluteRect) {
  return borderDecorationSides(node.styles).map((side) => {
    const decorationRect = borderDecorationRect(side, rect);
    const decorationAbsoluteRect = {
      x: round(absoluteRect.x + decorationRect.x),
      y: round(absoluteRect.y + decorationRect.y),
      width: decorationRect.width,
      height: decorationRect.height
    };
    return {
      id: `${node.sourceNodeId}::border-${side.side}`,
      type: "RECTANGLE",
      name: `Border / ${side.side}`,
      sourceNodeId: `${node.sourceNodeId}::border-${side.side}`,
      rect: decorationRect,
      absoluteRect: decorationAbsoluteRect,
      styles: {
        position: "absolute",
        backgroundColor: side.color
      },
      style: {
        fills: [side.color],
        strokes: [],
        cornerRadius: 0,
        effects: [],
        text: null
      },
      children: []
    };
  });
}

function geometryAdjustedAbsoluteRect(node, absoluteRect) {
  if (node.nodeType !== "pseudo") {
    return absoluteRect;
  }

  const translation = transformTranslation(node.styles?.transform);
  if (Math.abs(translation.x) < 0.001 && Math.abs(translation.y) < 0.001) {
    return absoluteRect;
  }
  return {
    ...absoluteRect,
    x: round(absoluteRect.x + translation.x),
    y: round(absoluteRect.y + translation.y)
  };
}

function transformTranslation(transform) {
  const value = String(transform ?? "").trim();
  if (!value || value === "none") {
    return { x: 0, y: 0 };
  }

  const matrix = value.match(/^matrix\(([^)]+)\)$/i);
  if (matrix) {
    const parts = parseTransformNumbers(matrix[1]);
    return {
      x: parts.length >= 6 ? parts[4] : 0,
      y: parts.length >= 6 ? parts[5] : 0
    };
  }

  const matrix3d = value.match(/^matrix3d\(([^)]+)\)$/i);
  if (matrix3d) {
    const parts = parseTransformNumbers(matrix3d[1]);
    return {
      x: parts.length >= 16 ? parts[12] : 0,
      y: parts.length >= 16 ? parts[13] : 0
    };
  }

  const translate3d = value.match(/^translate3d\(([^)]+)\)$/i);
  if (translate3d) {
    const parts = parseTransformNumbers(translate3d[1]);
    return { x: parts[0] ?? 0, y: parts[1] ?? 0 };
  }

  const translateX = value.match(/^translateX\(([^)]+)\)$/i);
  if (translateX) {
    return { x: parseCssNumber(translateX[1]), y: 0 };
  }

  const translateY = value.match(/^translateY\(([^)]+)\)$/i);
  if (translateY) {
    return { x: 0, y: parseCssNumber(translateY[1]) };
  }

  const translate = value.match(/^translate\(([^)]+)\)$/i);
  if (translate) {
    const parts = parseTransformNumbers(translate[1]);
    return { x: parts[0] ?? 0, y: parts[1] ?? 0 };
  }

  return { x: 0, y: 0 };
}

function parseTransformNumbers(value) {
  return String(value ?? "")
    .split(/[\s,]+/)
    .map((part) => parseCssNumber(part))
    .filter((number) => Number.isFinite(number));
}

function borderDecorationRect(side, rect) {
  if (side.side === "top") {
    return { x: 0, y: 0, width: rect.width, height: side.width };
  }
  if (side.side === "right") {
    return { x: round(rect.width - side.width), y: 0, width: side.width, height: rect.height };
  }
  if (side.side === "bottom") {
    return { x: 0, y: round(rect.height - side.width), width: rect.width, height: side.width };
  }
  return { x: 0, y: 0, width: side.width, height: rect.height };
}

function baseModel(node, type, rect, absoluteRect, overrides = {}) {
  return {
    id: node.sourceNodeId,
    type,
    name: layerNameForNode(node, type),
    sourceNodeId: node.sourceNodeId,
    ...(node.nodeType === "pseudo" ? { pseudoType: node.tagName } : {}),
    ...(numericZIndex(node.styles?.zIndex) !== null ? { cssZIndex: String(node.styles.zIndex).trim() } : {}),
    rect,
    absoluteRect,
    styles: node.styles ?? {},
    ...overrides
  };
}

function createTextModel(node, rect, absoluteRect, textAutoResize) {
  const geometry = normalizeTallHugTextGeometry(node, rect, absoluteRect, textAutoResize);
  return baseModel(node, "TEXT", geometry.rect, geometry.absoluteRect, {
    text: node.textContent,
    textAutoResize,
    ...textLayoutSizingForAutoResize(textAutoResize),
    style: extractVisualStyle(node),
    children: []
  });
}

function createTableCellTextModel(node, rect, absoluteRect, borderDecorations) {
  const padding = explicitCssPadding(node.styles) ?? zeroPadding();
  const textAutoResize = tableCellTextAutoResize(node, rect);
  const textModel = createTextModel(
    node,
    tableCellTextRect(rect, padding, node.styles, textAutoResize),
    tableCellTextAbsoluteRect(absoluteRect, rect, padding, node.styles, textAutoResize),
    textAutoResize
  );
  return baseModel(node, "FRAME", rect, absoluteRect, {
    name: `Table Cell / ${String(node.textContent ?? "").slice(0, 32)}`,
    style: extractVisualStyle(node),
    autoLayout: borderDecorations.length === 0
      ? tableCellAutoLayout(padding, node)
      : null,
    children: [textModel, ...borderDecorations]
  });
}

function tableCellTextAutoResize(node, rect) {
  return isClippedSingleLineText(node, rect, node.styles ?? {})
    ? "TRUNCATE"
    : "WIDTH_AND_HEIGHT";
}

function tableCellTextRect(rect, padding, styles = {}, textAutoResize = "WIDTH_AND_HEIGHT") {
  if (textAutoResize !== "WIDTH_AND_HEIGHT") {
    return contentRectFromPadding(rect, padding);
  }

  const lineHeight = parseCssNumber(styles.lineHeight) || parseCssNumber(styles.fontSize) * 1.2 || rect.height;
  const textHeight = round(Math.min(rect.height, Math.max(1, lineHeight)));
  const contentHeight = Math.max(1, rect.height - padding.top - padding.bottom);
  const yOffset = tableCellVerticalOffset(styles.verticalAlign, contentHeight, textHeight);
  return {
    x: padding.left,
    y: round(padding.top + yOffset),
    width: round(Math.max(1, rect.width - padding.left - padding.right)),
    height: textHeight
  };
}

function tableCellTextAbsoluteRect(absoluteRect, rect, padding, styles, textAutoResize) {
  const childRect = tableCellTextRect(rect, padding, styles, textAutoResize);
  return {
    x: round(absoluteRect.x + childRect.x),
    y: round(absoluteRect.y + childRect.y),
    width: childRect.width,
    height: childRect.height
  };
}

function tableCellAutoLayout(padding, node) {
  const styles = node.styles ?? {};
  return {
    applied: true,
    layoutMode: "HORIZONTAL",
    itemSpacing: 0,
    primaryAxisAlignItems: tableCellPrimaryAxisAlignment(styles.textAlign, node.attributes?.class),
    counterAxisAlignItems: tableCellCounterAxisAlignment(styles.verticalAlign),
    paddingLeft: padding.left,
    paddingRight: padding.right,
    paddingTop: padding.top,
    paddingBottom: padding.bottom,
    confidence: 0.9
  };
}

function tableCellPrimaryAxisAlignment(textAlign, className = "") {
  const normalized = normalizeCssKeyword(textAlign);
  if (normalized === "right" || normalized === "end" || normalized === "-webkit-right") {
    return "MAX";
  }
  if (normalized === "center" || normalized === "-webkit-center") {
    return "CENTER";
  }
  const classes = classTokens(className);
  if (classes.has("text-right") || classes.has("text-end")) {
    return "MAX";
  }
  if (classes.has("text-center")) {
    return "CENTER";
  }
  if (classes.has("text-left") || classes.has("text-start")) {
    return "MIN";
  }
  return "MIN";
}

function tableCellCounterAxisAlignment(verticalAlign) {
  const normalized = normalizeCssKeyword(verticalAlign);
  if (normalized === "top" || normalized === "text-top" || normalized === "super") {
    return "MIN";
  }
  if (normalized === "bottom" || normalized === "text-bottom" || normalized === "sub") {
    return "MAX";
  }
  return "CENTER";
}

function tableCellVerticalOffset(verticalAlign, contentHeight, textHeight) {
  const available = Math.max(0, contentHeight - textHeight);
  const alignment = tableCellCounterAxisAlignment(verticalAlign);
  if (alignment === "MIN") {
    return 0;
  }
  if (alignment === "MAX") {
    return round(available);
  }
  return round(available / 2);
}

function isDirectTableCellTextNode(node) {
  const tagName = String(node.tagName ?? "").toLowerCase();
  const display = normalizeCssKeyword(node.styles?.display);
  return tagName === "td" || tagName === "th" || display === "table-cell";
}

function classTokens(className) {
  return new Set(String(className ?? "").split(/\s+/).filter(Boolean));
}

function createDirectTextModel(node, parentAbsoluteRect, children) {
  const absoluteRect = inferDirectTextRect(node, parentAbsoluteRect, children);
  const rect = relativeRect(absoluteRect, parentAbsoluteRect);
  const styles = { ...(node.styles ?? {}) };
  delete styles.zIndex;
  const textNode = {
    ...node,
    sourceNodeId: `${node.sourceNodeId}::text`,
    tagName: "#text",
    children: [],
    rect: absoluteRect,
    styles
  };
  return createTextModel(textNode, rect, absoluteRect, inferTextContentAutoResize(textNode, rect));
}

function insertMixedContentTextChild(children, textModel, node) {
  const flexDirection = node.styles?.flexDirection ?? "row";
  const layoutMode = flexDirection.startsWith("column") ? "VERTICAL" : "HORIZONTAL";
  const sorted = (items) => [...items].sort((a, b) => layoutMode === "HORIZONTAL"
    ? a.absoluteRect.x - b.absoluteRect.x
    : a.absoluteRect.y - b.absoluteRect.y);
  const beforeChildren = sorted(children.filter(isBeforePseudoModel));
  const afterChildren = sorted(children.filter(isAfterPseudoModel));
  const flowChildren = sorted(children.filter((child) => !isBeforePseudoModel(child) && !isAfterPseudoModel(child)));
  return [
    ...beforeChildren,
    ...sorted([...flowChildren, textModel]),
    ...afterChildren
  ];
}

function isBeforePseudoModel(model) {
  return model.pseudoType === "::before" || model.name?.endsWith(" / ::before");
}

function isAfterPseudoModel(model) {
  return model.pseudoType === "::after" || model.name?.endsWith(" / ::after");
}

function inferDirectTextRect(node, parentRect, children) {
  const styles = node.styles ?? {};
  const flexDirection = styles.flexDirection ?? "row";
  const layoutMode = flexDirection.startsWith("column") ? "VERTICAL" : "HORIZONTAL";
  const padding = explicitCssPadding(styles) ?? zeroPadding();
  const parentStart = layoutMode === "HORIZONTAL"
    ? parentRect.x + padding.left
    : parentRect.y + padding.top;
  const parentEnd = layoutMode === "HORIZONTAL"
    ? parentRect.x + Math.max(0, parentRect.width - padding.right)
    : parentRect.y + Math.max(0, parentRect.height - padding.bottom);
  const crossStart = layoutMode === "HORIZONTAL"
    ? parentRect.y + padding.top
    : parentRect.x + padding.left;
  const crossSize = layoutMode === "HORIZONTAL"
    ? Math.max(1, parentRect.height - padding.top - padding.bottom)
    : Math.max(1, parentRect.width - padding.left - padding.right);
  const sorted = children
    .filter((child) => directTextChildOverlapsContent(child, layoutMode, parentStart, parentEnd))
    .sort((a, b) => layoutMode === "HORIZONTAL"
    ? a.absoluteRect.x - b.absoluteRect.x
    : a.absoluteRect.y - b.absoluteRect.y);
  const segments = [];
  let cursor = parentStart;

  for (const child of sorted) {
    const rawChildStart = layoutMode === "HORIZONTAL" ? child.absoluteRect.x : child.absoluteRect.y;
    const rawChildEnd = rawChildStart + (layoutMode === "HORIZONTAL" ? child.absoluteRect.width : child.absoluteRect.height);
    const childStart = clamp(rawChildStart, parentStart, parentEnd);
    const childEnd = clamp(rawChildEnd, parentStart, parentEnd);
    addDirectTextSegment(segments, cursor, childStart, cursor > parentStart, true);
    cursor = Math.max(cursor, childEnd);
  }
  addDirectTextSegment(segments, cursor, parentEnd, cursor > parentStart, false);

  const bestSegment = segments.sort((a, b) => b.size - a.size)[0];
  if (!bestSegment) {
    return { ...parentRect };
  }

  const estimatedTextSize = Math.min(bestSegment.size, estimateTextPrimarySize(node.textContent, styles));
  const start = bestSegment.hasPrevious && bestSegment.hasNext
    ? bestSegment.end - estimatedTextSize
    : bestSegment.start;
  if (layoutMode === "HORIZONTAL") {
    return {
      x: round(start),
      y: round(crossStart),
      width: round(Math.max(1, estimatedTextSize)),
      height: round(crossSize)
    };
  }
  return {
    x: round(crossStart),
    y: round(start),
    width: round(crossSize),
    height: round(Math.max(1, estimatedTextSize))
  };
}

function directTextChildOverlapsContent(child, layoutMode, parentStart, parentEnd) {
  const childStart = layoutMode === "HORIZONTAL" ? child.absoluteRect.x : child.absoluteRect.y;
  const childEnd = childStart + (layoutMode === "HORIZONTAL" ? child.absoluteRect.width : child.absoluteRect.height);
  return childEnd > parentStart + 0.5 && childStart < parentEnd - 0.5;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function addDirectTextSegment(segments, start, end, hasPrevious, hasNext) {
  const size = end - start;
  if (size > 0.5) {
    segments.push({ start, end, size, hasPrevious, hasNext });
  }
}

function estimateTextPrimarySize(text, styles = {}) {
  const fontSize = parseCssNumber(styles.fontSize) || 14;
  let width = 0;
  for (const char of String(text ?? "")) {
    if (/\s/.test(char)) {
      width += fontSize * 0.33;
    } else if (/[\u3000-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(char)) {
      width += fontSize;
    } else if (/[.,:;!|]/.test(char)) {
      width += fontSize * 0.33;
    } else {
      width += fontSize * 0.56;
    }
  }
  return round(Math.max(fontSize * 0.5, width));
}

function inferAutoLayout(node, children) {
  const styles = node.styles ?? {};
  const display = styles.display ?? "";
  const position = styles.position ?? "";

  if (position === "fixed" || position === "sticky") {
    return skippedLayout("fixed-or-sticky-layout");
  }
  if (display === "grid" || display === "inline-grid") {
    return skippedLayout("complex-grid");
  }
  const isFlex = display === "flex" || display === "inline-flex";
  const canTrySingleChildAlignment = children.length === 1 &&
    (isFlex || hasPotentialLineHeightAlignment(node, children[0]));
  if (!isFlex && !canTrySingleChildAlignment) {
    return null;
  }
  if (!hasUsableBounds(node.rect) || children.some((child) => !hasUsableBounds(child.absoluteRect))) {
    return skippedLayout("missing-bounds");
  }
  if (hasAbsolutePositionedChild(children)) {
    return skippedLayout("absolute-position-child");
  }

  const parentRect = normalizeRect(node.rect);
  if (hasOutOfBoundsChild(parentRect, children)) {
    return skippedLayout("out-of-bounds-child");
  }

  if (children.length === 1) {
    const singleChildLayout = inferSingleChildTextAutoLayout(node, children[0], parentRect);
    if (singleChildLayout) {
      return singleChildLayout;
    }
    if (isFlex) {
      return skippedLayout("one-child-container");
    }
    return null;
  }

  if (!isFlex) {
    return null;
  }
  if (children.length < 2) {
    return skippedLayout("one-child-container");
  }

  const flexDirection = styles.flexDirection ?? "row";
  const layoutMode = flexDirection.startsWith("column") ? "VERTICAL" : "HORIZONTAL";
  if (hasPrimaryAxisOverlap(children, layoutMode)) {
    return skippedLayout("overlapping-layout");
  }

  const primaryAxisAlignItems = primaryAxisAlignmentFromCss(styles.justifyContent);
  const counterAxisAlignItems = counterAxisAlignmentFromCss(styles.alignItems);
  if (hasNonUniformImplicitSpacing(styles, children, layoutMode, primaryAxisAlignItems)) {
    return skippedLayout("non-uniform-spacing");
  }
  const spacing = explicitSpacing(styles, layoutMode) ?? measuredSpacing(children, layoutMode);
  const paddingResult = resolvePadding(styles, parentRect, children);
  const padding = alignmentAwarePadding(
    paddingResult.padding,
    layoutMode,
    primaryAxisAlignItems,
    counterAxisAlignItems,
    paddingResult.explicit
  );

  return {
    applied: true,
    layoutMode,
    itemSpacing: spacing,
    primaryAxisAlignItems,
    counterAxisAlignItems,
    paddingLeft: padding.left,
    paddingRight: padding.right,
    paddingTop: padding.top,
    paddingBottom: padding.bottom,
    reversedChildren: isReverseFlexDirection(flexDirection),
    confidence: 0.92
  };
}

function orderedChildrenForAutoLayout(children, autoLayout) {
  if (autoLayout?.applied && autoLayout.reversedChildren) {
    return [...children].reverse();
  }
  if (!autoLayout?.applied) {
    return stackOrderedChildren(children);
  }
  return children;
}

function stackOrderedChildren(children) {
  if (!children.some((child) => numericZIndex(child.styles?.zIndex) !== null)) {
    return children;
  }
  return children
    .map((child, index) => ({ child, index, zIndex: numericZIndex(child.styles?.zIndex) ?? 0 }))
    .sort((a, b) => a.zIndex - b.zIndex || a.index - b.index)
    .map((item) => item.child);
}

function numericZIndex(value) {
  const normalized = String(value ?? "").trim();
  if (!/^-?\d+$/.test(normalized)) {
    return null;
  }
  return Number(normalized);
}

function isReverseFlexDirection(value) {
  const normalized = normalizeCssKeyword(value);
  return normalized === "row-reverse" || normalized === "column-reverse";
}

function hasAbsolutePositionedChild(children) {
  return children.some((child) => normalizeCssKeyword(child.styles?.position) === "absolute");
}

function inferSingleChildTextAutoLayout(node, child, parentRect) {
  const styles = node.styles ?? {};
  const display = styles.display ?? "";
  const isFlex = display === "flex" || display === "inline-flex";
  const text = String(child.text ?? "");
  if (child.type !== "TEXT" || text.includes("\n")) {
    return null;
  }

  const flexDirection = styles.flexDirection ?? "row";
  const layoutMode = isFlex && flexDirection.startsWith("column") ? "VERTICAL" : "HORIZONTAL";
  const primaryAxisAlignItems = primaryAxisAlignmentFromCss(styles.justifyContent);
  let counterAxisAlignItems = counterAxisAlignmentFromCss(styles.alignItems);
  const hasFlexAlignment = isFlex && Boolean(primaryAxisAlignItems || counterAxisAlignItems);
  const hasLineHeightAlignment = hasLineHeightAlignmentEvidence(styles, child, parentRect);
  if (!hasFlexAlignment && parentRect.height <= child.absoluteRect.height + 1) {
    return null;
  }
  if (!hasFlexAlignment && !hasLineHeightAlignment) {
    return null;
  }
  if (hasLineHeightAlignment && layoutMode === "HORIZONTAL" && !counterAxisAlignItems) {
    counterAxisAlignItems = "CENTER";
  }

  const paddingResult = resolvePadding(styles, parentRect, [child]);
  const padding = alignmentAwarePadding(
    paddingResult.padding,
    layoutMode,
    primaryAxisAlignItems,
    counterAxisAlignItems,
    paddingResult.explicit
  );

  return {
    applied: true,
    layoutMode,
    itemSpacing: 0,
    primaryAxisAlignItems,
    counterAxisAlignItems,
    paddingLeft: padding.left,
    paddingRight: padding.right,
    paddingTop: padding.top,
    paddingBottom: padding.bottom,
    confidence: 0.86
  };
}

function hasLineHeightAlignmentEvidence(styles, child, parentRect) {
  const parentLineHeight = parseCssNumber(styles.lineHeight);
  const childLineHeight = parseCssNumber(child.style?.text?.lineHeight);
  return approximatelyEqual(parentLineHeight, parentRect.height, 1) ||
    approximatelyEqual(childLineHeight, parentRect.height, 1);
}

function hasPotentialLineHeightAlignment(node, child) {
  const styles = node.styles ?? {};
  return child?.type === "TEXT" &&
    (parseCssNumber(styles.lineHeight) > 0 || parseCssNumber(child.style?.text?.lineHeight) > 0);
}

function approximatelyEqual(value, expected, tolerance) {
  return value > 0 && Math.abs(value - expected) <= tolerance;
}

function alignmentAwarePadding(padding, layoutMode, primaryAxisAlignItems, counterAxisAlignItems, explicitPadding = false) {
  const nextPadding = { ...padding };
  if (explicitPadding) {
    return nextPadding;
  }
  if (shouldLetAlignmentControlAxis(primaryAxisAlignItems)) {
    if (layoutMode === "HORIZONTAL") {
      nextPadding.left = 0;
      nextPadding.right = 0;
    } else {
      nextPadding.top = 0;
      nextPadding.bottom = 0;
    }
  }
  if (shouldLetAlignmentControlAxis(counterAxisAlignItems)) {
    if (layoutMode === "HORIZONTAL") {
      nextPadding.top = 0;
      nextPadding.bottom = 0;
    } else {
      nextPadding.left = 0;
      nextPadding.right = 0;
    }
  }
  return nextPadding;
}

function shouldLetAlignmentControlAxis(value) {
  return value === "CENTER" || value === "MAX";
}

function counterAxisAlignmentFromCss(value) {
  const normalized = normalizeCssKeyword(value);
  if (normalized === "center") {
    return "CENTER";
  }
  if (normalized === "flex-end" || normalized === "end" || normalized === "self-end") {
    return "MAX";
  }
  if (normalized === "flex-start" || normalized === "start" || normalized === "self-start") {
    return "MIN";
  }
  if (normalized === "baseline") {
    return "BASELINE";
  }
  return undefined;
}

function primaryAxisAlignmentFromCss(value) {
  const normalized = normalizeCssKeyword(value);
  if (normalized === "center") {
    return "CENTER";
  }
  if (normalized === "flex-end" || normalized === "end" || normalized === "right" || normalized === "bottom") {
    return "MAX";
  }
  if (normalized === "space-between") {
    return "SPACE_BETWEEN";
  }
  if (normalized === "flex-start" || normalized === "start" || normalized === "left" || normalized === "top") {
    return "MIN";
  }
  return undefined;
}

function normalizeCssKeyword(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function hasOutOfBoundsChild(parentRect, children) {
  const tolerance = 1;
  const parentRight = parentRect.x + parentRect.width;
  const parentBottom = parentRect.y + parentRect.height;

  return children.some((child) => {
    if (isNonvisualWrapper(child)) {
      return true;
    }

    const childRect = child.absoluteRect;
    if (
      childRect.x < parentRect.x - tolerance ||
      childRect.y < parentRect.y - tolerance ||
      childRect.x + childRect.width > parentRight + tolerance ||
      childRect.y + childRect.height > parentBottom + tolerance
    ) {
      return true;
    }

    return child.rect.x < -tolerance || child.rect.y < -tolerance;
  });
}

function isNonvisualWrapper(child) {
  return child.type === "FRAME" &&
    (child.children?.length ?? 0) > 0 &&
    child.absoluteRect.width <= 1 &&
    child.absoluteRect.height <= 1 &&
    !hasModelVisualStyle(child.style);
}

function hasModelVisualStyle(style = {}) {
  return (style.fills?.length ?? 0) > 0 ||
    (style.strokes?.length ?? 0) > 0 ||
    (style.effects?.length ?? 0) > 0;
}

function inferTextAutoResize(node, rect) {
  if (hasVisualBoxStyle(node.styles)) {
    return "HEIGHT";
  }
  return inferTextContentAutoResize(node, rect);
}

function inferTextContentAutoResize(node, rect) {
  if (String(node.textContent ?? "").includes("\n")) {
    return "HEIGHT";
  }

  const styles = node.styles ?? {};
  if (isClippedSingleLineText(node, rect, styles)) {
    return "TRUNCATE";
  }

  const lineHeight = parseCssNumber(styles.lineHeight) || parseCssNumber(styles.fontSize) * 1.2;
  if (lineHeight > 0 && rect.height > lineHeight * 1.75) {
    if (shouldPreserveTallSingleLineHug(node, rect, styles)) {
      return "WIDTH_AND_HEIGHT";
    }
    return "HEIGHT";
  }

  return "WIDTH_AND_HEIGHT";
}

function shouldPreserveTallSingleLineHug(node, rect, styles) {
  return (isSyntheticDirectTextNode(node) || isInteractiveSingleLineTextElement(node)) &&
    fitsEstimatedSingleLineText(node, rect, styles);
}

function normalizeTallHugTextGeometry(node, rect, absoluteRect, textAutoResize) {
  if (textAutoResize !== "WIDTH_AND_HEIGHT") {
    return { rect, absoluteRect };
  }

  const styles = node.styles ?? {};
  const lineHeight = parseCssNumber(styles.lineHeight) || parseCssNumber(styles.fontSize) * 1.2;
  if (!(lineHeight > 0) || rect.height <= lineHeight + 1) {
    return { rect, absoluteRect };
  }

  if (!shouldNormalizeTallSingleLineHugGeometry(node, rect, styles)) {
    return { rect, absoluteRect };
  }

  const height = round(Math.min(rect.height, lineHeight));
  const yOffset = round((rect.height - height) / 2);
  return {
    rect: {
      ...rect,
      y: round(rect.y + yOffset),
      height
    },
    absoluteRect: {
      ...absoluteRect,
      y: round(absoluteRect.y + yOffset),
      height
    }
  };
}

function shouldNormalizeTallSingleLineHugGeometry(node, rect, styles) {
  return (isSynthesizedDirectTextNode(node) || isInteractiveSingleLineTextElement(node)) &&
    fitsEstimatedSingleLineText(node, rect, styles);
}

function isSynthesizedDirectTextNode(node) {
  return String(node.sourceNodeId ?? "").endsWith("::text");
}

function isSyntheticDirectTextNode(node) {
  return node.tagName === "#text" || String(node.sourceNodeId ?? "").endsWith("::text");
}

function isInteractiveSingleLineTextElement(node) {
  const tagName = String(node.tagName ?? "").toLowerCase();
  const role = String(node.attributes?.role ?? "").toLowerCase();
  return tagName === "a" ||
    tagName === "button" ||
    role === "tab" ||
    role === "button" ||
    role === "link" ||
    role === "menuitem";
}

function fitsEstimatedSingleLineText(node, rect, styles) {
  if (rect.width <= 0) {
    return false;
  }
  const fontSize = parseCssNumber(styles.fontSize) || 14;
  const tolerance = Math.max(2, fontSize * 0.25);
  return estimateTextPrimarySize(node.textContent, styles) <= rect.width + tolerance;
}

function isClippedSingleLineText(node, rect, styles) {
  const overflow = normalizeCssKeyword(styles.overflow);
  const overflowX = normalizeCssKeyword(styles.overflowX);
  const textOverflow = normalizeCssKeyword(styles.textOverflow);
  const whiteSpace = normalizeCssKeyword(styles.whiteSpace);
  const clipsInline = textOverflow === "ellipsis" ||
    clipsOverflowKeyword(overflowX) ||
    clipsOverflowShorthand(overflow, "x");
  const preventsWrapping = whiteSpace === "nowrap" ||
    whiteSpace === "pre" ||
    whiteSpace === "pre-wrap";
  if (!clipsInline || !preventsWrapping || rect.width <= 0) {
    return false;
  }

  return estimateTextPrimarySize(node.textContent, styles) > rect.width + 1;
}

function textBackingAutoLayout(padding, textAutoResize) {
  const isSingleLineHugText = textAutoResize === "WIDTH_AND_HEIGHT";
  return {
    applied: true,
    layoutMode: "HORIZONTAL",
    itemSpacing: 0,
    primaryAxisAlignItems: isSingleLineHugText ? "CENTER" : "MIN",
    counterAxisAlignItems: isSingleLineHugText ? "CENTER" : "MIN",
    paddingLeft: padding.left,
    paddingRight: padding.right,
    paddingTop: padding.top,
    paddingBottom: padding.bottom,
    confidence: 0.9
  };
}

function contentRectFromPadding(rect, padding) {
  return {
    x: padding.left,
    y: padding.top,
    width: round(Math.max(1, rect.width - padding.left - padding.right)),
    height: round(Math.max(1, rect.height - padding.top - padding.bottom))
  };
}

function hasPositivePadding(padding) {
  return Boolean(padding) && (
    padding.left > 0 ||
    padding.right > 0 ||
    padding.top > 0 ||
    padding.bottom > 0
  );
}

function zeroPadding() {
  return {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0
  };
}

function textLayoutSizingForAutoResize(textAutoResize) {
  if (textAutoResize === "WIDTH_AND_HEIGHT") {
    return {
      layoutSizingHorizontal: "HUG",
      layoutSizingVertical: "HUG"
    };
  }

  return {
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "HUG"
  };
}

function skippedLayout(skippedReason) {
  return {
    applied: false,
    skippedReason,
    confidence: 0
  };
}

function hasPrimaryAxisOverlap(children, layoutMode) {
  const sorted = [...children].sort((a, b) => layoutMode === "HORIZONTAL"
    ? a.absoluteRect.x - b.absoluteRect.x
    : a.absoluteRect.y - b.absoluteRect.y);

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1].absoluteRect;
    const current = sorted[index].absoluteRect;
    const previousEnd = layoutMode === "HORIZONTAL"
      ? previous.x + previous.width
      : previous.y + previous.height;
    const currentStart = layoutMode === "HORIZONTAL" ? current.x : current.y;
    if (currentStart < previousEnd - 0.5) {
      return true;
    }
  }
  return false;
}

function explicitSpacing(styles, layoutMode) {
  const axisGap = layoutMode === "HORIZONTAL" ? styles.columnGap : styles.rowGap;
  const parsedAxis = parseCssNumber(axisGap);
  if (parsedAxis > 0) {
    return parsedAxis;
  }
  const parsedGap = parseCssNumber(styles.gap);
  return parsedGap > 0 ? parsedGap : null;
}

function measuredSpacing(children, layoutMode) {
  const gaps = primaryAxisGaps(children, layoutMode);
  if (gaps.length === 0) {
    return 0;
  }
  gaps.sort((a, b) => a - b);
  return round(gaps[Math.floor(gaps.length / 2)]);
}

function hasNonUniformImplicitSpacing(styles, children, layoutMode, primaryAxisAlignItems) {
  if (children.length < 3 || primaryAxisAlignItems === "SPACE_BETWEEN") {
    return false;
  }
  const gaps = primaryAxisGaps(children, layoutMode).sort((a, b) => a - b);
  if (gaps.length < 2) {
    return false;
  }

  const expectedGap = explicitSpacing(styles, layoutMode) ?? gaps[0];
  const largestGap = gaps[gaps.length - 1];
  const minimumDelta = 32;
  return largestGap - expectedGap > minimumDelta &&
    largestGap > Math.max(expectedGap * 3, expectedGap + minimumDelta);
}

function primaryAxisGaps(children, layoutMode) {
  const sorted = [...children].sort((a, b) => layoutMode === "HORIZONTAL"
    ? a.absoluteRect.x - b.absoluteRect.x
    : a.absoluteRect.y - b.absoluteRect.y);
  const gaps = [];

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1].absoluteRect;
    const current = sorted[index].absoluteRect;
    const gap = layoutMode === "HORIZONTAL"
      ? current.x - (previous.x + previous.width)
      : current.y - (previous.y + previous.height);
    if (gap >= 0) {
      gaps.push(gap);
    }
  }
  return gaps;
}

function inferPadding(parentRect, children) {
  const minX = Math.min(...children.map((child) => child.absoluteRect.x));
  const minY = Math.min(...children.map((child) => child.absoluteRect.y));
  const maxX = Math.max(...children.map((child) => child.absoluteRect.x + child.absoluteRect.width));
  const maxY = Math.max(...children.map((child) => child.absoluteRect.y + child.absoluteRect.height));

  return {
    left: round(Math.max(0, minX - parentRect.x)),
    right: round(Math.max(0, parentRect.x + parentRect.width - maxX)),
    top: round(Math.max(0, minY - parentRect.y)),
    bottom: round(Math.max(0, parentRect.y + parentRect.height - maxY))
  };
}

function resolvePadding(styles, parentRect, children) {
  const explicit = explicitCssPadding(styles);
  if (explicit) {
    return {
      padding: explicit,
      explicit: true
    };
  }
  return {
    padding: inferPadding(parentRect, children),
    explicit: false
  };
}

function explicitCssPadding(styles = {}) {
  const properties = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"];
  const hasPadding = properties.some((property) => styles[property] !== undefined && styles[property] !== "");
  if (!hasPadding) {
    return null;
  }
  return {
    left: round(Math.max(0, parseCssNumber(styles.paddingLeft))),
    right: round(Math.max(0, parseCssNumber(styles.paddingRight))),
    top: round(Math.max(0, parseCssNumber(styles.paddingTop))),
    bottom: round(Math.max(0, parseCssNumber(styles.paddingBottom)))
  };
}

function extractVisualStyle(node) {
  const styles = node.styles ?? {};
  return {
    fills: cssFillsFromStyles(styles),
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

function layerNameForNode(node, type) {
  if (type === "TEXT") {
    return `Text / ${node.textContent.slice(0, 32)}`;
  }
  if (type === "FALLBACK_IMAGE") {
    return `Fallback / ${node.tagName}`;
  }
  if (type === "IMAGE") {
    return assetKindForNode(node) === "svg"
      ? `Vector / ${node.attributes?.alt || node.tagName}`
      : `Image / ${node.attributes?.alt || node.tagName}`;
  }
  if (type === "FRAME") {
    return `Frame / ${node.tagName}`;
  }
  return `Shape / ${node.tagName}`;
}

function isRenderableNode(node) {
  return Boolean(
    node.textContent ||
    node.assetRef ||
    node.fallbackRef ||
    hasVisualBoxStyle(node.styles)
  );
}

function hasVisualBoxStyle(styles = {}) {
  return Boolean(
    visibleColor(styles.backgroundColor) ||
    visibleCssLinearGradient(styles.backgroundImage) ||
    cssStrokesFromStyles(styles).length > 0 ||
    borderDecorationSides(styles).length > 0 ||
    visibleShadow(styles.boxShadow)
  );
}

function shouldClipContent(node) {
  const styles = node.styles ?? {};
  return clipsOverflowShorthand(styles.overflow, "x") ||
    clipsOverflowShorthand(styles.overflow, "y") ||
    clipsOverflowKeyword(styles.overflowX) ||
    clipsOverflowKeyword(styles.overflowY);
}

function clipsOverflowShorthand(value, axis) {
  if (typeof value !== "string") {
    return false;
  }
  const parts = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return false;
  }
  if (parts.length === 1) {
    return clipsOverflowKeyword(parts[0]);
  }
  const axisValue = axis === "y" ? parts[1] : parts[0];
  return clipsOverflowKeyword(axisValue);
}

function clipsOverflowKeyword(value) {
  const keyword = normalizeCssKeyword(value);
  return keyword === "hidden" ||
    keyword === "clip" ||
    keyword === "scroll" ||
    keyword === "auto" ||
    keyword === "overlay";
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

function visibleColor(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value !== "transparent" &&
    value !== "rgba(0, 0, 0, 0)";
}

function cssFillsFromStyles(styles = {}) {
  const fills = [];
  if (visibleColor(styles.backgroundColor)) {
    fills.push(styles.backgroundColor);
  }
  if (visibleCssLinearGradient(styles.backgroundImage)) {
    fills.push(styles.backgroundImage);
  }
  return fills;
}

function visibleCssLinearGradient(value) {
  return typeof value === "string" &&
    /(?:^|,)\s*(?:repeating-)?linear-gradient\(/i.test(value);
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

function hasUsableBounds(rect) {
  return rect &&
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0;
}

function relativeRect(rect, parentRect) {
  return {
    x: round(rect.x - (parentRect.x ?? 0)),
    y: round(rect.y - (parentRect.y ?? 0)),
    width: rect.width,
    height: rect.height
  };
}

function normalizeRect(rect = {}) {
  return {
    x: Number(rect.x ?? 0),
    y: Number(rect.y ?? 0),
    width: Number(rect.width ?? 0),
    height: Number(rect.height ?? 0)
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

function walkModels(models, visit) {
  for (const model of models) {
    visit(model);
    walkModels(model.children ?? [], visit);
  }
}

function round(value) {
  return Math.round(value * 100) / 100;
}
