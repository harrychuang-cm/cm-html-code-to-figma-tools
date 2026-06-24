import { createSemanticNameMap } from "./semantic-naming.ts";
import { iconFontImageAssetForNode } from "./icon-font.ts";

export function createEditableLayoutNodeModels(packageData) {
  const fallbackReasons = new Map(
    (packageData.diagnostics?.fallbackReasons ?? []).map((item) => [item.sourceNodeId, item.reason])
  );
  const rootModel = createModel(packageData.capture.root, {
    parentRect: { x: 0, y: 0, width: 0, height: 0 },
    fallbackReasons,
    backdropColor: null,
    clippedAncestor: false,
    textFillGradient: null
  });

  if (!rootModel) {
    return [];
  }

  try {
    const semanticNaming = createSemanticNameMap(packageData.capture.root, packageData.capture.viewport);
    const semanticNameCount = applySemanticNamesToModels(rootModel, semanticNaming.names);
    const collapsedWrappers = collapseNonVisualWrappers(rootModel, semanticNaming.names);
    rootModel.semanticNamingSummary = {
      semanticNames: semanticNameCount,
      repeatedGroups: semanticNaming.repeatedGroupCount,
      collapsedWrappers
    };
  } catch {
    rootModel.semanticNamingSummary = { semanticNames: 0, repeatedGroups: 0, collapsedWrappers: 0 };
  }

  return [rootModel];
}

export function summarizeSemanticNamingModels(models) {
  const summary = models?.[0]?.semanticNamingSummary;
  return {
    semanticNames: summary?.semanticNames ?? 0,
    repeatedGroups: summary?.repeatedGroups ?? 0,
    collapsedWrappers: summary?.collapsedWrappers ?? 0
  };
}

function applySemanticNamesToModels(rootModel, names) {
  const consumed = new Set();
  let renamed = 0;

  const visit = (model) => {
    if (model.sourceNodeId && names.has(model.sourceNodeId) && !consumed.has(model.sourceNodeId)) {
      consumed.add(model.sourceNodeId);
      model.name = names.get(model.sourceNodeId);
      renamed += 1;
    }
    for (const child of model.children ?? []) {
      visit(child);
    }
  };

  visit(rootModel);
  return renamed;
}

export function collapseNonVisualWrappers(rootModel, semanticNames = new Map()) {
  let collapsedCount = 0;

  const collapseChildren = (parent) => {
    const children = parent.children ?? [];
    for (let index = 0; index < children.length; index += 1) {
      let child = children[index];
      while (shouldCollapseWrapper(child, parent, semanticNames)) {
        const grandchild = child.children[0];
        children[index] = {
          ...grandchild,
          rect: {
            x: round(child.rect.x + grandchild.rect.x),
            y: round(child.rect.y + grandchild.rect.y),
            width: grandchild.rect.width,
            height: grandchild.rect.height
          }
        };
        child = children[index];
        collapsedCount += 1;
      }
      collapseChildren(child);
    }
  };

  collapseChildren(rootModel);
  return collapsedCount;
}

function shouldCollapseWrapper(model, parent, semanticNames) {
  if (model.type !== "FRAME" || (model.children?.length ?? 0) !== 1) {
    return false;
  }
  if (model.assetRef || model.fallbackReason || model.clipsContent) {
    return false;
  }
  if (model.autoLayout?.applied || parent.autoLayout?.applied) {
    return false;
  }
  if (semanticNames.has(model.sourceNodeId)) {
    return false;
  }
  if (hasModelVisualStyle(model.style) || hasCollapseBlockingStyles(model.styles)) {
    return false;
  }

  const child = model.children[0];
  if (!child || sharesSourceIdentity(model, child)) {
    return false;
  }

  return rectsMatchWithinTolerance(model.absoluteRect, child.absoluteRect, 1);
}

function sharesSourceIdentity(model, child) {
  return Boolean(
    child.sourceNodeId &&
    model.sourceNodeId &&
    (child.sourceNodeId === model.sourceNodeId || child.sourceNodeId.startsWith(`${model.sourceNodeId}::`))
  );
}

function hasCollapseBlockingStyles(styles = {}) {
  const opacity = styles.opacity === undefined ? 1 : Number.parseFloat(styles.opacity);
  if (Number.isFinite(opacity) && opacity < 1) {
    return true;
  }
  const transform = String(styles.transform ?? "").trim();
  if (transform && transform !== "none") {
    return true;
  }
  return hasCssGradient(styles.backgroundImage);
}

