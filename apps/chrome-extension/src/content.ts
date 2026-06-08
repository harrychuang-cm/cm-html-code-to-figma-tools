import { captureVisibleViewportFromDocument } from "./capture-core.ts";

export const CAPTURE_DOM_MESSAGE = "FIGCAPTURE_COLLECT_DOM";

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

export function registerContentRuntime(runtime = globalThis.chrome?.runtime) {
  runtime?.onMessage?.addListener?.((message, _sender, sendResponse) => {
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
          message: error.message
        }
      });
    }

    return true;
  });
}

registerContentRuntime();
