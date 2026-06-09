import { summarizeDiagnostics } from "@figma-capture/capture-schema";
import { buildConfirmedExportPackage, downloadFigcaptureArchive } from "./capture-package.ts";
import {
  captureVisibleScreenshot,
  callChromeApi,
  runtimeError,
  toRuntimeErrorPayload
} from "./screenshot.ts";

export const CAPTURE_ACTIVE_TAB_MESSAGE = "FIGCAPTURE_CAPTURE_ACTIVE_TAB";
export const EXPORT_CONFIRMED_MESSAGE = "FIGCAPTURE_EXPORT_CONFIRMED";
export const CAPTURE_DOM_MESSAGE = "FIGCAPTURE_COLLECT_DOM";

export const RUNTIME_ERROR_CATEGORIES = {
  MISSING_ACTIVE_TAB: "missing-active-tab",
  CAPTURE_SCRIPT_FAILED: "capture-script-failed",
  SCREENSHOT_FAILED: "screenshot-failed",
  PACKAGE_GENERATION_FAILED: "package-generation-failed",
  DOWNLOAD_FAILED: "download-failed",
  MISSING_PENDING_CAPTURE: "missing-pending-capture"
};

let pendingCapture = null;

export function createChromeCaptureRuntime(options = {}) {
  const chromeApi = options.chromeApi ?? globalThis.chrome;
  const screenshotAdapter = options.screenshotAdapter ?? captureVisibleScreenshot;
  const packageBuilder = options.packageBuilder ?? buildConfirmedExportPackage;
  const assetResolver = options.assetResolver ?? createFetchAssetResolver();
  const downloader = options.downloader ?? downloadFigcaptureArchive;
  const contentMessage = options.contentMessage ?? sendContentCaptureMessage;
  const getPending = options.getPending ?? (() => pendingCapture);
  const setPending = options.setPending ?? ((value) => {
    pendingCapture = value;
  });

  return {
    async captureActiveTab() {
      const tab = await resolveActiveTab(chromeApi);
      const capture = await contentMessage(chromeApi, tab.id);
      const screenshotDataUrl = await screenshotAdapter(chromeApi, { tab });

      let previewPackage;
      try {
        previewPackage = await packageBuilder(capture, screenshotDataUrl, { assetResolver });
      } catch (error) {
        throw runtimeError(
          RUNTIME_ERROR_CATEGORIES.PACKAGE_GENERATION_FAILED,
          error?.message ?? "Capture package could not be generated",
          error
        );
      }

      const preview = createPreviewPayload(capture, screenshotDataUrl, previewPackage.packageData.diagnostics, tab);
      setPending({
        tab,
        capture,
        screenshotDataUrl,
        preview
      });

      return {
        status: "ready",
        localFirst: true,
        tab,
        preview
      };
    },

    async confirmExport() {
      const pending = getPending();
      if (!pending) {
        throw runtimeError(
          RUNTIME_ERROR_CATEGORIES.MISSING_PENDING_CAPTURE,
          "Run capture preview before confirming export"
        );
      }

      let exportPackage;
      try {
        exportPackage = await packageBuilder(pending.capture, pending.screenshotDataUrl, { assetResolver });
      } catch (error) {
        throw runtimeError(
          RUNTIME_ERROR_CATEGORIES.PACKAGE_GENERATION_FAILED,
          error?.message ?? "Capture package could not be generated",
          error
        );
      }

      let downloadId;
      try {
        downloadId = await downloader(chromeApi, exportPackage);
      } catch (error) {
        throw runtimeError(
          RUNTIME_ERROR_CATEGORIES.DOWNLOAD_FAILED,
          error?.message ?? "Capture package could not be downloaded",
          error
        );
      }

      setPending(null);
      return {
        status: "downloaded",
        filename: exportPackage.filename,
        downloadId
      };
    }
  };
}