function hasCssGradient(value) {
  return typeof value === "string" && /gradient\(/i.test(value);
}

function rectsMatchWithinTolerance(a, b, tolerance) {
  if (!a || !b) {
    return false;
  }
  return Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance;
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

  const inheritedBackdropColor = visibleColor(node.styles?.backgroundColor)
    ? node.styles.backgroundColor
    : context.backdropColor;
  const hasClippedAncestor = Boolean(context.clippedAncestor || shouldClipContent(node));
  const textFillGradient = textFillGradientFromStyles(node.styles) || context.textFillGradient || null;
  let absoluteRect = geometryAdjustedAbsoluteRect(node, normalizeRect(node.rect));
  let rect = relativeRect(absoluteRect, context.parentRect);
  let children = (node.children ?? [])
    .map((child) => createModel(child, {
      parentRect: absoluteRect,
      fallbackReasons: context.fallbackReasons,
      backdropColor: inheritedBackdropColor,
      clippedAncestor: hasClippedAncestor,
      textFillGradient
    }))
    .filter(Boolean);
  const visibleChildrenRect = visibleChildrenBoundsForTransparentTransformedWrapper(node, absoluteRect, children);
  if (visibleChildrenRect) {
    absoluteRect = visibleChildrenRect;
    rect = relativeRect(absoluteRect, context.parentRect);
    children = children.map((child) => ({
      ...child,
      rect: relativeRect(child.absoluteRect, absoluteRect)
    }));
  }
  children = repairStaticPseudoFlexGeometry(node, absoluteRect, children);
  const iconFontAsset = iconFontImageAssetForNode(node);
  if (iconFontAsset) {
    const style = imageVisualStyleForNode(node, context);
    style.assetRole = iconFontAsset.assetRole;
    return baseModel(node, "IMAGE", rect, absoluteRect, {
      assetRef: iconFontAsset.assetRef,
      assetKind: iconFontAsset.assetKind,
      assetRole: iconFontAsset.assetRole,
      ...(iconFontAsset.bytes ? { bytes: iconFontAsset.bytes } : {}),
      style,
      children: []
    });
  }
  if (node.textContent && shouldSuppressTinyClippedText(node, rect)) {
    return null;
  }
  const borderDecorations = createBorderDecorationModels(node, rect, absoluteRect);

  if (node.textContent && children.length > 0) {
    const mixedContent = prepareMixedDirectTextContent(node, absoluteRect, children);
    const textModel = createDirectTextModel(mixedContent.node, absoluteRect, mixedContent.children, context);
    const mixedChildren = [
      ...insertMixedContentTextChild(mixedContent.children, textModel, node),
      ...borderDecorations
    ];
    const autoLayout = inferAutoLayout(node, mixedChildren);
    return baseModel(node, "FRAME", rect, absoluteRect, {
      style: visualStyleForNode(node, context),
      autoLayout,
      clipsContent: shouldClipContent(node),
      children: orderedChildrenForAutoLayout(mixedChildren, autoLayout)
    });
  }

  if (node.textContent) {
    if (isDirectTableCellTextNode(node)) {
      return createTableCellTextModel(node, rect, absoluteRect, borderDecorations, context);
    }
    if (shouldPreserveTransparentPaddedInteractiveTextFrame(node, rect)) {
      return createTransparentPaddedTextFrameModel(node, rect, absoluteRect, borderDecorations, context);
    }
    const textGeometry = hasVisualBoxStyle(node.styles)
      ? { rect, absoluteRect }
      : paddedTransparentTextGeometry(node, rect, absoluteRect);
    const textModel = createTextModel(
      node,
      textGeometry.rect,
      textGeometry.absoluteRect,
      inferTextAutoResize(node, textGeometry.rect),
      context
    );
    if (hasVisualBoxStyle(node.styles)) {
      const backingPadding = explicitCssPadding(node.styles);
      const shouldUsePaddedBacking = hasPositivePadding(backingPadding);
      const backingContentRect = shouldUsePaddedBacking
        ? contentRectFromPadding(rect, backingPadding)
        : null;
      const backingTextAutoResize = shouldUsePaddedBacking
        ? inferPaddedBackingTextAutoResize(node, backingContentRect)
        : textModel.textAutoResize;
      const backingTextSizing = textLayoutSizingForAutoResize(backingTextAutoResize);
      const childRect = shouldUsePaddedBacking
        ? backingContentRect
        : {
            x: 0,
            y: 0,
            width: textModel.rect.width,
            height: textModel.rect.height
          };
      const shouldUseBackingAutoLayout = borderDecorations.length === 0 &&
        (shouldUsePaddedBacking || backingTextAutoResize === "WIDTH_AND_HEIGHT");
      const backingTextModel = {
        ...textModel,
        textAutoResize: backingTextAutoResize,
        ...backingTextSizing,
        rect: childRect
      };
      if (shouldUseBackingAutoLayout) {
        delete backingTextModel.layoutPositioning;
      }
      return baseModel(node, "FRAME", rect, absoluteRect, {
        name: `Text Background / ${node.textContent.slice(0, 32)}`,
        style: extractVisualStyle(node, context),
        autoLayout: shouldUseBackingAutoLayout
          ? textBackingAutoLayout(backingPadding ?? zeroPadding(), backingTextAutoResize)
          : null,
        children: [backingTextModel, ...borderDecorations]
      });
    }
    return textModel;
  }

  if (hasVisiblePlaceholder(node)) {
    return createPlaceholderInputModel(node, rect, absoluteRect, borderDecorations);
  }

  if (node.fallbackRef) {
    return baseModel(node, "FALLBACK_IMAGE", rect, absoluteRect, {
      assetRef: node.fallbackRef,
      fallbackReason: context.fallbackReasons.get(node.sourceNodeId) ?? "raster fallback",
      assetKind: assetKindForNode(node),
      style: extractVisualStyle(node, context),
      children: []
    });
  }

  if (shouldCreateBackgroundImageLayer(node, children)) {
    const frameChildren = [
      ...reparentAbsoluteOverlaysIntoStackingHosts(children),
      ...borderDecorations
    ];
    const autoLayout = inferAutoLayout(node, frameChildren);
    return baseModel(node, "FRAME", rect, absoluteRect, {
      style: extractVisualStyle(node, context),
      autoLayout,
      clipsContent: shouldClipContent(node),
      children: [
        createBackgroundImageModel(node, rect, absoluteRect),
        ...orderedChildrenForAutoLayout(frameChildren, autoLayout)
      ]
    });
  }

  if (node.assetRef || node.tagName === "img" || hasCssImageUrl(node.styles)) {
    return baseModel(node, "IMAGE", rect, absoluteRect, {
      assetRef: node.assetRef ?? null,
      assetKind: assetKindForNode(node),
      assetRole: assetRoleForNode(node),
      style: imageVisualStyleForNode(node, context),
      children: []
    });
  }

  if (children.length > 0) {
    const frameChildren = [
      ...reparentAbsoluteOverlaysIntoStackingHosts(children),
      ...borderDecorations
    ];
    const autoLayout = inferAutoLayout(node, frameChildren);
    const style = visualStyleWithSingleChildClip(node, frameChildren, visualStyleForNode(node, context));
    return baseModel(node, "FRAME", rect, absoluteRect, {
      style,
      autoLayout,
      clipsContent: shouldClipContent(node) || shouldMirrorSingleChildClip(node, frameChildren, style),
      children: orderedChildrenForAutoLayout(frameChildren, autoLayout)
    });
  }

  if (!isRenderableNode(node)) {
    return null;
  }

  if (borderDecorations.length > 0) {
    return baseModel(node, "FRAME", rect, absoluteRect, {
      style: extractVisualStyle(node, context),
      autoLayout: null,
      clipsContent: shouldClipContent(node),
      children: borderDecorations
    });
  }

  return baseModel(node, "RECTANGLE", rect, absoluteRect, {
    style: extractVisualStyle(node, context),
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

function createBackgroundImageModel(node, rect, absoluteRect) {
  return {
    id: `${node.sourceNodeId}::background-image`,
    type: "IMAGE",
    name: "Background image",
    sourceNodeId: `${node.sourceNodeId}::background-image`,
    layoutPositioning: "ABSOLUTE",
    rect: { x: 0, y: 0, width: rect.width, height: rect.height },
    absoluteRect,
    styles: node.styles ?? {},
    assetRef: node.assetRef ?? null,
    assetKind: assetKindForNode(node),
    assetRole: assetRoleForNode(node),
    ...(!node.assetRef ? { fallbackReason: "missing css background asset" } : {}),
    style: imageVisualStyleForNode(node),
    children: []
  };
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

function transformAxisScale(transform, axis) {
  const value = String(transform ?? "").trim();
  if (!value || value === "none") {
    return 1;
  }

  const matrix = value.match(/^matrix\(([^)]+)\)$/i);
  if (matrix) {
    const parts = parseTransformNumbers(matrix[1]);
    if (parts.length >= 4) {
      return axis === "x"
        ? Math.hypot(parts[0], parts[1])
        : Math.hypot(parts[2], parts[3]);
    }
  }

  const matrix3d = value.match(/^matrix3d\(([^)]+)\)$/i);
  if (matrix3d) {
    const parts = parseTransformNumbers(matrix3d[1]);
    if (parts.length >= 16) {
      return axis === "x"
        ? Math.hypot(parts[0], parts[1], parts[2])
        : Math.hypot(parts[4], parts[5], parts[6]);
    }
  }

  const scale3d = value.match(/^scale3d\(([^)]+)\)$/i);
  if (scale3d) {
    const parts = parseTransformNumbers(scale3d[1]);
    return axis === "x" ? parts[0] ?? 1 : parts[1] ?? parts[0] ?? 1;
  }

  const scaleX = value.match(/^scaleX\(([^)]+)\)$/i);
  if (scaleX) {
    return axis === "x" ? parseCssNumber(scaleX[1]) : 1;
  }

  const scaleY = value.match(/^scaleY\(([^)]+)\)$/i);
  if (scaleY) {
    return axis === "y" ? parseCssNumber(scaleY[1]) : 1;
  }

  const scale = value.match(/^scale\(([^)]+)\)$/i);
  if (scale) {
    const parts = parseTransformNumbers(scale[1]);
    return axis === "x" ? parts[0] ?? 1 : parts[1] ?? parts[0] ?? 1;
  }

  return 1;
}

function parseTransformNumbers(value) {
  return String(value ?? "")
    .split(/[\s,]+/)
    .map((part) => parseCssNumber(part))
    .filter((number) => Number.isFinite(number));
}

function visibleChildrenBoundsForTransparentTransformedWrapper(node, absoluteRect, children) {
  if (
    children.length === 0 ||
    hasVisualBoxStyle(node.styles) ||
    shouldClipContent(node) ||
    !hasTransformTranslation(node.styles?.transform)
  ) {
    return null;
  }

  const childrenRect = unionAbsoluteRect(children);
  if (!childrenRect || rectContains(absoluteRect, childrenRect, 1)) {
    return null;
  }
  return childrenRect;
}

function repairStaticPseudoFlexGeometry(node, absoluteRect, children) {
  const styles = node.styles ?? {};
  const display = normalizeCssKeyword(styles.display);
  if ((display !== "flex" && display !== "inline-flex") || children.length < 2) {
    return children;
  }
  const flexDirection = normalizeCssKeyword(styles.flexDirection);
  const layoutMode = flexDirection.startsWith("column") ? "VERTICAL" : "HORIZONTAL";
  const pseudoChildren = children.filter((child) => isStaticPseudoFlowModel(child) &&
    pseudoOverlapsFlowSibling(child, children, layoutMode));
  if (pseudoChildren.length === 0) {
    return children;
  }

  const padding = explicitCssPadding(styles) ?? zeroPadding();
  const startBase = layoutMode === "HORIZONTAL"
    ? absoluteRect.x + padding.left
    : absoluteRect.y + padding.top;
  const endBase = layoutMode === "HORIZONTAL"
    ? absoluteRect.x + absoluteRect.width - padding.right
    : absoluteRect.y + absoluteRect.height - padding.bottom;
  let beforeOffset = 0;
  let afterOffset = 0;
  return children.map((child) => {
    if (!pseudoChildren.includes(child)) {
      return child;
    }
    const size = layoutMode === "HORIZONTAL" ? child.absoluteRect.width : child.absoluteRect.height;
    const start = isBeforePseudoModel(child)
      ? startBase + beforeOffset
      : endBase - afterOffset - size;
    if (isBeforePseudoModel(child)) {
      beforeOffset += size;
    } else {
      afterOffset += size;
    }
    const absoluteChildRect = layoutMode === "HORIZONTAL"
      ? { ...child.absoluteRect, x: round(start) }
      : { ...child.absoluteRect, y: round(start) };
    return {
      ...child,
      absoluteRect: absoluteChildRect,
      rect: relativeRect(absoluteChildRect, absoluteRect)
    };
  });
}

function isStaticPseudoFlowModel(model) {
  return (isBeforePseudoModel(model) || isAfterPseudoModel(model)) &&
    normalizeCssKeyword(model.styles?.position) !== "absolute" &&
    hasUsableBounds(model.absoluteRect);
}

function pseudoOverlapsFlowSibling(pseudo, children, layoutMode) {
  return children.some((child) => child !== pseudo &&
    !isBeforePseudoModel(child) &&
    !isAfterPseudoModel(child) &&
    axisRangesOverlap(pseudo.absoluteRect, child.absoluteRect, layoutMode));
}

function axisRangesOverlap(a, b, layoutMode) {
  return primaryAxisStart(a, layoutMode) < primaryAxisEnd(b, layoutMode) &&
    primaryAxisEnd(a, layoutMode) > primaryAxisStart(b, layoutMode);
}

function hasTransformTranslation(transform) {
  const translation = transformTranslation(transform);
  return Math.abs(translation.x) >= 0.001 || Math.abs(translation.y) >= 0.001;
}

