export const SCREENSHOT_FAILED = "screenshot-failed";

export async function captureVisibleScreenshot(chromeApi = globalThis.chrome, options = {}) {
  const captureVisibleTab = chromeApi?.tabs?.captureVisibleTab;
  if (typeof captureVisibleTab !== "function") {
    throw screenshotError("Chrome visible screenshot API is unavailable");
  }

  try {
    const dataUrl = await callChromeApi(
      captureVisibleTab,
      chromeApi.tabs,
      [options.captureOptions ?? { format: "png" }],
      chromeApi
    );
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      throw new Error("Chrome visible screenshot API returned an invalid screenshot");
    }
    return dataUrl;
  } catch (error) {
    throw screenshotError(error?.message ?? "Visible screenshot capture failed", error);
  }
}

export function screenshotError(message, cause) {
  const error = new Error(message);
  error.category = SCREENSHOT_FAILED;
  if (cause) {
    error.cause = cause;
  }
  return error;
}

export function runtimeError(category, message, cause) {
  const error = new Error(message);
  error.category = category;
  if (cause) {
    error.cause = cause;
  }
  return error;
}

export function toRuntimeErrorPayload(error, fallbackCategory) {
  return {
    category: error?.category ?? fallbackCategory,
    message: error?.message ?? "Runtime operation failed"
  };
}

export function callChromeApi(fn, thisArg, args, chromeApi = globalThis.chrome) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (callback) => (value) => {
      if (settled) {
        return;
      }
      settled = true;
      const lastError = chromeApi?.runtime?.lastError;
      if (lastError) {
        reject(lastError);
        return;
      }
      callback(value);
    };

    try {
      const result = fn.apply(thisArg, [
        ...args,
        settle(resolve)
      ]);
      if (result && typeof result.then === "function") {
        result.then(settle(resolve), settle(reject));
      } else if (result !== undefined) {
        settle(resolve)(result);
      }
    } catch (error) {
      settle(reject)(error);
    }
  });
}
