import {
  captureElementFromDocument,
  captureVisibleViewportFromDocument,
  clampRectToViewport,
  normalizeRect
} from "./capture-core.ts";

export const CAPTURE_DOM_MESSAGE = "FIGCAPTURE_COLLECT_DOM";
export const PAGE_METRICS_MESSAGE = "FIGCAPTURE_PAGE_METRICS";
export const SCROLL_TO_MESSAGE = "FIGCAPTURE_SCROLL_TO";
export const SET_PINNED_HIDDEN_MESSAGE = "FIGCAPTURE_SET_PINNED_HIDDEN";
export const SELECT_ELEMENT_MESSAGE = "FIGCAPTURE_SELECT_ELEMENT";
export const CAPTURE_STATUS_MESSAGE = "FIGCAPTURE_CAPTURE_STATUS";
export const EXPORT_CONFIRMED_MESSAGE = "FIGCAPTURE_EXPORT_CONFIRMED";
export const ADD_ELEMENT_SELECTION_MESSAGE = "FIGCAPTURE_ADD_ELEMENT_SELECTION";
export const REMOVE_ELEMENT_SELECTION_MESSAGE = "FIGCAPTURE_REMOVE_ELEMENT_SELECTION";
export const CLEAR_ELEMENT_SELECTIONS_MESSAGE = "FIGCAPTURE_CLEAR_ELEMENT_SELECTIONS";
export const SELECTED_ELEMENT_ATTRIBUTE = "data-figcapture-selection-id";
export const OVERLAY_HOST_ATTRIBUTE = "data-figcapture-overlay-host";

let pinnedHiddenRecords = [];
let selectedElementRecord = null;
let activeSelectionController = null;
let captureStatusPanel = null;

export function describeContentRuntime() {
  return {
    captureScope: "visible-viewport",
    metadataFields: [
      "viewportWidth",
      "viewportHeight",
      "devicePixelRatio",
      "scrollX",
      "scrollY",
      "sourceUrl",
      "captureTimestamp"
    ]
  };
}

export function chromeShadowRootAccessor(chromeRef = globalThis.chrome) {
  if (typeof chromeRef?.dom?.openOrClosedShadowRoot !== "function") {
    return undefined;
  }
  return (element) => chromeRef.dom.openOrClosedShadowRoot(element);
}

export function pageMetrics(documentRef = globalThis.document, windowRef = globalThis.window) {
  const documentElement = documentRef.documentElement;
  const body = documentRef.body;
  return {
    documentWidth: Math.max(documentElement?.scrollWidth ?? 0, body?.scrollWidth ?? 0, windowRef.innerWidth),
    documentHeight: Math.max(documentElement?.scrollHeight ?? 0, body?.scrollHeight ?? 0, windowRef.innerHeight),
    viewport: {
      width: windowRef.innerWidth,
      height: windowRef.innerHeight,
      devicePixelRatio: windowRef.devicePixelRatio || 1,
      scrollX: windowRef.scrollX || 0,
      scrollY: windowRef.scrollY || 0
    }
  };
}

export async function scrollToAndSettle(scrollY, windowRef = globalThis.window) {
  const targetY = Math.max(0, Number(scrollY ?? 0));
  scrollInstantly(windowRef, targetY);
  await waitForScrollPosition(targetY, windowRef);
  await waitForRenderSettle(windowRef);
  return { scrollY: windowRef.scrollY || 0, scrollX: windowRef.scrollX || 0 };
}

export function setPinnedHidden(hidden, documentRef = globalThis.document, windowRef = globalThis.window) {
  if (hidden) {
    if (pinnedHiddenRecords.length === 0) {
      for (const element of Array.from(documentRef.querySelectorAll("*"))) {
        const position = windowRef.getComputedStyle(element).position;
        if (position === "fixed" || position === "sticky") {
          pinnedHiddenRecords.push({
            element,
            visibility: element.style.visibility
          });
          element.style.visibility = "hidden";
        }
      }
    }
  } else {
    for (const record of pinnedHiddenRecords) {
      record.element.style.visibility = record.visibility;
    }
    pinnedHiddenRecords = [];
  }
  return { pinnedCount: pinnedHiddenRecords.length };
}