export function createFetchAssetResolver(fetchImpl = globalThis.fetch?.bind(globalThis)) {
  return async function resolveAsset(source) {
    if (!fetchImpl) {
      throw new Error("Fetch API is unavailable for asset capture");
    }
    const response = await fetchImpl(source.url, {
      credentials: "include",
      cache: "force-cache"
    });
    if (!response?.ok) {
      throw new Error(`Asset request failed: ${response?.status ?? "unknown"}`);
    }
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers?.get?.("content-type") ?? ""
    };
  };
}

export async function resolveActiveTab(chromeApi = globalThis.chrome) {
  if (!chromeApi?.tabs?.query) {
    throw runtimeError(
      RUNTIME_ERROR_CATEGORIES.MISSING_ACTIVE_TAB,
      "Chrome tabs API is unavailable"
    );
  }

  const tabs = await chromeApi.tabs.query({ active: true, currentWindow: true });
  const tab = tabs?.[0];
  if (!tab?.id) {
    throw runtimeError(
      RUNTIME_ERROR_CATEGORIES.MISSING_ACTIVE_TAB,
      "No active tab is available for capture"
    );
  }

  return {
    id: tab.id,
    url: tab.url ?? "",
    title: tab.title ?? ""
  };
}

export async function sendContentCaptureMessage(chromeApi, tabId) {
  try {
    return await requestContentCapture(chromeApi, tabId);
  } catch (firstError) {
    if (!chromeApi?.scripting?.executeScript) {
      throw runtimeError(
        RUNTIME_ERROR_CATEGORIES.CAPTURE_SCRIPT_FAILED,
        firstError?.message ?? "Content capture script failed",
        firstError
      );
    }

    try {
      await chromeApi.scripting.executeScript({
        target: { tabId },
        files: ["content-script.js"]
      });
      return await requestContentCapture(chromeApi, tabId);
    } catch (error) {
      throw runtimeError(
        RUNTIME_ERROR_CATEGORIES.CAPTURE_SCRIPT_FAILED,
        error?.message ?? "Content capture script failed",
        error
      );
    }
  }
}

export async function handleCaptureActiveTab(chromeApi = globalThis.chrome, options = {}) {
  try {
    return await createChromeCaptureRuntime({ chromeApi, ...options }).captureActiveTab();
  } catch (error) {
    return {
      status: "error",
      error: toRuntimeErrorPayload(error, RUNTIME_ERROR_CATEGORIES.CAPTURE_SCRIPT_FAILED)
    };
  }
}

export async function handleConfirmExport(chromeApi = globalThis.chrome, options = {}) {
  try {
    return await createChromeCaptureRuntime({ chromeApi, ...options }).confirmExport();
  } catch (error) {
    return {
      status: "error",
      error: toRuntimeErrorPayload(error, RUNTIME_ERROR_CATEGORIES.DOWNLOAD_FAILED)
    };
  }
}

export function createPreviewPayload(capture, screenshotDataUrl, diagnostics, tab = {}) {
  const summary = summarizeDiagnostics(diagnostics);
  return {
    screenshotDataUrl,
    screenshotUrl: screenshotDataUrl,
    sourceUrl: capture.sourceUrl || tab.url || "",
    viewport: {
      width: capture.viewport.width,
      height: capture.viewport.height,
      devicePixelRatio: capture.viewport.devicePixelRatio,
      scrollX: capture.viewport.scrollX,
      scrollY: capture.viewport.scrollY
    },
    diagnostics,
    diagnosticsSummary: summary,
    packageGenerationStatus: "ready",
    packageStatus: "ready"
  };
}

async function requestContentCapture(chromeApi, tabId) {
  if (!chromeApi?.tabs?.sendMessage) {
    throw new Error("Chrome tab messaging API is unavailable");
  }

  const response = await callChromeApi(
    chromeApi.tabs.sendMessage,
    chromeApi.tabs,
    [tabId, { type: CAPTURE_DOM_MESSAGE }],
    chromeApi
  );

  if (response?.status !== "success" || !response.capture) {
    const message = response?.error?.message ?? "Content runtime did not return capture data";
    throw runtimeError(RUNTIME_ERROR_CATEGORIES.CAPTURE_SCRIPT_FAILED, message);
  }

  return response.capture;
}
