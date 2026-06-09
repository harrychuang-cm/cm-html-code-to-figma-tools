(function () {
  var REQUIRED_FILES = ["manifest.json", "capture.json", "figma-plan.json", "diagnostics.json", "screenshot.png"];
  var IMPORT_PACKAGE = "IMPORT_PACKAGE";
  var IMPORT_SUCCESS = "IMPORT_SUCCESS";
  var IMPORT_ERROR = "IMPORT_ERROR";
  var FALLBACK_FONT = { family: "Inter", style: "Regular" };

  function postError(category, message) {
    figma.ui.postMessage({
      type: IMPORT_ERROR,
      error: {
        category: category || "import-error",
        message: message || "Import failed"
      }
    });
  }

  function postSuccess(report) {
    figma.ui.postMessage({
      type: IMPORT_SUCCESS,
      report: report
    });
  }

  function runImport(message) {
    Promise.resolve()
      .then(function () {
        if (!message || message.type !== IMPORT_PACKAGE) {
          return null;
        }
        return importBytes(toUint8Array(message.bytes));
      })
      .then(function (result) {
        if (!result) {
          return;
        }
        postSuccess(result.report);
      })
      .catch(function (error) {
        postError(error.category || "import-error", error.message || "Import failed");
      });
  }

  function importBytes(bytes) {
    var packageData = unpackFigcapture(bytes);
    return renderPackage(packageData).then(function (renderResult) {
      return {
        report: createReport(packageData, renderResult)
      };
    });
  }

  function unpackFigcapture(bytes) {
    var files = readZip(bytes);
    var index;
    for (index = 0; index < REQUIRED_FILES.length; index += 1) {
      if (!files[REQUIRED_FILES[index]]) {
        throw importError(missingCategory(REQUIRED_FILES[index]), REQUIRED_FILES[index] + " is required");
      }
    }

    var packageData = {
      manifest: decodeJson(files["manifest.json"], "manifest.json"),
      capture: decodeJson(files["capture.json"], "capture.json"),
      figmaPlan: decodeJson(files["figma-plan.json"], "figma-plan.json"),
      diagnostics: decodeJson(files["diagnostics.json"], "diagnostics.json"),
      screenshot: files["screenshot.png"],
      assets: {}
    };

    Object.keys(files).forEach(function (name) {
      if (name.indexOf("assets/") === 0) {
        packageData.assets[name] = files[name];
      }
    });

    validatePackage(packageData);
    return packageData;
  }

  function validatePackage(packageData) {
    var manifest = packageData.manifest;
    if (!manifest || manifest.schemaVersion !== "1.0.0") {
      throw importError("unsupported-schema-version", "Capture package schema version is unsupported");
    }
    if (!manifest.viewportWidth || !manifest.viewportHeight) {
      throw importError("invalid-package", "Viewport metadata is missing");
    }
    if (!packageData.capture || !packageData.capture.root) {
      throw importError("invalid-package", "Capture DOM tree is missing");
    }
  }

  function renderPackage(packageData) {
    var frames = createFrames(packageData);
    var sourceFrame = frames[0];
    var accurateFrame = frames[1];
    var layoutModels = createEditableLayoutNodeModels(packageData);
    var autoLayoutSummary = summarizeAutoLayoutModels(layoutModels);
    var fontPromises = [];
    var index;

    sourceFrame.appendChild(createImageNode("Source screenshot", packageData.screenshot, {
      x: 0,
      y: 0,
      width: packageData.manifest.viewportWidth,
      height: packageData.manifest.viewportHeight
    }, true, null, null));

    for (index = 0; index < layoutModels.length; index += 1) {
      accurateFrame.appendChild(createLayerTreeForModel(layoutModels[index], packageData, fontPromises));
    }

    return Promise.all(fontPromises).then(function () {
      return {
        frames: frames,
        layoutModels: layoutModels,
        autoLayoutSummary: autoLayoutSummary,
        autoLayoutFrameEnabled: false,
        fontSubstitutions: []
      };
    });
  }

  function createFrames(packageData) {
    var roles = ["Source Screenshot", "Editable Accurate"];
    var title = packageData.capture.title || titleFromUrl(packageData.manifest.sourceUrl);
    var width = packageData.manifest.viewportWidth;
    var height = packageData.manifest.viewportHeight;
    var frames = [];
    var index;

    for (index = 0; index < roles.length; index += 1) {
      var frame = figma.createFrame();
      frame.name = title + " / " + width + "x" + height + " / " + roles[index];
      frame.x = index * (width + 80);
      frame.y = 0;
      frame.resize(width, height);
      frame.clipsContent = true;
      frame.fills = [];
      if (figma.currentPage && typeof figma.currentPage.appendChild === "function") {
        figma.currentPage.appendChild(frame);
      }
      frames.push(frame);
    }

    return frames;
  }

  function createLayerTreeForModel(model, packageData, fontPromises) {
    var layer;
    var assetRef;
    var index;

    if (model.type === "FRAME") {
      layer = createFrameLayer(model);
      for (index = 0; index < model.children.length; index += 1) {
        layer.appendChild(createLayerTreeForModel(model.children[index], packageData, fontPromises));
      }
      return layer;
    }

    if (model.type === "TEXT") {
      layer = figma.createText();
      applyGeometry(layer, model.rect);
      layer.name = model.name;
      writeNodeMetadata(layer, "sourceNodeId", model.sourceNodeId);
      fontPromises.push(setTextLayer(layer, {
        textContent: model.text,
        styles: model.styles || {},
        textAutoResize: model.textAutoResize || "HEIGHT",
        layoutSizingHorizontal: model.layoutSizingHorizontal,
        layoutSizingVertical: model.layoutSizingVertical
      }));
      return layer;
    }

    if (model.type === "IMAGE" || model.type === "FALLBACK_IMAGE") {
      assetRef = model.assetRef || null;
      return createImageNode(
        model.name,
        packageData.assets[assetRef] || new Uint8Array(0),
        model.rect,
        false,
        assetRef,
        model.fallbackReason || null,
        model.assetKind || null
      );
    }

    return createRectNode(model.name, {
      rect: model.rect,
      styles: model.styles || {}
    });
  }

  function createFrameLayer(model) {
    var frame = figma.createFrame();
    applyGeometry(frame, model.rect);
    frame.name = model.name;
    frame.clipsContent = Boolean(model.clipsContent);
    applyVisualStyle(frame, model.styles || {});
    applyAutoLayout(frame, model.autoLayout);
    writeNodeMetadata(frame, "sourceNodeId", model.sourceNodeId);
    return frame;
  }

  function applyAutoLayout(frame, autoLayout) {
    if (!autoLayout) {
      return;
    }
    if (!autoLayout.applied) {
      writeNodeMetadata(frame, "autoLayoutSkippedReason", autoLayout.skippedReason);
      return;
    }
    try {
      frame.layoutMode = autoLayout.layoutMode || "NONE";
      frame.primaryAxisSizingMode = "FIXED";
      frame.counterAxisSizingMode = "FIXED";
      if (autoLayout.primaryAxisAlignItems) {
        frame.primaryAxisAlignItems = autoLayout.primaryAxisAlignItems;
      }
      if (autoLayout.counterAxisAlignItems) {
        frame.counterAxisAlignItems = autoLayout.counterAxisAlignItems;
      }
      frame.itemSpacing = Number(autoLayout.itemSpacing) || 0;
      frame.paddingLeft = Number(autoLayout.paddingLeft) || 0;
      frame.paddingRight = Number(autoLayout.paddingRight) || 0;
      frame.paddingTop = Number(autoLayout.paddingTop) || 0;
      frame.paddingBottom = Number(autoLayout.paddingBottom) || 0;
    } catch (error) {
      writeNodeMetadata(frame, "autoLayoutSkippedReason", "figma-property-rejected");
      return;
    }
    writeNodeMetadata(frame, "autoLayoutConfidence", autoLayout.confidence);
  }

  function createImageNode(name, bytes, rect, locked, assetRef, fallbackReasonValue, assetKind) {
    var imageBytes = toUint8Array(bytes);
    var image;
    var reason = fallbackReasonValue;
    var svgNode;
    var node;
    if (isSvgAsset(assetRef, assetKind, imageBytes) && typeof figma.createNodeFromSvg === "function") {
      try {
        svgNode = figma.createNodeFromSvg(decodeUtf8(imageBytes));
        applyGeometry(svgNode, rect);
        svgNode.name = name;
        svgNode.locked = Boolean(locked);
        writeNodeMetadata(svgNode, "assetRef", assetRef);
        writeNodeMetadata(svgNode, "assetKind", "svg");
        return svgNode;
      } catch (error) {
        reason = fallbackReasonValue || "svg-render-failed";
      }
    }

    node = figma.createRectangle();
    applyGeometry(node, rect);
    node.name = name;
    node.locked = Boolean(locked);
    if (isSupportedRasterImage(imageBytes)) {
      try {
        image = figma.createImage(imageBytes);
        node.fills = [{
          type: "IMAGE",
          scaleMode: "FILL",
          imageHash: image.hash
        }];
        writeNodeMetadata(node, "assetRef", assetRef);
        writeNodeMetadata(node, "fallbackReason", reason);
        writeNodeMetadata(node, "imageHash", image.hash);
        return node;
      } catch (error) {
        reason = fallbackReasonValue || "image decode failed";
      }
    } else {
      reason = fallbackReasonValue || (imageBytes.length > 0 ? "external or unsupported image asset" : "missing image asset");
    }
    node.name = name + " / Placeholder";
    applyImagePlaceholderStyle(node);
    writeNodeMetadata(node, "assetRef", assetRef);
    writeNodeMetadata(node, "fallbackReason", reason);
    return node;
  }

  function writeNodeMetadata(node, key, value) {
    if (value === null || typeof value === "undefined" || value === "") {
      return;
    }
    if (typeof node.setPluginData === "function") {
      try {
        node.setPluginData(key, String(value));
      } catch (error) {
        // Keep rendering alive when Figma rejects plugin data for a node type.
      }
    }
    try {
      node[key] = value;
    } catch (error) {
      // Real Figma nodes are not extensible; tests can still inspect mock nodes.
    }
  }

  function applyImagePlaceholderStyle(node) {
    node.fills = [{
      type: "SOLID",
      color: {
        r: 0.94,
        g: 0.95,
        b: 0.97
      },
      opacity: 1
    }];
    node.strokes = [{
      type: "SOLID",
      color: {
        r: 0.64,
        g: 0.68,
        b: 0.74
      },
      opacity: 1
    }];
    node.strokeWeight = 1;
  }

  function createRectNode(name, captureNode) {
    var node = figma.createRectangle();
    var styles = captureNode.styles || {};
    applyGeometry(node, captureNode.rect);
    node.name = name;
    applyVisualStyle(node, styles);
    return node;
  }

  function applyVisualStyle(node, styles) {
    node.fills = paintArray(styles.backgroundColor);
    if (numberFromCss(styles.borderTopWidth) > 0 && parseCssColor(styles.borderTopColor)) {
      node.strokes = paintArray(styles.borderTopColor);
      node.strokeWeight = numberFromCss(styles.borderTopWidth);
    } else {
      node.strokes = [];
      node.strokeWeight = 0;
    }
    node.cornerRadius = Math.max(
      numberFromCss(styles.borderTopLeftRadius),
      numberFromCss(styles.borderTopRightRadius),
      numberFromCss(styles.borderBottomRightRadius),
      numberFromCss(styles.borderBottomLeftRadius)
    );
  }

  function setTextLayer(layer, captureNode) {
    var styles = captureNode.styles || {};
    var requestedFont = {
      family: parseFontFamily(styles.fontFamily) || FALLBACK_FONT.family,
      style: numberFromCss(styles.fontWeight) >= 600 ? "Bold" : "Regular"
    };

    return figma.loadFontAsync(requestedFont)
      .then(function () {
        return requestedFont;
      })
      .catch(function () {
        return figma.loadFontAsync(FALLBACK_FONT).then(function () {
          return FALLBACK_FONT;
        });
      })
      .then(function (fontName) {
        layer.fontName = fontName;
        layer.characters = captureNode.textContent || "";
        if (numberFromCss(styles.fontSize) > 0) {
          layer.fontSize = numberFromCss(styles.fontSize);
        }
        if (numberFromCss(styles.lineHeight) > 0) {
          try {
            layer.lineHeight = {
              unit: "PIXELS",
              value: numberFromCss(styles.lineHeight)
            };
          } catch (error) {
            // Keep importing text even when line-height cannot be set.
          }
        }
        layer.fills = paintArray(styles.color);
        applyTextResizeAndLayoutSizing(layer, captureNode);
      });
  }

  function applyTextResizeAndLayoutSizing(layer, captureNode) {
    var textAutoResize = captureNode.textAutoResize || "HEIGHT";
    var layoutSizingHorizontal = captureNode.layoutSizingHorizontal ||
      (textAutoResize === "WIDTH_AND_HEIGHT" ? "HUG" : "FIXED");
    var layoutSizingVertical = captureNode.layoutSizingVertical || "HUG";

    try {
      layer.textAutoResize = textAutoResize;
    } catch (error) {
      // Text remains editable even when auto-resize is unavailable.
    }
    safeSetFigmaProperty(layer, "layoutSizingHorizontal", layoutSizingHorizontal);
    safeSetFigmaProperty(layer, "layoutSizingVertical", layoutSizingVertical);
    if (layoutSizingHorizontal === "HUG") {
      safeSetFigmaProperty(layer, "layoutGrow", 0);
    }
  }

  function safeSetFigmaProperty(node, property, value) {
    try {
      node[property] = value;
    } catch (error) {
      // Older or stricter Figma hosts can reject newer layout sizing properties.
    }
  }

  function createEditableLayoutNodeModels(packageData) {
    var rootModel = createLayoutModel(packageData.capture.root, {
      parentRect: { x: 0, y: 0, width: 0, height: 0 },
      fallbackReasons: createFallbackReasonLookup(packageData)
    });
    return rootModel ? [rootModel] : [];
  }

  function createFallbackReasonLookup(packageData) {
    var reasons = packageData.diagnostics && packageData.diagnostics.fallbackReasons || [];
    var lookup = {};
    var index;
    for (index = 0; index < reasons.length; index += 1) {
      lookup[reasons[index].sourceNodeId] = reasons[index].reason;
    }
    return lookup;
  }

  function createLayoutModel(node, context) {
    var absoluteRect;
    var rect;
    var children = [];
    var nodeChildren;
    var index;
    var childModel;
    var model;

    if (!node) {
      return null;
    }

    absoluteRect = normalizeModelRect(node.rect);
    rect = relativeModelRect(absoluteRect, context.parentRect);
    nodeChildren = node.children || [];
    for (index = 0; index < nodeChildren.length; index += 1) {
      childModel = createLayoutModel(nodeChildren[index], {
        parentRect: absoluteRect,
        fallbackReasons: context.fallbackReasons
      });
      if (childModel) {
        children.push(childModel);
      }
    }

    if (node.textContent) {
      model = baseLayoutModel(node, "TEXT", rect, absoluteRect, []);
      model.text = node.textContent;
      model.textAutoResize = inferTextAutoResize(node, rect);
      model.layoutSizingHorizontal = textLayoutSizingHorizontal(model.textAutoResize);
      model.layoutSizingVertical = textLayoutSizingVertical(model.textAutoResize);
      if (hasVisualBoxStyle(node.styles)) {
        var backingPadding = explicitCssPadding(node.styles);
        var shouldUsePaddedBacking = hasPositivePadding(backingPadding);
        var backingTextAutoResize = shouldUsePaddedBacking
          ? inferTextContentAutoResize(node, rect)
          : "HEIGHT";
        childModel = model;
        childModel.rect = shouldUsePaddedBacking
          ? contentRectFromPadding(rect, backingPadding)
          : { x: 0, y: 0, width: rect.width, height: rect.height };
        childModel.textAutoResize = backingTextAutoResize;
        childModel.layoutSizingHorizontal = textLayoutSizingHorizontal(backingTextAutoResize);
        childModel.layoutSizingVertical = textLayoutSizingVertical(backingTextAutoResize);
        model = baseLayoutModel(node, "FRAME", rect, absoluteRect, [childModel]);
        model.name = "Text Background / " + String(node.textContent || "").slice(0, 32);
        model.autoLayout = shouldUsePaddedBacking ? textBackingAutoLayout(backingPadding, backingTextAutoResize) : null;
      }
      return model;
    }

    if (node.fallbackRef) {
      model = baseLayoutModel(node, "FALLBACK_IMAGE", rect, absoluteRect, []);
      model.assetRef = node.fallbackRef;
      model.assetKind = assetKindForNode(node);
      model.fallbackReason = context.fallbackReasons[node.sourceNodeId] || "raster fallback";
      return model;
    }

    if (node.assetRef || node.tagName === "img") {
      model = baseLayoutModel(node, "IMAGE", rect, absoluteRect, []);
      model.assetRef = node.assetRef || null;
      model.assetKind = assetKindForNode(node);
      return model;
    }

    if (children.length > 0) {
      model = baseLayoutModel(node, "FRAME", rect, absoluteRect, children);
      model.autoLayout = inferAutoLayout(node, children);
      model.children = orderedChildrenForAutoLayout(children, model.autoLayout);
      model.clipsContent = shouldClipContent(node);
      return model;
    }

    if (!isRenderable(node)) {
      return null;
    }

    return baseLayoutModel(node, "RECTANGLE", rect, absoluteRect, []);
  }

  function baseLayoutModel(node, type, rect, absoluteRect, children) {
    return {
      id: node.sourceNodeId,
      type: type,
      name: layoutLayerNameForNode(node, type),
      sourceNodeId: node.sourceNodeId,
      rect: rect,
      absoluteRect: absoluteRect,
      style: extractVisualStyle(node),
      styles: node.styles || {},
      children: children
    };
  }

  function inferAutoLayout(node, children) {
    var styles = node.styles || {};
    var display = styles.display || "";
    var position = styles.position || "";
    var parentRect;
    var layoutMode;
    var spacing;
    var primaryAxisAlignItems;
    var counterAxisAlignItems;
    var padding;
    var paddingResult;
    var flexDirection;
    var index;
    var isFlex;
    var canTrySingleChildAlignment;

    if (position === "fixed" || position === "sticky") {
      return skippedLayout("fixed-or-sticky-layout");
    }
    if (display === "grid" || display === "inline-grid") {
      return skippedLayout("complex-grid");
    }
    isFlex = display === "flex" || display === "inline-flex";
    canTrySingleChildAlignment = children.length === 1 &&
      (isFlex || hasPotentialLineHeightAlignment(node, children[0]));
    if (!isFlex && !canTrySingleChildAlignment) {
      return null;
    }
    if (!hasUsableBounds(node.rect)) {
      return skippedLayout("missing-bounds");
    }
    for (index = 0; index < children.length; index += 1) {
      if (!hasUsableBounds(children[index].absoluteRect)) {
        return skippedLayout("missing-bounds");
      }
    }
    parentRect = normalizeModelRect(node.rect);
    if (hasOutOfBoundsChild(parentRect, children)) {
      return skippedLayout("out-of-bounds-child");
    }

    if (children.length === 1) {
      var singleChildLayout = inferSingleChildTextAutoLayout(node, children[0], parentRect);
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

    flexDirection = styles.flexDirection || "row";
    layoutMode = String(flexDirection).indexOf("column") === 0 ? "VERTICAL" : "HORIZONTAL";
    if (hasPrimaryAxisOverlap(children, layoutMode)) {
      return skippedLayout("overlapping-layout");
    }

    primaryAxisAlignItems = primaryAxisAlignmentFromCss(styles.justifyContent);
    counterAxisAlignItems = counterAxisAlignmentFromCss(styles.alignItems);
    if (hasNonUniformImplicitSpacing(styles, children, layoutMode, primaryAxisAlignItems)) {
      return skippedLayout("non-uniform-spacing");
    }
    spacing = explicitSpacing(styles, layoutMode);
    if (spacing === null) {
      spacing = measuredSpacing(children, layoutMode);
    }
    paddingResult = resolvePadding(styles, parentRect, children);
    padding = alignmentAwarePadding(
      paddingResult.padding,
      layoutMode,
      primaryAxisAlignItems,
      counterAxisAlignItems,
      paddingResult.explicit
    );

    return {
      applied: true,
      layoutMode: layoutMode,
      itemSpacing: spacing,
      primaryAxisAlignItems: primaryAxisAlignItems,
      counterAxisAlignItems: counterAxisAlignItems,
      paddingLeft: padding.left,
      paddingRight: padding.right,
      paddingTop: padding.top,
      paddingBottom: padding.bottom,
      reversedChildren: isReverseFlexDirection(flexDirection),
      confidence: 0.92
    };
  }

  function orderedChildrenForAutoLayout(children, autoLayout) {
    if (autoLayout && autoLayout.applied && autoLayout.reversedChildren) {
      return children.slice().reverse();
    }
    return children;
  }

  function isReverseFlexDirection(value) {
    var normalized = normalizeCssKeyword(value);
    return normalized === "row-reverse" || normalized === "column-reverse";
  }

  function inferSingleChildTextAutoLayout(node, child, parentRect) {
    var styles = node.styles || {};
    var display = styles.display || "";
    var isFlex = display === "flex" || display === "inline-flex";
    var text = String(child.text || "");
    var flexDirection;
    var layoutMode;
    var primaryAxisAlignItems;
    var counterAxisAlignItems;
    var hasFlexAlignment;
    var hasLineHeightAlignment;
    var padding;
    var paddingResult;

    if (child.type !== "TEXT" || text.indexOf("\n") >= 0) {
      return null;
    }

    flexDirection = styles.flexDirection || "row";
    layoutMode = isFlex && String(flexDirection).indexOf("column") === 0 ? "VERTICAL" : "HORIZONTAL";
    primaryAxisAlignItems = primaryAxisAlignmentFromCss(styles.justifyContent);
    counterAxisAlignItems = counterAxisAlignmentFromCss(styles.alignItems);
    hasFlexAlignment = isFlex && Boolean(primaryAxisAlignItems || counterAxisAlignItems);
    hasLineHeightAlignment = hasLineHeightAlignmentEvidence(styles, child, parentRect);
    if (!hasFlexAlignment && parentRect.height <= child.absoluteRect.height + 1) {
      return null;
    }
    if (!hasFlexAlignment && !hasLineHeightAlignment) {
      return null;
    }
    if (hasLineHeightAlignment && layoutMode === "HORIZONTAL" && !counterAxisAlignItems) {
      counterAxisAlignItems = "CENTER";
    }

    paddingResult = resolvePadding(styles, parentRect, [child]);
    padding = alignmentAwarePadding(
      paddingResult.padding,
      layoutMode,
      primaryAxisAlignItems,
      counterAxisAlignItems,
      paddingResult.explicit
    );

    return {
      applied: true,
      layoutMode: layoutMode,
      itemSpacing: 0,
      primaryAxisAlignItems: primaryAxisAlignItems,
      counterAxisAlignItems: counterAxisAlignItems,
      paddingLeft: padding.left,
      paddingRight: padding.right,
      paddingTop: padding.top,
      paddingBottom: padding.bottom,
      confidence: 0.86
    };
  }

  function hasLineHeightAlignmentEvidence(styles, child, parentRect) {
    var childStyle = child.style || {};
    var childTextStyle = childStyle.text || {};
    var parentLineHeight = numberFromCss(styles.lineHeight);
    var childLineHeight = numberFromCss(childTextStyle.lineHeight);
    return approximatelyEqual(parentLineHeight, parentRect.height, 1) ||
      approximatelyEqual(childLineHeight, parentRect.height, 1);
  }

  function hasPotentialLineHeightAlignment(node, child) {
    var styles = node.styles || {};
    var childStyle = child && child.style || {};
    var childTextStyle = childStyle.text || {};
    return child && child.type === "TEXT" &&
      (numberFromCss(styles.lineHeight) > 0 || numberFromCss(childTextStyle.lineHeight) > 0);
  }

  function approximatelyEqual(value, expected, tolerance) {
    return value > 0 && Math.abs(value - expected) <= tolerance;
  }

  function skippedLayout(skippedReason) {
    return {
      applied: false,
      skippedReason: skippedReason,
      confidence: 0
    };
  }

  function alignmentAwarePadding(padding, layoutMode, primaryAxisAlignItems, counterAxisAlignItems, explicitPadding) {
    var nextPadding = {
      left: padding.left,
      right: padding.right,
      top: padding.top,
      bottom: padding.bottom
    };
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
    var normalized = normalizeCssKeyword(value);
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
    var normalized = normalizeCssKeyword(value);
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
    return typeof value === "string" ? value.replace(/^\s+|\s+$/g, "").toLowerCase() : "";
  }

  function hasOutOfBoundsChild(parentRect, children) {
    var tolerance = 1;
    var parentRight = parentRect.x + parentRect.width;
    var parentBottom = parentRect.y + parentRect.height;
    var index;
    var child;
    var childRect;

    for (index = 0; index < children.length; index += 1) {
      child = children[index];
      if (isNonvisualWrapper(child)) {
        return true;
      }
      childRect = child.absoluteRect;
      if (
        childRect.x < parentRect.x - tolerance ||
        childRect.y < parentRect.y - tolerance ||
        childRect.x + childRect.width > parentRight + tolerance ||
        childRect.y + childRect.height > parentBottom + tolerance
      ) {
        return true;
      }
      if (child.rect.x < -tolerance || child.rect.y < -tolerance) {
        return true;
      }
    }
    return false;
  }

  function isNonvisualWrapper(child) {
    return child.type === "FRAME" &&
      (child.children || []).length > 0 &&
      child.absoluteRect.width <= 1 &&
      child.absoluteRect.height <= 1 &&
      !hasModelVisualStyle(child.style);
  }

  function hasModelVisualStyle(style) {
    var safeStyle = style || {};
    return (safeStyle.fills || []).length > 0 ||
      (safeStyle.strokes || []).length > 0 ||
      (safeStyle.effects || []).length > 0;
  }

  function inferTextAutoResize(node, rect) {
    if (hasVisualBoxStyle(node.styles)) {
      return "HEIGHT";
    }
    return inferTextContentAutoResize(node, rect);
  }

  function inferTextContentAutoResize(node, rect) {
    var styles;
    var lineHeight;

    if (String(node.textContent || "").indexOf("\n") >= 0) {
      return "HEIGHT";
    }

    styles = node.styles || {};
    lineHeight = numberFromCss(styles.lineHeight) || numberFromCss(styles.fontSize) * 1.2;
    if (lineHeight > 0 && rect.height > lineHeight * 1.75) {
      return "HEIGHT";
    }

    return "WIDTH_AND_HEIGHT";
  }

  function textBackingAutoLayout(padding, textAutoResize) {
    var isSingleLineHugText = textAutoResize === "WIDTH_AND_HEIGHT";
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

  function textLayoutSizingHorizontal(textAutoResize) {
    return textAutoResize === "WIDTH_AND_HEIGHT" ? "HUG" : "FIXED";
  }

  function textLayoutSizingVertical() {
    return "HUG";
  }

  function summarizeAutoLayoutModels(models) {
    var applied = [];
    var skipped = [];
    var totalConfidence = 0;

    walkLayoutModels(models, function (model) {
      if (!model.autoLayout) {
        return;
      }
      if (model.autoLayout.applied) {
        applied.push(model.autoLayout);
        return;
      }
      if (model.autoLayout.skippedReason) {
        skipped.push({
          sourceNodeId: model.sourceNodeId || "",
          reason: model.autoLayout.skippedReason
        });
      }
    });

    applied.forEach(function (item) {
      totalConfidence += Number(item.confidence) || 0;
    });

    return {
      appliedCount: applied.length,
      skippedCount: skipped.length,
      averageConfidence: applied.length === 0 ? 0 : round(totalConfidence / applied.length),
      skippedReasons: skipped
    };
  }

  function walkLayoutModels(models, visit) {
    var index;
    for (index = 0; index < models.length; index += 1) {
      visit(models[index]);
      walkLayoutModels(models[index].children || [], visit);
    }
  }

  function hasPrimaryAxisOverlap(children, layoutMode) {
    var sorted = children.slice().sort(function (a, b) {
      return layoutMode === "HORIZONTAL"
        ? a.absoluteRect.x - b.absoluteRect.x
        : a.absoluteRect.y - b.absoluteRect.y;
    });
    var index;
    var previous;
    var current;
    var previousEnd;
    var currentStart;

    for (index = 1; index < sorted.length; index += 1) {
      previous = sorted[index - 1].absoluteRect;
      current = sorted[index].absoluteRect;
      previousEnd = layoutMode === "HORIZONTAL"
        ? previous.x + previous.width
        : previous.y + previous.height;
      currentStart = layoutMode === "HORIZONTAL" ? current.x : current.y;
      if (currentStart < previousEnd - 0.5) {
        return true;
      }
    }
    return false;
  }

  function explicitSpacing(styles, layoutMode) {
    var axisGap = layoutMode === "HORIZONTAL" ? styles.columnGap : styles.rowGap;
    var parsedAxis = numberFromCss(axisGap);
    var parsedGap;
    if (parsedAxis > 0) {
      return parsedAxis;
    }
    parsedGap = numberFromCss(styles.gap);
    return parsedGap > 0 ? parsedGap : null;
  }

  function measuredSpacing(children, layoutMode) {
    var gaps = primaryAxisGaps(children, layoutMode);
    if (gaps.length === 0) {
      return 0;
    }
    gaps.sort(function (a, b) {
      return a - b;
    });
    return round(gaps[Math.floor(gaps.length / 2)]);
  }

  function hasNonUniformImplicitSpacing(styles, children, layoutMode, primaryAxisAlignItems) {
    var gaps;
    var expectedGap;
    var largestGap;
    var minimumDelta = 32;
    if (children.length < 3 || primaryAxisAlignItems === "SPACE_BETWEEN") {
      return false;
    }
    gaps = primaryAxisGaps(children, layoutMode).sort(function (a, b) {
      return a - b;
    });
    if (gaps.length < 2) {
      return false;
    }
    expectedGap = explicitSpacing(styles, layoutMode);
    if (expectedGap === null) {
      expectedGap = gaps[0];
    }
    largestGap = gaps[gaps.length - 1];
    return largestGap - expectedGap > minimumDelta &&
      largestGap > Math.max(expectedGap * 3, expectedGap + minimumDelta);
  }

  function primaryAxisGaps(children, layoutMode) {
    var sorted = children.slice().sort(function (a, b) {
      return layoutMode === "HORIZONTAL"
        ? a.absoluteRect.x - b.absoluteRect.x
        : a.absoluteRect.y - b.absoluteRect.y;
    });
    var gaps = [];
    var index;
    var previous;
    var current;
    var gap;

    for (index = 1; index < sorted.length; index += 1) {
      previous = sorted[index - 1].absoluteRect;
      current = sorted[index].absoluteRect;
      gap = layoutMode === "HORIZONTAL"
        ? current.x - (previous.x + previous.width)
        : current.y - (previous.y + previous.height);
      if (gap >= 0) {
        gaps.push(gap);
      }
    }

    return gaps;
  }

  function inferPadding(parentRect, children) {
    var minX = null;
    var minY = null;
    var maxX = null;
    var maxY = null;
    var index;
    var rect;

    for (index = 0; index < children.length; index += 1) {
      rect = children[index].absoluteRect;
      minX = minX === null ? rect.x : Math.min(minX, rect.x);
      minY = minY === null ? rect.y : Math.min(minY, rect.y);
      maxX = maxX === null ? rect.x + rect.width : Math.max(maxX, rect.x + rect.width);
      maxY = maxY === null ? rect.y + rect.height : Math.max(maxY, rect.y + rect.height);
    }

    return {
      left: round(Math.max(0, minX - parentRect.x)),
      right: round(Math.max(0, parentRect.x + parentRect.width - maxX)),
      top: round(Math.max(0, minY - parentRect.y)),
      bottom: round(Math.max(0, parentRect.y + parentRect.height - maxY))
    };
  }

  function resolvePadding(styles, parentRect, children) {
    var explicit = explicitCssPadding(styles);
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

  function explicitCssPadding(styles) {
    var safeStyles = styles || {};
    var hasPadding = safeStyles.paddingTop !== undefined && safeStyles.paddingTop !== "" ||
      safeStyles.paddingRight !== undefined && safeStyles.paddingRight !== "" ||
      safeStyles.paddingBottom !== undefined && safeStyles.paddingBottom !== "" ||
      safeStyles.paddingLeft !== undefined && safeStyles.paddingLeft !== "";
    if (!hasPadding) {
      return null;
    }
    return {
      left: round(Math.max(0, numberFromCss(safeStyles.paddingLeft))),
      right: round(Math.max(0, numberFromCss(safeStyles.paddingRight))),
      top: round(Math.max(0, numberFromCss(safeStyles.paddingTop))),
      bottom: round(Math.max(0, numberFromCss(safeStyles.paddingBottom)))
    };
  }

  function extractVisualStyle(node) {
    var styles = node.styles || {};
    return {
      fills: visibleColor(styles.backgroundColor) ? [styles.backgroundColor] : [],
      strokes: visibleBorder(styles) ? [{
        color: styles.borderTopColor,
        width: numberFromCss(styles.borderTopWidth)
      }] : [],
      cornerRadius: Math.max(
        numberFromCss(styles.borderTopLeftRadius),
        numberFromCss(styles.borderTopRightRadius),
        numberFromCss(styles.borderBottomRightRadius),
        numberFromCss(styles.borderBottomLeftRadius)
      ),
      effects: visibleShadow(styles.boxShadow) ? [{ type: "shadow", value: styles.boxShadow }] : [],
      text: node.textContent ? {
        fontFamily: styles.fontFamily || "",
        fontSize: numberFromCss(styles.fontSize),
        fontWeight: styles.fontWeight || "",
        lineHeight: styles.lineHeight || "",
        color: styles.color || ""
      } : null
    };
  }

  function layoutLayerNameForNode(node, type) {
    var alt = node.attributes && node.attributes.alt;
    if (type === "TEXT") {
      return "Text / " + String(node.textContent || "").slice(0, 32);
    }
    if (type === "FALLBACK_IMAGE") {
      return "Fallback / " + node.tagName;
    }
    if (type === "IMAGE") {
      return assetKindForNode(node) === "svg"
        ? "Vector / " + (alt || node.tagName)
        : "Image / " + (alt || node.tagName);
    }
    if (type === "FRAME") {
      return "Frame / " + node.tagName;
    }
    return "Shape / " + node.tagName;
  }

  function hasUsableBounds(rect) {
    return rect &&
      isFinite(rect.x) &&
      isFinite(rect.y) &&
      isFinite(rect.width) &&
      isFinite(rect.height) &&
      rect.width > 0 &&
      rect.height > 0;
  }

  function relativeModelRect(rect, parentRect) {
    return {
      x: round(rect.x - (parentRect.x || 0)),
      y: round(rect.y - (parentRect.y || 0)),
      width: rect.width,
      height: rect.height
    };
  }

  function normalizeModelRect(rect) {
    var safeRect = rect || {};
    return {
      x: Number(safeRect.x) || 0,
      y: Number(safeRect.y) || 0,
      width: Number(safeRect.width) || 0,
      height: Number(safeRect.height) || 0
    };
  }

  function hasVisualBoxStyle(styles) {
    var safeStyles = styles || {};
    return Boolean(
      visibleColor(safeStyles.backgroundColor) ||
      visibleBorder(safeStyles) ||
      visibleShadow(safeStyles.boxShadow)
    );
  }

  function shouldClipContent(node) {
    var overflow = node.styles && node.styles.overflow;
    return overflow === "hidden" || overflow === "clip" || overflow === "scroll" || overflow === "auto";
  }

  function assetKindForNode(node) {
    var ref;
    if (node.attributes && node.attributes.assetKind) {
      return node.attributes.assetKind;
    }
    ref = node.assetRef || node.fallbackRef || "";
    if (String(ref).toLowerCase().slice(-4) === ".svg") {
      return "svg";
    }
    return "raster";
  }

  function visibleColor(value) {
    var color = parseCssColor(value);
    return Boolean(color && color.a > 0);
  }

  function visibleBorder(styles) {
    return numberFromCss(styles.borderTopWidth) > 0 && visibleColor(styles.borderTopColor);
  }

  function visibleShadow(value) {
    return typeof value === "string" && value.length > 0 && value !== "none";
  }

  function createReport(packageData, renderResult) {
    var diagnostics = packageData.diagnostics || {};
    var counts = diagnostics.counts || {};
    var autoLayoutSummary = renderResult.autoLayoutSummary || {
      appliedCount: 0,
      skippedCount: 0,
      averageConfidence: 0,
      skippedReasons: []
    };
    return {
      createdFrameCount: renderResult.frames.length,
      createdNodeCount: countNodes(renderResult.frames),
      fallbackCount: counts.fallbacks || 0,
      missingAssetCount: counts.missingAssets || 0,
      unsupportedStyleCount: counts.unsupportedStyles || 0,
      fontSubstitutions: renderResult.fontSubstitutions || [],
      autoLayoutConfidenceSummary: autoLayoutSummary
    };
  }

  function countNodes(nodes) {
    var count = 0;
    var index;
    for (index = 0; index < nodes.length; index += 1) {
      count += 1;
      count += countNodes(nodes[index].children || []);
    }
    return count;
  }

  function isRenderable(node) {
    var styles = node.styles || {};
    return Boolean(
      node.textContent ||
      node.assetRef ||
      node.fallbackRef ||
      node.tagName === "img" ||
      parseCssColor(styles.backgroundColor) ||
      numberFromCss(styles.borderTopWidth) > 0
    );
  }

  function fallbackReason(packageData, sourceNodeId) {
    var reasons = packageData.diagnostics && packageData.diagnostics.fallbackReasons || [];
    var index;
    for (index = 0; index < reasons.length; index += 1) {
      if (reasons[index].sourceNodeId === sourceNodeId) {
        return reasons[index].reason;
      }
    }
    return "raster fallback";
  }

  function traverse(node, visit) {
    var children;
    var index;
    if (!node) {
      return;
    }
    visit(node);
    children = node.children || [];
    for (index = 0; index < children.length; index += 1) {
      traverse(children[index], visit);
    }
  }

  function applyGeometry(node, rect) {
    var safeRect = rect || {};
    node.x = Number(safeRect.x) || 0;
    node.y = Number(safeRect.y) || 0;
    node.resize(Math.max(1, Number(safeRect.width) || 1), Math.max(1, Number(safeRect.height) || 1));
  }

  function paintArray(value) {
    var color = parseCssColor(value);
    if (!color) {
      return [];
    }
    return [{
      type: "SOLID",
      color: {
        r: color.r / 255,
        g: color.g / 255,
        b: color.b / 255
      },
      opacity: color.a
    }];
  }

  function parseCssColor(value) {
    var match;
    var parts;
    if (typeof value !== "string" || value === "" || value === "transparent") {
      return null;
    }
    match = value.match(/^rgba?\(([^)]+)\)$/i);
    if (!match) {
      return null;
    }
    parts = match[1].split(",").map(function (part) {
      return Number(part.trim());
    });
    if (parts.length < 3 || !isFinite(parts[0]) || !isFinite(parts[1]) || !isFinite(parts[2])) {
      return null;
    }
    return {
      r: clamp(parts[0], 0, 255),
      g: clamp(parts[1], 0, 255),
      b: clamp(parts[2], 0, 255),
      a: clamp(isFinite(parts[3]) ? parts[3] : 1, 0, 1)
    };
  }

  function inferAxis(children) {
    var minX;
    var maxX;
    var minY;
    var maxY;
    var index;
    if (children.length < 2) {
      return "x";
    }
    minX = maxX = children[0].rect.x;
    minY = maxY = children[0].rect.y;
    for (index = 1; index < children.length; index += 1) {
      minX = Math.min(minX, children[index].rect.x);
      maxX = Math.max(maxX, children[index].rect.x);
      minY = Math.min(minY, children[index].rect.y);
      maxY = Math.max(maxY, children[index].rect.y);
    }
    return (maxX - minX) >= (maxY - minY) ? "x" : "y";
  }

  function parseFontFamily(value) {
    return String(value || "").split(",")[0].trim().replace(/^['"]|['"]$/g, "");
  }

  function numberFromCss(value) {
    var parsed = parseFloat(value);
    return isFinite(parsed) ? parsed : 0;
  }

  function titleFromUrl(url) {
    var normalized = String(url || "");
    var withoutQuery;
    var path;
    var parts;
    if (!normalized) {
      return "Capture";
    }
    withoutQuery = normalized.split("?")[0].split("#")[0];
    path = withoutQuery.replace(/^https?:\/\/[^/]+/i, "");
    parts = path.split("/").filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1].replace(/-/g, " ");
    }
    return normalized.replace(/^https?:\/\//i, "").split("/")[0] || "Capture";
  }

  function missingCategory(fileName) {
    if (fileName === "manifest.json") {
      return "missing-manifest";
    }
    if (fileName === "screenshot.png") {
      return "missing-screenshot";
    }
    return "missing-file";
  }

  function importError(category, message) {
    var error = new Error(message);
    error.category = category;
    return error;
  }

  function decodeJson(files, name) {
    try {
      return JSON.parse(decodeUtf8(files));
    } catch (error) {
      throw importError("invalid-json", name + " must contain valid JSON");
    }
  }

  function readZip(bytes) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var eocdOffset = findEndOfCentralDirectory(bytes);
    var entryCount;
    var centralOffset;
    var files = {};
    var index;

    if (eocdOffset < 0) {
      throw importError("invalid-package", "ZIP end of central directory not found");
    }

    entryCount = view.getUint16(eocdOffset + 10, true);
    centralOffset = view.getUint32(eocdOffset + 16, true);

    for (index = 0; index < entryCount; index += 1) {
      var compressedSize;
      var nameLength;
      var extraLength;
      var commentLength;
      var localOffset;
      var nameStart;
      var name;
      var localNameLength;
      var localExtraLength;
      var dataStart;

      if (view.getUint32(centralOffset, true) !== 0x02014b50) {
        throw importError("invalid-package", "Invalid ZIP central directory header");
      }
      if (view.getUint16(centralOffset + 10, true) !== 0) {
        throw importError("invalid-package", "Only stored ZIP entries are supported");
      }

      compressedSize = view.getUint32(centralOffset + 20, true);
      nameLength = view.getUint16(centralOffset + 28, true);
      extraLength = view.getUint16(centralOffset + 30, true);
      commentLength = view.getUint16(centralOffset + 32, true);
      localOffset = view.getUint32(centralOffset + 42, true);
      nameStart = centralOffset + 46;
      name = decodeUtf8(copyBytes(bytes, nameStart, nameStart + nameLength));

      if (view.getUint32(localOffset, true) !== 0x04034b50) {
        throw importError("invalid-package", "Invalid ZIP local file header");
      }

      localNameLength = view.getUint16(localOffset + 26, true);
      localExtraLength = view.getUint16(localOffset + 28, true);
      dataStart = localOffset + 30 + localNameLength + localExtraLength;
      files[name] = copyBytes(bytes, dataStart, dataStart + compressedSize);
      centralOffset = nameStart + nameLength + extraLength + commentLength;
    }
    return files;
  }

  function findEndOfCentralDirectory(bytes) {
    var offset;
    for (offset = bytes.length - 22; offset >= 0; offset -= 1) {
      if (bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b && bytes[offset + 2] === 0x05 && bytes[offset + 3] === 0x06) {
        return offset;
      }
    }
    return -1;
  }

  function toUint8Array(value) {
    if (value instanceof Uint8Array) {
      return value;
    }
    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }
    if (Array.isArray(value)) {
      var arrayBytes = new Uint8Array(value.length);
      var index;
      for (index = 0; index < value.length; index += 1) {
        arrayBytes[index] = value[index];
      }
      return arrayBytes;
    }
    if (value && value.buffer instanceof ArrayBuffer) {
      return new Uint8Array(value.buffer, value.byteOffset || 0, value.byteLength);
    }
    return new Uint8Array(0);
  }

  function isSupportedRasterImage(bytes) {
    return isPng(bytes) || isJpeg(bytes) || isGif(bytes) || isWebp(bytes);
  }

  function isSvgAsset(assetRef, assetKind, bytes) {
    var ref = String(assetRef || "").toLowerCase();
    return assetKind === "svg" || ref.slice(-4) === ".svg" || isSvgBytes(bytes);
  }

  function isSvgBytes(bytes) {
    var head = decodeUtf8(copyBytes(bytes, 0, Math.min(bytes.length, 512))).replace(/^\s+/, "");
    return head.indexOf("<svg") === 0 || head.indexOf("<svg") >= 0;
  }

  function isPng(bytes) {
    return bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }

  function isJpeg(bytes) {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  function isGif(bytes) {
    return bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61;
  }

  function isWebp(bytes) {
    return bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }

  function copyBytes(bytes, start, end) {
    var length = Math.max(0, end - start);
    var out = new Uint8Array(length);
    var index;
    for (index = 0; index < length; index += 1) {
      out[index] = bytes[start + index];
    }
    return out;
  }

  function decodeUtf8(bytes) {
    var output = "";
    var index = 0;
    while (index < bytes.length) {
      var first = bytes[index];
      var codePoint;
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

  function round(value) {
    return Math.round(value * 100) / 100;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  if (typeof figma !== "undefined" && figma.ui) {
    if (typeof figma.showUI === "function") {
      figma.showUI(typeof __html__ === "undefined" ? "" : __html__, {
        width: 360,
        height: 520
      });
    }
    figma.ui.onmessage = runImport;
  }
}());
