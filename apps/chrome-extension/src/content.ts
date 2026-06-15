import { captureVisibleViewportFromDocument } from "./capture-core.ts";

export const CAPTURE_DOM_MESSAGE = "FIGCAPTURE_COLLECT_DOM";
export const PAGE_METRICS_MESSAGE = "FIGCAPTURE_PAGE_METRICS";
export const SCROLL_TO_MESSAGE = "FIGCAPTURE_SCROLL_TO";
export const SET_PINNED_HIDDEN_MESSAGE = "FIGCAPTURE_SET_PINNED_HIDDEN";

let pinnedHiddenRecords = [];

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
  windowRef.scrollTo(0, Number(scrollY ?? 0));
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
  if (message?.mode !== "full-page") {
    await waitForRenderSettle(windowRef);
    return captureVisibleViewportFromDocument(documentRef, windowRef, { openOrClosedShadowRoot });
  }
  windowRef.scrollTo(0, 0);
  await waitForRenderSettle(windowRef);
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

registerContentRuntime();
