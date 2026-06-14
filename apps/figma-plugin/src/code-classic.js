(function () {
  var REQUIRED_FILES = ["manifest.json", "capture.json", "figma-plan.json", "diagnostics.json", "screenshot.png"];
  var IMPORT_PACKAGE = "IMPORT_PACKAGE";
  var IMPORT_SUCCESS = "IMPORT_SUCCESS";
  var IMPORT_ERROR = "IMPORT_ERROR";
  var IMPORT_PROGRESS = "IMPORT_PROGRESS";
  var FALLBACK_FONT = { family: "Inter", style: "Regular" };
  // Active during a single import; maps captured colors/numbers to local Figma
  // Variables so matching values bind to the variable instead of a raw literal.
  var VARIABLE_INDEX = null;
  var SUPPORTED_ZIP_FLAGS = 0x0800;
  var MAX_ARCHIVE_FILE_NAME_LENGTH = 240;

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

  function postProgress(payload) {
    if (typeof figma === "undefined" || !figma.ui || typeof figma.ui.postMessage !== "function") {
      return;
    }
    figma.ui.postMessage({
      type: IMPORT_PROGRESS,
      phase: (payload && payload.phase) || "importing",
      processed: (payload && payload.processed) || 0,
      total: (payload && payload.total) || 0,
      label: (payload && payload.label) || "",
      message: (payload && payload.message) || ""
    });
  }

  function countModelNodes(models) {
    var list = models || [];
    var count = 0;
    var index;
    for (index = 0; index < list.length; index += 1) {
      count += 1 + countModelNodes(list[index].children);
    }
    return count;
  }

  function tickProgress(progress) {
    var pct;
    if (!progress || !progress.total) {
      return;
    }
    progress.processed += 1;
    pct = Math.floor((progress.processed / progress.total) * 100);
    if (pct === progress.lastPct && progress.processed < progress.total) {
      return;
    }
    progress.lastPct = pct;
    postProgress({
      phase: "rendering",
      processed: progress.processed,
      total: progress.total,
      label: progress.captureDesc ? "Rendering " + progress.captureDesc : "Rendering layers",
      message: progress.captureDesc ? "Building layers — " + progress.captureDesc : "Building layers"
    });
  }

  // ---------------------------------------------------------------------------
  // Figma Variables matching
  //
  // Before rendering we snapshot every local COLOR and FLOAT variable keyed by
  // its concrete value. While building layers, colors and design-token numbers
  // that match a variable bind to it (setBoundVariableForPaint / setBoundVariable)
  // so the imported design stays linked to the file's variables.
  // ---------------------------------------------------------------------------
  function loadVariableIndex(matchVariables) {
    if (matchVariables === false || typeof figma === "undefined" || !figma.variables) {
      return Promise.resolve(null);
    }
    return Promise.all([
      readLocalVariables("COLOR"),
      readLocalVariables("FLOAT")
    ]).then(function (lists) {
      return buildVariableIndex(lists[0], lists[1]);
    }).catch(function () {
      return null;
    });
  }

  function readLocalVariables(type) {
    try {
      if (typeof figma.variables.getLocalVariablesAsync === "function") {
        return figma.variables.getLocalVariablesAsync(type);
      }
      if (typeof figma.variables.getLocalVariables === "function") {
        return Promise.resolve(figma.variables.getLocalVariables(type));
      }
    } catch (error) {
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  }

  function buildVariableIndex(colorVars, floatVars) {
    var colorByKey = {};
    var floatByKey = {};
    var hasColors = false;
    var hasFloats = false;

    (colorVars || []).forEach(function (variable) {
      var value = firstConcreteVariableValue(variable);
      var key;
      if (value && typeof value === "object" && typeof value.r === "number") {
        key = colorKeyFromRgba(value.r, value.g, value.b, typeof value.a === "number" ? value.a : 1);
        if (!Object.prototype.hasOwnProperty.call(colorByKey, key)) {
          colorByKey[key] = variable;
          hasColors = true;
        }
      }
    });

    (floatVars || []).forEach(function (variable) {
      var value = firstConcreteVariableValue(variable);
      var key;
      if (typeof value === "number" && isFinite(value)) {
        key = floatKey(value);
        if (!Object.prototype.hasOwnProperty.call(floatByKey, key)) {
          floatByKey[key] = variable;
          hasFloats = true;
        }
      }
    });

    return {
      colorByKey: colorByKey,
      floatByKey: floatByKey,
      hasColors: hasColors,
      hasFloats: hasFloats,
      boundColors: 0,
      boundNumbers: 0
    };
  }

  function firstConcreteVariableValue(variable) {
    var values = variable && variable.valuesByMode;
    var modeId;
    var value;
    if (!values) {
      return null;
    }
    for (modeId in values) {
      if (Object.prototype.hasOwnProperty.call(values, modeId)) {
        value = values[modeId];
        if (value && typeof value === "object" && value.type === "VARIABLE_ALIAS") {
          continue;
        }
        return value;
      }
    }
    return null;
  }

  function colorKeyFromRgba(r, g, b, a) {
    return channel255(r) + "," + channel255(g) + "," + channel255(b) + "," + alphaKey(a);
  }

  function channel255(value) {
    return Math.round(clamp(Number(value) || 0, 0, 1) * 255);
  }

  function alphaKey(value) {
    var alpha = typeof value === "number" ? value : 1;
    return Math.round(clamp(alpha, 0, 1) * 100) / 100;
  }

  function floatKey(value) {
    return String(Math.round(Number(value) * 1000) / 1000);
  }

  function canBindPaints() {
    return typeof figma !== "undefined" &&
      figma.variables &&
      typeof figma.variables.setBoundVariableForPaint === "function";
  }

  function withBoundColors(paints) {
    var result;
    var index;
    if (!VARIABLE_INDEX || !VARIABLE_INDEX.hasColors || !canBindPaints()) {
      return paints;
    }
    if (!Array.isArray(paints) || paints.length === 0) {
      return paints;
    }
    result = [];
    for (index = 0; index < paints.length; index += 1) {
      result.push(bindPaintColor(paints[index]));
    }
    return result;
  }

  function bindPaintColor(paint) {
    var variable;
    var bound;
    if (!paint || paint.type !== "SOLID" || !paint.color) {
      return paint;
    }
    variable = lookupColorVariable(paint.color, paint.opacity);
    if (!variable) {
      return paint;
    }
    try {
      bound = figma.variables.setBoundVariableForPaint(paint, "color", variable);
      VARIABLE_INDEX.boundColors += 1;
      return bound || paint;
    } catch (error) {
      return paint;
    }
  }

  function lookupColorVariable(color, opacity) {
    var key = colorKeyFromRgba(color.r, color.g, color.b, typeof opacity === "number" ? opacity : 1);
    return Object.prototype.hasOwnProperty.call(VARIABLE_INDEX.colorByKey, key)
      ? VARIABLE_INDEX.colorByKey[key]
      : null;
  }

  function lookupFloatVariable(value) {
    var key = floatKey(value);
    return Object.prototype.hasOwnProperty.call(VARIABLE_INDEX.floatByKey, key)
      ? VARIABLE_INDEX.floatByKey[key]
      : null;
  }

  function bindNodeNumber(node, field, value) {
    var variable;
    if (!VARIABLE_INDEX || !VARIABLE_INDEX.hasFloats || !node || typeof node.setBoundVariable !== "function") {
      return false;
    }
    if (typeof value !== "number" || !isFinite(value) || value <= 0) {
      return false;
    }
    variable = lookupFloatVariable(value);
    if (!variable) {
      return false;
    }
    try {
      node.setBoundVariable(field, variable);
      VARIABLE_INDEX.boundNumbers += 1;
      return true;
    } catch (error) {
      return false;
    }
  }

  function bindCornerRadius(node, value) {
    var fields = ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"];
    var variable;
    var bound = false;
    var index;
    if (!VARIABLE_INDEX || !VARIABLE_INDEX.hasFloats || !node || typeof node.setBoundVariable !== "function") {
      return;
    }
    if (typeof value !== "number" || !isFinite(value) || value <= 0) {
      return;
    }
    variable = lookupFloatVariable(value);
    if (!variable) {
      return;
    }
    for (index = 0; index < fields.length; index += 1) {
      try {
        node.setBoundVariable(fields[index], variable);
        bound = true;
      } catch (error) {
        // Some node types reject individual corner fields; keep trying the rest.
      }
    }
    if (bound) {
      VARIABLE_INDEX.boundNumbers += 1;
    }
  }

  function summarizeVariableBindings(index) {
    if (!index) {
      return { available: false, colors: 0, numbers: 0 };
    }
    return { available: true, colors: index.boundColors, numbers: index.boundNumbers };
  }

  function runImport(message) {
    Promise.resolve()
      .then(function () {
        if (!message || message.type !== IMPORT_PACKAGE) {
          return null;
        }
        return importBytes(toUint8Array(message.bytes), message.matchVariables !== false);
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

  function importBytes(bytes, matchVariables) {
    var captures = readCaptureBundle(bytes);
    captures.sort(function (a, b) {
      return b.width - a.width;
    });

    var prepared = captures.map(function (entry) {
      return { entry: entry, models: createEditableLayoutNodeModels(entry.packageData) };
    });
    var total = prepared.reduce(function (sum, item) {
      return sum + countModelNodes(item.models);
    }, 0);
    var progress = {
      processed: 0,
      total: total,
      lastPct: -1,
      captureCount: prepared.length,
      captureDesc: ""
    };

    postProgress({
      phase: "preparing",
      processed: 0,
      total: total,
      label: "Matching variables",
      message: "Matching variables…"
    });

    return loadVariableIndex(matchVariables).then(function (variableIndex) {
      VARIABLE_INDEX = variableIndex;

      var reports = [];
      var state = { originX: 0 };
      var chain = Promise.resolve();

      prepared.forEach(function (item, index) {
        chain = chain.then(function () {
          var capLabel = item.entry.label || String(item.entry.width);
          progress.captureDesc = progress.captureCount > 1
            ? capLabel + "px (" + (index + 1) + "/" + progress.captureCount + ")"
            : capLabel + "px";
          postProgress({
            phase: "rendering",
            processed: progress.processed,
            total: progress.total,
            label: "Rendering " + progress.captureDesc,
            message: "Building layers — " + progress.captureDesc
          });
          return renderPackage(item.entry.packageData, state.originX, item.models, progress).then(function (renderResult) {
            reports.push(createReport(item.entry.packageData, renderResult));
            state.originX += 2 * (captureFrameSize(item.entry.packageData.manifest).width + 80);
          });
        });
      });

      return chain.then(function () {
        postProgress({
          phase: "done",
          processed: progress.total,
          total: progress.total,
          label: "Done",
          message: "Import complete"
        });
        var aggregated = aggregateReports(reports);
        if (aggregated) {
          aggregated.variableBindings = summarizeVariableBindings(variableIndex);
        }
        return { report: aggregated };
      });
    }).then(function (result) {
      VARIABLE_INDEX = null;
      return result;
    }, function (error) {
      VARIABLE_INDEX = null;
      throw error;
    });
  }

  function readCaptureBundle(bytes) {
    var files = readZip(bytes);

    if (!files["captures.json"]) {
      var single = buildPackageDataFromFiles(files);
      return [{
        width: single.manifest.viewportWidth,
        label: String(single.manifest.viewportWidth),
        packageData: single
      }];
    }

    var index = decodeJson(files["captures.json"], "captures.json");
    if (!index || index.bundleType !== "multi-capture" || !Array.isArray(index.captures)) {
      throw importError("invalid-package", "captures.json must describe a multi-capture bundle");
    }

    return index.captures.map(function (entry) {
      if (!entry || typeof entry.dir !== "string" || !entry.dir) {
        throw importError("invalid-package", "capture entry must reference a directory");
      }
      var subFiles = {};
      Object.keys(files).forEach(function (name) {
        if (name.indexOf(entry.dir) === 0) {
          subFiles[name.slice(entry.dir.length)] = files[name];
        }
      });
      return {
        width: entry.width,
        label: entry.label || String(entry.width),
        packageData: buildPackageDataFromFiles(subFiles)
      };
    });
  }

  function unpackFigcapture(bytes) {
    return buildPackageDataFromFiles(readZip(bytes));
  }

  function buildPackageDataFromFiles(files) {
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

  function aggregateReports(reports) {
    if (reports.length <= 1) {
      return reports[0];
    }
    var sumKey = function (key) {
      return reports.reduce(function (total, report) {
        return total + (report[key] || 0);
      }, 0);
    };
    var aggregated = Object.assign({}, reports[0]);
    aggregated.createdFrameCount = sumKey("createdFrameCount");
    aggregated.createdNodeCount = sumKey("createdNodeCount");
    aggregated.fallbackCount = sumKey("fallbackCount");
    aggregated.missingAssetCount = sumKey("missingAssetCount");
    aggregated.unsupportedStyleCount = sumKey("unsupportedStyleCount");
    aggregated.fontSubstitutions = reports.reduce(function (all, report) {
      return all.concat(report.fontSubstitutions || []);
    }, []);
    return aggregated;
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
    validateAssetReferences(packageData.capture.root, packageData.assets);
  }

  function validateAssetReferences(node, assets) {
    var index;
    if (!node || typeof node !== "object") {
      return;
    }
    validateAssetReference(node.assetRef, assets, "assetRef");
    validateAssetReference(node.fallbackRef, assets, "fallbackRef");
    for (index = 0; index < (node.children || []).length; index += 1) {
      validateAssetReferences(node.children[index], assets);
    }
  }

  function validateAssetReference(value, assets, key) {
    var reason;
    if (typeof value !== "string") {
      return;
    }
    reason = archiveFileNameError(value);
    if (reason) {
      throw importError("invalid-package", reason);
    }
    if (value.indexOf("assets/") !== 0) {
      throw importError("invalid-package", key + " must reference a packaged asset");
    }
    if (!assets || !Object.prototype.hasOwnProperty.call(assets, value)) {
      throw importError("missing-file", value + " is referenced but not packaged");
    }
  }

  function renderPackage(packageData, originX, providedModels, progress) {
    var frames = createFrames(packageData, originX || 0);
    var sourceFrame = frames[0];
    var accurateFrame = frames[1];
    var layoutModels = providedModels || createEditableLayoutNodeModels(packageData);
    var autoLayoutSummary = summarizeAutoLayoutModels(layoutModels);
    var semanticNamingSummary = summarizeSemanticNamingModels(layoutModels);
    var fontPromises = [];
    var fontSubstitutions = [];
    var index;

    var frameSize = captureFrameSize(packageData.manifest);
    sourceFrame.appendChild(createImageNode("Source screenshot", packageData.screenshot, {
      x: 0,
      y: 0,
      width: frameSize.width,
      height: frameSize.height
    }, true, null, null));

    for (index = 0; index < layoutModels.length; index += 1) {
      accurateFrame.appendChild(createLayerTreeForModel(layoutModels[index], packageData, fontPromises, fontSubstitutions, progress));
    }

    if (progress) {
      postProgress({
        phase: "fonts",
        processed: progress.processed,
        total: progress.total,
        label: progress.captureDesc ? "Loading fonts — " + progress.captureDesc : "Loading fonts",
        message: "Loading fonts…"
      });
    }

    return Promise.all(fontPromises).then(function () {
      return {
        frames: frames,
        layoutModels: layoutModels,
        autoLayoutSummary: autoLayoutSummary,
        semanticNamingSummary: semanticNamingSummary,
        autoLayoutFrameEnabled: false,
        fontSubstitutions: fontSubstitutions
      };
    });
  }

  function captureFrameSize(manifest) {
    var safeManifest = manifest || {};
    if (
      safeManifest.captureMode === "full-page" &&
      safeManifest.documentWidth > 0 &&
      safeManifest.documentHeight > 0
    ) {
      return { width: safeManifest.documentWidth, height: safeManifest.documentHeight };
    }
    return { width: safeManifest.viewportWidth, height: safeManifest.viewportHeight };
  }

  function createFrames(packageData, originX) {
    var roles = ["Source Screenshot", "Editable Accurate"];
    var title = packageData.capture.title || titleFromUrl(packageData.manifest.sourceUrl);
    var frameSize = captureFrameSize(packageData.manifest);
    var width = frameSize.width;
    var height = frameSize.height;
    var baseX = originX || 0;
    var frames = [];
    var index;

    for (index = 0; index < roles.length; index += 1) {
      var frame = figma.createFrame();
      frame.name = title + " / " + width + "x" + height + " / " + roles[index];
      frame.x = baseX + index * (width + 80);
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

  function createLayerTreeForModel(model, packageData, fontPromises, fontSubstitutions, progress) {
    var layer;
    var assetRef;
    var index;

    tickProgress(progress);

    if (model.type === "FRAME") {
      layer = createFrameLayer(model);
      for (index = 0; index < model.children.length; index += 1) {
        appendModelChild(
          layer,
          createLayerTreeForModel(model.children[index], packageData, fontPromises, fontSubstitutions, progress),
          model.children[index]
        );
      }
      return layer;
    }

    if (model.type === "TEXT") {
      layer = figma.createText();
      applyGeometry(layer, model.rect);
      layer.name = model.name;
      writeNodeMetadata(layer, "sourceNodeId", model.sourceNodeId);
      writeNodeMetadata(layer, "cssZIndex", model.cssZIndex);
      applyModelLayoutPositioning(layer, model);
      fontPromises.push(setTextLayer(layer, {
        textContent: model.text,
        sourceNodeId: model.sourceNodeId,
        styles: model.styles || {},
        textAutoResize: model.textAutoResize || "HEIGHT",
        layoutSizingHorizontal: model.layoutSizingHorizontal,
        layoutSizingVertical: model.layoutSizingVertical
      }, fontSubstitutions));
      return layer;
    }

    if (model.type === "IMAGE" || model.type === "FALLBACK_IMAGE") {
      assetRef = model.assetRef || null;
      layer = createImageNode(
        model.name,
        packageData.assets[assetRef] || new Uint8Array(0),
        model.rect,
        false,
        assetRef,
        model.fallbackReason || null,
        model.assetKind || null,
        model.style || model.styles || {},
        model.sourceNodeId,
        model.cssZIndex,
        model.absoluteRect,
        packageData
      );
      applyModelLayoutPositioning(layer, model);
      return layer;
    }

    layer = createRectNode(model.name, {
      rect: model.rect,
      styles: model.styles || {}
    });
    writeNodeMetadata(layer, "sourceNodeId", model.sourceNodeId);
    writeNodeMetadata(layer, "cssZIndex", model.cssZIndex);
    applyModelLayoutPositioning(layer, model);
    return layer;
  }

  function createFrameLayer(model) {
    var frame = figma.createFrame();
    applyGeometry(frame, model.rect);
    frame.name = model.name;
    frame.clipsContent = Boolean(model.clipsContent);
    applyVisualStyle(frame, model.style || model.styles || {});
    applyAutoLayout(frame, model.autoLayout);
    writeNodeMetadata(frame, "sourceNodeId", model.sourceNodeId);
    writeNodeMetadata(frame, "cssZIndex", model.cssZIndex);
    applyModelLayoutPositioning(frame, model);
    return frame;
  }

  function applyModelLayoutPositioning(node, model) {
    if (model.layoutPositioning) {
      safeSetFigmaProperty(node, "layoutPositioning", model.layoutPositioning);
    }
  }

  function appendModelChild(parent, child, model) {
    parent.appendChild(child);
    applyModelLayoutPositioning(child, model || {});
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
      bindNodeNumber(frame, "itemSpacing", Number(autoLayout.itemSpacing) || 0);
      bindNodeNumber(frame, "paddingLeft", Number(autoLayout.paddingLeft) || 0);
      bindNodeNumber(frame, "paddingRight", Number(autoLayout.paddingRight) || 0);
      bindNodeNumber(frame, "paddingTop", Number(autoLayout.paddingTop) || 0);
      bindNodeNumber(frame, "paddingBottom", Number(autoLayout.paddingBottom) || 0);
    } catch (error) {
      writeNodeMetadata(frame, "autoLayoutSkippedReason", "figma-property-rejected");
      return;
    }
    writeNodeMetadata(frame, "autoLayoutConfidence", autoLayout.confidence);
  }

  function createImageNode(name, bytes, rect, locked, assetRef, fallbackReasonValue, assetKind, style, sourceNodeId, cssZIndex, absoluteRect, packageData) {
    var imageBytes = toUint8Array(bytes);
    var image;
    var reason = fallbackReasonValue;
    var node;
    var screenshotFallback;
    var canUseScreenshotCropFallback = false;
    if (isSvgAsset(assetRef, assetKind, imageBytes) && typeof figma.createNodeFromSvg === "function") {
      try {
        return createSvgImageNode(name, imageBytes, rect, locked, assetRef, style || {}, sourceNodeId, cssZIndex);
      } catch (error) {
        reason = fallbackReasonValue || "svg-render-failed";
      }
    }

    node = figma.createRectangle();
    applyGeometry(node, rect);
    node.name = name;
    node.locked = Boolean(locked);
    writeNodeMetadata(node, "sourceNodeId", sourceNodeId);
    writeNodeMetadata(node, "cssZIndex", cssZIndex);
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
        canUseScreenshotCropFallback = true;
        reason = fallbackReasonValue || "image decode failed";
      }
    } else {
      reason = fallbackReasonValue || (imageBytes.length > 0 ? "external or unsupported image asset" : "missing image asset");
    }
    if (canUseScreenshotCropFallback) {
      screenshotFallback = createScreenshotCropFallbackNode(name, rect, locked, assetRef, sourceNodeId, cssZIndex, absoluteRect, packageData, reason);
      if (screenshotFallback) {
        return screenshotFallback;
      }
    }
    node.name = name + " / Placeholder";
    applyImagePlaceholderStyle(node);
    writeNodeMetadata(node, "assetRef", assetRef);
    writeNodeMetadata(node, "fallbackReason", reason);
    return node;
  }

  function createScreenshotCropFallbackNode(name, rect, locked, assetRef, sourceNodeId, cssZIndex, absoluteRect, packageData, reason) {
    var viewportWidth = Number(packageData && packageData.manifest && packageData.manifest.viewportWidth || 0);
    var viewportHeight = Number(packageData && packageData.manifest && packageData.manifest.viewportHeight || 0);
    var imageHash;
    var frame;
    var screenshotLayer;
    var sourceX;
    var sourceY;
    if (
      !absoluteRect ||
      !packageData ||
      !packageData.screenshot ||
      !rect ||
      rect.width <= 0 ||
      rect.height <= 0 ||
      viewportWidth <= 0 ||
      viewportHeight <= 0
    ) {
      return null;
    }
    try {
      imageHash = getScreenshotImageHash(packageData);
    } catch (error) {
      return null;
    }
    if (!imageHash) {
      return null;
    }

    frame = figma.createFrame();
    applyGeometry(frame, rect);
    frame.name = name + " / Screenshot Crop";
    frame.locked = Boolean(locked);
    frame.clipsContent = true;
    frame.fills = [];
    writeNodeMetadata(frame, "sourceNodeId", sourceNodeId);
    writeNodeMetadata(frame, "cssZIndex", cssZIndex);
    writeNodeMetadata(frame, "assetRef", assetRef);
    writeNodeMetadata(frame, "fallbackReason", (reason || "image fallback") + "; screenshot crop fallback");

    screenshotLayer = figma.createRectangle();
    screenshotLayer.name = "Screenshot crop source";
    sourceX = numberFromCss(absoluteRect.x);
    sourceY = numberFromCss(absoluteRect.y);
    screenshotLayer.x = sourceX === 0 ? 0 : -sourceX;
    screenshotLayer.y = sourceY === 0 ? 0 : -sourceY;
    screenshotLayer.resize(viewportWidth, viewportHeight);
    screenshotLayer.fills = [{
      type: "IMAGE",
      scaleMode: "FILL",
      imageHash: imageHash
    }];
    writeNodeMetadata(screenshotLayer, "assetRef", assetRef);
    writeNodeMetadata(screenshotLayer, "fallbackReason", "screenshot crop source");
    frame.appendChild(screenshotLayer);
    return frame;
  }

  function getScreenshotImageHash(packageData) {
    if (!packageData._screenshotImageHash) {
      packageData._screenshotImageHash = figma.createImage(toUint8Array(packageData.screenshot)).hash;
    }
    return packageData._screenshotImageHash;
  }

  function createSvgImageNode(name, imageBytes, rect, locked, assetRef, style, sourceNodeId, cssZIndex) {
    var svgText = decodeUtf8(imageBytes);
    var svgNode = figma.createNodeFromSvg(svgText);
    var safeRect = rect || {};
    var rotation = rotationFromTransform(style && style.transform);
    var fitted = fittedSvgRect(safeRect, svgIntrinsicSize(svgText), shouldPreserveSvgAspectRatio(svgText));
    var rectWidth = Math.max(0, Number(safeRect.width) || 0);
    var rectHeight = Math.max(0, Number(safeRect.height) || 0);
    var requiresWrapper = rotation !== 0 ||
      fitted.x !== 0 ||
      fitted.y !== 0 ||
      fitted.width !== rectWidth ||
      fitted.height !== rectHeight;
    var frame;

    if (!requiresWrapper) {
      applyGeometry(svgNode, safeRect);
      svgNode.name = name;
      svgNode.locked = Boolean(locked);
      writeNodeMetadata(svgNode, "sourceNodeId", sourceNodeId);
      writeNodeMetadata(svgNode, "cssZIndex", cssZIndex);
      writeNodeMetadata(svgNode, "assetRef", assetRef);
      writeNodeMetadata(svgNode, "assetKind", "svg");
      return svgNode;
    }

    frame = figma.createFrame();
    applyGeometry(frame, safeRect);
    frame.name = name;
    frame.locked = Boolean(locked);
    frame.clipsContent = true;
    frame.fills = [];
    writeNodeMetadata(frame, "sourceNodeId", sourceNodeId);
    writeNodeMetadata(frame, "cssZIndex", cssZIndex);
    writeNodeMetadata(frame, "assetRef", assetRef);
    writeNodeMetadata(frame, "assetKind", "svg");

    var placed = rotatedFittedSvgRect(safeRect, fitted, rotation);
    svgNode.x = placed.x;
    svgNode.y = placed.y;
    svgNode.resize(Math.max(1, fitted.width || 1), Math.max(1, fitted.height || 1));
    safeSetFigmaProperty(svgNode, "rotation", rotation);
    svgNode.name = name + " / Vector";
    writeNodeMetadata(svgNode, "assetRef", assetRef);
    writeNodeMetadata(svgNode, "assetKind", "svg");
    frame.appendChild(svgNode);
    return frame;
  }

  function svgIntrinsicSize(svgText) {
    var viewBox = extractSvgAttribute(svgText, "viewBox");
    var values;
    var width;
    var height;
    if (viewBox) {
      values = viewBox.replace(/^\s+|\s+$/g, "").split(/[\s,]+/).map(function (value) {
        return parseFloat(value);
      });
      if (values.length >= 4 && isFinite(values[2]) && isFinite(values[3]) && values[2] > 0 && values[3] > 0) {
        return {
          width: values[2],
          height: values[3]
        };
      }
    }
    width = numberFromCss(extractSvgAttribute(svgText, "width"));
    height = numberFromCss(extractSvgAttribute(svgText, "height"));
    if (width > 0 && height > 0) {
      return {
        width: width,
        height: height
      };
    }
    return null;
  }

  function extractSvgAttribute(svgText, attribute) {
    var pattern = new RegExp("\\s" + attribute + "\\s*=\\s*[\"']([^\"']+)[\"']", "i");
    var match = String(svgText || "").match(pattern);
    return match ? match[1] : "";
  }

  function shouldPreserveSvgAspectRatio(svgText) {
    return !/preserveAspectRatio\s*=\s*["']none["']/i.test(String(svgText || ""));
  }

  function fittedSvgRect(rect, intrinsic, preserveAspectRatio) {
    var width = Math.max(0, Number((rect || {}).width) || 0);
    var height = Math.max(0, Number((rect || {}).height) || 0);
    var scale;
    var rawFittedWidth;
    var rawFittedHeight;
    var fittedWidth;
    var fittedHeight;
    if (!preserveAspectRatio || !intrinsic || intrinsic.width <= 0 || intrinsic.height <= 0 || width <= 0 || height <= 0) {
      return {
        x: 0,
        y: 0,
        width: width,
        height: height
      };
    }
    scale = Math.min(width / intrinsic.width, height / intrinsic.height);
    rawFittedWidth = intrinsic.width * scale;
    rawFittedHeight = intrinsic.height * scale;
    fittedWidth = round(rawFittedWidth);
    fittedHeight = round(rawFittedHeight);
    return {
      x: round((width - rawFittedWidth) / 2),
      y: round((height - rawFittedHeight) / 2),
      width: fittedWidth,
      height: fittedHeight
    };
  }

  function rotatedFittedSvgRect(containerRect, fitted, rotation) {
    var angle = (Number(rotation) || 0) * Math.PI / 180;
    var width;
    var height;
    var corners;
    var minX;
    var minY;
    var maxX;
    var maxY;
    var rotatedWidth;
    var rotatedHeight;
    var targetX;
    var targetY;
    if (Math.abs(angle) < 0.0001) {
      return fitted;
    }
    width = Number(fitted.width) || 0;
    height = Number(fitted.height) || 0;
    corners = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: 0, y: height },
      { x: width, y: height }
    ].map(function (point) {
      return {
        x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
        y: point.x * Math.sin(angle) + point.y * Math.cos(angle)
      };
    });
    minX = Math.min.apply(null, corners.map(function (point) { return point.x; }));
    minY = Math.min.apply(null, corners.map(function (point) { return point.y; }));
    maxX = Math.max.apply(null, corners.map(function (point) { return point.x; }));
    maxY = Math.max.apply(null, corners.map(function (point) { return point.y; }));
    rotatedWidth = maxX - minX;
    rotatedHeight = maxY - minY;
    targetX = ((Number((containerRect || {}).width) || 0) - rotatedWidth) / 2;
    targetY = ((Number((containerRect || {}).height) || 0) - rotatedHeight) / 2;
    return {
      x: round(targetX - minX),
      y: round(targetY - minY),
      width: fitted.width,
      height: fitted.height
    };
  }

  function rotationFromTransform(transform) {
    var value = String(transform || "").replace(/^\s+|\s+$/g, "");
    var match;
    var parts;
    var angle;
    if (!value || value === "none") {
      return 0;
    }
    match = value.match(/^matrix\(([^)]+)\)$/i);
    if (match) {
      parts = match[1].split(",").map(function (part) {
        return parseFloat(part.replace(/^\s+|\s+$/g, ""));
      });
      if (parts.length >= 4 && finiteNumberList(parts)) {
        return normalizeRotation(Math.atan2(parts[1], parts[0]) * 180 / Math.PI);
      }
    }
    match = value.match(/^matrix3d\(([^)]+)\)$/i);
    if (match) {
      parts = match[1].split(",").map(function (part) {
        return parseFloat(part.replace(/^\s+|\s+$/g, ""));
      });
      if (parts.length >= 16 && finiteNumberList(parts)) {
        return normalizeRotation(Math.atan2(parts[1], parts[0]) * 180 / Math.PI);
      }
    }
    match = value.match(/rotate\((-?[\d.]+)(deg|rad|turn)?\)/i);
    if (match) {
      angle = parseFloat(match[1]);
      if (!isFinite(angle)) {
        return 0;
      }
      if (match[2] === "rad") {
        angle = angle * 180 / Math.PI;
      } else if (match[2] === "turn") {
        angle *= 360;
      }
      return normalizeRotation(angle);
    }
    return 0;
  }

  function finiteNumberList(values) {
    var index;
    for (index = 0; index < values.length; index += 1) {
      if (!isFinite(values[index])) {
        return false;
      }
    }
    return true;
  }

  function normalizeRotation(angle) {
    var rounded = round(angle);
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
    var borderSides = Array.isArray(styles && styles.borderSides)
      ? styles.borderSides
      : nativeBorderStrokeSidesFromStyles(styles || {});
    var stroke = Array.isArray(styles && styles.strokes) && styles.strokes.length > 0
      ? styles.strokes[0]
      : cssStrokeFromStyles(styles);
    node.fills = withBoundColors(fillPaintArray(styles));
    if (borderSides.length > 0) {
      applyBorderSideStrokes(node, borderSides);
    } else if (stroke) {
      node.strokes = withBoundColors(paintArray(stroke.color));
      node.strokeWeight = stroke.width;
      bindNodeNumber(node, "strokeWeight", stroke.width);
    } else {
      node.strokes = [];
      node.strokeWeight = 0;
    }
    node.cornerRadius = Number(styles && styles.cornerRadius) > 0
      ? Number(styles.cornerRadius)
      : cornerRadiusFromStyles(styles);
    bindCornerRadius(node, node.cornerRadius);
    node.effects = shadowEffectsFromStyle(styles);
  }

  function shadowEffectsFromStyle(styles) {
    var safeStyles = styles || {};
    var sourceEffects = Array.isArray(safeStyles.effects) ? safeStyles.effects : [];
    var effects = [];
    var index;
    var effect;
    if (sourceEffects.length > 0) {
      for (index = 0; index < sourceEffects.length; index += 1) {
        effect = cssShadowToEffect(sourceEffects[index] && sourceEffects[index].value);
        if (effect) {
          effects.push(effect);
        }
      }
      return effects;
    }
    effect = cssShadowToEffect(safeStyles.boxShadow);
    return effect ? [effect] : [];
  }

  function cssShadowToEffect(value) {
    var shadow = firstOuterCssShadow(value);
    var colorValue;
    var color;
    var lengthSource;
    var matches;
    var lengths;
    if (!shadow) {
      return null;
    }
    colorValue = extractCssShadowColor(shadow);
    color = parseCssColor(colorValue) || { r: 0, g: 0, b: 0, a: 0.16 };
    lengthSource = colorValue ? shadow.replace(colorValue, " ") : shadow;
    matches = lengthSource.match(/-?\d*\.?\d+(?:px)?/gi) || [];
    lengths = matches.map(function (match) {
      return numberFromCss(match);
    }).filter(function (number) {
      return isFinite(number);
    });
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
      radius: lengths.length > 2 ? lengths[2] : 0,
      spread: lengths.length > 3 ? lengths[3] : 0,
      visible: true,
      blendMode: "NORMAL"
    };
  }

  function firstOuterCssShadow(value) {
    var shadows;
    var index;
    if (typeof value !== "string" || value.length === 0 || value === "none") {
      return "";
    }
    shadows = splitCssArguments(value);
    for (index = 0; index < shadows.length; index += 1) {
      if (shadows[index] && !/\binset\b/i.test(shadows[index])) {
        return shadows[index].replace(/^\s+|\s+$/g, "");
      }
    }
    return "";
  }

  function extractCssShadowColor(value) {
    var match = String(value || "").match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}|transparent/i);
    return match ? match[0] : "";
  }

  function applyBorderSideStrokes(node, borderSides) {
    var first = borderSides[0];
    var weights = { top: 0, right: 0, bottom: 0, left: 0 };
    var index;
    node.strokes = withBoundColors(paintArray(first && first.color));
    node.strokeWeight = 0;
    for (index = 0; index < borderSides.length; index += 1) {
      weights[borderSides[index].side] = borderSides[index].width;
      node.strokeWeight = Math.max(node.strokeWeight, borderSides[index].width);
    }
    safeSetFigmaProperty(node, "strokeAlign", "INSIDE");
    safeSetFigmaProperty(node, "strokeTopWeight", weights.top);
    safeSetFigmaProperty(node, "strokeRightWeight", weights.right);
    safeSetFigmaProperty(node, "strokeBottomWeight", weights.bottom);
    safeSetFigmaProperty(node, "strokeLeftWeight", weights.left);
  }

  function setTextLayer(layer, captureNode, fontSubstitutions) {
    var styles = captureNode.styles || {};
    var requestedFonts = fontNamesFromStyles(styles, captureNode.textContent);

    return loadFontWithFallback(requestedFonts).then(function (loadedFont) {
        var fontName = loadedFont.fontName;
        if (loadedFont.substituted) {
          fontSubstitutions.push({
            sourceNodeId: captureNode.sourceNodeId,
            requested: loadedFont.requested,
            requestedStack: loadedFont.requestedStack,
            attempted: loadedFont.attempted,
            used: loadedFont.fontName
          });
        }
        layer.fontName = fontName;
        layer.characters = captureNode.textContent || "";
        if (numberFromCss(styles.fontSize) > 0) {
          layer.fontSize = numberFromCss(styles.fontSize);
          bindNodeNumber(layer, "fontSize", numberFromCss(styles.fontSize));
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
        var textFills = textFillPaintArray(styles);
        layer.fills = withBoundColors(textFills.length > 0 ? textFills : paintArray(textColorFromStyles(styles)));
        applyTextAlignment(layer, styles.textAlign);
        applyTextResizeAndLayoutSizing(layer, captureNode);
      });
  }

  function loadFontWithFallback(requestedFonts) {
    var requestedStack = normalizeFontCandidates(requestedFonts);
    var candidates = dedupeFontNames(requestedStack.concat([FALLBACK_FONT]));
    var attempted = [];
    var index = 0;

    function tryNext() {
      var fontName;
      if (index >= candidates.length) {
        attempted.push(FALLBACK_FONT);
        return figma.loadFontAsync(FALLBACK_FONT).then(function () {
          return {
            fontName: FALLBACK_FONT,
            requested: requestedStack[0] || FALLBACK_FONT,
            requestedStack: requestedStack,
            attempted: attempted.slice(),
            substituted: !sameFontName(FALLBACK_FONT, requestedStack[0] || FALLBACK_FONT)
          };
        });
      }
      fontName = candidates[index];
      index += 1;
      attempted.push(fontName);
      return figma.loadFontAsync(fontName).then(function () {
        return {
          fontName: fontName,
          requested: requestedStack[0] || FALLBACK_FONT,
          requestedStack: requestedStack,
          attempted: attempted.slice(),
          substituted: !sameFontName(fontName, requestedStack[0] || FALLBACK_FONT)
        };
      }).catch(function () {
        return tryNext();
      });
    }

    return tryNext();
  }

  function fontNamesFromStyles(styles, textContent) {
    var requestedStyles = fontStyleCandidatesFromCss(styles.fontWeight, styles.fontStyle);
    var families = preferFontFamiliesForText(parseFontFamilyStack(styles.fontFamily), textContent);
    var candidates = [];
    var index;
    var styleIndex;
    var family;

    for (styleIndex = 0; styleIndex < requestedStyles.length; styleIndex += 1) {
      for (index = 0; index < families.length; index += 1) {
        family = families[index];
        if (!isGenericFontFamily(family)) {
          candidates.push({ family: family, style: requestedStyles[styleIndex] });
        }
      }
    }

    return normalizeFontCandidates(candidates);
  }

  function normalizeFontCandidates(fonts) {
    var list = Array.isArray(fonts) ? fonts : [fonts];
    var candidates = [];
    var index;
    var fontName;
    for (index = 0; index < list.length; index += 1) {
      fontName = list[index] || {};
      if (String(fontName.family || "").replace(/^\s+|\s+$/g, "").length > 0) {
        candidates.push({
          family: String(fontName.family || "").replace(/^\s+|\s+$/g, ""),
          style: String(fontName.style || "Regular").replace(/^\s+|\s+$/g, "") || "Regular"
        });
      }
    }
    candidates = dedupeFontNames(candidates);
    return candidates.length > 0 ? candidates : [FALLBACK_FONT];
  }

  function dedupeFontNames(fonts) {
    var seen = {};
    var unique = [];
    var index;
    var key;
    for (index = 0; index < fonts.length; index += 1) {
      key = fontKey(fonts[index]);
      if (!seen[key]) {
        seen[key] = true;
        unique.push(fonts[index]);
      }
    }
    return unique;
  }

  function sameFontName(a, b) {
    return fontKey(a) === fontKey(b);
  }

  function fontKey(fontName) {
    return String(fontName && fontName.family || "") + "\n" + String(fontName && fontName.style || "");
  }

  function parseFontFamilyStack(value) {
    var families = [];
    var current = "";
    var quote = "";
    var source = String(value || "");
    var index;
    var char;
    for (index = 0; index < source.length; index += 1) {
      char = source[index];
      if (char === "\\" && index + 1 < source.length) {
        current += source[index + 1];
        index += 1;
      } else if ((char === "\"" || char === "'") && (!quote || quote === char)) {
        quote = quote ? "" : char;
        current += char;
      } else if (char === "," && !quote) {
        pushFontFamily(families, current);
        current = "";
      } else {
        current += char;
      }
    }
    pushFontFamily(families, current);
    return families;
  }

  function pushFontFamily(families, value) {
    var family = String(value || "")
      .replace(/^\s+|\s+$/g, "")
      .replace(/^['"]|['"]$/g, "")
      .replace(/^\s+|\s+$/g, "");
    if (family.length > 0) {
      families.push(family);
    }
  }

  function isGenericFontFamily(family) {
    var key = String(family || "").replace(/^\s+|\s+$/g, "").toLowerCase();
    return key === "serif" ||
      key === "sans-serif" ||
      key === "monospace" ||
      key === "cursive" ||
      key === "fantasy" ||
      key === "system-ui" ||
      key === "ui-serif" ||
      key === "ui-sans-serif" ||
      key === "ui-monospace" ||
      key === "ui-rounded" ||
      key === "emoji" ||
      key === "math" ||
      key === "fangsong" ||
      key === "-apple-system" ||
      key === "blinkmacsystemfont";
  }

  function preferFontFamiliesForText(families, textContent) {
    var preferred = [];
    var remaining = [];
    var index;
    var family;
    if (!containsCjkText(textContent)) {
      return families;
    }
    for (index = 0; index < families.length; index += 1) {
      family = families[index];
      if (isCjkFontFamily(family)) {
        preferred.push(family);
      } else {
        remaining.push(family);
      }
    }
    return preferred.length > 0 ? preferred.concat(remaining) : families;
  }

  function containsCjkText(value) {
    return /[\u3040-\u30ff\u3100-\u312f\u31a0-\u31bf\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/.test(String(value || ""));
  }

  function isCjkFontFamily(family) {
    return /noto\s+sans\s+(tc|sc|jp|kr)|source\s+han|pingfang|pingfang\s+tc|microsoft\s+jhenghei|jhenghei|hiragino|heiti|yahei|mingliu|pmingliu|songti|kaiti|cjk/i
      .test(String(family || ""));
  }

  function fontStyleCandidatesFromCss(fontWeight, fontStyle) {
    var weight = normalizedFontWeight(fontWeight);
    var italic = /italic|oblique/i.test(String(fontStyle || ""));
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
    var value = String(fontWeight || "").replace(/^\s+|\s+$/g, "").toLowerCase();
    var parsed;
    if (value === "bold") {
      return 700;
    }
    if (value === "normal") {
      return 400;
    }
    parsed = parseInt(value, 10);
    return isFinite(parsed) ? parsed : 400;
  }

  function dedupeStrings(values) {
    var seen = {};
    var result = [];
    var index;
    var value;
    for (index = 0; index < values.length; index += 1) {
      value = values[index];
      if (!seen[value]) {
        seen[value] = true;
        result.push(value);
      }
    }
    return result;
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

  function applyTextAlignment(layer, textAlign) {
    var horizontal = textAlignHorizontal(textAlign);
    if (horizontal) {
      safeSetFigmaProperty(layer, "textAlignHorizontal", horizontal);
    }
  }

  function textAlignHorizontal(value) {
    var normalized = String(value || "").replace(/^\s+|\s+$/g, "").toLowerCase();
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
    } catch (error) {
      // Older or stricter Figma hosts can reject newer layout sizing properties.
    }
  }

  function createEditableLayoutNodeModels(packageData) {
    var rootModel = createLayoutModel(packageData.capture.root, {
      parentRect: { x: 0, y: 0, width: 0, height: 0 },
      fallbackReasons: createFallbackReasonLookup(packageData),
      backdropColor: null,
      clippedAncestor: false
    });
    var semanticNaming;
    if (!rootModel) {
      return [];
    }
    try {
      semanticNaming = createSemanticNameMap(packageData.capture.root, packageData.capture.viewport);
      rootModel.semanticNamingSummary = {
        semanticNames: applySemanticNamesToModels(rootModel, semanticNaming.names),
        repeatedGroups: semanticNaming.repeatedGroupCount,
        collapsedWrappers: collapseNonVisualWrappers(rootModel, semanticNaming.names)
      };
    } catch (error) {
      rootModel.semanticNamingSummary = { semanticNames: 0, repeatedGroups: 0, collapsedWrappers: 0 };
    }
    return [rootModel];
  }

  function summarizeSemanticNamingModels(models) {
    var summary = models && models[0] && models[0].semanticNamingSummary || {};
    return {
      semanticNames: summary.semanticNames || 0,
      repeatedGroups: summary.repeatedGroups || 0,
      collapsedWrappers: summary.collapsedWrappers || 0
    };
  }

  var SEMANTIC_TAG_NAMES = {
    header: "Header",
    footer: "Footer",
    nav: "Navigation",
    aside: "Sidebar",
    main: "Main",
    section: "Section",
    article: "Article",
    form: "Form",
    button: "Button",
    table: "Table",
    thead: "Table Head",
    tbody: "Table Body",
    tr: "Table Row",
    ul: "List",
    ol: "List",
    li: "List Item",
    a: "Link",
    input: "Input",
    select: "Select",
    textarea: "Text Area",
    label: "Label",
    h1: "Heading",
    h2: "Heading",
    h3: "Heading",
    h4: "Heading",
    h5: "Heading",
    h6: "Heading",
    dialog: "Modal",
    figure: "Figure",
    img: "Image",
    video: "Video"
  };

  var SEMANTIC_ARIA_ROLE_NAMES = {
    banner: "Header",
    navigation: "Navigation",
    contentinfo: "Footer",
    complementary: "Sidebar",
    main: "Main",
    search: "Search",
    form: "Form",
    region: "Section",
    button: "Button",
    tab: "Tab",
    tablist: "Tab List",
    dialog: "Modal",
    menu: "Menu",
    menuitem: "Menu Item",
    menubar: "Menu Bar",
    listbox: "List",
    list: "List",
    listitem: "List Item",
    checkbox: "Checkbox",
    radio: "Radio",
    switch: "Switch",
    textbox: "Input",
    toolbar: "Toolbar",
    tooltip: "Tooltip",
    alert: "Alert",
    progressbar: "Progress Bar"
  };

  var SEMANTIC_CLASS_TOKEN_NAMES = {
    btn: "Button",
    button: "Button",
    card: "Card",
    nav: "Navigation",
    navbar: "Navigation",
    menu: "Navigation",
    modal: "Modal",
    dialog: "Modal",
    popup: "Modal",
    badge: "Badge",
    tag: "Badge",
    chip: "Badge",
    avatar: "Avatar",
    icon: "Icon",
    header: "Header",
    footer: "Footer",
    sidebar: "Sidebar",
    aside: "Sidebar",
    tab: "Tab",
    tooltip: "Tooltip",
    banner: "Hero",
    hero: "Hero",
    form: "Form",
    search: "Search",
    list: "List",
    item: "List Item",
    title: "Heading",
    heading: "Heading",
    logo: "Logo"
  };

  var SEMANTIC_LABEL_SUFFIX_NAMES = {
    Button: true,
    Tab: true,
    Link: true,
    Heading: true,
    "Menu Item": true
  };

  function createSemanticNameMap(root, viewport) {
    var names = {};
    var repeatedGroupCount = 0;
    var context = { viewport: viewport || null };

    try {
      walkCaptureNodes(root, function (node) {
        var overrides = annotateRepeatedSiblingGroups(node.children || [], context);
        var sourceNodeId;
        var name;
        repeatedGroupCount += countDistinctSemanticGroups(overrides);
        for (sourceNodeId in overrides) {
          if (Object.prototype.hasOwnProperty.call(overrides, sourceNodeId)) {
            names[sourceNodeId] = overrides[sourceNodeId];
          }
        }
        if (!Object.prototype.hasOwnProperty.call(names, node.sourceNodeId)) {
          name = semanticNameForNode(node, context);
          if (name) {
            names[node.sourceNodeId] = name;
          }
        }
      });
    } catch (error) {
      return { names: {}, repeatedGroupCount: 0 };
    }

    return { names: names, repeatedGroupCount: repeatedGroupCount };
  }

  function semanticNameForNode(node, context) {
    try {
      return deriveSemanticName(node, context || {});
    } catch (error) {
      return null;
    }
  }

  function deriveSemanticName(node, context) {
    var tagName;
    var role;
    var baseName;
    var heuristicName;

    if (!node || node.nodeType === "pseudo" || node.nodeType === "text") {
      return null;
    }

    tagName = normalizeCssKeyword(node.tagName);
    baseName = SEMANTIC_TAG_NAMES[tagName];
    if (baseName) {
      return withSemanticLabelSuffix(baseName, node);
    }

    role = normalizeCssKeyword(node.attributes && node.attributes.role);
    baseName = SEMANTIC_ARIA_ROLE_NAMES[role];
    if (baseName) {
      return withSemanticLabelSuffix(baseName, node);
    }

    heuristicName = geometricHeuristicName(node, context.viewport);
    if (heuristicName) {
      return heuristicName;
    }

    baseName = semanticClassTokenName(node.attributes && node.attributes.class);
    if (baseName) {
      return withSemanticLabelSuffix(baseName, node);
    }

    return null;
  }

  function withSemanticLabelSuffix(baseName, node) {
    var label;
    if (baseName === "Image" || baseName === "Video") {
      label = normalizeSemanticLabel(node.attributes && (node.attributes.alt || node.attributes["aria-label"]));
      return label ? baseName + " / " + label : baseName;
    }
    if (baseName === "Input" || baseName === "Select" || baseName === "Text Area") {
      label = normalizeSemanticLabel(node.attributes && node.attributes.placeholder);
      return label ? baseName + " / " + label : baseName;
    }
    if (!SEMANTIC_LABEL_SUFFIX_NAMES[baseName]) {
      return baseName;
    }
    label = normalizeSemanticLabel(node.attributes && node.attributes["aria-label"]) || singleLineSubtreeText(node, 0);
    return label ? baseName + " / " + label : baseName;
  }

  function normalizeSemanticLabel(value) {
    var label = String(value || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    if (!label || label.indexOf("\n") !== -1) {
      return "";
    }
    return label.slice(0, 32);
  }

  function singleLineSubtreeText(node, depth) {
    var direct;
    var index;
    var childText;
    var children;
    if (!node || depth > 4) {
      return "";
    }
    direct = String(node.textContent || "").replace(/^\s+|\s+$/g, "");
    if (direct) {
      return direct.indexOf("\n") === -1 ? direct.slice(0, 32) : "";
    }
    children = node.children || [];
    for (index = 0; index < children.length; index += 1) {
      if (children[index].nodeType === "pseudo") {
        continue;
      }
      childText = singleLineSubtreeText(children[index], depth + 1);
      if (childText) {
        return childText;
      }
    }
    return "";
  }

  function geometricHeuristicName(node, viewport) {
    var rect = node.rect;
    var wideEnough;
    var shortEnough;
    if (!rect || (node.children || []).length === 0) {
      return null;
    }

    if (viewport && viewport.width > 0 && viewport.height > 0) {
      wideEnough = rect.width >= viewport.width * 0.9;
      shortEnough = rect.height > 0 && rect.height <= viewport.height * 0.25;
      if (wideEnough && shortEnough && rect.y <= 2) {
        return "Header";
      }
      if (wideEnough && shortEnough && rect.y + rect.height >= viewport.height - 2) {
        return "Footer";
      }
    }

    if (
      visibleColor(node.styles && node.styles.backgroundColor) &&
      (semanticMaxCornerRadius(node.styles) >= 4 || visibleShadow(node.styles && node.styles.boxShadow)) &&
      countSemanticRenderableChildren(node) >= 2
    ) {
      return "Card";
    }

    return null;
  }

  function semanticClassTokenName(className) {
    var tokens = semanticClassTokens(className);
    var index;
    for (index = 0; index < tokens.length; index += 1) {
      if (SEMANTIC_CLASS_TOKEN_NAMES[tokens[index]]) {
        return SEMANTIC_CLASS_TOKEN_NAMES[tokens[index]];
      }
    }
    return null;
  }

  function semanticClassTokens(className) {
    return String(className || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(function (token) {
        return Boolean(token);
      });
  }

  function annotateRepeatedSiblingGroups(children, context) {
    var overrides = {};
    try {
      collectRepeatedGroupOverrides(children || [], context || {}, overrides);
    } catch (error) {
      return {};
    }
    return overrides;
  }

  function collectRepeatedGroupOverrides(children, context, overrides) {
    var groups = {};
    var index;
    var child;
    var signature;
    var key;
    var members;
    var baseName;
    var ordered;

    for (index = 0; index < children.length; index += 1) {
      child = children[index];
      if (!child || child.nodeType !== "element" || !child.sourceNodeId) {
        continue;
      }
      signature = semanticStructuralSignature(child);
      if (!groups[signature]) {
        groups[signature] = [];
      }
      groups[signature].push(child);
    }

    for (key in groups) {
      if (!Object.prototype.hasOwnProperty.call(groups, key)) {
        continue;
      }
      members = groups[key];
      if (members.length < 2) {
        continue;
      }
      baseName = semanticNameForNode(members[0], context);
      if (!baseName) {
        continue;
      }
      baseName = baseName.split(" / ")[0];
      ordered = members.slice().sort(bySemanticVisualOrder);
      for (index = 0; index < ordered.length; index += 1) {
        overrides[ordered[index].sourceNodeId] = baseName + " " + (index + 1);
      }
    }
  }

  function semanticStructuralSignature(node) {
    var tokens = semanticClassTokens(node.attributes && node.attributes.class);
    var unique = {};
    var deduped = [];
    var childTags = [];
    var children = node.children || [];
    var index;
    for (index = 0; index < tokens.length; index += 1) {
      if (!unique[tokens[index]]) {
        unique[tokens[index]] = true;
        deduped.push(tokens[index]);
      }
    }
    deduped.sort();
    for (index = 0; index < children.length; index += 1) {
      if (children[index].nodeType === "element") {
        childTags.push(normalizeCssKeyword(children[index].tagName));
      }
    }
    return normalizeCssKeyword(node.tagName) + "|" + deduped.join(".") + "|" + childTags.join(",");
  }

  function bySemanticVisualOrder(a, b) {
    var ay = a.rect && a.rect.y || 0;
    var by = b.rect && b.rect.y || 0;
    if (Math.abs(ay - by) > 1) {
      return ay - by;
    }
    return (a.rect && a.rect.x || 0) - (b.rect && b.rect.x || 0);
  }

  function countDistinctSemanticGroups(overrides) {
    var baseNames = {};
    var count = 0;
    var key;
    var base;
    for (key in overrides) {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        base = overrides[key].replace(/ \d+$/, "");
        if (!baseNames[base]) {
          baseNames[base] = true;
          count += 1;
        }
      }
    }
    return count;
  }

  function countSemanticRenderableChildren(node) {
    var children = node.children || [];
    var count = 0;
    var index;
    var child;
    for (index = 0; index < children.length; index += 1) {
      child = children[index];
      if (
        child.textContent ||
        child.assetRef ||
        child.fallbackRef ||
        (child.children || []).length > 0 ||
        visibleColor(child.styles && child.styles.backgroundColor)
      ) {
        count += 1;
      }
    }
    return count;
  }

  function semanticMaxCornerRadius(styles) {
    var safeStyles = styles || {};
    return Math.max(
      numberFromCss(safeStyles.borderTopLeftRadius),
      numberFromCss(safeStyles.borderTopRightRadius),
      numberFromCss(safeStyles.borderBottomRightRadius),
      numberFromCss(safeStyles.borderBottomLeftRadius)
    );
  }

  function walkCaptureNodes(node, visit) {
    var children;
    var index;
    if (!node) {
      return;
    }
    visit(node);
    children = node.children || [];
    for (index = 0; index < children.length; index += 1) {
      walkCaptureNodes(children[index], visit);
    }
  }

  function applySemanticNamesToModels(rootModel, names) {
    var consumed = {};
    var renamed = 0;

    function visit(model) {
      var children = model.children || [];
      var index;
      if (
        model.sourceNodeId &&
        Object.prototype.hasOwnProperty.call(names, model.sourceNodeId) &&
        !consumed[model.sourceNodeId]
      ) {
        consumed[model.sourceNodeId] = true;
        model.name = names[model.sourceNodeId];
        renamed += 1;
      }
      for (index = 0; index < children.length; index += 1) {
        visit(children[index]);
      }
    }

    visit(rootModel);
    return renamed;
  }

  function collapseNonVisualWrappers(rootModel, semanticNames) {
    var collapsedCount = 0;

    function collapseChildren(parent) {
      var children = parent.children || [];
      var index;
      var child;
      var grandchild;
      var replacement;
      for (index = 0; index < children.length; index += 1) {
        child = children[index];
        while (shouldCollapseWrapper(child, parent, semanticNames)) {
          grandchild = child.children[0];
          replacement = {};
          for (var key in grandchild) {
            if (Object.prototype.hasOwnProperty.call(grandchild, key)) {
              replacement[key] = grandchild[key];
            }
          }
          replacement.rect = {
            x: round(child.rect.x + grandchild.rect.x),
            y: round(child.rect.y + grandchild.rect.y),
            width: grandchild.rect.width,
            height: grandchild.rect.height
          };
          children[index] = replacement;
          child = replacement;
          collapsedCount += 1;
        }
        collapseChildren(child);
      }
    }

    collapseChildren(rootModel);
    return collapsedCount;
  }

  function shouldCollapseWrapper(model, parent, semanticNames) {
    var child;
    if (!model || model.type !== "FRAME" || (model.children || []).length !== 1) {
      return false;
    }
    if (model.assetRef || model.fallbackReason || model.clipsContent) {
      return false;
    }
    if ((model.autoLayout && model.autoLayout.applied) || (parent.autoLayout && parent.autoLayout.applied)) {
      return false;
    }
    if (semanticNames && Object.prototype.hasOwnProperty.call(semanticNames, model.sourceNodeId)) {
      return false;
    }
    if (hasModelVisualStyle(model.style) || hasCollapseBlockingStyles(model.styles)) {
      return false;
    }
    child = model.children[0];
    if (!child || sharesSourceIdentity(model, child)) {
      return false;
    }
    return rectsMatchWithinTolerance(model.absoluteRect, child.absoluteRect, 1);
  }

  function sharesSourceIdentity(model, child) {
    return Boolean(
      child.sourceNodeId &&
      model.sourceNodeId &&
      (child.sourceNodeId === model.sourceNodeId ||
        child.sourceNodeId.indexOf(model.sourceNodeId + "::") === 0)
    );
  }

  function hasCollapseBlockingStyles(styles) {
    var safeStyles = styles || {};
    var opacity = safeStyles.opacity === undefined ? 1 : parseFloat(safeStyles.opacity);
    var transform = String(safeStyles.transform || "").replace(/^\s+|\s+$/g, "");
    if (isFinite(opacity) && opacity < 1) {
      return true;
    }
    if (transform && transform !== "none") {
      return true;
    }
    return /gradient\(/i.test(String(safeStyles.backgroundImage || ""));
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
    var borderDecorations;
    var nodeChildren;
    var index;
    var childModel;
    var model;
    var visibleChildrenRect;
    var inheritedBackdropColor;
    var hasClippedAncestor;
    var textGeometry;

    if (!node) {
      return null;
    }

    inheritedBackdropColor = visibleColor(node.styles && node.styles.backgroundColor)
      ? node.styles.backgroundColor
      : context.backdropColor;
    hasClippedAncestor = Boolean(context.clippedAncestor || shouldClipContent(node));
    absoluteRect = geometryAdjustedAbsoluteRect(node, normalizeModelRect(node.rect));
    rect = relativeModelRect(absoluteRect, context.parentRect);
    nodeChildren = node.children || [];
    for (index = 0; index < nodeChildren.length; index += 1) {
      childModel = createLayoutModel(nodeChildren[index], {
        parentRect: absoluteRect,
        fallbackReasons: context.fallbackReasons,
        backdropColor: inheritedBackdropColor,
        clippedAncestor: hasClippedAncestor
      });
      if (childModel) {
        children.push(childModel);
      }
    }
    visibleChildrenRect = visibleChildrenBoundsForTransparentTransformedWrapper(node, absoluteRect, children);
    if (visibleChildrenRect) {
      absoluteRect = visibleChildrenRect;
      rect = relativeModelRect(absoluteRect, context.parentRect);
      children = children.map(function (child) {
        return Object.assign({}, child, {
          rect: relativeModelRect(child.absoluteRect, absoluteRect)
        });
      });
    }
    children = repairStaticPseudoFlexGeometry(node, absoluteRect, children);
    if (node.textContent && shouldSuppressTinyClippedText(node, rect)) {
      return null;
    }
    borderDecorations = createBorderDecorationModels(node, rect, absoluteRect);

    if (node.textContent && children.length > 0) {
      var mixedContent = prepareMixedDirectTextContent(node, absoluteRect, children);
      childModel = createDirectTextModel(mixedContent.node, absoluteRect, mixedContent.children);
      children = insertMixedContentTextChild(mixedContent.children, childModel, node);
      children = children.concat(borderDecorations);
      model = baseLayoutModel(node, "FRAME", rect, absoluteRect, children);
      applyTextOverlayBackdrop(model, node, context);
      model.autoLayout = inferAutoLayout(node, children);
      model.children = orderedChildrenForAutoLayout(children, model.autoLayout);
      model.clipsContent = shouldClipContent(node);
      return model;
    }

    if (node.textContent) {
      if (isDirectTableCellTextNode(node)) {
        return createTableCellTextModel(node, rect, absoluteRect, borderDecorations);
      }
      if (shouldPreserveTransparentPaddedInteractiveTextFrame(node, rect)) {
        return createTransparentPaddedTextFrameModel(node, rect, absoluteRect, borderDecorations);
      }
      textGeometry = hasVisualBoxStyle(node.styles)
        ? { rect: rect, absoluteRect: absoluteRect }
        : paddedTransparentTextGeometry(node, rect, absoluteRect);
      model = createTextModel(
        node,
        textGeometry.rect,
        textGeometry.absoluteRect,
        inferTextAutoResize(node, textGeometry.rect)
      );
      if (hasVisualBoxStyle(node.styles)) {
        var backingPadding = explicitCssPadding(node.styles);
        var shouldUsePaddedBacking = hasPositivePadding(backingPadding);
        var backingContentRect = shouldUsePaddedBacking
          ? contentRectFromPadding(rect, backingPadding)
          : null;
        var backingTextAutoResize = shouldUsePaddedBacking
          ? inferPaddedBackingTextAutoResize(node, backingContentRect)
          : "HEIGHT";
        childModel = model;
        childModel.rect = shouldUsePaddedBacking
          ? backingContentRect
          : { x: 0, y: 0, width: rect.width, height: rect.height };
        childModel.textAutoResize = backingTextAutoResize;
        childModel.layoutSizingHorizontal = textLayoutSizingHorizontal(backingTextAutoResize);
        childModel.layoutSizingVertical = textLayoutSizingVertical(backingTextAutoResize);
        model = baseLayoutModel(node, "FRAME", rect, absoluteRect, [childModel].concat(borderDecorations));
        model.name = "Text Background / " + String(node.textContent || "").slice(0, 32);
        model.autoLayout = shouldUsePaddedBacking && borderDecorations.length === 0
          ? textBackingAutoLayout(backingPadding, backingTextAutoResize)
          : null;
      }
      return model;
    }

    if (hasVisiblePlaceholder(node)) {
      return createPlaceholderInputModel(node, rect, absoluteRect, borderDecorations);
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
      children = reparentAbsoluteOverlaysIntoStackingHosts(children).concat(borderDecorations);
      model = baseLayoutModel(node, "FRAME", rect, absoluteRect, children);
      model.autoLayout = inferAutoLayout(node, children);
      model.children = orderedChildrenForAutoLayout(children, model.autoLayout);
      model.clipsContent = shouldClipContent(node);
      return model;
    }

    if (!isRenderable(node)) {
      return null;
    }

    if (borderDecorations.length > 0) {
      model = baseLayoutModel(node, "FRAME", rect, absoluteRect, borderDecorations);
      model.autoLayout = null;
      model.clipsContent = shouldClipContent(node);
      return model;
    }

    return baseLayoutModel(node, "RECTANGLE", rect, absoluteRect, []);
  }

  function createBorderDecorationModels(node, rect, absoluteRect) {
    var sides = borderDecorationSides(node.styles);
    var models = [];
    var index;
    var side;
    var decorationRect;
    var decorationAbsoluteRect;
    for (index = 0; index < sides.length; index += 1) {
      side = sides[index];
      decorationRect = borderDecorationRect(side, rect);
      decorationAbsoluteRect = {
        x: round(absoluteRect.x + decorationRect.x),
        y: round(absoluteRect.y + decorationRect.y),
        width: decorationRect.width,
        height: decorationRect.height
      };
      models.push({
        id: node.sourceNodeId + "::border-" + side.side,
        type: "RECTANGLE",
        name: "Border / " + side.side,
        sourceNodeId: node.sourceNodeId + "::border-" + side.side,
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
      });
    }
    return models;
  }

  function geometryAdjustedAbsoluteRect(node, absoluteRect) {
    var translation;
    if (node.nodeType !== "pseudo") {
      return absoluteRect;
    }

    translation = transformTranslation(node.styles && node.styles.transform);
    if (Math.abs(translation.x) < 0.001 && Math.abs(translation.y) < 0.001) {
      return absoluteRect;
    }
    return {
      x: round(absoluteRect.x + translation.x),
      y: round(absoluteRect.y + translation.y),
      width: absoluteRect.width,
      height: absoluteRect.height
    };
  }

  function transformTranslation(transform) {
    var value = String(transform || "").replace(/^\s+|\s+$/g, "");
    var match;
    var parts;
    if (!value || value === "none") {
      return { x: 0, y: 0 };
    }

    match = value.match(/^matrix\(([^)]+)\)$/i);
    if (match) {
      parts = parseTransformNumbers(match[1]);
      return {
        x: parts.length >= 6 ? parts[4] : 0,
        y: parts.length >= 6 ? parts[5] : 0
      };
    }

    match = value.match(/^matrix3d\(([^)]+)\)$/i);
    if (match) {
      parts = parseTransformNumbers(match[1]);
      return {
        x: parts.length >= 16 ? parts[12] : 0,
        y: parts.length >= 16 ? parts[13] : 0
      };
    }

    match = value.match(/^translate3d\(([^)]+)\)$/i);
    if (match) {
      parts = parseTransformNumbers(match[1]);
      return { x: parts[0] || 0, y: parts[1] || 0 };
    }

    match = value.match(/^translateX\(([^)]+)\)$/i);
    if (match) {
      return { x: numberFromCss(match[1]), y: 0 };
    }

    match = value.match(/^translateY\(([^)]+)\)$/i);
    if (match) {
      return { x: 0, y: numberFromCss(match[1]) };
    }

    match = value.match(/^translate\(([^)]+)\)$/i);
    if (match) {
      parts = parseTransformNumbers(match[1]);
      return { x: parts[0] || 0, y: parts[1] || 0 };
    }

    return { x: 0, y: 0 };
  }

  function parseTransformNumbers(value) {
    var rawParts = String(value || "").split(/[\s,]+/);
    var parts = [];
    var index;
    var parsed;
    for (index = 0; index < rawParts.length; index += 1) {
      parsed = numberFromCss(rawParts[index]);
      if (isFinite(parsed)) {
        parts.push(parsed);
      }
    }
    return parts;
  }

  function visibleChildrenBoundsForTransparentTransformedWrapper(node, absoluteRect, children) {
    var childrenRect;
    if (
      children.length === 0 ||
      hasVisualBoxStyle(node.styles) ||
      shouldClipContent(node) ||
      !hasTransformTranslation(node.styles && node.styles.transform)
    ) {
      return null;
    }

    childrenRect = unionAbsoluteRect(children);
    if (!childrenRect || rectContains(absoluteRect, childrenRect, 1)) {
      return null;
    }
    return childrenRect;
  }

  function repairStaticPseudoFlexGeometry(node, absoluteRect, children) {
    var styles = node.styles || {};
    var display = normalizeCssKeyword(styles.display);
    var flexDirection;
    var layoutMode;
    var pseudoChildren;
    var padding;
    var startBase;
    var endBase;
    var beforeOffset = 0;
    var afterOffset = 0;
    if ((display !== "flex" && display !== "inline-flex") || children.length < 2) {
      return children;
    }
    flexDirection = normalizeCssKeyword(styles.flexDirection);
    layoutMode = flexDirection.indexOf("column") === 0 ? "VERTICAL" : "HORIZONTAL";
    pseudoChildren = children.filter(function (child) {
      return isStaticPseudoFlowModel(child) && pseudoOverlapsFlowSibling(child, children, layoutMode);
    });
    if (pseudoChildren.length === 0) {
      return children;
    }

    padding = explicitCssPadding(styles) || zeroPadding();
    startBase = layoutMode === "HORIZONTAL"
      ? absoluteRect.x + padding.left
      : absoluteRect.y + padding.top;
    endBase = layoutMode === "HORIZONTAL"
      ? absoluteRect.x + absoluteRect.width - padding.right
      : absoluteRect.y + absoluteRect.height - padding.bottom;

    return children.map(function (child) {
      var size;
      var start;
      var absoluteChildRect;
      if (pseudoChildren.indexOf(child) < 0) {
        return child;
      }
      size = layoutMode === "HORIZONTAL" ? child.absoluteRect.width : child.absoluteRect.height;
      start = isBeforePseudoModel(child)
        ? startBase + beforeOffset
        : endBase - afterOffset - size;
      if (isBeforePseudoModel(child)) {
        beforeOffset += size;
      } else {
        afterOffset += size;
      }
      absoluteChildRect = layoutMode === "HORIZONTAL"
        ? Object.assign({}, child.absoluteRect, { x: round(start) })
        : Object.assign({}, child.absoluteRect, { y: round(start) });
      return Object.assign({}, child, {
        absoluteRect: absoluteChildRect,
        rect: relativeModelRect(absoluteChildRect, absoluteRect)
      });
    });
  }

  function isStaticPseudoFlowModel(model) {
    return (isBeforePseudoModel(model) || isAfterPseudoModel(model)) &&
      normalizeCssKeyword(model.styles && model.styles.position) !== "absolute" &&
      hasUsableBounds(model.absoluteRect);
  }

  function pseudoOverlapsFlowSibling(pseudo, children, layoutMode) {
    return children.some(function (child) {
      return child !== pseudo &&
        !isBeforePseudoModel(child) &&
        !isAfterPseudoModel(child) &&
        axisRangesOverlap(pseudo.absoluteRect, child.absoluteRect, layoutMode);
    });
  }

  function axisRangesOverlap(a, b, layoutMode) {
    return primaryAxisStart(a, layoutMode) < primaryAxisEnd(b, layoutMode) &&
      primaryAxisEnd(a, layoutMode) > primaryAxisStart(b, layoutMode);
  }

  function hasTransformTranslation(transform) {
    var translation = transformTranslation(transform);
    return Math.abs(translation.x) >= 0.001 || Math.abs(translation.y) >= 0.001;
  }

  function unionAbsoluteRect(children) {
    var visibleChildren = children.filter(function (child) {
      return hasUsableBounds(child.absoluteRect);
    });
    var left;
    var top;
    var right;
    var bottom;
    if (visibleChildren.length === 0) {
      return null;
    }

    left = Math.min.apply(null, visibleChildren.map(function (child) { return child.absoluteRect.x; }));
    top = Math.min.apply(null, visibleChildren.map(function (child) { return child.absoluteRect.y; }));
    right = Math.max.apply(null, visibleChildren.map(function (child) { return child.absoluteRect.x + child.absoluteRect.width; }));
    bottom = Math.max.apply(null, visibleChildren.map(function (child) { return child.absoluteRect.y + child.absoluteRect.height; }));
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

  function baseLayoutModel(node, type, rect, absoluteRect, children) {
    var model = {
      id: node.sourceNodeId,
      type: type,
      name: layoutLayerNameForNode(node, type),
      sourceNodeId: node.sourceNodeId,
      pseudoType: node.nodeType === "pseudo" ? node.tagName : undefined,
      rect: rect,
      absoluteRect: absoluteRect,
      style: extractVisualStyle(node),
      styles: node.styles || {},
      children: children
    };
    if (numericZIndex(node.styles && node.styles.zIndex) !== null) {
      model.cssZIndex = String(node.styles.zIndex).replace(/^\s+|\s+$/g, "");
    }
    if (normalizeCssKeyword(node.styles && node.styles.position) === "absolute") {
      model.layoutPositioning = "ABSOLUTE";
    }
    return model;
  }

  function createTextModel(node, rect, absoluteRect, textAutoResize) {
    var geometry = normalizeTallHugTextGeometry(node, rect, absoluteRect, textAutoResize);
    var model = baseLayoutModel(node, "TEXT", geometry.rect, geometry.absoluteRect, []);
    model.text = node.textContent;
    model.textAutoResize = textAutoResize;
    model.layoutSizingHorizontal = textLayoutSizingHorizontal(textAutoResize);
    model.layoutSizingVertical = textLayoutSizingVertical(textAutoResize);
    return model;
  }

  function createTableCellTextModel(node, rect, absoluteRect, borderDecorations) {
    var padding = explicitCssPadding(node.styles) || zeroPadding();
    var textAutoResize = tableCellTextAutoResize(node, rect);
    var textModel = createTextModel(
      node,
      tableCellTextRect(rect, padding, node.styles || {}, textAutoResize),
      tableCellTextAbsoluteRect(absoluteRect, rect, padding, node.styles || {}, textAutoResize),
      textAutoResize
    );
    var model = baseLayoutModel(node, "FRAME", rect, absoluteRect, [textModel].concat(borderDecorations));
    model.name = "Table Cell / " + String(node.textContent || "").slice(0, 32);
    model.autoLayout = borderDecorations.length === 0
      ? tableCellAutoLayout(padding, node)
      : null;
    return model;
  }

  function createTransparentPaddedTextFrameModel(node, rect, absoluteRect, borderDecorations) {
    var padding = explicitCssPadding(node.styles) || zeroPadding();
    var contentRect = contentRectFromPadding(rect, padding);
    var contentAbsoluteRect = {
      x: round(absoluteRect.x + contentRect.x),
      y: round(absoluteRect.y + contentRect.y),
      width: contentRect.width,
      height: contentRect.height
    };
    var textNode = {};
    var key;
    var textAutoResize;
    var textModel;
    var model;
    for (key in node) {
      if (Object.prototype.hasOwnProperty.call(node, key)) {
        textNode[key] = node[key];
      }
    }
    textNode.sourceNodeId = String(node.sourceNodeId || "") + "::text";
    textAutoResize = inferPaddedBackingTextAutoResize(textNode, contentRect);
    textModel = createTextModel(
      textNode,
      contentRect,
      contentAbsoluteRect,
      textAutoResize
    );
    model = baseLayoutModel(node, "FRAME", rect, absoluteRect, [textModel].concat(borderDecorations));
    model.name = "Text Wrapper / " + String(node.textContent || "").slice(0, 32);
    model.autoLayout = borderDecorations.length === 0
      ? textBackingAutoLayout(padding, textAutoResize)
      : null;
    model.clipsContent = shouldClipContent(node);
    return model;
  }

  function createPlaceholderInputModel(node, rect, absoluteRect, borderDecorations) {
    var placeholderTextModel = createPlaceholderTextModel(node, rect, absoluteRect);
    var model = baseLayoutModel(node, "FRAME", rect, absoluteRect, [placeholderTextModel].concat(borderDecorations));
    model.name = "Input / " + String((node.attributes && node.attributes.placeholder) || "").slice(0, 32);
    model.autoLayout = null;
    model.clipsContent = shouldClipContent(node);
    return model;
  }

  function createPlaceholderTextModel(node, rect, absoluteRect) {
    var placeholderTextRect = inputPlaceholderTextRect(rect, node.styles || {});
    var placeholderAbsoluteRect = {
      x: round(absoluteRect.x + placeholderTextRect.x),
      y: round(absoluteRect.y + placeholderTextRect.y),
      width: placeholderTextRect.width,
      height: placeholderTextRect.height
    };
    var placeholderNode = Object.assign({}, node, {
      sourceNodeId: node.sourceNodeId + "::placeholder",
      tagName: "#text",
      textContent: String((node.attributes && node.attributes.placeholder) || ""),
      rect: placeholderAbsoluteRect,
      styles: placeholderTextStyles(node.styles || {}),
      children: []
    });
    return createTextModel(placeholderNode, placeholderTextRect, placeholderAbsoluteRect, "TRUNCATE");
  }

  function inputPlaceholderTextRect(rect, styles) {
    var padding = explicitCssPadding(styles) || zeroPadding();
    var lineHeight = numberFromCss(styles && styles.lineHeight) ||
      numberFromCss(styles && styles.fontSize) * 1.2 ||
      rect.height;
    var textHeight = round(Math.min(rect.height, Math.max(1, lineHeight)));
    var contentHeight = Math.max(1, rect.height - padding.top - padding.bottom);
    return {
      x: padding.left,
      y: round(padding.top + Math.max(0, (contentHeight - textHeight) / 2)),
      width: round(Math.max(1, rect.width - padding.left - padding.right)),
      height: textHeight
    };
  }

  function placeholderTextStyles(styles) {
    var next = Object.assign({}, styles, {
      color: styles.placeholderColor || styles.color,
      whiteSpace: "nowrap",
      overflow: "hidden",
      overflowX: "hidden",
      textOverflow: styles.textOverflow === "ellipsis" ? "ellipsis" : "clip"
    });
    delete next.webkitTextFillColor;
    delete next.backgroundClip;
    delete next.webkitBackgroundClip;
    delete next.backgroundImage;
    return next;
  }

  function tableCellTextAutoResize(node, rect) {
    return isClippedSingleLineText(node, rect, node.styles || {})
      ? "TRUNCATE"
      : "WIDTH_AND_HEIGHT";
  }

  function tableCellTextRect(rect, padding, styles, textAutoResize) {
    var lineHeight;
    var textHeight;
    var contentHeight;
    var yOffset;
    if (textAutoResize !== "WIDTH_AND_HEIGHT") {
      return contentRectFromPadding(rect, padding);
    }

    lineHeight = numberFromCss(styles && styles.lineHeight) ||
      numberFromCss(styles && styles.fontSize) * 1.2 ||
      rect.height;
    textHeight = round(Math.min(rect.height, Math.max(1, lineHeight)));
    contentHeight = Math.max(1, rect.height - padding.top - padding.bottom);
    yOffset = tableCellVerticalOffset(styles && styles.verticalAlign, contentHeight, textHeight);
    return {
      x: padding.left,
      y: round(padding.top + yOffset),
      width: round(Math.max(1, rect.width - padding.left - padding.right)),
      height: textHeight
    };
  }

  function tableCellTextAbsoluteRect(absoluteRect, rect, padding, styles, textAutoResize) {
    var childRect = tableCellTextRect(rect, padding, styles, textAutoResize);
    return {
      x: round(absoluteRect.x + childRect.x),
      y: round(absoluteRect.y + childRect.y),
      width: childRect.width,
      height: childRect.height
    };
  }

  function tableCellAutoLayout(padding, node) {
    var styles = node.styles || {};
    return {
      applied: true,
      layoutMode: "HORIZONTAL",
      itemSpacing: 0,
      primaryAxisAlignItems: tableCellPrimaryAxisAlignment(styles && styles.textAlign, node.attributes && node.attributes.class),
      counterAxisAlignItems: tableCellCounterAxisAlignment(styles && styles.verticalAlign),
      paddingLeft: padding.left,
      paddingRight: padding.right,
      paddingTop: padding.top,
      paddingBottom: padding.bottom,
      confidence: 0.9
    };
  }

  function tableCellPrimaryAxisAlignment(textAlign, className) {
    var normalized = normalizeCssKeyword(textAlign);
    var classes;
    if (normalized === "right" || normalized === "end" || normalized === "-webkit-right") {
      return "MAX";
    }
    if (normalized === "center" || normalized === "-webkit-center") {
      return "CENTER";
    }
    classes = classTokens(className);
    if (classes["text-right"] || classes["text-end"]) {
      return "MAX";
    }
    if (classes["text-center"]) {
      return "CENTER";
    }
    if (classes["text-left"] || classes["text-start"]) {
      return "MIN";
    }
    return "MIN";
  }

  function tableCellCounterAxisAlignment(verticalAlign) {
    var normalized = normalizeCssKeyword(verticalAlign);
    if (normalized === "top" || normalized === "text-top" || normalized === "super") {
      return "MIN";
    }
    if (normalized === "bottom" || normalized === "text-bottom" || normalized === "sub") {
      return "MAX";
    }
    return "CENTER";
  }

  function tableCellVerticalOffset(verticalAlign, contentHeight, textHeight) {
    var available = Math.max(0, contentHeight - textHeight);
    var alignment = tableCellCounterAxisAlignment(verticalAlign);
    if (alignment === "MIN") {
      return 0;
    }
    if (alignment === "MAX") {
      return round(available);
    }
    return round(available / 2);
  }

  function isDirectTableCellTextNode(node) {
    var tagName = String(node.tagName || "").toLowerCase();
    var display = normalizeCssKeyword(node.styles && node.styles.display);
    return tagName === "td" || tagName === "th" || display === "table-cell";
  }

  function hasVisiblePlaceholder(node) {
    var tagName = String(node.tagName || "").toLowerCase();
    var placeholder = String((node.attributes && node.attributes.placeholder) || "");
    return (tagName === "input" || tagName === "textarea") &&
      placeholder.replace(/^\s+|\s+$/g, "").length > 0 &&
      String((node.attributes && node.attributes["data-has-value"]) || "").toLowerCase() !== "true";
  }

  function classTokens(className) {
    var tokens = {};
    var parts = String(className || "").split(/\s+/);
    var index;
    for (index = 0; index < parts.length; index += 1) {
      if (parts[index]) {
        tokens[parts[index]] = true;
      }
    }
    return tokens;
  }

  function createDirectTextModel(node, parentAbsoluteRect, children) {
    var absoluteRect = inferDirectTextRect(node, parentAbsoluteRect, children);
    var rect = relativeModelRect(absoluteRect, parentAbsoluteRect);
    var textNode = {};
    var textStyles = {};
    Object.keys(node).forEach(function (key) {
      textNode[key] = node[key];
    });
    Object.keys(node.styles || {}).forEach(function (key) {
      if (key !== "zIndex") {
        textStyles[key] = node.styles[key];
      }
    });
    textNode.sourceNodeId = String(node.sourceNodeId || "") + "::text";
    textNode.tagName = "#text";
    textNode.children = [];
    textNode.rect = absoluteRect;
    textNode.styles = textStyles;
    return createTextModel(textNode, rect, absoluteRect, inferTextContentAutoResize(textNode, rect));
  }

  function prepareMixedDirectTextContent(node, parentAbsoluteRect, children) {
    var merge = mergeableInlineSeparator(node, parentAbsoluteRect, children);
    var mergedNode;
    if (!merge) {
      return {
        node: node,
        children: children
      };
    }

    mergedNode = {};
    Object.keys(node).forEach(function (key) {
      mergedNode[key] = node[key];
    });
    mergedNode.textContent = insertInlineSeparatorText(
      node.textContent,
      merge.separator.text,
      merge.primaryOffset,
      node.styles
    );
    return {
      node: mergedNode,
      children: children.filter(function (child) {
        return child !== merge.separator;
      })
    };
  }

  function mergeableInlineSeparator(node, parentAbsoluteRect, children) {
    var separators = children.filter(isInlineTextSeparatorModel);
    var index;
    var styles;
    var flexDirection;
    var padding;
    var parentStart;
    var parentEnd;
    var parentSize;
    var separator;
    var primaryOffset;
    var largestSegment;
    var estimatedTextSize;

    if (separators.length !== 1) {
      return null;
    }
    for (index = 0; index < children.length; index += 1) {
      if (children[index].pseudoType) {
        return null;
      }
    }

    styles = node.styles || {};
    flexDirection = styles.flexDirection || "row";
    if (String(flexDirection).indexOf("column") === 0) {
      return null;
    }

    padding = explicitCssPadding(styles) || zeroPadding();
    parentStart = parentAbsoluteRect.x + padding.left;
    parentEnd = parentAbsoluteRect.x + Math.max(0, parentAbsoluteRect.width - padding.right);
    parentSize = parentEnd - parentStart;
    separator = separators[0];
    primaryOffset = separator.absoluteRect.x - parentStart;
    if (primaryOffset <= 1 || primaryOffset >= parentSize - 1) {
      return null;
    }

    largestSegment = largestDirectTextSegmentSize(children, parentStart, parentEnd);
    estimatedTextSize = estimateTextPrimarySize(node.textContent, styles);
    if (estimatedTextSize <= largestSegment + 1 || estimatedTextSize > parentSize + separator.absoluteRect.width + 8) {
      return null;
    }

    return {
      separator: separator,
      primaryOffset: primaryOffset
    };
  }

  function isInlineTextSeparatorModel(child) {
    var text;
    if (child.type !== "TEXT" || child.pseudoType) {
      return false;
    }
    text = String(child.text || "").replace(/^\s+|\s+$/g, "");
    return text.length > 0 && text.length <= 2 && /^[|¦:：/\\·•\-–—]+$/.test(text);
  }

  function largestDirectTextSegmentSize(children, parentStart, parentEnd) {
    var sorted = children.filter(function (child) {
      return directTextChildOverlapsContent(child, "HORIZONTAL", parentStart, parentEnd);
    }).sort(function (a, b) {
      return a.absoluteRect.x - b.absoluteRect.x;
    });
    var segments = [];
    var cursor = parentStart;
    var index;
    var child;
    var childStart;
    var childEnd;
    var largest = 0;
    for (index = 0; index < sorted.length; index += 1) {
      child = sorted[index];
      childStart = clampNumber(child.absoluteRect.x, parentStart, parentEnd);
      childEnd = clampNumber(child.absoluteRect.x + child.absoluteRect.width, parentStart, parentEnd);
      addDirectTextSegment(segments, cursor, childStart, cursor > parentStart, true);
      cursor = Math.max(cursor, childEnd);
    }
    addDirectTextSegment(segments, cursor, parentEnd, cursor > parentStart, false);
    for (index = 0; index < segments.length; index += 1) {
      largest = Math.max(largest, segments[index].size);
    }
    return largest;
  }

  function insertInlineSeparatorText(text, separator, primaryOffset, styles) {
    var source = String(text || "");
    var index = closestTextSplitIndex(source, primaryOffset, styles || {});
    var prefix = source.slice(0, index).replace(/\s+$/g, "");
    var suffix = source.slice(index).replace(/^\s+/g, "");
    var parts = [prefix, String(separator || "").replace(/^\s+|\s+$/g, ""), suffix].filter(function (part) {
      return Boolean(part);
    });
    return parts.join(" ");
  }

  function closestTextSplitIndex(text, targetWidth, styles) {
    var bestIndex = 0;
    var bestDistance = Number.POSITIVE_INFINITY;
    var index;
    var width;
    var distance;
    for (index = 0; index <= text.length; index += 1) {
      width = estimateTextPrimarySize(text.slice(0, index), styles);
      distance = Math.abs(width - targetWidth);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  function insertMixedContentTextChild(children, textModel, node) {
    var flexDirection = node.styles && node.styles.flexDirection || "row";
    var layoutMode = String(flexDirection).indexOf("column") === 0 ? "VERTICAL" : "HORIZONTAL";
    var sorted = function (items) {
      return items.slice().sort(function (a, b) {
        return layoutMode === "HORIZONTAL"
          ? a.absoluteRect.x - b.absoluteRect.x
          : a.absoluteRect.y - b.absoluteRect.y;
      });
    };
    var beforeChildren = sorted(children.filter(isBeforePseudoModel));
    var afterChildren = sorted(children.filter(isAfterPseudoModel));
    var flowChildren = sorted(children.filter(function (child) {
      return !isBeforePseudoModel(child) && !isAfterPseudoModel(child);
    }));
    return beforeChildren.concat(sorted(flowChildren.concat([textModel]))).concat(afterChildren);
  }

  function isBeforePseudoModel(model) {
    return model.pseudoType === "::before" || hasNameSuffix(model, " / ::before");
  }

  function isAfterPseudoModel(model) {
    return model.pseudoType === "::after" || hasNameSuffix(model, " / ::after");
  }

  function hasNameSuffix(model, suffix) {
    var name = String(model && model.name || "");
    return name.slice(name.length - suffix.length) === suffix;
  }

  function inferDirectTextRect(node, parentRect, children) {
    var styles = node.styles || {};
    var flexDirection = styles.flexDirection || "row";
    var layoutMode = String(flexDirection).indexOf("column") === 0 ? "VERTICAL" : "HORIZONTAL";
    var padding = explicitCssPadding(styles) || zeroPadding();
    var parentStart = layoutMode === "HORIZONTAL"
      ? parentRect.x + padding.left
      : parentRect.y + padding.top;
    var parentEnd = layoutMode === "HORIZONTAL"
      ? parentRect.x + Math.max(0, parentRect.width - padding.right)
      : parentRect.y + Math.max(0, parentRect.height - padding.bottom);
    var crossStart = layoutMode === "HORIZONTAL"
      ? parentRect.y + padding.top
      : parentRect.x + padding.left;
    var crossSize = layoutMode === "HORIZONTAL"
      ? Math.max(1, parentRect.height - padding.top - padding.bottom)
      : Math.max(1, parentRect.width - padding.left - padding.right);
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
    var sorted = children.filter(function (child) {
      return directTextChildOverlapsContent(child, layoutMode, parentStart, parentEnd);
    }).sort(function (a, b) {
      return layoutMode === "HORIZONTAL"
        ? a.absoluteRect.x - b.absoluteRect.x
        : a.absoluteRect.y - b.absoluteRect.y;
    });
    var segments = [];
    var cursor = parentStart;
    var index;
    var child;
    var rawChildStart;
    var rawChildEnd;
    var childStart;
    var childEnd;
    var bestSegment;
    var estimatedTextSize;
    var start;

    for (index = 0; index < sorted.length; index += 1) {
      child = sorted[index];
      rawChildStart = layoutMode === "HORIZONTAL" ? child.absoluteRect.x : child.absoluteRect.y;
      rawChildEnd = rawChildStart + (layoutMode === "HORIZONTAL" ? child.absoluteRect.width : child.absoluteRect.height);
      childStart = clampNumber(rawChildStart, parentStart, parentEnd);
      childEnd = clampNumber(rawChildEnd, parentStart, parentEnd);
      addDirectTextSegment(segments, cursor, childStart, cursor > parentStart, true);
      cursor = Math.max(cursor, childEnd);
    }
    addDirectTextSegment(segments, cursor, parentEnd, cursor > parentStart, false);

    segments.sort(function (a, b) {
      return b.size - a.size;
    });
    bestSegment = segments[0];
    if (!bestSegment) {
      return {
        x: parentRect.x,
        y: parentRect.y,
        width: parentRect.width,
        height: parentRect.height
      };
    }

    estimatedTextSize = Math.min(bestSegment.size, estimateTextPrimarySize(node.textContent, styles));
    start = bestSegment.hasPrevious && bestSegment.hasNext
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

  function shouldUseFullMultilineDirectTextRect(node, parentRect, children, layoutMode, padding) {
    var styles;
    var whiteSpace;
    var lineHeight;
    var contentHeight;
    var firstLineBottom;
    var index;
    if (layoutMode !== "HORIZONTAL") {
      return false;
    }
    for (index = 0; index < children.length; index += 1) {
      if (children[index].pseudoType) {
        return false;
      }
    }

    styles = node.styles || {};
    whiteSpace = normalizeCssKeyword(styles.whiteSpace);
    if (whiteSpace === "nowrap" || whiteSpace === "pre") {
      return false;
    }

    lineHeight = numberFromCss(styles.lineHeight) || numberFromCss(styles.fontSize) * 1.2;
    contentHeight = Math.max(1, parentRect.height - padding.top - padding.bottom);
    if (!(lineHeight > 0) || contentHeight < lineHeight * 1.5) {
      return false;
    }

    firstLineBottom = parentRect.y + padding.top + lineHeight - 0.5;
    for (index = 0; index < children.length; index += 1) {
      if (children[index].absoluteRect.y >= firstLineBottom) {
        return true;
      }
    }
    return false;
  }

  function directTextChildOverlapsContent(child, layoutMode, parentStart, parentEnd) {
    var childStart = layoutMode === "HORIZONTAL" ? child.absoluteRect.x : child.absoluteRect.y;
    var childEnd = childStart + (layoutMode === "HORIZONTAL" ? child.absoluteRect.width : child.absoluteRect.height);
    return childEnd > parentStart + 0.5 && childStart < parentEnd - 0.5;
  }

  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function addDirectTextSegment(segments, start, end, hasPrevious, hasNext) {
    var size = end - start;
    if (size > 0.5) {
      segments.push({
        start: start,
        end: end,
        size: size,
        hasPrevious: hasPrevious,
        hasNext: hasNext
      });
    }
  }

  function estimateTextPrimarySize(text, styles) {
    var safeStyles = styles || {};
    var fontSize = numberFromCss(safeStyles.fontSize) || 14;
    var width = 0;
    var chars = String(text || "");
    var index;
    var char;
    for (index = 0; index < chars.length; index += 1) {
      char = chars.charAt(index);
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
    if (hasAbsolutePositionedChild(children)) {
      return skippedLayout("absolute-position-child");
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

    primaryAxisAlignItems = inferPrimaryAxisAlignment(styles, children, layoutMode, parentRect);
    counterAxisAlignItems = counterAxisAlignmentFromCss(styles.alignItems);
    if (hasNonUniformImplicitSpacing(styles, children, layoutMode, primaryAxisAlignItems)) {
      return skippedLayout("non-uniform-spacing");
    }
    if (primaryAxisAlignItems === "SPACE_BETWEEN") {
      spacing = 0;
    } else {
      spacing = explicitSpacing(styles, layoutMode);
      if (spacing === null) {
        spacing = measuredSpacing(children, layoutMode);
      }
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
    var pseudoOrderedChildren = orderPseudoChildrenForFlow(children, autoLayout && autoLayout.layoutMode || "HORIZONTAL");
    if (autoLayout && autoLayout.applied && autoLayout.reversedChildren) {
      return pseudoOrderedChildren.slice().reverse();
    }
    if (!autoLayout || !autoLayout.applied) {
      return stackOrderedChildren(pseudoOrderedChildren);
    }
    return pseudoOrderedChildren;
  }

  function orderPseudoChildrenForFlow(children, layoutMode) {
    var hasPseudo = children.some(function (child) {
      return isBeforePseudoModel(child) || isAfterPseudoModel(child);
    });
    if (!hasPseudo) {
      return children;
    }
    var sorted = function (items) {
      return items.slice().sort(function (a, b) {
        return layoutMode === "HORIZONTAL"
          ? a.absoluteRect.x - b.absoluteRect.x
          : a.absoluteRect.y - b.absoluteRect.y;
      });
    };
    var beforeChildren = sorted(children.filter(isBeforePseudoModel));
    var afterChildren = sorted(children.filter(isAfterPseudoModel));
    var flowChildren = children.filter(function (child) {
      return !isBeforePseudoModel(child) && !isAfterPseudoModel(child);
    });
    return beforeChildren.concat(flowChildren).concat(afterChildren);
  }

  function stackOrderedChildren(children) {
    var hasExplicitZIndex = children.some(function (child) {
      return siblingStackOrderZIndex(child) !== null;
    });
    if (!hasExplicitZIndex) {
      return children;
    }
    return children.map(function (child, index) {
      var zIndex = siblingStackOrderZIndex(child);
      return {
        child: child,
        index: index,
        zIndex: zIndex === null ? 0 : zIndex
      };
    }).sort(function (a, b) {
      return a.zIndex - b.zIndex || a.index - b.index;
    }).map(function (item) {
      return item.child;
    });
  }

  function reparentAbsoluteOverlaysIntoStackingHosts(children) {
    var next;
    var sourceIndex;
    var overlay;
    var overlayIndex;
    var hostIndex;
    var host;
    var graftedOverlay;
    if (children.length < 2) {
      return children;
    }

    next = children.slice();
    for (sourceIndex = 0; sourceIndex < children.length; sourceIndex += 1) {
      overlay = children[sourceIndex];
      if (!isAbsoluteOverlayCandidate(overlay)) {
        continue;
      }

      overlayIndex = next.indexOf(overlay);
      if (overlayIndex < 0) {
        continue;
      }

      hostIndex = -1;
      for (var index = 0; index < next.length; index += 1) {
        if (next[index] !== overlay && canHostAbsoluteOverlay(next[index], overlay)) {
          hostIndex = index;
          break;
        }
      }
      if (hostIndex < 0) {
        continue;
      }

      host = next[hostIndex];
      graftedOverlay = {};
      Object.keys(overlay).forEach(function (key) {
        graftedOverlay[key] = overlay[key];
      });
      graftedOverlay.rect = relativeModelRect(overlay.absoluteRect, host.absoluteRect);
      graftedOverlay.layoutPositioning = "ABSOLUTE";

      next[hostIndex] = copyModelWithChildren(host, [graftedOverlay].concat(host.children || []));
      next.splice(overlayIndex, 1);
    }

    return next;
  }

  function copyModelWithChildren(model, children) {
    var copy = {};
    Object.keys(model).forEach(function (key) {
      copy[key] = model[key];
    });
    copy.children = children;
    return copy;
  }

  function isAbsoluteOverlayCandidate(model) {
    return normalizeCssKeyword(model.styles && model.styles.position) === "absolute" &&
      hasUsableBounds(model.absoluteRect);
  }

  function canHostAbsoluteOverlay(host, overlay) {
    var hostZIndex;
    var overlayZIndex;
    if (host.type !== "FRAME" || !host.autoLayout || !host.autoLayout.applied || !hasModelVisualStyle(host.style)) {
      return false;
    }
    if (!rectContains(host.absoluteRect, overlay.absoluteRect, 1)) {
      return false;
    }
    hostZIndex = stackOrderZIndex(host);
    overlayZIndex = stackOrderZIndex(overlay);
    if (overlayZIndex === null) {
      overlayZIndex = 0;
    }
    return hostZIndex !== null && hostZIndex > overlayZIndex;
  }

  function rectContains(outer, inner, tolerance) {
    var safeTolerance = tolerance || 0;
    return inner.x >= outer.x - safeTolerance &&
      inner.y >= outer.y - safeTolerance &&
      inner.x + inner.width <= outer.x + outer.width + safeTolerance &&
      inner.y + inner.height <= outer.y + outer.height + safeTolerance;
  }

  function stackOrderZIndex(model) {
    var ownZIndex = numericZIndex(model.styles && model.styles.zIndex);
    var descendantZIndex = null;
    var index;
    var childZIndex;
    if (ownZIndex !== null) {
      return ownZIndex;
    }
    for (index = 0; index < (model.children || []).length; index += 1) {
      childZIndex = stackOrderZIndex(model.children[index]);
      if (childZIndex !== null) {
        descendantZIndex = descendantZIndex === null
          ? childZIndex
          : Math.max(descendantZIndex, childZIndex);
      }
    }
    return descendantZIndex;
  }

  function siblingStackOrderZIndex(model) {
    var ownZIndex = numericZIndex(model.styles && model.styles.zIndex);
    if (ownZIndex !== null) {
      return ownZIndex;
    }
    if (!isNonVisualOverlayWrapper(model)) {
      return null;
    }
    return positionedOverlayDescendantZIndex(model);
  }

  function numericZIndex(value) {
    var normalized = String(value == null ? "" : value).replace(/^\s+|\s+$/g, "");
    if (!/^-?\d+$/.test(normalized)) {
      return null;
    }
    return Number(normalized);
  }

  function isNonVisualOverlayWrapper(model) {
    var position;
    var isStaticLike;
    var collapsed;
    var children;
    var index;
    var childPosition;
    if (model.type !== "FRAME" || hasModelVisualStyle(model.style)) {
      return false;
    }
    position = normalizeCssKeyword(model.styles && model.styles.position);
    isStaticLike = !position || position === "static" || position === "relative";
    if (!isStaticLike) {
      return false;
    }
    collapsed = model.rect.width <= 1 ||
      model.rect.height <= 1 ||
      model.absoluteRect.width <= 1 ||
      model.absoluteRect.height <= 1;
    if (collapsed) {
      return true;
    }
    children = model.children || [];
    if (children.length === 0) {
      return false;
    }
    for (index = 0; index < children.length; index += 1) {
      childPosition = normalizeCssKeyword(children[index].styles && children[index].styles.position);
      if (
        childPosition !== "fixed" &&
        childPosition !== "absolute" &&
        !isNonVisualOverlayWrapper(children[index])
      ) {
        return false;
      }
    }
    return true;
  }

  function positionedOverlayDescendantZIndex(model) {
    var result = null;
    var index;
    var child;
    var position;
    var childZIndex;
    var descendantZIndex;
    function include(value) {
      if (value !== null) {
        result = result === null ? value : Math.max(result, value);
      }
    }
    for (index = 0; index < (model.children || []).length; index += 1) {
      child = model.children[index];
      position = normalizeCssKeyword(child.styles && child.styles.position);
      childZIndex = (position === "fixed" || position === "absolute")
        ? numericZIndex(child.styles && child.styles.zIndex)
        : null;
      descendantZIndex = positionedOverlayDescendantZIndex(child);
      include(childZIndex);
      include(descendantZIndex);
    }
    return result;
  }

  function isReverseFlexDirection(value) {
    var normalized = normalizeCssKeyword(value);
    return normalized === "row-reverse" || normalized === "column-reverse";
  }

  function hasAbsolutePositionedChild(children) {
    return children.some(function (child) {
      return normalizeCssKeyword(child.styles && child.styles.position) === "absolute";
    });
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

    lineHeight = numberFromCss(styles.lineHeight) || numberFromCss(styles.fontSize) * 1.2;
    if (lineHeight > 0 && rect.height > lineHeight * 1.75) {
      if (shouldPreserveTallSingleLineHug(node, rect, styles)) {
        return "WIDTH_AND_HEIGHT";
      }
      return "HEIGHT";
    }

    return "WIDTH_AND_HEIGHT";
  }

  function inferPaddedBackingTextAutoResize(node, rect) {
    var styles;
    var lineHeight;

    if (String(node.textContent || "").indexOf("\n") >= 0) {
      return "HEIGHT";
    }

    styles = node.styles || {};
    if (isClippedSingleLineText(node, rect, styles)) {
      return "TRUNCATE";
    }
    if (isOverflowClippedTextBox(node, rect, styles)) {
      return "TRUNCATE";
    }

    lineHeight = numberFromCss(styles.lineHeight) || numberFromCss(styles.fontSize) * 1.2;
    if (lineHeight > 0 && rect.height > lineHeight * 1.75) {
      return "HEIGHT";
    }

    return "WIDTH_AND_HEIGHT";
  }

  function shouldPreserveTallSingleLineHug(node, rect, styles) {
    return (isSyntheticDirectTextNode(node) || isInteractiveSingleLineTextElement(node)) &&
      fitsEstimatedSingleLineText(node, rect, styles);
  }

  function shouldPreserveTransparentPaddedInteractiveTextFrame(node, rect) {
    var styles;
    var padding;
    var explicitWidth;
    var explicitHeight;
    var contentRect;
    if (
      hasVisualBoxStyle(node.styles) ||
      !isInteractiveSingleLineTextElement(node) ||
      String(node.textContent || "").indexOf("\n") >= 0 ||
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return false;
    }

    styles = node.styles || {};
    padding = explicitCssPadding(styles);
    if (!hasPositivePadding(padding)) {
      return false;
    }

    explicitWidth = numberFromCss(styles.width);
    explicitHeight = numberFromCss(styles.height);
    if (
      (!(explicitWidth > 0) || Math.abs(explicitWidth - rect.width) > 1.5) &&
      (!(explicitHeight > 0) || Math.abs(explicitHeight - rect.height) > 1.5)
    ) {
      return false;
    }

    contentRect = contentRectFromPadding(rect, padding);
    return fitsEstimatedSingleLineText(node, contentRect, styles);
  }

  function shouldPreserveExplicitTextBoxWidth(node, rect, styles) {
    var explicitWidth;
    var fontSize;
    var padding;
    var estimatedTextBoxWidth;
    var tolerance;
    if (
      isSyntheticDirectTextNode(node) ||
      isInteractiveSingleLineTextElement(node) ||
      rect.width <= 0 ||
      !String(node.textContent || "").replace(/^\s+|\s+$/g, "")
    ) {
      return false;
    }

    explicitWidth = numberFromCss(styles.width);
    if (!(explicitWidth > 0) || Math.abs(explicitWidth - rect.width) > 1.5) {
      return false;
    }

    fontSize = numberFromCss(styles.fontSize) || 14;
    padding = numberFromCss(styles.paddingLeft) + numberFromCss(styles.paddingRight);
    estimatedTextBoxWidth = estimateTextPrimarySize(node.textContent, styles) + Math.max(0, padding);
    tolerance = Math.max(6, fontSize * 0.5);
    return rect.width > estimatedTextBoxWidth + tolerance;
  }

  function isCapturedRectClippedExplicitTextBox(node, rect, styles) {
    var explicitWidth;
    var fontSize;
    var estimatedTextWidth;
    var tolerance;
    if (
      isSyntheticDirectTextNode(node) ||
      rect.width <= 0 ||
      !String(node.textContent || "").replace(/^\s+|\s+$/g, "")
    ) {
      return false;
    }

    explicitWidth = numberFromCss(styles.width);
    if (!(explicitWidth > rect.width + 1.5)) {
      return false;
    }

    fontSize = numberFromCss(styles.fontSize) || 14;
    estimatedTextWidth = estimateTextPrimarySize(node.textContent, styles);
    tolerance = Math.max(2, fontSize * 0.25);
    return estimatedTextWidth > rect.width + tolerance;
  }

  function shouldSuppressTinyClippedText(node, rect) {
    var styles = node.styles || {};
    var explicitWidth;
    var fontSize;
    var tinyWidth;
    if (
      isSyntheticDirectTextNode(node) ||
      rect.width <= 0 ||
      !String(node.textContent || "").replace(/^\s+|\s+$/g, "")
    ) {
      return false;
    }

    explicitWidth = numberFromCss(styles.width);
    fontSize = numberFromCss(styles.fontSize) || 14;
    tinyWidth = Math.max(4, fontSize * 0.3);
    return explicitWidth > rect.width + 1.5 &&
      rect.width <= tinyWidth &&
      estimateTextPrimarySize(node.textContent, styles) > rect.width + Math.max(2, fontSize * 0.25);
  }

  function isOverflowClippedTextBox(node, rect, styles) {
    var explicitHeight;
    var lineHeight;
    var estimatedLines;
    var visibleLines;
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      !String(node.textContent || "").replace(/^\s+|\s+$/g, "") ||
      !clipsTextOverflow(styles)
    ) {
      return false;
    }

    explicitHeight = numberFromCss(styles.height);
    if (!(explicitHeight > 0) || Math.abs(explicitHeight - rect.height) > 1.5) {
      return false;
    }

    lineHeight = numberFromCss(styles.lineHeight) || numberFromCss(styles.fontSize) * 1.2;
    if (!(lineHeight > 0) || rect.height <= lineHeight + 1) {
      return false;
    }

    estimatedLines = Math.max(1, Math.ceil(estimateTextPrimarySize(node.textContent, styles) / Math.max(1, rect.width)));
    visibleLines = Math.max(1, Math.floor((rect.height + 0.5) / lineHeight));
    return estimatedLines >= visibleLines;
  }

  function clipsTextOverflow(styles) {
    return clipsOverflowKeyword(styles && styles.overflow) ||
      clipsOverflowKeyword(styles && styles.overflowX) ||
      clipsOverflowKeyword(styles && styles.overflowY) ||
      clipsOverflowShorthand(styles && styles.overflow, "x") ||
      clipsOverflowShorthand(styles && styles.overflow, "y");
  }

  function normalizeTallHugTextGeometry(node, rect, absoluteRect, textAutoResize) {
    var styles;
    var lineHeight;
    var height;
    var yOffset;
    if (textAutoResize !== "WIDTH_AND_HEIGHT") {
      return { rect: rect, absoluteRect: absoluteRect };
    }

    styles = node.styles || {};
    lineHeight = numberFromCss(styles.lineHeight) || numberFromCss(styles.fontSize) * 1.2;
    if (!(lineHeight > 0) || rect.height <= lineHeight + 1) {
      return { rect: rect, absoluteRect: absoluteRect };
    }

    if (!shouldNormalizeTallSingleLineHugGeometry(node, rect, styles)) {
      return { rect: rect, absoluteRect: absoluteRect };
    }

    height = round(Math.min(rect.height, lineHeight));
    yOffset = round((rect.height - height) / 2);
    return {
      rect: {
        x: rect.x,
        y: round(rect.y + yOffset),
        width: rect.width,
        height: height
      },
      absoluteRect: {
        x: absoluteRect.x,
        y: round(absoluteRect.y + yOffset),
        width: absoluteRect.width,
        height: height
      }
    };
  }

  function shouldNormalizeTallSingleLineHugGeometry(node, rect, styles) {
    return (
      isSynthesizedDirectTextNode(node) ||
      isInteractiveSingleLineTextElement(node) ||
      isCenteredSingleLineTextBox(node, styles)
    ) &&
      fitsEstimatedSingleLineText(node, rect, styles);
  }

  function isSynthesizedDirectTextNode(node) {
    return String(node.sourceNodeId || "").slice(-6) === "::text";
  }

  function isSyntheticDirectTextNode(node) {
    return node.tagName === "#text" || String(node.sourceNodeId || "").slice(-6) === "::text";
  }

  function isInteractiveSingleLineTextElement(node) {
    var tagName = String(node.tagName || "").toLowerCase();
    var role = String(node.attributes && node.attributes.role || "").toLowerCase();
    return tagName === "a" ||
      tagName === "button" ||
      role === "tab" ||
      role === "button" ||
      role === "link" ||
      role === "menuitem";
  }

  function isCenteredSingleLineTextBox(node, styles) {
    var display = normalizeCssKeyword(styles.display);
    var textAlign = normalizeCssKeyword(styles.textAlign);
    var whiteSpace = normalizeCssKeyword(styles.whiteSpace);
    return textAlign === "center" &&
      (display === "inline-block" || display === "block" || display === "inline-flex") &&
      numberFromCss(styles.height) > 0 &&
      whiteSpace !== "normal";
  }

  function fitsEstimatedSingleLineText(node, rect, styles) {
    var fontSize;
    var tolerance;
    if (rect.width <= 0) {
      return false;
    }
    fontSize = numberFromCss(styles.fontSize) || 14;
    tolerance = Math.max(2, fontSize * 0.25);
    return estimateTextPrimarySize(node.textContent, styles) <= rect.width + tolerance;
  }

  function isClippedSingleLineText(node, rect, styles) {
    var overflow = normalizeCssKeyword(styles.overflow);
    var overflowX = normalizeCssKeyword(styles.overflowX);
    var textOverflow = normalizeCssKeyword(styles.textOverflow);
    var whiteSpace = normalizeCssKeyword(styles.whiteSpace);
    var clipsInline = textOverflow === "ellipsis" ||
      clipsOverflowKeyword(overflowX) ||
      clipsOverflowShorthand(overflow, "x");
    var preventsWrapping = whiteSpace === "nowrap" ||
      whiteSpace === "pre" ||
      whiteSpace === "pre-wrap";
    if (!clipsInline || !preventsWrapping || rect.width <= 0) {
      return false;
    }

    return estimateTextPrimarySize(node.textContent, styles) > rect.width + 1;
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

  function paddedTransparentTextGeometry(node, rect, absoluteRect) {
    var padding = explicitCssPadding(node.styles);
    var styles;
    var contentRect;
    if (!hasPositivePadding(padding)) {
      return { rect: rect, absoluteRect: absoluteRect };
    }
    styles = node.styles || {};
    if (shouldPreserveExplicitTextBoxWidth(node, rect, styles)) {
      return { rect: rect, absoluteRect: absoluteRect };
    }
    contentRect = contentRectFromPadding(rect, padding);
    return {
      rect: {
        x: round(rect.x + contentRect.x),
        y: round(rect.y + contentRect.y),
        width: contentRect.width,
        height: contentRect.height
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

  function inferPrimaryAxisAlignment(styles, children, layoutMode, parentRect) {
    var cssAlignment = primaryAxisAlignmentFromCss(styles.justifyContent);
    if (cssAlignment) {
      return cssAlignment;
    }
    if (shouldInferSpaceBetweenFromGeometry(styles, children, layoutMode, parentRect)) {
      return "SPACE_BETWEEN";
    }
    return undefined;
  }

  function shouldInferSpaceBetweenFromGeometry(styles, children, layoutMode, parentRect) {
    var sorted;
    var explicitGap;
    var marginGap;
    var measuredGap;
    var expectedGap;
    var minimumDelta = 32;
    var leadingInset;
    var trailingInset;
    if (children.length !== 2) {
      return false;
    }

    sorted = sortedByPrimaryAxis(children, layoutMode);
    explicitGap = explicitSpacing(styles, layoutMode);
    marginGap = trailingAxisMargin(sorted[0], layoutMode) + leadingAxisMargin(sorted[1], layoutMode);
    if (explicitGap === null && marginGap <= 0) {
      return false;
    }

    measuredGap = primaryAxisGap(sorted[0], sorted[1], layoutMode);
    expectedGap = explicitGap === null ? 0 : explicitGap;
    if (
      measuredGap - expectedGap <= minimumDelta ||
      measuredGap <= Math.max(expectedGap * 3, expectedGap + minimumDelta)
    ) {
      return false;
    }

    leadingInset = primaryAxisStart(sorted[0].absoluteRect, layoutMode) - primaryAxisStart(parentRect, layoutMode);
    trailingInset = primaryAxisEnd(parentRect, layoutMode) - primaryAxisEnd(sorted[1].absoluteRect, layoutMode);
    return approximatelyEqualInset(leadingInset, leadingAxisPadding(styles, layoutMode), 2) &&
      approximatelyEqualInset(trailingInset, trailingAxisPadding(styles, layoutMode), 2);
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
    var sorted = sortedByPrimaryAxis(children, layoutMode);
    var gaps = [];
    var index;
    var gap;

    for (index = 1; index < sorted.length; index += 1) {
      gap = primaryAxisGap(sorted[index - 1], sorted[index], layoutMode);
      if (gap >= 0) {
        gaps.push(gap);
      }
    }

    return gaps;
  }

  function sortedByPrimaryAxis(children, layoutMode) {
    return children.slice().sort(function (a, b) {
      return primaryAxisStart(a.absoluteRect, layoutMode) - primaryAxisStart(b.absoluteRect, layoutMode);
    });
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

  function leadingAxisPadding(styles, layoutMode) {
    return numberFromCss(layoutMode === "HORIZONTAL" ? styles.paddingLeft : styles.paddingTop);
  }

  function trailingAxisPadding(styles, layoutMode) {
    return numberFromCss(layoutMode === "HORIZONTAL" ? styles.paddingRight : styles.paddingBottom);
  }

  function leadingAxisMargin(model, layoutMode) {
    return numberFromCss(layoutMode === "HORIZONTAL" ? model.styles && model.styles.marginLeft : model.styles && model.styles.marginTop);
  }

  function trailingAxisMargin(model, layoutMode) {
    return numberFromCss(layoutMode === "HORIZONTAL" ? model.styles && model.styles.marginRight : model.styles && model.styles.marginBottom);
  }

  function approximatelyEqualInset(value, expected, tolerance) {
    return Math.abs(value - expected) <= tolerance;
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
    var borderSides = nativeBorderStrokeSidesFromStyles(styles);
    var stroke = borderSides.length > 0 ? strokeFromBorderSides(borderSides) : cssStrokeFromStyles(styles);
    return {
      fills: cssFillsFromStyles(styles),
      strokes: stroke ? [stroke] : [],
      borderSides: borderSides,
      cornerRadius: cornerRadiusFromStyles(styles),
      effects: visibleShadow(styles.boxShadow) ? [{ type: "shadow", value: styles.boxShadow }] : [],
      objectFit: styles.objectFit || "",
      transform: styles.transform || "",
      transformOrigin: styles.transformOrigin || "",
      text: node.textContent ? {
        fontFamily: styles.fontFamily || "",
        fontSize: numberFromCss(styles.fontSize),
        fontStyle: styles.fontStyle || "",
        fontWeight: styles.fontWeight || "",
        lineHeight: styles.lineHeight || "",
        color: textColorFromStyles(styles),
        textAlign: styles.textAlign || "",
        fills: cssTextFillsFromStyles(styles)
      } : null
    };
  }

  function applyTextOverlayBackdrop(model, node, context) {
    if (!shouldApplyTextOverlayBackdrop(model, node, context)) {
      return;
    }
    model.style = Object.assign({}, model.style, {
      fills: [context.backdropColor]
    });
  }

  function shouldApplyTextOverlayBackdrop(model, node, context) {
    return Boolean(
      context.clippedAncestor &&
      visibleColor(context.backdropColor) &&
      model.style &&
      model.style.fills &&
      model.style.fills.length === 0 &&
      node.textContent &&
      normalizeCssKeyword(node.styles && node.styles.position) === "absolute" &&
      hasEllipsisPseudoChild(node)
    );
  }

  function hasEllipsisPseudoChild(node) {
    return (node.children || []).some(function (child) {
      return child.nodeType === "pseudo" &&
        String(child.textContent || "").replace(/^\s+|\s+$/g, "") === "." + "." + ".";
    });
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
      cssFillsFromStyles(safeStyles).length > 0 ||
      Boolean(cssStrokeFromStyles(safeStyles)) ||
      nativeBorderStrokeSidesFromStyles(safeStyles).length > 0 ||
      borderDecorationSides(safeStyles).length > 0 ||
      visibleShadow(safeStyles.boxShadow)
    );
  }

  function shouldClipContent(node) {
    var styles = node.styles || {};
    return clipsOverflowShorthand(styles.overflow, "x") ||
      clipsOverflowShorthand(styles.overflow, "y") ||
      clipsOverflowKeyword(styles.overflowX) ||
      clipsOverflowKeyword(styles.overflowY);
  }

  function clipsOverflowShorthand(value, axis) {
    var parts;
    var axisValue;
    if (typeof value !== "string") {
      return false;
    }
    parts = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return false;
    }
    if (parts.length === 1) {
      return clipsOverflowKeyword(parts[0]);
    }
    axisValue = axis === "y" ? parts[1] : parts[0];
    return clipsOverflowKeyword(axisValue);
  }

  function clipsOverflowKeyword(value) {
    var keyword = normalizeCssKeyword(value);
    return keyword === "hidden" ||
      keyword === "clip" ||
      keyword === "scroll" ||
      keyword === "auto" ||
      keyword === "overlay";
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

  function cssFillsFromStyles(styles) {
    var safeStyles = styles || {};
    var fills = [];
    if (isBackgroundClippedToText(safeStyles)) {
      return fills;
    }
    if (visibleColor(safeStyles.backgroundColor)) {
      fills.push(safeStyles.backgroundColor);
    }
    if (visibleCssLinearGradient(safeStyles.backgroundImage)) {
      fills.push(safeStyles.backgroundImage);
    }
    return fills;
  }

  function cssTextFillsFromStyles(styles) {
    var safeStyles = styles || {};
    return isBackgroundClippedToText(safeStyles) && visibleCssLinearGradient(safeStyles.backgroundImage)
      ? [safeStyles.backgroundImage]
      : [];
  }

  function isBackgroundClippedToText(styles) {
    var safeStyles = styles || {};
    return cssClipIncludesText(safeStyles.backgroundClip) ||
      cssClipIncludesText(safeStyles.webkitBackgroundClip);
  }

  function cssClipIncludesText(value) {
    return String(value || "")
      .toLowerCase()
      .split(",")
      .map(function (item) {
        return item.replace(/^\s+|\s+$/g, "");
      })
      .indexOf("text") >= 0;
  }

  function textColorFromStyles(styles) {
    var safeStyles = styles || {};
    if (visibleColor(safeStyles.webkitTextFillColor)) {
      return safeStyles.webkitTextFillColor;
    }
    return safeStyles.color || "";
  }

  function visibleCssLinearGradient(value) {
    return typeof value === "string" &&
      /(?:^|,)\s*(?:repeating-)?linear-gradient\(/i.test(value);
  }

  function cssStrokeFromStyles(styles) {
    var safeStyles = styles || {};
    var sides = visibleBorderSides(safeStyles);
    var borderStroke = uniformBorderStrokeFromSides(sides) || legacyTopBorderStroke(safeStyles, sides);
    var outlineStroke;
    if (borderStroke) {
      return borderStroke;
    }
    outlineStroke = cssStrokeSide(safeStyles.outlineWidth, safeStyles.outlineColor, safeStyles.outlineStyle);
    return outlineStroke;
  }

  function borderDecorationSides(styles) {
    var sides = visibleBorderSides(styles || {});
    return uniformBorderStrokeFromSides(sides) ||
      legacyTopBorderStroke(styles || {}, sides) ||
      nativeBorderStrokeSidesFromStyles(styles || {}, sides).length > 0
      ? []
      : sides;
  }

  function uniformBorderStroke(styles) {
    return uniformBorderStrokeFromSides(visibleBorderSides(styles || {}));
  }

  function uniformBorderStrokeFromSides(sides) {
    var first;
    var index;
    if (sides.length !== 4) {
      return null;
    }
    first = sides[0];
    for (index = 1; index < sides.length; index += 1) {
      if (sides[index].width !== first.width || sides[index].color !== first.color) {
        return null;
      }
    }
    return {
      color: first.color,
      width: first.width
    };
  }

  function visibleBorderSides(styles) {
    var sides = [];
    addVisibleBorderSide(sides, "top", styles.borderTopWidth, styles.borderTopColor, styles.borderTopStyle);
    addVisibleBorderSide(sides, "right", styles.borderRightWidth, styles.borderRightColor, styles.borderRightStyle);
    addVisibleBorderSide(sides, "bottom", styles.borderBottomWidth, styles.borderBottomColor, styles.borderBottomStyle);
    addVisibleBorderSide(sides, "left", styles.borderLeftWidth, styles.borderLeftColor, styles.borderLeftStyle);
    return sides;
  }

  function nativeBorderStrokeSidesFromStyles(styles, sides) {
    var safeStyles = styles || {};
    var safeSides = sides || visibleBorderSides(safeStyles);
    if (
      safeSides.length === 0 ||
      uniformBorderStrokeFromSides(safeSides) ||
      legacyTopBorderStroke(safeStyles, safeSides) ||
      cornerRadiusFromStyles(safeStyles) <= 0 ||
      !sameBorderSidePaint(safeSides)
    ) {
      return [];
    }
    return safeSides;
  }

  function sameBorderSidePaint(sides) {
    var first = sides[0];
    var index;
    if (!first) {
      return false;
    }
    for (index = 1; index < sides.length; index += 1) {
      if (sides[index].color !== first.color) {
        return false;
      }
    }
    return true;
  }

  function strokeFromBorderSides(sides) {
    var first = sides[0];
    var width = 0;
    var index;
    for (index = 0; index < sides.length; index += 1) {
      width = Math.max(width, sides[index].width);
    }
    return {
      color: first.color,
      width: width
    };
  }

  function cornerRadiusFromStyles(styles) {
    var safeStyles = styles || {};
    return Math.max(
      numberFromCss(safeStyles.borderTopLeftRadius),
      numberFromCss(safeStyles.borderTopRightRadius),
      numberFromCss(safeStyles.borderBottomRightRadius),
      numberFromCss(safeStyles.borderBottomLeftRadius)
    );
  }

  function addVisibleBorderSide(sides, side, width, color, style) {
    var stroke = cssStrokeSide(width, color, style);
    if (stroke) {
      sides.push({
        side: side,
        color: stroke.color,
        width: stroke.width
      });
    }
  }

  function legacyTopBorderStroke(styles, sides) {
    var properties = [
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "borderRightStyle",
      "borderBottomStyle",
      "borderLeftStyle",
      "borderRightColor",
      "borderBottomColor",
      "borderLeftColor"
    ];
    var index;
    if (sides.length !== 1 || sides[0].side !== "top") {
      return null;
    }
    for (index = 0; index < properties.length; index += 1) {
      if (styles[properties[index]] !== undefined && styles[properties[index]] !== "") {
        return null;
      }
    }
    return {
      color: sides[0].color,
      width: sides[0].width
    };
  }

  function cssStrokeSide(width, color, style) {
    var normalizedStyle = typeof style === "string" ? style.replace(/^\s+|\s+$/g, "").toLowerCase() : "";
    var parsedWidth = numberFromCss(width);
    if (parsedWidth <= 0 || !visibleColor(color) || normalizedStyle === "none" || normalizedStyle === "hidden") {
      return null;
    }
    return {
      color: color,
      width: parsedWidth
    };
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
    var semanticNamingSummary = renderResult.semanticNamingSummary || {};
    return {
      createdFrameCount: renderResult.frames.length,
      createdNodeCount: countNodes(renderResult.frames),
      fallbackCount: counts.fallbacks || 0,
      missingAssetCount: counts.missingAssets || 0,
      unsupportedStyleCount: counts.unsupportedStyles || 0,
      fontSubstitutions: renderResult.fontSubstitutions || [],
      autoLayoutConfidenceSummary: autoLayoutSummary,
      semanticNamingSummary: {
        semanticNames: semanticNamingSummary.semanticNames || 0,
        repeatedGroups: semanticNamingSummary.repeatedGroups || 0,
        collapsedWrappers: semanticNamingSummary.collapsedWrappers || 0
      }
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
      hasVisualBoxStyle(styles)
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

  function fillPaintArray(styles) {
    var fills = Array.isArray(styles && styles.fills)
      ? styles.fills
      : cssFillsFromStyles(styles || {});
    return fills.map(function (fill) {
      return cssFillToPaint(fill);
    }).filter(Boolean);
  }

  function textFillPaintArray(styles) {
    var fills = cssTextFillsFromStyles(styles || {});
    return fills.map(function (fill) {
      return cssFillToPaint(fill);
    }).filter(Boolean);
  }

  function cssFillToPaint(value) {
    return cssLinearGradientToPaint(value) || paintArray(value)[0] || null;
  }

  function cssLinearGradientToPaint(value) {
    var args = extractCssFunctionArgs(value, ["linear-gradient", "repeating-linear-gradient"]);
    var parts;
    var first;
    var stops;
    var reverseStops = false;
    var parsedStops;
    var gradientStops;
    if (!args) {
      return null;
    }
    parts = splitCssArguments(args);
    if (parts.length < 2) {
      return null;
    }
    stops = parts;
    first = parts[0].replace(/^\s+|\s+$/g, "").toLowerCase();
    if (isCssGradientDirection(first)) {
      stops = parts.slice(1);
      reverseStops = first === "to left" || first === "270deg" || first === "-90deg";
    }
    if (stops.length < 2) {
      return null;
    }
    parsedStops = stops.map(function (stop, index) {
      return cssGradientStop(stop, index, stops.length);
    }).filter(Boolean);
    if (parsedStops.length < 2) {
      return null;
    }
    gradientStops = reverseStops
      ? parsedStops.map(function (stop) {
        return {
          position: round(1 - stop.position),
          color: stop.color
        };
      }).sort(function (a, b) { return a.position - b.position; })
      : parsedStops;
    return {
      type: "GRADIENT_LINEAR",
      gradientTransform: [
        [1, 0, 0],
        [0, 1, 0]
      ],
      gradientStops: gradientStops
    };
  }

  function extractCssFunctionArgs(value, names) {
    var source = String(value || "");
    var lower = source.toLowerCase();
    var nameIndex;
    var name;
    var start;
    var depth;
    var index;
    var char;
    for (nameIndex = 0; nameIndex < names.length; nameIndex += 1) {
      name = names[nameIndex];
      start = lower.indexOf(name + "(");
      if (start < 0) {
        continue;
      }
      depth = 0;
      for (index = start + name.length; index < source.length; index += 1) {
        char = source[index];
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
    var parts = [];
    var depth = 0;
    var start = 0;
    var source = String(value || "");
    var index;
    var char;
    for (index = 0; index < source.length; index += 1) {
      char = source[index];
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
      } else if (char === "," && depth === 0) {
        parts.push(source.slice(start, index).replace(/^\s+|\s+$/g, ""));
        start = index + 1;
      }
    }
    parts.push(source.slice(start).replace(/^\s+|\s+$/g, ""));
    return parts.filter(Boolean);
  }

  function isCssGradientDirection(value) {
    return /^to\s+(?:left|right|top|bottom)$/.test(value) ||
      /^-?\d+(?:\.\d+)?deg$/.test(value);
  }

  function cssGradientStop(value, index, total) {
    var source = String(value || "").replace(/^\s+|\s+$/g, "");
    var colorMatch = source.match(/^(transparent|rgba?\([^)]+\)|#[0-9a-f]{3,8})/i);
    var color;
    var remainder;
    var positionMatch;
    var fallbackPosition;
    var position;
    if (!colorMatch) {
      return null;
    }
    color = parseCssColor(colorMatch[1]);
    if (!color) {
      return null;
    }
    remainder = source.slice(colorMatch[0].length).replace(/^\s+|\s+$/g, "");
    positionMatch = remainder.match(/(-?[\d.]+)%/);
    fallbackPosition = total <= 1 ? 0 : index / (total - 1);
    position = positionMatch ? clamp(parseFloat(positionMatch[1]) / 100, 0, 1) : fallbackPosition;
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
    var expanded;
    if (typeof value !== "string" || value === "") {
      return null;
    }
    if (value === "transparent") {
      return {
        r: 0,
        g: 0,
        b: 0,
        a: 0
      };
    }
    match = value.match(/^rgba?\(([^)]+)\)$/i);
    if (match) {
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

    match = value.match(/^#([0-9a-f]{3,8})$/i);
    if (!match) {
      return null;
    }
    expanded = match[1].length === 3 || match[1].length === 4
      ? match[1].split("").map(function (char) { return char + char; }).join("")
      : match[1];
    return {
      r: parseInt(expanded.slice(0, 2), 16),
      g: parseInt(expanded.slice(2, 4), 16),
      b: parseInt(expanded.slice(4, 6), 16),
      a: expanded.length >= 8 ? clamp(parseInt(expanded.slice(6, 8), 16) / 255, 0, 1) : 1
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
    var centralSize;
    var centralOffset;
    var files = {};
    var index;

    if (eocdOffset < 0) {
      throw importError("invalid-package", "ZIP end of central directory not found");
    }

    entryCount = view.getUint16(eocdOffset + 10, true);
    centralSize = view.getUint32(eocdOffset + 12, true);
    centralOffset = view.getUint32(eocdOffset + 16, true);
    requireZipRange(centralOffset, centralSize, bytes.length, "ZIP central directory is out of bounds", "archive");

    for (index = 0; index < entryCount; index += 1) {
      var flags;
      var method;
      var expectedCrc;
      var compressedSize;
      var uncompressedSize;
      var nameLength;
      var extraLength;
      var commentLength;
      var localOffset;
      var nameStart;
      var name;
      var reason;
      var localFlags;
      var localMethod;
      var localNameLength;
      var localExtraLength;
      var dataStart;
      var fileBytes;

      requireZipRange(centralOffset, 46, bytes.length, "ZIP central directory entry is truncated", "archive");
      if (view.getUint32(centralOffset, true) !== 0x02014b50) {
        throw importError("invalid-package", "Invalid ZIP central directory header");
      }
      flags = view.getUint16(centralOffset + 8, true);
      method = view.getUint16(centralOffset + 10, true);
      if ((flags & ~SUPPORTED_ZIP_FLAGS) !== 0) {
        throw importError("invalid-package", "Unsupported ZIP entry flags");
      }
      if (method !== 0) {
        throw importError("invalid-package", "Only stored ZIP entries are supported");
      }

      expectedCrc = view.getUint32(centralOffset + 16, true);
      compressedSize = view.getUint32(centralOffset + 20, true);
      uncompressedSize = view.getUint32(centralOffset + 24, true);
      if (compressedSize !== uncompressedSize) {
        throw importError("invalid-package", "Stored ZIP entry size mismatch");
      }
      nameLength = view.getUint16(centralOffset + 28, true);
      extraLength = view.getUint16(centralOffset + 30, true);
      commentLength = view.getUint16(centralOffset + 32, true);
      localOffset = view.getUint32(centralOffset + 42, true);
      nameStart = centralOffset + 46;
      requireZipRange(nameStart, nameLength + extraLength + commentLength, bytes.length, "ZIP central directory entry is truncated", "archive");
      name = decodeUtf8(copyBytes(bytes, nameStart, nameStart + nameLength));
      reason = archiveFileNameError(name);
      if (reason) {
        throw importError("invalid-package", reason);
      }
      if (Object.prototype.hasOwnProperty.call(files, name)) {
        throw importError("invalid-package", "Duplicate ZIP entry " + name);
      }

      requireZipRange(localOffset, 30, bytes.length, "ZIP local file header is out of bounds", name);
      if (view.getUint32(localOffset, true) !== 0x04034b50) {
        throw importError("invalid-package", "Invalid ZIP local file header");
      }

      localFlags = view.getUint16(localOffset + 6, true);
      localMethod = view.getUint16(localOffset + 8, true);
      localNameLength = view.getUint16(localOffset + 26, true);
      localExtraLength = view.getUint16(localOffset + 28, true);
      if ((localFlags & ~SUPPORTED_ZIP_FLAGS) !== 0 || localMethod !== method) {
        throw importError("invalid-package", "ZIP local file header does not match central directory");
      }
      requireZipRange(localOffset + 30, localNameLength + localExtraLength, bytes.length, "ZIP local file header is truncated", name);
      dataStart = localOffset + 30 + localNameLength + localExtraLength;
      requireZipRange(dataStart, compressedSize, bytes.length, "ZIP entry data is out of bounds", name);
      fileBytes = copyBytes(bytes, dataStart, dataStart + compressedSize);
      if (crc32(fileBytes) !== expectedCrc) {
        throw importError("invalid-package", "ZIP entry checksum mismatch");
      }
      files[name] = fileBytes;
      centralOffset = nameStart + nameLength + extraLength + commentLength;
    }
    return files;
  }

  function archiveFileNameError(name) {
    var segments;
    var index;
    if (typeof name !== "string" || name.length === 0) {
      return "file name must be a non-empty string";
    }
    if (name.length > MAX_ARCHIVE_FILE_NAME_LENGTH) {
      return "file name is too long";
    }
    if (/[\u0000-\u001f\u007f]/.test(name)) {
      return "file name must not contain control characters";
    }
    if (name.indexOf("\\") >= 0 || name.indexOf(":") >= 0 || name.charAt(0) === "/" || /^[a-z]:\//i.test(name)) {
      return "file name must be a portable relative path";
    }
    if (name.charAt(name.length - 1) === "/") {
      return "file name must not be a directory";
    }
    segments = name.split("/");
    for (index = 0; index < segments.length; index += 1) {
      if (segments[index] === "" || segments[index] === "." || segments[index] === "..") {
        return "file name must not contain empty, current, or parent directory segments";
      }
    }
    return "";
  }

  function requireZipRange(start, length, total, message, path) {
    if (!isFinite(start) || !isFinite(length) || start < 0 || length < 0 || start > total || start + length > total) {
      throw importError("invalid-package", message || ("Invalid ZIP entry " + (path || "archive")));
    }
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

  var crcTable;

  function crc32(bytes) {
    var crc = 0xffffffff;
    var index;
    if (!crcTable) {
      crcTable = createCrcTable();
    }
    for (index = 0; index < bytes.length; index += 1) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[index]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function createCrcTable() {
    var table = new Uint32Array(256);
    var index;
    var bit;
    var value;
    for (index = 0; index < 256; index += 1) {
      value = index;
      for (bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[index] = value >>> 0;
    }
    return table;
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
        width: 380,
        height: 600
      });
    }
    figma.ui.onmessage = runImport;
  }
}());
