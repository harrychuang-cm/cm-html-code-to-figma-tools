import { callChromeApi, runtimeError, SCREENSHOT_FAILED } from "./screenshot.ts";

export const EMULATION_FAILED = "emulation-failed";
export const DEBUGGER_PROTOCOL_VERSION = "1.3";

export function deviceMetricsForWidth(width, options = {}) {
  return {
    width,
    height: options.height ?? 0,
    deviceScaleFactor: options.deviceScaleFactor ?? 0,
    mobile: options.mobile ?? width <= 768
  };
}

export function createDeviceEmulationSession(chromeApi = globalThis.chrome, tabId, options = {}) {
  const debuggerApi = chromeApi?.debugger;
  const protocolVersion = options.protocolVersion ?? DEBUGGER_PROTOCOL_VERSION;
  const target = { tabId };
  let attached = false;

  function sendCommand(method, params = {}) {
    return callChromeApi(debuggerApi.sendCommand, debuggerApi, [target, method, params], chromeApi);
  }

  return {
    isAttached() {
      return attached;
    },

    async attach() {
      if (
        typeof debuggerApi?.attach !== "function" ||
        typeof debuggerApi?.sendCommand !== "function" ||
        typeof debuggerApi?.detach !== "function"
      ) {
        throw runtimeError(EMULATION_FAILED, "Chrome debugger API is unavailable for device emulation");
      }
      try {
        await callChromeApi(debuggerApi.attach, debuggerApi, [target, protocolVersion], chromeApi);
        attached = true;
      } catch (error) {
        throw runtimeError(
          EMULATION_FAILED,
          error?.message ?? "Could not attach the debugger for device emulation",
          error
        );
      }
    },

    async setWidth(width, metricsOptions = {}) {
      try {
        await sendCommand("Emulation.setDeviceMetricsOverride", deviceMetricsForWidth(width, metricsOptions));
      } catch (error) {
        throw runtimeError(
          EMULATION_FAILED,
          error?.message ?? `Could not emulate viewport width ${width}`,
          error
        );
      }
    },

    async captureScreenshot(params = {}) {
      try {
        const result = await sendCommand("Page.captureScreenshot", {
          format: params.format ?? "png",
          captureBeyondViewport: Boolean(params.captureBeyondViewport),
          fromSurface: params.fromSurface ?? true,
          ...(params.clip ? { clip: params.clip } : {})
        });
        const data = result?.data;
        if (typeof data !== "string" || data.length === 0) {
          throw new Error("Screenshot protocol returned no image data");
        }
        return `data:image/png;base64,${data}`;
      } catch (error) {
        throw runtimeError(
          SCREENSHOT_FAILED,
          error?.message ?? "Could not capture the emulated screenshot",
          error
        );
      }
    },

    async clear() {
      if (!attached) {
        return;
      }
      await sendCommand("Emulation.clearDeviceMetricsOverride").catch(() => null);
    },

    async detach() {
      if (!attached) {
        return;
      }
      attached = false;
      await callChromeApi(debuggerApi.detach, debuggerApi, [target], chromeApi).catch(() => null);
    }
  };
}