function unionAbsoluteRect(children) {
  const visibleChildren = children.filter((child) => hasUsableBounds(child.absoluteRect));
  if (visibleChildren.length === 0) {
    return null;
  }

  const left = Math.min(...visibleChildren.map((child) => child.absoluteRect.x));
  const top = Math.min(...visibleChildren.map((child) => child.absoluteRect.y));
  const right = Math.max(...visibleChildren.map((child) => child.absoluteRect.x + child.absoluteRect.width));
  const bottom = Math.max(...visibleChildren.map((child) => child.absoluteRect.y + child.absoluteRect.height));
  return {
    x: round(left),
    y: round(top),
    width: round(Math.max(1, right - left)),
    height: round(Math.max(1, bottom - top))
  };
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
    ...(normalizeCssKeyword(node.styles?.position) === "absolute" ? { layoutPositioning: "ABSOLUTE" } : {}),
    rect,
    absoluteRect,
    styles: node.styles ?? {},
    ...overrides
  };
}

function createTextModel(node, rect, absoluteRect, textAutoResize, context = {}) {
  const geometry = normalizeTallHugTextGeometry(node, rect, absoluteRect, textAutoResize);
  return baseModel(node, "TEXT", geometry.rect, geometry.absoluteRect, {
    text: node.textContent,
    textAutoResize,
    ...textLayoutSizingForAutoResize(textAutoResize),
    style: extractVisualStyle(node, context),
    children: []
  });
}

function createTableCellTextModel(node, rect, absoluteRect, borderDecorations, context = {}) {
  const padding = explicitCssPadding(node.styles) ?? zeroPadding();
  const textAutoResize = tableCellTextAutoResize(node, rect);
  const textModel = createTextModel(
    node,
    tableCellTextRect(rect, padding, node.styles, textAutoResize),
    tableCellTextAbsoluteRect(absoluteRect, rect, padding, node.styles, textAutoResize),
    textAutoResize,
    context
  );
  return baseModel(node, "FRAME", rect, absoluteRect, {
    name: `Table Cell / ${String(node.textContent ?? "").slice(0, 32)}`,
    style: extractVisualStyle(node, context),
    autoLayout: borderDecorations.length === 0
      ? tableCellAutoLayout(padding, node)
      : null,
    children: [textModel, ...borderDecorations]
  });
}

function createTransparentPaddedTextFrameModel(node, rect, absoluteRect, borderDecorations, context = {}) {
  const padding = explicitCssPadding(node.styles) ?? zeroPadding();
  const contentRect = contentRectFromPadding(rect, padding);
  const contentAbsoluteRect = {
    x: round(absoluteRect.x + contentRect.x),
    y: round(absoluteRect.y + contentRect.y),
    width: contentRect.width,
    height: contentRect.height
  };
  const textNode = {
    ...node,
    sourceNodeId: `${node.sourceNodeId}::text`
  };
  const textAutoResize = inferPaddedBackingTextAutoResize(textNode, contentRect);
  const textModel = createTextModel(
    textNode,
    contentRect,
    contentAbsoluteRect,
    textAutoResize,
    context
  );

  return baseModel(node, "FRAME", rect, absoluteRect, {
    name: `Text Wrapper / ${String(node.textContent ?? "").slice(0, 32)}`,
    style: extractVisualStyle(node, context),
    autoLayout: borderDecorations.length === 0
      ? textBackingAutoLayout(padding, textAutoResize)
      : null,
    clipsContent: shouldClipContent(node),
    children: [textModel, ...borderDecorations]
  });
}

function createPlaceholderInputModel(node, rect, absoluteRect, borderDecorations) {
  const placeholderTextModel = createPlaceholderTextModel(node, rect, absoluteRect);
  return baseModel(node, "FRAME", rect, absoluteRect, {
    name: `Input / ${String(node.attributes?.placeholder ?? "").slice(0, 32)}`,
    style: extractVisualStyle(node),
    autoLayout: null,
    clipsContent: shouldClipContent(node),
    children: [placeholderTextModel, ...borderDecorations]
  });
}

function createPlaceholderTextModel(node, rect, absoluteRect) {
  const placeholderTextRect = inputPlaceholderTextRect(rect, node.styles ?? {});
  const placeholderAbsoluteRect = {
    x: round(absoluteRect.x + placeholderTextRect.x),
    y: round(absoluteRect.y + placeholderTextRect.y),
    width: placeholderTextRect.width,
    height: placeholderTextRect.height
  };
  const placeholderStyles = placeholderTextStyles(node.styles ?? {});
  const placeholderNode = {
    ...node,
    sourceNodeId: `${node.sourceNodeId}::placeholder`,
    tagName: "#text",
    textContent: String(node.attributes?.placeholder ?? ""),
    rect: placeholderAbsoluteRect,
    styles: placeholderStyles,
    children: []
  };
  return createTextModel(placeholderNode, placeholderTextRect, placeholderAbsoluteRect, "TRUNCATE");
}

function inputPlaceholderTextRect(rect, styles = {}) {
  const padding = explicitCssPadding(styles) ?? zeroPadding();
  const lineHeight = parseCssNumber(styles.lineHeight) || parseCssNumber(styles.fontSize) * 1.2 || rect.height;
  const textHeight = round(Math.min(rect.height, Math.max(1, lineHeight)));
  const contentHeight = Math.max(1, rect.height - padding.top - padding.bottom);
  return {
    x: padding.left,
    y: round(padding.top + Math.max(0, (contentHeight - textHeight) / 2)),
    width: round(Math.max(1, rect.width - padding.left - padding.right)),
    height: textHeight
  };
}

