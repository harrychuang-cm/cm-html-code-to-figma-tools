import { validatePackageBytes } from "./importer.ts";
import {
  IMPORT_PACKAGE,
  createImportErrorMessage,
  createImportSuccessMessage,
  isImportPackageMessage
} from "./message-bridge.ts";
import { createFigmaApiAdapter } from "./figma-adapter.ts";
import { renderThreeFramesAsync } from "./renderer.ts";
import { createImportReport } from "./report.ts";

export function describePluginRuntime() {
  return {
    outputFrames: [
      "Source Screenshot",
      "Editable Accurate"
    ]
  };
}

export async function importCaptureIntoFrames(adapter, packageData) {
  return renderThreeFramesAsync(adapter, packageData);
}

export async function importPackageBytes(bytes, options = {}) {
  const validation = validatePackageBytes(bytes);
  if (!validation.ok) {
    return {
      status: "error",
      error: validation.error
    };
  }

  const figmaApi = options.figmaApi ?? globalThis.figma;
  const adapter = options.adapter ?? createFigmaApiAdapter(figmaApi, {
    assets: validation.packageData.assets,
    screenshot: validation.packageData.screenshot,
    viewport: {
      width: validation.packageData.manifest.viewportWidth,
      height: validation.packageData.manifest.viewportHeight
    },
    fallbackFont: options.fallbackFont
  });
  const renderResult = await renderThreeFramesAsync(adapter, validation.packageData);
  const report = createImportReport(validation.packageData, renderResult);

  return {
    status: "success",
    packageData: validation.packageData,
    renderResult,
    report
  };
}

export function registerFigmaPluginRuntime(figmaApi = globalThis.figma, options = {}) {
  if (!figmaApi?.ui) {
    return false;
  }

  if (typeof figmaApi.showUI === "function") {
    figmaApi.showUI(typeof __html__ === "undefined" ? "" : __html__, {
      width: options.width ?? 360,
      height: options.height ?? 520
    });
  }

  figmaApi.ui.onmessage = async (message) => {
    if (!isImportPackageMessage(message) || message.type !== IMPORT_PACKAGE) {
      return;
    }

    const result = await importPackageBytes(message.bytes, {
      figmaApi,
      fallbackFont: options.fallbackFont
    });
    if (result.status === "error") {
      figmaApi.ui.postMessage(createImportErrorMessage(result.error));
      return;
    }

    figmaApi.ui.postMessage(createImportSuccessMessage(result.report));
  };

  return true;
}

if (globalThis.figma?.ui) {
  registerFigmaPluginRuntime(globalThis.figma);
}
