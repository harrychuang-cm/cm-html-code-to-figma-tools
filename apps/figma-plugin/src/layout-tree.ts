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

  const absoluteRect = normalizeRect(node.rect);
  const rect = relativeRect(absoluteRect, context.parentRect);
  const children = (node.children ?? [])
    .map((child) => createModel(child, {
      parentRect: absoluteRect,
      fallbackReasons: context.fallbackReasons
    }))
    .filter(Boolean);

  if (node.textContent) {
    const textAutoResize = inferTextAutoResize(node, rect);
    const textModel = baseModel(node, "TEXT", rect, absoluteRect, {
      text: node.textContent,
      textAutoResize,
      ...textLayoutSizingForAutoResize(textAutoResize),
      style: extractVisualStyle(node),
      children: []
    });
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
        autoLayout: shouldUsePaddedBacking ? textBackingAutoLayout(backingPadding, backingTextAutoResize) : null,
        children: [{
          ...textModel,
          textAutoResize: backingTextAutoResize,
          ...backingTextSizing,
          rect: childRect
        }]
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
    const autoLayout = inferAutoLayout(node, children);
    return baseModel(node, "FRAME", rect, absoluteRect, {
      style: extractVisualStyle(node),
      autoLayout,
      clipsContent: shouldClipContent(node),
      children: orderedChildrenForAutoLayout(children, autoLayout)
    });
  }

  if (!isRenderableNode(node)) {
    return null;
  }

  return baseModel(node, "RECTANGLE", rect, absoluteRect, {
    style: extractVisualStyle(node),
    children: []
  });
}

function baseModel(node, type, rect, absoluteRect, overrides = {}) {
  return {
    id: node.sourceNodeId,
    type,
    name: layerNameForNode(node, type),
    sourceNodeId: node.sourceNodeId,
    rect,
    absoluteRect,
    ...overrides
  };
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
  return children;
}

function isReverseFlexDirection(value) {
  const normalized = normalizeCssKeyword(value);
  return normalized === "row-reverse" || normalized === "column-reverse";
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
  const lineHeight = parseCssNumber(styles.lineHeight) || parseCssNumber(styles.fontSize) * 1.2;
  if (lineHeight > 0 && rect.height > lineHeight * 1.75) {
    return "HEIGHT";
  }

  return "WIDTH_AND_HEIGHT";
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
    visibleBorder(styles) ||
    visibleShadow(styles.boxShadow)
  );
}

function shouldClipContent(node) {
  const overflow = node.styles?.overflow;
  return overflow === "hidden" || overflow === "clip" || overflow === "scroll" || overflow === "auto";
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

function visibleBorder(styles) {
  return parseCssNumber(styles.borderTopWidth) > 0 && visibleColor(styles.borderTopColor);
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