function placeholderTextStyles(styles = {}) {
  const next = {
    ...styles,
    color: styles.placeholderColor || styles.color,
    whiteSpace: "nowrap",
    overflow: "hidden",
    overflowX: "hidden",
    textOverflow: styles.textOverflow === "ellipsis" ? "ellipsis" : "clip"
  };
  delete next.webkitTextFillColor;
  delete next.backgroundClip;
  delete next.webkitBackgroundClip;
  delete next.backgroundImage;
  return next;
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

function hasVisiblePlaceholder(node) {
  const tagName = String(node.tagName ?? "").toLowerCase();
  const placeholder = String(node.attributes?.placeholder ?? "");
  return (tagName === "input" || tagName === "textarea") &&
    placeholder.trim().length > 0 &&
    String(node.attributes?.["data-has-value"] ?? "").toLowerCase() !== "true";
}

function classTokens(className) {
  return new Set(String(className ?? "").split(/\s+/).filter(Boolean));
}

function createDirectTextModel(node, parentAbsoluteRect, children, context = {}) {
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
  return createTextModel(textNode, rect, absoluteRect, inferTextContentAutoResize(textNode, rect), context);
}

function prepareMixedDirectTextContent(node, parentAbsoluteRect, children) {
  const merge = mergeableInlineSeparator(node, parentAbsoluteRect, children);
  if (!merge) {
    return { node, children };
  }

  const mergedText = insertInlineSeparatorText(
    node.textContent,
    merge.separator.text,
    merge.primaryOffset,
    node.styles
  );
  return {
    node: {
      ...node,
      textContent: mergedText
    },
    children: children.filter((child) => child !== merge.separator)
  };
}

function mergeableInlineSeparator(node, parentAbsoluteRect, children) {
  const separators = children.filter(isInlineTextSeparatorModel);
  if (separators.length !== 1 || children.some((child) => child.pseudoType)) {
    return null;
  }

  const styles = node.styles ?? {};
  const flexDirection = styles.flexDirection ?? "row";
  if (flexDirection.startsWith("column")) {
    return null;
  }

  const padding = explicitCssPadding(styles) ?? zeroPadding();
  const parentStart = parentAbsoluteRect.x + padding.left;
  const parentEnd = parentAbsoluteRect.x + Math.max(0, parentAbsoluteRect.width - padding.right);
  const parentSize = parentEnd - parentStart;
  const separator = separators[0];
  const primaryOffset = separator.absoluteRect.x - parentStart;
  if (primaryOffset <= 1 || primaryOffset >= parentSize - 1) {
    return null;
  }

  const largestSegment = largestDirectTextSegmentSize(children, parentStart, parentEnd);
  const estimatedTextSize = estimateTextPrimarySize(node.textContent, styles);
  if (estimatedTextSize <= largestSegment + 1 || estimatedTextSize > parentSize + separator.absoluteRect.width + 8) {
    return null;
  }

  return { separator, primaryOffset };
}

function isInlineTextSeparatorModel(child) {
  if (child.type !== "TEXT" || child.pseudoType) {
    return false;
  }
  const text = String(child.text ?? "").trim();
  return text.length > 0 && text.length <= 2 && /^[|¦:：/\\·•\-–—]+$/.test(text);
}

function largestDirectTextSegmentSize(children, parentStart, parentEnd) {
  const sorted = children
    .filter((child) => directTextChildOverlapsContent(child, "HORIZONTAL", parentStart, parentEnd))
    .sort((a, b) => a.absoluteRect.x - b.absoluteRect.x);
  const segments = [];
  let cursor = parentStart;
  for (const child of sorted) {
    const childStart = clamp(child.absoluteRect.x, parentStart, parentEnd);
    const childEnd = clamp(child.absoluteRect.x + child.absoluteRect.width, parentStart, parentEnd);
    addDirectTextSegment(segments, cursor, childStart, cursor > parentStart, true);
    cursor = Math.max(cursor, childEnd);
  }
  addDirectTextSegment(segments, cursor, parentEnd, cursor > parentStart, false);
  return segments.reduce((max, segment) => Math.max(max, segment.size), 0);
}

function insertInlineSeparatorText(text, separator, primaryOffset, styles = {}) {
  const source = String(text ?? "");
  const index = closestTextSplitIndex(source, primaryOffset, styles);
  const prefix = source.slice(0, index).trimEnd();
  const suffix = source.slice(index).trimStart();
  return [prefix, String(separator ?? "").trim(), suffix].filter(Boolean).join(" ");
}

function closestTextSplitIndex(text, targetWidth, styles = {}) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= text.length; index += 1) {
    const width = estimateTextPrimarySize(text.slice(0, index), styles);
    const distance = Math.abs(width - targetWidth);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
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
  const firstLineRect = firstLineDirectTextRect(node, parentRect, children, layoutMode, padding);
  if (firstLineRect) {
    return firstLineRect;
  }
  if (shouldUseFullMultilineDirectTextRect(node, parentRect, children, layoutMode, padding)) {
    if (layoutMode === "HORIZONTAL") {
      return {
        x: round(parentStart),
        y: round(crossStart),
        width: round(Math.max(1, parentEnd - parentStart)),
        height: round(crossSize)
      };
    }
    return {
      x: round(crossStart),
      y: round(parentStart),
      width: round(crossSize),
      height: round(Math.max(1, parentEnd - parentStart))
    };
  }
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
  const textAlign = normalizeCssKeyword(styles.textAlign);
  const shouldAlignToSegmentEnd = bestSegment.hasNext &&
    (bestSegment.hasPrevious || textAlign === "center" || textAlign === "right" || textAlign === "end");
  const start = shouldAlignToSegmentEnd
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

function firstLineDirectTextRect(node, parentRect, children, layoutMode, padding) {
  if (layoutMode !== "HORIZONTAL" || children.some((child) => child.pseudoType)) {
    return null;
  }
  if (String(node.textContent ?? "").includes("\n")) {
    return null;
  }

  const styles = node.styles ?? {};
  const lineHeight = parseCssNumber(styles.lineHeight) || parseCssNumber(styles.fontSize) * 1.2;
  if (!(lineHeight > 0)) {
    return null;
  }

  const contentWidth = Math.max(1, parentRect.width - padding.left - padding.right);
  const fontSize = parseCssNumber(styles.fontSize) || 14;
  if (estimateTextPrimarySize(node.textContent, styles) > contentWidth + fontSize) {
    return null;
  }

  const firstLineBottom = parentRect.y + padding.top + lineHeight - 0.5;
  if (!children.some((child) => child.absoluteRect.y >= firstLineBottom)) {
    return null;
  }

  return {
    x: round(parentRect.x + padding.left),
    y: round(parentRect.y + padding.top),
    width: round(contentWidth),
    height: round(lineHeight)
  };
}

function shouldUseFullMultilineDirectTextRect(node, parentRect, children, layoutMode, padding) {
  if (layoutMode !== "HORIZONTAL" || children.some((child) => child.pseudoType)) {
    return false;
  }

  const styles = node.styles ?? {};
  const whiteSpace = normalizeCssKeyword(styles.whiteSpace);
  if (whiteSpace === "nowrap" || whiteSpace === "pre") {
    return false;
  }

  const lineHeight = parseCssNumber(styles.lineHeight) || parseCssNumber(styles.fontSize) * 1.2;
  const contentHeight = Math.max(1, parentRect.height - padding.top - padding.bottom);
  if (!(lineHeight > 0) || contentHeight < lineHeight * 1.5) {
    return false;
  }

  const firstLineBottom = parentRect.y + padding.top + lineHeight - 0.5;
  return children.some((child) => child.absoluteRect.y >= firstLineBottom);
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
    (
      isFlex ||
      hasPotentialLineHeightAlignment(node, children[0]) ||
      hasButtonTextAlignmentPotential(node, children[0]) ||
      hasTableCellSingleChildAlignmentPotential(node, children[0])
    );
  const canTryNonFlexFlow = children.length > 1 && hasNonFlexFlowStyleEvidence(node);
  if (!isFlex && !canTrySingleChildAlignment && !canTryNonFlexFlow) {
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
    return inferNonFlexFlowAutoLayout(node, children, parentRect);
  }
  if (children.length < 2) {
    return skippedLayout("one-child-container");
  }

  const flexDirection = styles.flexDirection ?? "row";
  const layoutMode = flexDirection.startsWith("column") ? "VERTICAL" : "HORIZONTAL";
  if (hasPrimaryAxisOverlap(children, layoutMode)) {
    return skippedLayout("overlapping-layout");
  }

  const primaryAxisAlignItems = inferPrimaryAxisAlignment(styles, children, layoutMode, parentRect);
  const counterAxisAlignItems = inferCounterAxisAlignment(styles, children, layoutMode, parentRect);
  if (hasNonUniformImplicitSpacing(styles, children, layoutMode, primaryAxisAlignItems)) {
    return skippedLayout("non-uniform-spacing");
  }
  const spacing = primaryAxisAlignItems === "SPACE_BETWEEN"
    ? 0
    : explicitSpacing(styles, layoutMode) ?? measuredSpacing(children, layoutMode);
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

function inferNonFlexFlowAutoLayout(node, children, parentRect) {
  if (children.length < 2 || !hasNonFlexFlowEvidence(node, children, parentRect)) {
    return null;
  }

  const styles = node.styles ?? {};
  const layoutMode = inferNonFlexFlowMode(children);
  if (!layoutMode) {
    return null;
  }

  const primaryAxisAlignItems = inferNonFlexFlowPrimaryAxisAlignment(styles, children, layoutMode, parentRect);
  const counterAxisAlignItems = inferNonFlexFlowCounterAxisAlignment(styles, children, layoutMode, parentRect);
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
    confidence: 0.78
  };
}

function hasNonFlexFlowEvidence(node, children, parentRect) {
  if (!hasNonFlexFlowStyleEvidence(node)) {
    return false;
  }
  return centeredChildrenBounds(children, parentRect, "HORIZONTAL") ||
    centeredChildrenBounds(children, parentRect, "VERTICAL") ||
    hasNonFlexFlowCssAlignment(node);
}

function hasNonFlexFlowStyleEvidence(node) {
  const styles = node.styles ?? {};
  const display = normalizeCssKeyword(styles.display);
  return ["block", "inline-block", "inline", ""].includes(display) && hasNonFlexFlowCssAlignment(node);
}

function hasNonFlexFlowCssAlignment(node) {
  const styles = node.styles ?? {};
  const textAlign = normalizeCssKeyword(styles.textAlign);
  if (textAlign === "center" || textAlign === "right" || textAlign === "end") {
    return true;
  }
  if (
    normalizeCssKeyword(styles.justifyContent) === "center" ||
    normalizeCssKeyword(styles.alignItems) === "center"
  ) {
    return true;
  }
  return false;
}

function inferNonFlexFlowMode(children) {
  const overlapsHorizontally = hasPrimaryAxisOverlap(children, "HORIZONTAL");
  const overlapsVertically = hasPrimaryAxisOverlap(children, "VERTICAL");
  if (!overlapsHorizontally && overlapsVertically) {
    return "HORIZONTAL";
  }
  if (overlapsHorizontally && !overlapsVertically) {
    return "VERTICAL";
  }
  return null;
}

function inferNonFlexFlowPrimaryAxisAlignment(styles, children, layoutMode, parentRect) {
  if (layoutMode === "HORIZONTAL") {
    const cssAlignment = primaryAxisAlignmentFromCss(styles.justifyContent);
    if (cssAlignment) {
      return cssAlignment;
    }
    if (normalizeCssKeyword(styles.textAlign) === "center" || centeredChildrenBounds(children, parentRect, layoutMode)) {
      return "CENTER";
    }
  }
  if (centeredChildrenBounds(children, parentRect, layoutMode) && !childrenFillPrimaryAxis(children, parentRect, layoutMode)) {
    return "CENTER";
  }
  return "MIN";
}

function inferNonFlexFlowCounterAxisAlignment(styles, children, layoutMode, parentRect) {
  const cssAlignment = counterAxisAlignmentFromCss(styles.alignItems);
  if (cssAlignment) {
    return cssAlignment;
  }
  if (layoutMode === "VERTICAL" && normalizeCssKeyword(styles.textAlign) === "center") {
    return "CENTER";
  }
  if (children.every((child) => centeredRectOnAxis(child.absoluteRect, parentRect, counterLayoutMode(layoutMode)))) {
    return "CENTER";
  }
  return "MIN";
}

function centeredChildrenBounds(children, parentRect, layoutMode) {
  const bounds = unionAbsoluteRect(children);
  return Boolean(bounds && centeredRectOnAxis(bounds, parentRect, layoutMode));
}

function centeredRectOnAxis(rect, parentRect, layoutMode) {
  const tolerance = Math.max(2, primaryAxisSize(parentRect, layoutMode) * 0.02);
  const rectCenter = primaryAxisStart(rect, layoutMode) + primaryAxisSize(rect, layoutMode) / 2;
  const parentCenter = primaryAxisStart(parentRect, layoutMode) + primaryAxisSize(parentRect, layoutMode) / 2;
  return Math.abs(rectCenter - parentCenter) <= tolerance;
}

function childrenFillPrimaryAxis(children, parentRect, layoutMode) {
  const bounds = unionAbsoluteRect(children);
  if (!bounds) {
    return false;
  }
  return primaryAxisSize(bounds, layoutMode) >= primaryAxisSize(parentRect, layoutMode) - 1;
}

function counterLayoutMode(layoutMode) {
  return layoutMode === "HORIZONTAL" ? "VERTICAL" : "HORIZONTAL";
}

function orderedChildrenForAutoLayout(children, autoLayout) {
  const layoutMode = autoLayout?.layoutMode ?? "HORIZONTAL";
  const pseudoOrderedChildren = orderPseudoChildrenForFlow(children, layoutMode);
  if (!autoLayout?.applied) {
    return stackOrderedChildren(pseudoOrderedChildren);
  }
  return orderChildrenByVisualFlow(pseudoOrderedChildren, layoutMode);
}

function orderPseudoChildrenForFlow(children, layoutMode) {
  if (!children.some((child) => isBeforePseudoModel(child) || isAfterPseudoModel(child))) {
    return children;
  }
  const sorted = (items) => [...items].sort((a, b) => layoutMode === "HORIZONTAL"
    ? a.absoluteRect.x - b.absoluteRect.x
    : a.absoluteRect.y - b.absoluteRect.y);
  const beforeChildren = sorted(children.filter(isBeforePseudoModel));
  const afterChildren = sorted(children.filter(isAfterPseudoModel));
  const flowChildren = children.filter((child) => !isBeforePseudoModel(child) && !isAfterPseudoModel(child));
  return [
    ...beforeChildren,
    ...flowChildren,
    ...afterChildren
  ];
}

function orderChildrenByVisualFlow(children, layoutMode) {
  const beforeChildren = sortModelsByVisualFlow(children.filter(isBeforePseudoModel), layoutMode);
  const afterChildren = sortModelsByVisualFlow(children.filter(isAfterPseudoModel), layoutMode);
  const flowChildren = sortModelsByVisualFlow(
    children.filter((child) => !isBeforePseudoModel(child) && !isAfterPseudoModel(child)),
    layoutMode
  );
  return [
    ...beforeChildren,
    ...flowChildren,
    ...afterChildren
  ];
}

function sortModelsByVisualFlow(children, layoutMode) {
  return children
    .map((child, index) => ({ child, index }))
    .sort((a, b) => compareModelVisualFlow(a.child, b.child, layoutMode) || a.index - b.index)
    .map((item) => item.child);
}

function compareModelVisualFlow(a, b, layoutMode) {
  const primaryDelta = primaryAxisStart(a.absoluteRect, layoutMode) - primaryAxisStart(b.absoluteRect, layoutMode);
  if (Math.abs(primaryDelta) > 0.5) {
    return primaryDelta;
  }
  const counterDelta = counterAxisStart(a.absoluteRect, layoutMode) - counterAxisStart(b.absoluteRect, layoutMode);
  if (Math.abs(counterDelta) > 0.5) {
    return counterDelta;
  }
  return 0;
}

function stackOrderedChildren(children) {
  if (!children.some((child) => siblingStackOrderZIndex(child) !== null)) {
    return children;
  }
  return children
    .map((child, index) => ({ child, index, zIndex: siblingStackOrderZIndex(child) ?? 0 }))
    .sort((a, b) => a.zIndex - b.zIndex || a.index - b.index)
    .map((item) => item.child);
}

function reparentAbsoluteOverlaysIntoStackingHosts(children) {
  if (children.length < 2) {
    return children;
  }

  const next = [...children];
  for (const overlay of children) {
    if (!isAbsoluteOverlayCandidate(overlay)) {
      continue;
    }

    const overlayIndex = next.indexOf(overlay);
    if (overlayIndex < 0) {
      continue;
    }

    const hostIndex = next.findIndex((candidate) => candidate !== overlay && canHostAbsoluteOverlay(candidate, overlay));
    if (hostIndex < 0) {
      continue;
    }

    const host = next[hostIndex];
    const graftedOverlay = {
      ...overlay,
      rect: relativeRect(overlay.absoluteRect, host.absoluteRect),
      layoutPositioning: "ABSOLUTE"
    };
    next[hostIndex] = {
      ...host,
      children: [graftedOverlay, ...(host.children ?? [])]
    };
    next.splice(overlayIndex, 1);
  }

  return next;
}

function isAbsoluteOverlayCandidate(model) {
  return normalizeCssKeyword(model.styles?.position) === "absolute" &&
    hasUsableBounds(model.absoluteRect);
}

function canHostAbsoluteOverlay(host, overlay) {
  if (host.type !== "FRAME" || !host.autoLayout?.applied || !hasModelVisualStyle(host.style)) {
    return false;
  }
  if (!rectContains(host.absoluteRect, overlay.absoluteRect, 1)) {
    return false;
  }
  const hostZIndex = stackOrderZIndex(host);
  const overlayZIndex = stackOrderZIndex(overlay) ?? 0;
  return hostZIndex !== null && hostZIndex > overlayZIndex;
}

function rectContains(outer, inner, tolerance = 0) {
  return inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance;
}

function stackOrderZIndex(model) {
  const ownZIndex = numericZIndex(model.styles?.zIndex);
  if (ownZIndex !== null) {
    return ownZIndex;
  }
  let descendantZIndex = null;
  for (const child of model.children ?? []) {
    const childZIndex = stackOrderZIndex(child);
    if (childZIndex !== null) {
      descendantZIndex = descendantZIndex === null
        ? childZIndex
        : Math.max(descendantZIndex, childZIndex);
    }
  }
  return descendantZIndex;
}

function siblingStackOrderZIndex(model) {
  const ownZIndex = numericZIndex(model.styles?.zIndex);
  if (ownZIndex !== null) {
    return ownZIndex;
  }
  if (!isNonVisualOverlayWrapper(model)) {
    return null;
  }
  return positionedOverlayDescendantZIndex(model);
}

function numericZIndex(value) {
  const normalized = String(value ?? "").trim();
  if (!/^-?\d+$/.test(normalized)) {
    return null;
  }
  return Number(normalized);
}

function isNonVisualOverlayWrapper(model) {
  if (model.type !== "FRAME" || hasModelVisualStyle(model.style)) {
    return false;
  }
  const position = normalizeCssKeyword(model.styles?.position);
  const isStaticLike = !position || position === "static" || position === "relative";
  if (!isStaticLike) {
    return false;
  }
  const collapsed = model.rect.width <= 1 ||
    model.rect.height <= 1 ||
    model.absoluteRect.width <= 1 ||
    model.absoluteRect.height <= 1;
  if (collapsed) {
    return true;
  }
  const children = model.children ?? [];
  return children.length > 0 && children.every((child) => {
    const childPosition = normalizeCssKeyword(child.styles?.position);
    return childPosition === "fixed" ||
      childPosition === "absolute" ||
      isNonVisualOverlayWrapper(child);
  });
}

function positionedOverlayDescendantZIndex(model) {
  let result = null;
  for (const child of model.children ?? []) {
    const position = normalizeCssKeyword(child.styles?.position);
    const childZIndex = (position === "fixed" || position === "absolute")
      ? numericZIndex(child.styles?.zIndex)
      : null;
    const descendantZIndex = positionedOverlayDescendantZIndex(child);
    for (const value of [childZIndex, descendantZIndex]) {
      if (value !== null) {
        result = result === null ? value : Math.max(result, value);
      }
    }
  }
  return result;
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
  const hasTableCellChildAlignment = hasTableCellSingleChildAlignmentEvidence(node, child, parentRect);
  if (!hasTableCellChildAlignment && (child.type !== "TEXT" || text.includes("\n"))) {
    return null;
  }

  const flexDirection = styles.flexDirection ?? "row";
  const layoutMode = isFlex && flexDirection.startsWith("column") ? "VERTICAL" : "HORIZONTAL";
  let primaryAxisAlignItems = primaryAxisAlignmentFromCss(styles.justifyContent);
  let counterAxisAlignItems = counterAxisAlignmentFromCss(styles.alignItems);
  const hasFlexAlignment = isFlex && Boolean(primaryAxisAlignItems || counterAxisAlignItems);
  const hasLineHeightAlignment = hasLineHeightAlignmentEvidence(styles, child, parentRect);
  const hasButtonTextAlignment = hasButtonTextAlignmentEvidence(node, child, parentRect);
  if (!hasFlexAlignment && !hasButtonTextAlignment && !hasTableCellChildAlignment && parentRect.height <= child.absoluteRect.height + 1) {
    return null;
  }
  if (!hasFlexAlignment && !hasLineHeightAlignment && !hasButtonTextAlignment && !hasTableCellChildAlignment) {
    return null;
  }
  if (hasTableCellChildAlignment) {
    primaryAxisAlignItems = "CENTER";
    counterAxisAlignItems = "CENTER";
  }
  if (hasButtonTextAlignment && !primaryAxisAlignItems) {
    primaryAxisAlignItems = "CENTER";
  }
  if (hasButtonTextAlignment && !counterAxisAlignItems) {
    counterAxisAlignItems = "CENTER";
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

function hasButtonTextAlignmentPotential(node, child) {
  return isInteractiveSingleLineTextElement(node) &&
    child?.type === "TEXT" &&
    !String(child.text ?? "").includes("\n");
}

function hasButtonTextAlignmentEvidence(node, child, parentRect) {
  if (!hasButtonTextAlignmentPotential(node, child) || !hasUsableBounds(parentRect) || !hasUsableBounds(child.absoluteRect)) {
    return false;
  }
  const textAlign = normalizeCssKeyword(node.styles?.textAlign);
  const horizontallyCentered = Math.abs(
    (child.absoluteRect.x + child.absoluteRect.width / 2) -
    (parentRect.x + parentRect.width / 2)
  ) <= Math.max(2, parentRect.width * 0.02);
  const verticallyCentered = Math.abs(
    (child.absoluteRect.y + child.absoluteRect.height / 2) -
    (parentRect.y + parentRect.height / 2)
  ) <= Math.max(2, parentRect.height * 0.08);
  return (textAlign === "center" || horizontallyCentered) && verticallyCentered;
}

function hasTableCellSingleChildAlignmentPotential(node, child) {
  const childRect = child?.rect ?? child?.absoluteRect;
  return isDirectTableCellTextNode(node) &&
    child?.type === "FRAME" &&
    hasUsableBounds(node.rect) &&
    hasUsableBounds(childRect);
}

function hasTableCellSingleChildAlignmentEvidence(node, child, parentRect) {
  if (!hasTableCellSingleChildAlignmentPotential(node, child) || !hasUsableBounds(parentRect)) {
    return false;
  }
  const childRect = child.absoluteRect;
  const horizontallyCentered = Math.abs(
    (childRect.x + childRect.width / 2) -
    (parentRect.x + parentRect.width / 2)
  ) <= Math.max(1, parentRect.width * 0.03);
  const verticallyCentered = Math.abs(
    (childRect.y + childRect.height / 2) -
    (parentRect.y + parentRect.height / 2)
  ) <= Math.max(1, parentRect.height * 0.05);
  return horizontallyCentered && verticallyCentered;
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
  const styles = node.styles ?? {};
  if (hasVisualBoxStyle(styles)) {
    return shouldUseHugTextInVisualBacking(node, rect, styles)
      ? "WIDTH_AND_HEIGHT"
      : "HEIGHT";
  }
  return inferTextContentAutoResize(node, rect);
}

function shouldUseHugTextInVisualBacking(node, rect, styles) {
  if (String(node.textContent ?? "").includes("\n")) {
    return false;
  }
  if (isClippedSingleLineText(node, rect, styles) || isOverflowClippedTextBox(node, rect, styles)) {
    return false;
  }
  return isCenteredSingleLineTextBox(node, styles, rect) &&
    fitsEstimatedSingleLineText(node, rect, styles);
}

function inferTextContentAutoResize(node, rect) {
  if (String(node.textContent ?? "").includes("\n")) {
    return "HEIGHT";
  }

  const styles = node.styles ?? {};
  if (isClippedSingleLineText(node, rect, styles)) {
    return "TRUNCATE";
  }
  if (isCapturedRectClippedExplicitTextBox(node, rect, styles)) {
    return "TRUNCATE";
  }
  if (isOverflowClippedTextBox(node, rect, styles)) {
    return "TRUNCATE";
  }
  if (shouldPreserveExplicitTextBoxWidth(node, rect, styles)) {
    return "HEIGHT";
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

function inferPaddedBackingTextAutoResize(node, rect) {
  if (String(node.textContent ?? "").includes("\n")) {
    return "HEIGHT";
  }

  const styles = node.styles ?? {};
  if (isClippedSingleLineText(node, rect, styles)) {
    return "TRUNCATE";
  }
  if (isOverflowClippedTextBox(node, rect, styles)) {
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

function shouldPreserveTransparentPaddedInteractiveTextFrame(node, rect) {
  if (
    hasVisualBoxStyle(node.styles) ||
    !isInteractiveSingleLineTextElement(node) ||
    String(node.textContent ?? "").includes("\n") ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return false;
  }

  const styles = node.styles ?? {};
  const padding = explicitCssPadding(styles);
  if (!hasPositivePadding(padding)) {
    return false;
  }

  const explicitWidth = parseCssNumber(styles.width);
  const explicitHeight = parseCssNumber(styles.height);
  if (
    (!(explicitWidth > 0) || Math.abs(explicitWidth - rect.width) > 1.5) &&
    (!(explicitHeight > 0) || Math.abs(explicitHeight - rect.height) > 1.5)
  ) {
    return false;
  }

  const contentRect = contentRectFromPadding(rect, padding);
  return fitsEstimatedSingleLineText(node, contentRect, styles);
}

function shouldPreserveExplicitTextBoxWidth(node, rect, styles) {
  if (
    isSyntheticDirectTextNode(node) ||
    isInteractiveSingleLineTextElement(node) ||
    rect.width <= 0 ||
    !String(node.textContent ?? "").trim()
  ) {
    return false;
  }

  const explicitWidth = parseCssNumber(styles.width);
  if (!(explicitWidth > 0) || Math.abs(explicitWidth - rect.width) > 1.5) {
    return false;
  }

  const fontSize = parseCssNumber(styles.fontSize) || 14;
  const padding = parseCssNumber(styles.paddingLeft) + parseCssNumber(styles.paddingRight);
  const estimatedTextBoxWidth = estimateTextPrimarySize(node.textContent, styles) + Math.max(0, padding);
  const tolerance = Math.max(6, fontSize * 0.5);
  return rect.width > estimatedTextBoxWidth + tolerance;
}

function isCapturedRectClippedExplicitTextBox(node, rect, styles) {
  if (
    isSyntheticDirectTextNode(node) ||
    rect.width <= 0 ||
    !String(node.textContent ?? "").trim()
  ) {
    return false;
  }

  const explicitWidth = parseCssNumber(styles.width);
  if (!(explicitWidth > rect.width + 1.5)) {
    return false;
  }
  if (explicitWidthMatchesTransformedRect(styles, rect)) {
    return false;
  }

  const fontSize = parseCssNumber(styles.fontSize) || 14;
  const estimatedTextWidth = estimateTextPrimarySize(node.textContent, styles);
  const tolerance = Math.max(2, fontSize * 0.25);
  return estimatedTextWidth > rect.width + tolerance;
}

function shouldSuppressTinyClippedText(node, rect) {
  const styles = node.styles ?? {};
  if (
    isSyntheticDirectTextNode(node) ||
    rect.width <= 0 ||
    !String(node.textContent ?? "").trim()
  ) {
    return false;
  }

  const explicitWidth = parseCssNumber(styles.width);
  const fontSize = parseCssNumber(styles.fontSize) || 14;
  const tinyWidth = Math.max(4, fontSize * 0.3);
  if (isVisuallyHiddenAccessibilityText(node, rect, styles, fontSize)) {
    return true;
  }
  if (explicitWidthMatchesTransformedRect(styles, rect)) {
    return false;
  }
  return explicitWidth > rect.width + 1.5 &&
    rect.width <= tinyWidth &&
    estimateTextPrimarySize(node.textContent, styles) > rect.width + Math.max(2, fontSize * 0.25);
}

function isVisuallyHiddenAccessibilityText(node, rect, styles, fontSize) {
  const position = normalizeCssKeyword(styles.position);
  const explicitWidth = parseCssNumber(styles.width);
  const explicitHeight = parseCssNumber(styles.height);
  const text = String(node.textContent ?? "").trim();
  return (position === "absolute" || position === "fixed") &&
    rect.width <= 2 &&
    rect.height <= 2 &&
    explicitWidth > 0 &&
    explicitWidth <= 2 &&
    explicitHeight > 0 &&
    explicitHeight <= 2 &&
    clipsTextOverflow(styles) &&
    estimateTextPrimarySize(text, styles) > rect.width + Math.max(2, fontSize * 0.25);
}

function explicitWidthMatchesTransformedRect(styles = {}, rect) {
  const explicitWidth = parseCssNumber(styles.width);
  const scaleX = transformAxisScale(styles.transform, "x");
  return explicitWidth > 0 &&
    Math.abs(scaleX - 1) > 0.001 &&
    Math.abs(explicitWidth * scaleX - rect.width) <= 1.5;
}

function isOverflowClippedTextBox(node, rect, styles) {
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    !String(node.textContent ?? "").trim() ||
    !clipsTextOverflow(styles)
  ) {
    return false;
  }

  const explicitHeight = parseCssNumber(styles.height);
  if (!(explicitHeight > 0) || Math.abs(explicitHeight - rect.height) > 1.5) {
    return false;
  }

  const lineHeight = parseCssNumber(styles.lineHeight) || parseCssNumber(styles.fontSize) * 1.2;
  if (!(lineHeight > 0) || rect.height <= lineHeight + 1) {
    return false;
  }

  const estimatedLines = Math.max(1, Math.ceil(estimateTextPrimarySize(node.textContent, styles) / Math.max(1, rect.width)));
  const visibleLines = Math.max(1, Math.floor((rect.height + 0.5) / lineHeight));
  return estimatedLines >= visibleLines;
}

function clipsTextOverflow(styles = {}) {
  return clipsOverflowKeyword(styles.overflow) ||
    clipsOverflowKeyword(styles.overflowX) ||
    clipsOverflowKeyword(styles.overflowY) ||
    clipsOverflowShorthand(styles.overflow, "x") ||
    clipsOverflowShorthand(styles.overflow, "y");
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
  return (
    isSynthesizedDirectTextNode(node) ||
    isInteractiveSingleLineTextElement(node) ||
    isCenteredSingleLineTextBox(node, styles, rect)
  ) &&
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

function isCenteredSingleLineTextBox(node, styles, rect = null) {
  const display = normalizeCssKeyword(styles.display);
  const textAlign = normalizeCssKeyword(styles.textAlign);
  const whiteSpace = normalizeCssKeyword(styles.whiteSpace);
  const hasHeight = parseCssNumber(styles.height) > 0 || Number(rect?.height) > 0;
  const flexCentered = (display === "flex" || display === "inline-flex") &&
    normalizeCssKeyword(styles.justifyContent) === "center" &&
    normalizeCssKeyword(styles.alignItems) === "center";
  const textCentered = textAlign === "center" &&
    (display === "inline-block" || display === "block" || display === "inline-flex") &&
    whiteSpace !== "normal";
  return hasHeight && (flexCentered || textCentered);
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

function paddedTransparentTextGeometry(node, rect, absoluteRect) {
  const padding = explicitCssPadding(node.styles);
  if (!hasPositivePadding(padding)) {
    return { rect, absoluteRect };
  }
  const styles = node.styles ?? {};
  if (shouldPreserveExplicitTextBoxWidth(node, rect, styles)) {
    return { rect, absoluteRect };
  }
  const contentRect = contentRectFromPadding(rect, padding);
  return {
    rect: {
      ...contentRect,
      x: round(rect.x + contentRect.x),
      y: round(rect.y + contentRect.y)
    },
    absoluteRect: {
      x: round(absoluteRect.x + contentRect.x),
      y: round(absoluteRect.y + contentRect.y),
      width: contentRect.width,
      height: contentRect.height
    }
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

function inferPrimaryAxisAlignment(styles, children, layoutMode, parentRect) {
  const cssAlignment = primaryAxisAlignmentFromCss(styles.justifyContent);
  if (cssAlignment) {
    return cssAlignment;
  }
  if (shouldInferSpaceBetweenFromGeometry(styles, children, layoutMode, parentRect)) {
    return "SPACE_BETWEEN";
  }
  return undefined;
}

function inferCounterAxisAlignment(styles, children, layoutMode, parentRect) {
  const cssAlignment = counterAxisAlignmentFromCss(styles.alignItems);
  if (cssAlignment) {
    return cssAlignment;
  }
  if (shouldInferCounterAxisCenterFromMargins(children, layoutMode, parentRect)) {
    return "CENTER";
  }
  return undefined;
}

function shouldInferCounterAxisCenterFromMargins(children, layoutMode, parentRect) {
  if (children.length === 0) {
    return false;
  }

  const parentStart = counterAxisStart(parentRect, layoutMode);
  const parentSize = counterAxisSize(parentRect, layoutMode);
  return children.every((child) => {
    const rect = child.absoluteRect;
    const childSize = counterAxisSize(rect, layoutMode);
    const remainingSpace = parentSize - childSize;
    if (remainingSpace <= 4) {
      return false;
    }
    const leadingMargin = leadingCounterAxisMargin(child, layoutMode);
    const trailingMargin = trailingCounterAxisMargin(child, layoutMode);
    if (leadingMargin <= 0 || trailingMargin <= 0 || !approximatelyEqualInset(leadingMargin, trailingMargin, 2)) {
      return false;
    }
    const expectedStart = parentStart + remainingSpace / 2;
    return approximatelyEqualInset(counterAxisStart(rect, layoutMode), expectedStart, 1);
  });
}

function shouldInferSpaceBetweenFromGeometry(styles, children, layoutMode, parentRect) {
  if (children.length !== 2) {
    return false;
  }

  const sorted = sortedByPrimaryAxis(children, layoutMode);
  const explicitGap = explicitSpacing(styles, layoutMode);
  const marginGap = trailingAxisMargin(sorted[0], layoutMode) + leadingAxisMargin(sorted[1], layoutMode);
  if (explicitGap === null && marginGap <= 0) {
    return false;
  }

  const measuredGap = primaryAxisGap(sorted[0], sorted[1], layoutMode);
  const expectedGap = explicitGap ?? 0;
  const minimumDelta = 32;
  if (
    measuredGap - expectedGap <= minimumDelta ||
    measuredGap <= Math.max(expectedGap * 3, expectedGap + minimumDelta)
  ) {
    return false;
  }

  const leadingInset = primaryAxisStart(sorted[0].absoluteRect, layoutMode) - primaryAxisStart(parentRect, layoutMode);
  const trailingInset = primaryAxisEnd(parentRect, layoutMode) - primaryAxisEnd(sorted[1].absoluteRect, layoutMode);
  return approximatelyEqualInset(leadingInset, leadingAxisPadding(styles, layoutMode), 2) &&
    approximatelyEqualInset(trailingInset, trailingAxisPadding(styles, layoutMode), 2);
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
  const sorted = sortedByPrimaryAxis(children, layoutMode);
  const gaps = [];

  for (let index = 1; index < sorted.length; index += 1) {
    const gap = primaryAxisGap(sorted[index - 1], sorted[index], layoutMode);
    if (gap >= 0) {
      gaps.push(gap);
    }
  }
  return gaps;
}

function sortedByPrimaryAxis(children, layoutMode) {
  return [...children].sort((a, b) => primaryAxisStart(a.absoluteRect, layoutMode) - primaryAxisStart(b.absoluteRect, layoutMode));
}

function primaryAxisGap(previous, current, layoutMode) {
  return primaryAxisStart(current.absoluteRect, layoutMode) - primaryAxisEnd(previous.absoluteRect, layoutMode);
}

function primaryAxisStart(rect, layoutMode) {
  return layoutMode === "HORIZONTAL" ? rect.x : rect.y;
}

function primaryAxisEnd(rect, layoutMode) {
  return layoutMode === "HORIZONTAL" ? rect.x + rect.width : rect.y + rect.height;
}

function primaryAxisSize(rect, layoutMode) {
  return layoutMode === "HORIZONTAL" ? rect.width : rect.height;
}

function counterAxisStart(rect, layoutMode) {
  return layoutMode === "HORIZONTAL" ? rect.y : rect.x;
}

function counterAxisSize(rect, layoutMode) {
  return layoutMode === "HORIZONTAL" ? rect.height : rect.width;
}

function leadingAxisPadding(styles, layoutMode) {
  return parseCssNumber(layoutMode === "HORIZONTAL" ? styles.paddingLeft : styles.paddingTop);
}

function trailingAxisPadding(styles, layoutMode) {
  return parseCssNumber(layoutMode === "HORIZONTAL" ? styles.paddingRight : styles.paddingBottom);
}

function leadingAxisMargin(model, layoutMode) {
  return parseCssNumber(layoutMode === "HORIZONTAL" ? model.styles?.marginLeft : model.styles?.marginTop);
}

function trailingAxisMargin(model, layoutMode) {
  return parseCssNumber(layoutMode === "HORIZONTAL" ? model.styles?.marginRight : model.styles?.marginBottom);
}

function leadingCounterAxisMargin(model, layoutMode) {
  return parseCssNumber(layoutMode === "HORIZONTAL" ? model.styles?.marginTop : model.styles?.marginLeft);
}

function trailingCounterAxisMargin(model, layoutMode) {
  return parseCssNumber(layoutMode === "HORIZONTAL" ? model.styles?.marginBottom : model.styles?.marginRight);
}

function approximatelyEqualInset(value, expected, tolerance) {
  return Math.abs(value - expected) <= tolerance;
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

function extractVisualStyle(node, context = {}) {
  const styles = node.styles ?? {};
  const borderSides = nativeBorderStrokeSidesFromStyles(styles);
  const opacity = cssOpacityFromStyles(styles);
  return {
    fills: cssFillsFromStyles(styles),
    strokes: borderSides.length > 0
      ? [strokeFromBorderSides(borderSides)]
      : cssStrokesFromStyles(styles),
    borderSides,
    cornerRadius: cornerRadiusFromStyles(styles),
    cornerRadii: cornerRadiiFromStyles(styles),
    effects: cssShadowStyleEffects(styles.boxShadow),
    ...(opacity === null ? {} : { opacity }),
    objectFit: styles.objectFit ?? "",
    transform: styles.transform ?? "",
    transformOrigin: styles.transformOrigin ?? "",
    color: styles.color ?? "",
    text: node.textContent ? {
      fontFamily: styles.fontFamily ?? "",
      fontSize: parseCssNumber(styles.fontSize),
      fontStyle: styles.fontStyle ?? "",
      fontWeight: styles.fontWeight ?? "",
      lineHeight: styles.lineHeight ?? "",
      color: textColorFromStyles(styles),
      textAlign: styles.textAlign ?? "",
      fills: cssTextFillsFromStyles(styles, context.textFillGradient)
    } : null
  };
}

function imageVisualStyleForNode(node, context = {}) {
  const style = extractVisualStyle(node, context);
  if (assetRoleForNode(node) !== "css-background") {
    return style;
  }
  return {
    ...style,
    imageScaleMode: cssBackgroundImageScaleMode(node.styles),
    backgroundSize: node.styles?.backgroundSize ?? "",
    backgroundPosition: node.styles?.backgroundPosition ?? "",
    backgroundRepeat: node.styles?.backgroundRepeat ?? ""
  };
}

function visualStyleForNode(node, context) {
  const style = extractVisualStyle(node, context);
  if (!shouldApplyTextOverlayBackdrop(node, context, style)) {
    return style;
  }
  return {
    ...style,
    fills: [context.backdropColor]
  };
}

function visualStyleWithSingleChildClip(node, children, style) {
  if (!shouldMirrorSingleChildClip(node, children, style)) {
    return style;
  }
  return {
    ...style,
    cornerRadius: children[0].style.cornerRadius,
    cornerRadii: children[0].style.cornerRadii
  };
}

function shouldMirrorSingleChildClip(node, children, style = {}) {
  if ((children?.length ?? 0) !== 1 || hasModelVisualStyle(style)) {
    return false;
  }
  const child = children[0];
  if (!child || child.type !== "IMAGE" || !(child.style?.cornerRadius > 0)) {
    return false;
  }
  if (!rectsMatchWithinTolerance(normalizeRect(node.rect), child.absoluteRect, 1)) {
    return false;
  }
  const tagName = normalizeCssKeyword(node.tagName);
  const classes = classTokens(node.attributes?.class);
  return tagName === "picture" ||
    classes.has("avatar") ||
    classes.has("image") ||
    classes.has("thumb") ||
    classes.has("cover") ||
    classes.has("poster");
}

function shouldApplyTextOverlayBackdrop(node, context, style) {
  return Boolean(
    context.clippedAncestor &&
    visibleColor(context.backdropColor) &&
    style.fills.length === 0 &&
    node.textContent &&
    normalizeCssKeyword(node.styles?.position) === "absolute" &&
    hasEllipsisPseudoChild(node)
  );
}

function hasEllipsisPseudoChild(node) {
  return (node.children ?? []).some((child) =>
    child.nodeType === "pseudo" &&
    String(child.textContent ?? "").trim() === "..."
  );
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
    cssFillsFromStyles(styles).length > 0 ||
    cssStrokesFromStyles(styles).length > 0 ||
    nativeBorderStrokeSidesFromStyles(styles).length > 0 ||
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
  const cssImageUrl = cssImageUrlFromStyles(node.styles);
  if (cssImageUrl && /\.svg(?:[?#]|$)/i.test(cssImageUrl)) {
    return "svg";
  }
  const ref = node.assetRef ?? node.fallbackRef ?? "";
  if (typeof ref === "string" && ref.toLowerCase().endsWith(".svg")) {
    return "svg";
  }
  return "raster";
}

function assetRoleForNode(node) {
  if (typeof node.attributes?.assetRole === "string") {
    return node.attributes.assetRole;
  }
  return hasCssImageUrl(node.styles) ? "css-background" : "";
}

function cssBackgroundImageScaleMode(styles = {}) {
  const backgroundSize = String(styles.backgroundSize ?? "").trim().toLowerCase();
  if (backgroundSize.includes("contain")) {
    return "FIT";
  }
  return "FILL";
}

function shouldCreateBackgroundImageLayer(node, children) {
  return node.tagName !== "img" &&
    node.tagName !== "svg" &&
    !node.textContent &&
    children.length > 0 &&
    (Boolean(node.assetRef) || hasCssImageUrl(node.styles));
}

function hasCssImageUrl(styles = {}) {
  return Boolean(cssImageUrlFromStyles(styles));
}

function cssImageUrlFromStyles(styles = {}) {
  return firstCssImageUrl(
    styles.content,
    styles.maskImage,
    styles.webkitMaskImage,
    styles.backgroundImage
  );
}

function firstCssImageUrl(...values) {
  for (const value of values) {
    if (typeof value !== "string" || value.length === 0 || value === "none") {
      continue;
    }
    const match = value.match(/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/i);
    if (match) {
      return (match[1] || match[2] || match[3] || "").trim();
    }
  }
  return "";
}

function visibleColor(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value !== "transparent" &&
    value !== "rgba(0, 0, 0, 0)";
}

function cssFillsFromStyles(styles = {}) {
  if (isBackgroundClippedToText(styles)) {
    return [];
  }
  if (maskedGradientBorderStroke(styles)) {
    return [];
  }

  const fills = [];
  if (visibleColor(styles.backgroundColor)) {
    fills.push(styles.backgroundColor);
  }
  if (visibleCssLinearGradient(styles.backgroundImage)) {
    fills.push(styles.backgroundImage);
  }
  return fills;
}

function cssTextFillsFromStyles(styles = {}, inheritedTextFillGradient = null) {
  const ownGradient = textFillGradientFromStyles(styles);
  if (ownGradient) {
    return [ownGradient];
  }
  return inheritedTextFillGradient && hasTransparentWebkitTextFill(styles)
    ? [inheritedTextFillGradient]
    : [];
}

function textFillGradientFromStyles(styles = {}) {
  return isBackgroundClippedToText(styles) && visibleCssLinearGradient(styles.backgroundImage)
    ? styles.backgroundImage
    : "";
}

function hasTransparentWebkitTextFill(styles = {}) {
  const value = normalizeCssKeyword(styles.webkitTextFillColor);
  return value === "transparent" ||
    value === "rgba(0, 0, 0, 0)" ||
    value === "rgba(0,0,0,0)" ||
    /\/\s*0\)?$/.test(value);
}

function isBackgroundClippedToText(styles = {}) {
  return cssClipIncludesText(styles.backgroundClip) ||
    cssClipIncludesText(styles.webkitBackgroundClip);
}

function cssClipIncludesText(value) {
  return String(value ?? "")
    .toLowerCase()
    .split(",")
    .map((item) => item.trim())
    .includes("text");
}

function textColorFromStyles(styles = {}) {
  if (visibleColor(styles.webkitTextFillColor)) {
    return styles.webkitTextFillColor;
  }
  return styles.color ?? "";
}

function visibleCssLinearGradient(value) {
  return typeof value === "string" &&
    /(?:^|,)\s*(?:repeating-)?linear-gradient\(/i.test(value);
}

function cssStrokesFromStyles(styles = {}) {
  const maskedGradientStroke = maskedGradientBorderStroke(styles);
  if (maskedGradientStroke) {
    return [maskedGradientStroke];
  }
  const sides = visibleBorderSides(styles);
  const borderStroke = uniformBorderStrokeFromSides(sides) ?? legacyTopBorderStroke(styles, sides);
  if (borderStroke) {
    return [borderStroke];
  }
  const outlineStroke = cssStrokeSide(styles.outlineWidth, styles.outlineColor, styles.outlineStyle);
  return outlineStroke ? [outlineStroke] : [];
}

function maskedGradientBorderStroke(styles = {}) {
  if (!visibleCssLinearGradient(styles.backgroundImage) || !hasLayeredCssMask(styles)) {
    return null;
  }
  const padding = explicitCssPadding(styles);
  if (!padding) {
    return null;
  }
  const widths = [padding.top, padding.right, padding.bottom, padding.left].filter((value) => value > 0);
  if (widths.length === 0) {
    return null;
  }
  return {
    color: styles.backgroundImage,
    width: Math.max(...widths)
  };
}

function hasLayeredCssMask(styles = {}) {
  const mask = `${styles.maskImage ?? ""}, ${styles.webkitMaskImage ?? ""}`;
  return (mask.match(/(?:linear-gradient|radial-gradient|url)\(/gi) ?? []).length >= 2;
}

function borderDecorationSides(styles = {}) {
  const sides = visibleBorderSides(styles);
  return uniformBorderStrokeFromSides(sides) ||
    legacyTopBorderStroke(styles, sides) ||
    nativeBorderStrokeSidesFromStyles(styles, sides).length > 0
    ? []
    : sides;
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

function nativeBorderStrokeSidesFromStyles(styles = {}, sides = visibleBorderSides(styles)) {
  if (sides.length === 0 ||
    uniformBorderStrokeFromSides(sides) ||
    legacyTopBorderStroke(styles, sides) ||
    cornerRadiusFromStyles(styles) <= 0 ||
    !sameBorderSidePaint(sides)
  ) {
    return [];
  }
  return sides;
}

function sameBorderSidePaint(sides) {
  const [first] = sides;
  return Boolean(first) && sides.every((side) => side.color === first.color);
}

function strokeFromBorderSides(sides) {
  const [first] = sides;
  return {
    color: first.color,
    width: Math.max(...sides.map((side) => side.width))
  };
}

function cornerRadiusFromStyles(styles = {}) {
  const radii = cornerRadiiFromStyles(styles);
  return Math.max(radii.topLeft, radii.topRight, radii.bottomRight, radii.bottomLeft);
}

function cornerRadiiFromStyles(styles = {}) {
  return {
    topLeft: parseCssNumber(styles.borderTopLeftRadius),
    topRight: parseCssNumber(styles.borderTopRightRadius),
    bottomRight: parseCssNumber(styles.borderBottomRightRadius),
    bottomLeft: parseCssNumber(styles.borderBottomLeftRadius)
  };
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

function cssShadowStyleEffects(value) {
  return outerCssShadows(value).map((shadow) => ({ type: "shadow", value: shadow }));
}

function outerCssShadows(value) {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim() === "none") {
    return [];
  }
  return splitTopLevelCssList(value)
    .map((shadow) => shadow.trim())
    .filter((shadow) => shadow.length > 0 && !/\binset\b/i.test(shadow));
}

function splitTopLevelCssList(value) {
  const parts = [];
  const source = String(value ?? "");
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth = Math.max(0, depth - 1);
    } else if (char === "," && depth === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}

function cssOpacityFromStyles(styles = {}) {
  if (styles.opacity === undefined || styles.opacity === "") {
    return null;
  }
  const opacity = Number.parseFloat(styles.opacity);
  if (!Number.isFinite(opacity) || opacity >= 1) {
    return null;
  }
  return clamp(opacity, 0, 1);
}

function visibleShadow(value) {
  return outerCssShadows(value).length > 0;
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
