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
export const SELECTED_ELEMENT_ATTRIBUTE = "data-figcapture-selection-id";

let pinnedHiddenRecords = [];
let selectedElementRecord = null;
let activeSelectionController = null;

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

export function selectElementFromPage(documentRef = globalThis.document, windowRef = globalThis.window) {
  activeSelectionController?.cancel?.();

  return new Promise((resolve, reject) => {
    const overlay = createSelectionOverlay(documentRef);
    const state = {
      currentElement: null,
      resolved: false
    };
    const cleanup = () => {
      documentRef.removeEventListener?.("pointermove", onPointerMove, true);
      documentRef.removeEventListener?.("click", onClick, true);
      documentRef.removeEventListener?.("keydown", onKeyDown, true);
      windowRef.removeEventListener?.("scroll", onScroll, true);
      overlay.highlight.remove?.();
      overlay.hint.remove?.();
      if (activeSelectionController?.cancel === cancel) {
        activeSelectionController = null;
      }
    };
    const finish = (element) => {
      const rect = normalizeRect(element.getBoundingClientRect());
      if (rect.width <= 0 || rect.height <= 0) {
        reject(new Error("Selected element has no visible size"));
        cleanup();
        return;
      }
      cleanupSelectedElement();
      const selection = createElementSelection(element, rect, windowRef);
      element.setAttribute?.(SELECTED_ELEMENT_ATTRIBUTE, selection.id);
      selectedElementRecord = { id: selection.id, element };
      state.resolved = true;
      cleanup();
      resolve({ selection });
    };
    function cancel(message = "Element selection cancelled") {
      if (state.resolved) {
        return;
      }
      state.resolved = true;
      cleanup();
      reject(new Error(message));
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
      const element = state.currentElement ?? selectableEventElement(event, overlay, documentRef);
      if (!element) {
        return;
      }
      event.preventDefault?.();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      finish(element);
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
    documentRef.addEventListener?.("pointermove", onPointerMove, true);
    documentRef.addEventListener?.("click", onClick, true);
    documentRef.addEventListener?.("keydown", onKeyDown, true);
    windowRef.addEventListener?.("scroll", onScroll, true);
  });
}

function createSelectionOverlay(documentRef) {
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

  const hint = documentRef.createElement("div");
  hint.setAttribute?.("data-figcapture-selection-overlay", "hint");
  hint.textContent = "Click an element for Figma · Esc cancels";
  Object.assign(hint.style, {
    position: "fixed",
    left: "12px",
    bottom: "12px",
    zIndex: "2147483647",
    pointerEvents: "none",
    padding: "8px 10px",
    borderRadius: "8px",
    background: "rgba(17, 24, 39, 0.92)",
    color: "#fff",
    font: "12px/1.3 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    boxShadow: "0 6px 20px rgba(0, 0, 0, 0.25)"
  });

  documentRef.documentElement?.appendChild?.(highlight);
  documentRef.documentElement?.appendChild?.(hint);
  return { highlight, hint };
}

function selectableEventElement(event, overlay, documentRef) {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  const target = path.find((item) => isElementNode(item)) ?? event.target;
  if (!isElementNode(target) || target === overlay.highlight || target === overlay.hint) {
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
