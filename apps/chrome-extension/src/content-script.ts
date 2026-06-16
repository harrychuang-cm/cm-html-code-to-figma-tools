(() => {
  const runtimeStateKey = "__figcaptureContentRuntimeState";
  const runtimeVersion = "2026-06-16-element-selection-v1";
  const runtimeState = globalThis[runtimeStateKey] ?? { registered: false, handler: null };
  runtimeState.version = runtimeVersion;
  globalThis[runtimeStateKey] = runtimeState;

  const CAPTURE_DOM_MESSAGE = "FIGCAPTURE_COLLECT_DOM";
  const DEFAULT_STYLE_PROPERTIES = [
    "display",
    "position",
    "boxSizing",
    "width",
    "height",
    "backgroundColor",
    "backgroundImage",
    "backgroundPosition",
    "backgroundRepeat",
    "backgroundSize",
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
    "maskComposite",
    "webkitMaskComposite",
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

  const PAGE_METRICS_MESSAGE = "FIGCAPTURE_PAGE_METRICS";
  const SCROLL_TO_MESSAGE = "FIGCAPTURE_SCROLL_TO";
  const SET_PINNED_HIDDEN_MESSAGE = "FIGCAPTURE_SET_PINNED_HIDDEN";
  const SELECT_ELEMENT_MESSAGE = "FIGCAPTURE_SELECT_ELEMENT";
  const CAPTURE_STATUS_MESSAGE = "FIGCAPTURE_CAPTURE_STATUS";
  const EXPORT_CONFIRMED_MESSAGE = "FIGCAPTURE_EXPORT_CONFIRMED";
  const ADD_ELEMENT_SELECTION_MESSAGE = "FIGCAPTURE_ADD_ELEMENT_SELECTION";
  const REMOVE_ELEMENT_SELECTION_MESSAGE = "FIGCAPTURE_REMOVE_ELEMENT_SELECTION";
  const CLEAR_ELEMENT_SELECTIONS_MESSAGE = "FIGCAPTURE_CLEAR_ELEMENT_SELECTIONS";
  const SELECTED_ELEMENT_ATTRIBUTE = "data-figcapture-selection-id";
  const OVERLAY_HOST_ATTRIBUTE = "data-figcapture-overlay-host";
  let pinnedHiddenRecords = [];
  let selectedElementRecord = null;
  let activeSelectionController = null;
  let captureStatusPanel = null;

  runtimeState.handler = (message, _sender, sendResponse) => {
    const handler = messageHandler(message?.type);
    if (!handler) {
      return false;
    }

    Promise.resolve()
      .then(() => handler(message))
      .then((payload) => sendResponse({ status: "success", ...payload }))
      .catch((error) => sendResponse({
        status: "error",
        error: {
          category: "capture-failed",
          message: error?.message ?? "DOM capture failed"
        }
      }));

    return true;
  };

  if (!runtimeState.registered) {
    chrome?.runtime?.onMessage?.addListener?.((message, sender, sendResponse) => {
      const activeState = globalThis[runtimeStateKey];
      if (typeof activeState?.handler !== "function") {
        return false;
      }
      return activeState.handler(message, sender, sendResponse);
    });
    runtimeState.registered = true;
  }

  function messageHandler(type) {
    if (type === CAPTURE_DOM_MESSAGE) {
      return collectDomMessage;
    }
    if (type === SELECT_ELEMENT_MESSAGE) {
      return selectElementMessage;
    }
    if (type === CAPTURE_STATUS_MESSAGE) {
      return captureStatusMessage;
    }
    if (type === PAGE_METRICS_MESSAGE) {
      return pageMetricsMessage;
    }
    if (type === SCROLL_TO_MESSAGE) {
      return scrollToMessage;
    }
    if (type === SET_PINNED_HIDDEN_MESSAGE) {
      return setPinnedHiddenMessage;
    }
    return null;
  }

  async function collectDomMessage(message) {
    if (message?.mode === "element") {
      await waitForRenderSettle();
      const selected = findSelectedElement(message?.selection);
      try {
        return { capture: captureElementFromDocument(selected.element, document, window) };
      } finally {
        cleanupSelectedElement(selected.selection?.id);
      }
    }
    if (message?.mode !== "full-page") {
      await waitForRenderSettle();
      return { capture: captureVisibleViewportFromDocument() };
    }
    await scrollToAndSettle(0);
    const metrics = pageMetrics();
    return {
      capture: captureVisibleViewportFromDocument(document, window, {
        captureMode: "full-page",
        captureBounds: {
          width: message?.documentWidth ?? metrics.documentWidth,
          height: message?.documentHeight ?? metrics.documentHeight
        }
      })
    };
  }

  function selectElementMessage() {
    return selectElementFromPage();
  }

  function captureStatusMessage(message) {
    return showCaptureStatusPanel(message);
  }

  function pageMetricsMessage() {
    return { metrics: pageMetrics() };
  }

  async function scrollToMessage(message) {
    return scrollToAndSettle(message?.scrollY);
  }

  async function scrollToAndSettle(scrollY, windowRef = window) {
    const targetY = Math.max(0, Number(scrollY ?? 0));
    scrollInstantly(windowRef, targetY);
    await waitForScrollPosition(targetY, windowRef);
    await waitForRenderSettle();
    return { scrollY: windowRef.scrollY || 0, scrollX: windowRef.scrollX || 0 };
  }

  function setPinnedHiddenMessage(message) {
    if (message?.hidden) {
      hidePinnedElements();
    } else {
      restorePinnedElements();
    }
    return { pinnedCount: pinnedHiddenRecords.length };
  }

  function selectElementFromPage(documentRef = document, windowRef = window, runtimeRef = chrome?.runtime) {
    activeSelectionController?.cancel?.();
    dismissCaptureStatusPanel();

    const overlay = createSelectionOverlay(documentRef);
    const state = {
      currentElement: null,
      selectedItems: [],
      capturing: false,
      closed: false
    };
    const cleanup = () => {
      documentRef.removeEventListener?.("pointermove", onPointerMove, true);
      documentRef.removeEventListener?.("click", onClick, true);
      documentRef.removeEventListener?.("keydown", onKeyDown, true);
      windowRef.removeEventListener?.("scroll", onScroll, true);
      overlay.highlight.remove?.();
      overlay.panel.remove?.();
      cleanupOverlayHost(documentRef);
      cleanupSelectedElement();
      if (activeSelectionController?.cancel === cancel) {
        activeSelectionController = null;
      }
    };
    async function cancel() {
      if (state.closed) {
        return;
      }
      state.closed = true;
      try {
        await runtimeRef?.sendMessage?.({ type: CLEAR_ELEMENT_SELECTIONS_MESSAGE });
      } catch {
        // The page overlay can still be dismissed if the background worker is gone.
      }
      cleanup();
    }
    async function addElement(element) {
      if (state.capturing || state.closed) {
        return;
      }
      const rect = normalizeRect(element.getBoundingClientRect());
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      state.capturing = true;
      setSelectionTrayBusy(overlay, true);
      cleanupSelectedElement();
      const selection = createElementSelection(element, rect, windowRef);
      element.setAttribute?.(SELECTED_ELEMENT_ATTRIBUTE, selection.id);
      selectedElementRecord = { id: selection.id, element };

      const previousVisibility = overlay.host.style.visibility;
      overlay.host.style.visibility = "hidden";
      try {
        const response = await runtimeRef?.sendMessage?.({
          type: ADD_ELEMENT_SELECTION_MESSAGE,
          selection
        });
        if (response?.status === "error") {
          markSelectionTrayError(overlay);
          return;
        }
        if (response?.item) {
          state.selectedItems.push(response.item);
          renderSelectionTray(overlay, state, runtimeRef);
        }
      } catch {
        markSelectionTrayError(overlay);
      } finally {
        overlay.host.style.visibility = previousVisibility;
        cleanupSelectedElement(selection.id);
        state.capturing = false;
        setSelectionTrayBusy(overlay, false);
        renderSelectionTray(overlay, state, runtimeRef);
      }
    }
    async function downloadSelected() {
      if (state.closed || state.capturing || state.selectedItems.length === 0) {
        return;
      }
      state.capturing = true;
      setSelectionTrayBusy(overlay, true);
      try {
        const response = await runtimeRef?.sendMessage?.({ type: EXPORT_CONFIRMED_MESSAGE });
        if (response?.status === "error") {
          markSelectionTrayError(overlay);
          return;
        }
        state.closed = true;
        cleanup();
      } catch {
        markSelectionTrayError(overlay);
      } finally {
        state.capturing = false;
        setSelectionTrayBusy(overlay, false);
        if (!state.closed) {
          renderSelectionTray(overlay, state, runtimeRef);
        }
      }
    }
    function onPointerMove(event) {
      const element = selectableEventElement(event, overlay, documentRef);
      if (!element) {
        return;
      }
      state.currentElement = element;
      updateSelectionOverlay(overlay.highlight, element, windowRef);
    }
    function onClick(event) {
      if (isOverlayEvent(event, documentRef)) {
        return;
      }
      const element = state.currentElement ?? selectableEventElement(event, overlay, documentRef);
      if (!element) {
        return;
      }
      event.preventDefault?.();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      addElement(element);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault?.();
        event.stopPropagation?.();
        cancel();
      }
    }
    function onScroll() {
      if (state.currentElement) {
        updateSelectionOverlay(overlay.highlight, state.currentElement, windowRef);
      }
    }

    activeSelectionController = { cancel };
    overlay.cancelButton?.addEventListener?.("click", (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      cancel();
    });
    overlay.downloadButton?.addEventListener?.("click", (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      downloadSelected();
    });
    overlay.panel?.addEventListener?.("click", (event) => {
      event.stopPropagation?.();
    });
    documentRef.addEventListener?.("pointermove", onPointerMove, true);
    documentRef.addEventListener?.("click", onClick, true);
    documentRef.addEventListener?.("keydown", onKeyDown, true);
    windowRef.addEventListener?.("scroll", onScroll, true);
    renderSelectionTray(overlay, state, runtimeRef);

    return { selecting: true };
  }

  function createSelectionOverlay(documentRef) {
    const host = ensureOverlayHost(documentRef);
    const highlight = documentRef.createElement("div");
    highlight.setAttribute?.("data-figcapture-selection-overlay", "highlight");
    Object.assign(highlight.style, {
      position: "fixed",
      zIndex: "2147483647",
      pointerEvents: "none",
      border: "2px solid #3b6cf6",
      background: "rgba(59, 108, 246, 0.14)",
      boxShadow: "0 0 0 99999px rgba(15, 23, 42, 0.22)",
      borderRadius: "4px",
      display: "none"
    });

    const panel = documentRef.createElement("div");
    panel.setAttribute?.("data-figcapture-selection-overlay", "panel");
    Object.assign(panel.style, {
      position: "fixed",
      left: "50%",
      top: "16px",
      transform: "translateX(-50%)",
      zIndex: "2147483647",
      pointerEvents: "auto",
      alignItems: "center",
      display: "flex",
      gap: "8px",
      maxWidth: "min(720px, calc(100vw - 32px))",
      minHeight: "64px",
      padding: "8px",
      border: "1px solid rgba(255, 255, 255, 0.14)",
      borderRadius: "10px",
      background: "rgba(17, 24, 39, 0.94)",
      color: "#fff",
      font: "12px/1.3 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      boxShadow: "0 10px 32px rgba(0, 0, 0, 0.30)",
      WebkitFontSmoothing: "antialiased",
      userSelect: "none"
    });
    const thumbnailList = documentRef.createElement("div");
    thumbnailList.setAttribute?.("data-figcapture-selection-overlay", "thumbnail-list");
    Object.assign(thumbnailList.style, {
      alignItems: "center",
      display: "flex",
      flex: "1",
      gap: "8px",
      minWidth: "52px",
      maxWidth: "min(480px, calc(100vw - 210px))",
      overflowX: "auto",
      pointerEvents: "auto",
      scrollbarWidth: "none"
    });
    const emptySlot = documentRef.createElement("div");
    emptySlot.setAttribute?.("aria-hidden", "true");
    Object.assign(emptySlot.style, {
      alignItems: "center",
      border: "1px dashed rgba(255,255,255,.26)",
      borderRadius: "6px",
      color: "rgba(255,255,255,.44)",
      display: "flex",
      flex: "0 0 52px",
      font: "600 18px/1 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      height: "52px",
      justifyContent: "center",
      width: "52px"
    });
    emptySlot.textContent = "+";
    thumbnailList.appendChild(emptySlot);

    const downloadButton = documentRef.createElement("button");
    downloadButton.type = "button";
    downloadButton.textContent = "Download";
    downloadButton.disabled = true;
    Object.assign(downloadButton.style, panelButtonStyle("primary"));
    const cancelButton = documentRef.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    Object.assign(cancelButton.style, panelButtonStyle("secondary"));
    panel.appendChild(thumbnailList);
    panel.appendChild(downloadButton);
    panel.appendChild(cancelButton);

    host.appendChild?.(highlight);
    host.appendChild?.(panel);
    return { host, highlight, panel, thumbnailList, emptySlot, downloadButton, cancelButton };
  }

  function renderSelectionTray(overlay, state, runtimeRef = chrome?.runtime) {
    if (!overlay?.thumbnailList) {
      return;
    }
    overlay.thumbnailList.replaceChildren?.();
    if (state.selectedItems.length === 0) {
      overlay.thumbnailList.appendChild?.(overlay.emptySlot);
    } else {
      for (const item of state.selectedItems) {
        overlay.thumbnailList.appendChild?.(createSelectionThumbnail(overlay.thumbnailList.ownerDocument, item, async () => {
          try {
            const response = await runtimeRef?.sendMessage?.({
              type: REMOVE_ELEMENT_SELECTION_MESSAGE,
              itemId: item.id
            });
            if (response?.status === "error") {
              markSelectionTrayError(overlay);
              return;
            }
            state.selectedItems = Array.isArray(response?.items)
              ? response.items
              : state.selectedItems.filter((entry) => entry.id !== item.id);
            renderSelectionTray(overlay, state, runtimeRef);
          } catch {
            markSelectionTrayError(overlay);
          }
        }));
      }
    }
    if (overlay.downloadButton) {
      overlay.downloadButton.disabled = state.selectedItems.length === 0 || state.capturing;
      overlay.downloadButton.style.opacity = overlay.downloadButton.disabled ? "0.45" : "1";
    }
  }

  function createSelectionThumbnail(documentRef, item, onRemove) {
    const tile = documentRef.createElement("div");
    tile.setAttribute?.("data-figcapture-selection-overlay", "thumbnail");
    Object.assign(tile.style, {
      border: "1px solid rgba(255,255,255,.24)",
      borderRadius: "6px",
      flex: "0 0 52px",
      height: "52px",
      overflow: "hidden",
      pointerEvents: "auto",
      position: "relative",
      width: "52px"
    });

    if (item?.screenshotDataUrl) {
      const image = documentRef.createElement("img");
      image.alt = item?.selector ?? "Selected element";
      image.src = item.screenshotDataUrl;
      Object.assign(image.style, {
        display: "block",
        height: "100%",
        objectFit: "cover",
        width: "100%"
      });
      tile.appendChild(image);
    } else {
      const placeholder = documentRef.createElement("div");
      placeholder.textContent = selectedElementNumberLabel(item?.label);
      Object.assign(placeholder.style, {
        alignItems: "center",
        background: "rgba(59,108,246,.18)",
        color: "rgba(255,255,255,.86)",
        display: "flex",
        font: "700 14px/1 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        height: "100%",
        justifyContent: "center",
        width: "100%"
      });
      tile.appendChild(placeholder);
    }

    const removeButton = documentRef.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "x";
    removeButton.setAttribute?.("aria-label", `Remove ${item?.label ?? "selected element"}`);
    Object.assign(removeButton.style, {
      alignItems: "center",
      appearance: "none",
      background: "rgba(15, 23, 42, 0.84)",
      border: "1px solid rgba(255,255,255,.30)",
      borderRadius: "999px",
      color: "#fff",
      cursor: "pointer",
      display: "flex",
      font: "700 10px/1 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      height: "18px",
      justifyContent: "center",
      padding: "0",
      pointerEvents: "auto",
      position: "absolute",
      right: "3px",
      top: "3px",
      width: "18px"
    });
    removeButton.addEventListener?.("click", (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      onRemove();
    });
    tile.appendChild(removeButton);
    return tile;
  }

  function selectedElementNumberLabel(label = "") {
    const match = String(label).match(/\d+$/);
    return match ? match[0] : "";
  }

  function setSelectionTrayBusy(overlay, busy) {
    if (overlay?.downloadButton) {
      overlay.downloadButton.disabled = busy || overlay.downloadButton.disabled;
      overlay.downloadButton.style.cursor = busy ? "wait" : "pointer";
    }
    if (overlay?.panel) {
      overlay.panel.style.opacity = busy ? "0.72" : "1";
    }
  }

  function markSelectionTrayError(overlay) {
    if (!overlay?.panel) {
      return;
    }
    overlay.panel.style.border = "1px solid rgba(239, 68, 68, 0.70)";
    const timer = window.setTimeout ?? setTimeout;
    timer(() => {
      if (overlay.panel?.style) {
        overlay.panel.style.border = "1px solid rgba(255, 255, 255, 0.14)";
      }
    }, 900);
  }

  function selectableEventElement(event, overlay, documentRef) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const target = path.find((item) => isElementNode(item)) ?? event.target;
    if (!isElementNode(target) || target === overlay.highlight || target === overlay.panel) {
      return null;
    }
    if (target === documentRef.documentElement || target === documentRef.body) {
      return target;
    }
    if (target.closest?.("[data-figcapture-selection-overlay]")) {
      return null;
    }
    return target;
  }

  function isOverlayEvent(event, documentRef) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const target = path.find((item) => isElementNode(item)) ?? event.target;
    return isElementNode(target) && Boolean(target.closest?.("[data-figcapture-selection-overlay]"));
  }

  function updateSelectionOverlay(highlight, element, windowRef) {
    const rect = normalizeRect(element.getBoundingClientRect());
    if (rect.width <= 0 || rect.height <= 0) {
      highlight.style.display = "none";
      return;
    }
    const visibleRect = clampRectToViewport(rect, {
      width: windowRef.innerWidth,
      height: windowRef.innerHeight
    });
    if (visibleRect.width <= 0 || visibleRect.height <= 0) {
      highlight.style.display = "none";
      return;
    }
    Object.assign(highlight.style, {
      display: "block",
      left: `${visibleRect.x}px`,
      top: `${visibleRect.y}px`,
      width: `${visibleRect.width}px`,
      height: `${visibleRect.height}px`
    });
  }

  function positionFloatingPanel(panel, targetRect, windowRef = window) {
    if (!panel?.style) {
      return;
    }
    const panelRect = panel.getBoundingClientRect?.() ?? { height: 48 };
    const panelHeight = Math.max(1, Number(panelRect.height ?? 48));
    const viewportHeight = Math.max(1, Number(windowRef.innerHeight ?? 0));
    const top = Number(targetRect?.y ?? targetRect?.top ?? 0);
    const bottom = top + Number(targetRect?.height ?? 0);
    const topRoom = top - 16;
    const bottomRoom = viewportHeight - bottom - 16;
    const useBottom = topRoom < panelHeight + 12 && bottomRoom >= panelHeight + 12;

    panel.style.top = useBottom ? "auto" : "16px";
    panel.style.bottom = useBottom ? "16px" : "auto";
    panel.style.opacity = topRoom < panelHeight + 12 && bottomRoom < panelHeight + 12
      ? "0.28"
      : "1";
  }

  function createElementSelection(element, rect, windowRef) {
    const id = `figcapture-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const viewport = {
      width: windowRef.innerWidth,
      height: windowRef.innerHeight,
      devicePixelRatio: windowRef.devicePixelRatio || 1,
      scrollX: windowRef.scrollX || 0,
      scrollY: windowRef.scrollY || 0
    };
    return {
      id,
      tagName: String(element.tagName ?? "div").toLowerCase(),
      selector: elementSelectorLabel(element),
      text: String(element.textContent ?? "").trim().slice(0, 120),
      rect,
      documentRect: {
        x: round(rect.x + viewport.scrollX),
        y: round(rect.y + viewport.scrollY),
        width: rect.width,
        height: rect.height
      },
      viewport
    };
  }

  function findSelectedElement(selection = {}) {
    const id = selection?.id;
    if (!id) {
      throw new Error("Element selection is missing");
    }
    if (selectedElementRecord?.id === id && isElementNode(selectedElementRecord.element)) {
      return { element: selectedElementRecord.element, selection };
    }
    for (const element of Array.from(document.querySelectorAll?.(`[${SELECTED_ELEMENT_ATTRIBUTE}]`) ?? [])) {
      if (element.getAttribute?.(SELECTED_ELEMENT_ATTRIBUTE) === id) {
        return { element, selection };
      }
    }
    throw new Error("Selected element is no longer available");
  }

  function cleanupSelectedElement(id = selectedElementRecord?.id) {
    if (!id) {
      return;
    }
    if (selectedElementRecord?.id === id) {
      selectedElementRecord.element?.removeAttribute?.(SELECTED_ELEMENT_ATTRIBUTE);
      selectedElementRecord = null;
      return;
    }
    for (const element of Array.from(document.querySelectorAll?.(`[${SELECTED_ELEMENT_ATTRIBUTE}]`) ?? [])) {
      if (element.getAttribute?.(SELECTED_ELEMENT_ATTRIBUTE) === id) {
        element.removeAttribute?.(SELECTED_ELEMENT_ATTRIBUTE);
      }
    }
  }

  function elementSelectorLabel(element) {
    const tagName = String(element.tagName ?? "div").toLowerCase();
    const id = element.getAttribute?.("id");
    if (id) {
      return `${tagName}#${id}`;
    }
    const className = String(element.getAttribute?.("class") ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .join(".");
    return className ? `${tagName}.${className}` : tagName;
  }

  function isElementNode(value) {
    return Boolean(value && (value.nodeType === 1 || value.tagName));
  }

  function showCaptureStatusPanel(message = {}, documentRef = document, runtimeRef = chrome?.runtime) {
    if (message.state === "hide") {
      dismissCaptureStatusPanel();
      return { shown: false };
    }

    dismissCaptureStatusPanel();

    const host = ensureOverlayHost(documentRef);
    const panel = documentRef.createElement("div");
    panel.setAttribute?.("data-figcapture-selection-overlay", "status-panel");
    Object.assign(panel.style, {
      position: "fixed",
      left: "50%",
      top: "16px",
      transform: "translateX(-50%)",
      zIndex: "2147483647",
      pointerEvents: "auto",
      display: "flex",
      alignItems: "center",
      gap: "12px",
      maxWidth: "min(620px, calc(100vw - 32px))",
      padding: "10px 12px",
      border: statusPanelBorder(message.state),
      borderRadius: "10px",
      background: "rgba(17, 24, 39, 0.95)",
      color: "#fff",
      font: "12px/1.3 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      boxShadow: "0 10px 32px rgba(0, 0, 0, 0.30)",
      WebkitFontSmoothing: "antialiased",
      userSelect: "none"
    });

    const copy = documentRef.createElement("div");
    copy.style.minWidth = "0";
    copy.style.flex = "1";
    copy.appendChild(panelText(documentRef, message.title ?? statusPanelTitle(message.state), {
      display: "block",
      fontSize: "13px",
      fontWeight: "650",
      margin: "0 0 2px"
    }));
    copy.appendChild(panelText(documentRef, message.message ?? statusPanelMessage(message.state), {
      color: "rgba(255,255,255,.74)"
    }));
    panel.appendChild(copy);

    if (message.state === "ready") {
      const downloadButton = documentRef.createElement("button");
      downloadButton.type = "button";
      downloadButton.textContent = "Download .figcapture";
      Object.assign(downloadButton.style, panelButtonStyle("primary"));
      downloadButton.addEventListener?.("click", async () => {
        downloadButton.disabled = true;
        downloadButton.textContent = "Downloading...";
        try {
          const response = await runtimeRef?.sendMessage?.({ type: EXPORT_CONFIRMED_MESSAGE });
          if (response?.status === "error") {
            showCaptureStatusPanel({
              state: "error",
              title: "Download failed",
              message: response.error?.message ?? "Could not download the capture."
            }, documentRef, runtimeRef);
            return;
          }
          showCaptureStatusPanel({
            state: "success",
            title: "Downloaded",
            message: response?.filename ?? "The selected element capture was downloaded."
          }, documentRef, runtimeRef);
        } catch (error) {
          showCaptureStatusPanel({
            state: "error",
            title: "Download failed",
            message: error?.message ?? "Could not download the capture."
          }, documentRef, runtimeRef);
        }
      });
      panel.appendChild(downloadButton);
    }

    const dismissButton = documentRef.createElement("button");
    dismissButton.type = "button";
    dismissButton.textContent = "Dismiss";
    Object.assign(dismissButton.style, panelButtonStyle("secondary"));
    dismissButton.addEventListener?.("click", dismissCaptureStatusPanel);
    panel.appendChild(dismissButton);

    host.appendChild?.(panel);
    captureStatusPanel = panel;
    return { shown: true };
  }

  function dismissCaptureStatusPanel() {
    captureStatusPanel?.remove?.();
    captureStatusPanel = null;
    cleanupOverlayHost();
  }

  function panelText(documentRef, text, styles = {}) {
    const element = documentRef.createElement("span");
    element.textContent = text;
    Object.assign(element.style, styles);
    return element;
  }

  function panelButtonStyle(kind) {
    return {
      appearance: "none",
      border: kind === "primary" ? "1px solid #3b6cf6" : "1px solid rgba(255,255,255,.20)",
      borderRadius: "8px",
      background: kind === "primary" ? "#3b6cf6" : "rgba(255,255,255,.08)",
      color: "#fff",
      cursor: "pointer",
      font: "600 12px/1 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      padding: "8px 10px",
      pointerEvents: "auto",
      whiteSpace: "nowrap"
    };
  }

  function ensureOverlayHost(documentRef = document) {
    const existing = documentRef.querySelector?.(`[${OVERLAY_HOST_ATTRIBUTE}]`);
    if (existing) {
      return existing;
    }

    const host = documentRef.createElement("div");
    host.setAttribute?.(OVERLAY_HOST_ATTRIBUTE, "true");
    Object.assign(host.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      pointerEvents: "none",
      overflow: "visible",
      contain: "layout style paint"
    });
    (documentRef.body ?? documentRef.documentElement)?.appendChild?.(host);
    return host;
  }

  function cleanupOverlayHost(documentRef = document) {
    const host = documentRef.querySelector?.(`[${OVERLAY_HOST_ATTRIBUTE}]`);
    if (host && (host.childNodes?.length ?? 0) === 0) {
      host.remove?.();
    }
  }

  function statusPanelBorder(state) {
    if (state === "error") {
      return "1px solid rgba(239, 68, 68, 0.50)";
    }
    if (state === "success" || state === "ready") {
      return "1px solid rgba(74, 222, 128, 0.42)";
    }
    return "1px solid rgba(255, 255, 255, 0.14)";
  }

  function statusPanelTitle(state) {
    if (state === "ready") {
      return "Element capture ready";
    }
    if (state === "success") {
      return "Done";
    }
    if (state === "error") {
      return "Capture failed";
    }
    return "Capturing";
  }

  function statusPanelMessage(state) {
    if (state === "ready") {
      return "Download now, or open the extension popup to preview it.";
    }
    if (state === "success") {
      return "The capture was downloaded.";
    }
    if (state === "error") {
      return "Try selecting a different element.";
    }
    return "Preparing the selected element capture.";
  }

  function pageMetrics() {
    const documentElement = document.documentElement;
    const body = document.body;
    return {
      documentWidth: Math.max(documentElement?.scrollWidth ?? 0, body?.scrollWidth ?? 0, window.innerWidth),
      documentHeight: Math.max(documentElement?.scrollHeight ?? 0, body?.scrollHeight ?? 0, window.innerHeight),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
        scrollX: window.scrollX || 0,
        scrollY: window.scrollY || 0
      }
    };
  }

  function hidePinnedElements() {
    if (pinnedHiddenRecords.length > 0) {
      return;
    }
    for (const element of Array.from(document.querySelectorAll("*"))) {
      const position = window.getComputedStyle(element).position;
      if (position === "fixed" || position === "sticky") {
        pinnedHiddenRecords.push({
          element,
          visibility: element.style.visibility
        });
        element.style.visibility = "hidden";
      }
    }
  }

  function restorePinnedElements() {
    for (const record of pinnedHiddenRecords) {
      record.element.style.visibility = record.visibility;
    }
    pinnedHiddenRecords = [];
  }

  function scrollInstantly(windowRef, targetY) {
    if (typeof windowRef?.scrollTo !== "function") {
      return;
    }
    try {
      windowRef.scrollTo({ left: 0, top: targetY, behavior: "instant" });
    } catch {
      windowRef.scrollTo(0, targetY);
      return;
    }
    if (!Number.isFinite(windowRef.scrollY) || Math.abs((windowRef.scrollY || 0) - targetY) > 1) {
      try {
        windowRef.scrollTo(0, targetY);
      } catch {
        // The later settle phase will report the actual scroll position.
      }
    }
  }

  async function waitForScrollPosition(targetY, windowRef = window) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (Math.abs((windowRef.scrollY || 0) - targetY) <= 1) {
        return;
      }
      await waitForNextFrame(windowRef);
    }
  }

  function waitForNextFrame(windowRef = window) {
    return new Promise((resolve) => {
      const settleTimer = typeof windowRef?.setTimeout === "function"
        ? windowRef.setTimeout.bind(windowRef)
        : setTimeout;
      if (typeof windowRef?.requestAnimationFrame === "function") {
        windowRef.requestAnimationFrame(() => settleTimer(resolve, 0));
        return;
      }
      settleTimer(resolve, 16);
    });
  }

  function waitForRenderSettle() {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame !== "function") {
        setTimeout(resolve, 0);
        return;
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 250);
        });
      });
    });
  }

  function captureVisibleViewportFromDocument(documentRef = document, windowRef = window, options = {}) {
    const viewport = {
      width: windowRef.innerWidth,
      height: windowRef.innerHeight,
      devicePixelRatio: windowRef.devicePixelRatio || 1,
      scrollX: windowRef.scrollX || 0,
      scrollY: windowRef.scrollY || 0
    };
    const rootElement = documentRef.body ?? documentRef.documentElement;
    const rawRoot = snapshotDomElement(rootElement, windowRef);
    const root = options.captureMode === "full-page"
      ? translateFullPageCaptureRoot(rawRoot, viewport, options.captureBounds)
      : rawRoot;

    return captureElementTree(root, viewport, {
      sourceUrl: documentRef.location?.href ?? windowRef.location?.href ?? "about:blank",
      title: documentRef.title ?? "",
      captureTimestamp: new Date().toISOString(),
      captureMode: options.captureMode,
      captureBounds: options.captureBounds
    });
  }

  function captureElementFromDocument(element, documentRef = document, windowRef = window, options = {}) {
    if (!element || typeof element.getBoundingClientRect !== "function") {
      throw new Error("A selectable element is required for element capture");
    }

    const elementRect = normalizeRect(element.getBoundingClientRect());
    const captureBounds = {
      width: positiveNumber(options.captureBounds?.width, positiveNumber(elementRect.width, 1)),
      height: positiveNumber(options.captureBounds?.height, positiveNumber(elementRect.height, 1))
    };
    const rawRoot = snapshotDomElement(element, windowRef);
    const root = translateElementCaptureRoot(rawRoot, elementRect, captureBounds);

    return captureElementTree(root, {
      width: captureBounds.width,
      height: captureBounds.height,
      devicePixelRatio: windowRef.devicePixelRatio || 1,
      scrollX: windowRef.scrollX || 0,
      scrollY: windowRef.scrollY || 0
    }, {
      sourceUrl: documentRef.location?.href ?? windowRef.location?.href ?? "about:blank",
      title: documentRef.title ?? "",
      captureTimestamp: new Date().toISOString(),
      captureMode: "element",
      captureBounds
    });
  }

  function translateFullPageCaptureRoot(root, viewport, captureBounds = {}) {
    const width = positiveNumber(captureBounds?.width, positiveNumber(root?.rect?.width, viewport.width));
    const height = positiveNumber(captureBounds?.height, positiveNumber(root?.rect?.height, viewport.height));
    const offset = {
      x: Number(viewport.scrollX ?? 0),
      y: Number(viewport.scrollY ?? 0)
    };

    return translateCaptureNodeToDocument(root, offset, true, { width, height });
  }

  function translateElementCaptureRoot(root, elementRect, captureBounds = {}) {
    return translateCaptureNodeToDocument(root, {
      x: -Number(elementRect.x ?? 0),
      y: -Number(elementRect.y ?? 0)
    }, true, {
      width: captureBounds.width,
      height: captureBounds.height
    });
  }

  function translateCaptureNodeToDocument(node, offset, isRoot = false, rootBounds = {}) {
    if (!node) {
      return node;
    }

    const rect = normalizeRect(node.rect ?? {});
    const documentRect = isRoot
      ? {
        x: 0,
        y: 0,
        width: round(rootBounds.width),
        height: round(rootBounds.height)
      }
      : {
        ...rect,
        x: round(rect.x + offset.x),
        y: round(rect.y + offset.y)
      };

    return {
      ...node,
      rect: documentRect,
      children: (node.children ?? []).map((child) => translateCaptureNodeToDocument(child, offset))
    };
  }

  function captureElementTree(inputRoot, viewport, options = {}) {
    const captureBounds = options.captureBounds ?? { width: viewport.width, height: viewport.height };
    const captureMode = options.captureMode === "element" ? "element" : options.captureMode;
    const isFullPage = captureMode === "full-page";
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
      ...(isFullPage
        ? {
          captureMode: "full-page",
          documentWidth: captureBounds.width,
          documentHeight: captureBounds.height
        }
        : captureMode === "element"
          ? { captureMode: "element" }
        : {}),
      root: normalizeElement(inputRoot, "dom-1", captureBounds, true, { clipToViewport: true })
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
    if (isClosedShadowHost(element, tagName)) {
      attributes["data-closed-shadow-root"] = "true";
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
        ...renderedChildEntries(element)
          .map((entry) => entry.slot
            ? snapshotSlottedTextNode(entry.textNode, entry.slot, windowRef)
            : snapshotDomElement(entry.element, windowRef, nextContainingBlockRect))
          .filter(Boolean),
        ...snapshotPseudoElements(element, rect, nextContainingBlockRect, windowRef)
      ]
    };
  }

  function renderedChildEntries(element) {
    const shadowRoot = accessibleShadowRoot(element);
    const baseChildren = shadowRoot ? shadowRoot.children : element.children;
    const entries = [];
    for (const child of Array.from(baseChildren ?? [])) {
      expandRenderedChild(child, entries);
    }
    return entries;
  }

  function expandRenderedChild(child, entries) {
    if (String(child.tagName ?? "").toLowerCase() !== "slot") {
      entries.push({ element: child });
      return;
    }

    const assigned = assignedSlotNodes(child);
    if (assigned.length > 0) {
      for (const node of assigned) {
        if (node.nodeType === 1 || (node.nodeType === undefined && node.tagName)) {
          entries.push({ element: node });
        } else if (node.nodeType === 3 && String(node.textContent ?? "").trim().length > 0) {
          entries.push({ textNode: node, slot: child });
        }
      }
      return;
    }

    for (const fallbackChild of Array.from(child.children ?? [])) {
      expandRenderedChild(fallbackChild, entries);
    }
  }

  function assignedSlotNodes(slot) {
    try {
      if (typeof slot.assignedNodes === "function") {
        return Array.from(slot.assignedNodes({ flatten: true }) ?? []);
      }
      if (typeof slot.assignedElements === "function") {
        return Array.from(slot.assignedElements({ flatten: true }) ?? []);
      }
    } catch {
      return [];
    }
    return [];
  }

  function accessibleShadowRoot(element) {
    if (element.shadowRoot) {
      return element.shadowRoot;
    }
    if (typeof chrome?.dom?.openOrClosedShadowRoot === "function") {
      try {
        return chrome.dom.openOrClosedShadowRoot(element) ?? null;
      } catch {
        return null;
      }
    }
    return null;
  }

  function isClosedShadowHost(element, tagName) {
    return tagName.includes("-") &&
      !accessibleShadowRoot(element) &&
      Array.from(element.children ?? []).length === 0;
  }

  function snapshotSlottedTextNode(textNode, slot, windowRef) {
    const rect = slottedTextRect(textNode);
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    const styles = slotComputedStyles(slot, windowRef);
    return {
      tagName: "#slotted-text",
      nodeType: "text",
      textContent: normalizeDirectTextContent(textNode.textContent ?? "", styles.whiteSpace),
      rect,
      styles,
      attributes: { "data-slotted-text": "true" },
      children: []
    };
  }

  function slottedTextRect(textNode) {
    try {
      if (typeof document.createRange !== "function") {
        return null;
      }
      const range = document.createRange();
      range.selectNode(textNode);
      return normalizeRect(range.getBoundingClientRect());
    } catch {
      return null;
    }
  }

  function slotComputedStyles(slot, windowRef) {
    try {
      return pickStyles(windowRef.getComputedStyle(slot));
    } catch {
      return {};
    }
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

  function positiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