export async function collectDom(message, documentRef = globalThis.document, windowRef = globalThis.window) {
  const openOrClosedShadowRoot = chromeShadowRootAccessor();
  if (message?.mode === "element") {
    await waitForRenderSettle(windowRef);
    const selected = findSelectedElement(message?.selection, documentRef);
    try {
      return captureElementFromDocument(selected.element, documentRef, windowRef, {
        openOrClosedShadowRoot,
        selection: selected.selection
      });
    } finally {
      cleanupSelectedElement(selected.selection?.id);
    }
  }
  if (message?.mode !== "full-page") {
    await waitForRenderSettle(windowRef);
    return captureVisibleViewportFromDocument(documentRef, windowRef, { openOrClosedShadowRoot });
  }
  await scrollToAndSettle(0, windowRef);
  const metrics = pageMetrics(documentRef, windowRef);
  return captureVisibleViewportFromDocument(documentRef, windowRef, {
    openOrClosedShadowRoot,
    captureMode: "full-page",
    captureBounds: {
      width: message?.documentWidth ?? metrics.documentWidth,
      height: message?.documentHeight ?? metrics.documentHeight
    }
  });
}

export function registerContentRuntime(runtime = globalThis.chrome?.runtime) {
  runtime?.onMessage?.addListener?.((message, _sender, sendResponse) => {
    const handler = contentMessageHandler(message?.type);
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
  });
}

function contentMessageHandler(type) {
  if (type === CAPTURE_DOM_MESSAGE) {
    return async (message) => ({ capture: await collectDom(message) });
  }
  if (type === SELECT_ELEMENT_MESSAGE) {
    return () => selectElementFromPage();
  }
  if (type === CAPTURE_STATUS_MESSAGE) {
    return (message) => showCaptureStatusPanel(message);
  }
  if (type === PAGE_METRICS_MESSAGE) {
    return () => ({ metrics: pageMetrics() });
  }
  if (type === SCROLL_TO_MESSAGE) {
    return (message) => scrollToAndSettle(message?.scrollY);
  }
  if (type === SET_PINNED_HIDDEN_MESSAGE) {
    return (message) => setPinnedHidden(Boolean(message?.hidden));
  }
  return null;
}

export function selectElementFromPage(
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  runtimeRef = globalThis.chrome?.runtime
) {
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

function renderSelectionTray(overlay, state, runtimeRef = globalThis.chrome?.runtime) {
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
  const timer = globalThis.setTimeout ?? setTimeout;
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

function positionFloatingPanel(panel, targetRect, windowRef = globalThis.window) {
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

function findSelectedElement(selection = {}, documentRef = globalThis.document) {
  const id = selection?.id;
  if (!id) {
    throw new Error("Element selection is missing");
  }
  if (selectedElementRecord?.id === id && isElementNode(selectedElementRecord.element)) {
    return { element: selectedElementRecord.element, selection };
  }
  for (const element of Array.from(documentRef.querySelectorAll?.(`[${SELECTED_ELEMENT_ATTRIBUTE}]`) ?? [])) {
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
  for (const element of Array.from(globalThis.document?.querySelectorAll?.(`[${SELECTED_ELEMENT_ATTRIBUTE}]`) ?? [])) {
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

export function showCaptureStatusPanel(message = {}, documentRef = globalThis.document, runtimeRef = globalThis.chrome?.runtime) {
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

function ensureOverlayHost(documentRef = globalThis.document) {
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

function cleanupOverlayHost(documentRef = globalThis.document) {
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

async function waitForScrollPosition(targetY, windowRef = globalThis.window) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (Math.abs((windowRef.scrollY || 0) - targetY) <= 1) {
      return;
    }
    await waitForNextFrame(windowRef);
  }
}

function waitForNextFrame(windowRef = globalThis.window) {
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

function waitForRenderSettle(windowRef = globalThis.window) {
  return new Promise((resolve) => {
    const settleTimer = typeof windowRef?.setTimeout === "function"
      ? windowRef.setTimeout.bind(windowRef)
      : setTimeout;
    if (typeof windowRef?.requestAnimationFrame !== "function") {
      settleTimer(resolve, 0);
      return;
    }
    windowRef.requestAnimationFrame(() => {
      windowRef.requestAnimationFrame(() => {
        settleTimer(resolve, 250);
      });
    });
  });
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

registerContentRuntime();
