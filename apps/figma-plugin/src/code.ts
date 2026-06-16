import { validateMultiCapturePackageBytes } from "./importer.ts";
import {
  IMPORT_PACKAGE,
  createImportPackageTransferReceiver,
  createImportErrorMessage,
  createImportProgressMessage,
  createImportSuccessMessage,
  isImportPackageMessage,
  isImportPackageTransferMessage
} from "./message-bridge.ts";
import { createFigmaApiAdapter } from "./figma-adapter.ts";
import { renderThreeFramesAsync, captureFrameSize, FRAME_ROLES, FRAME_GAP } from "./renderer.ts";
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
  const validation = validateMultiCapturePackageBytes(bytes);
  if (!validation.ok) {
    return {
      status: "error",
      error: validation.error
    };
  }

  const figmaApi = options.figmaApi ?? globalThis.figma;
  const captures = sortCapturesByWidthDescending(validation.bundle.captures);

  const rendered = [];
  let originX = 0;
  for (const entry of captures) {
    const packageData = entry.packageData;
    const fallbackViewport = captureFrameSize(packageData.manifest);
    const adapter = options.adapter ?? createFigmaApiAdapter(figmaApi, {
      assets: packageData.assets,
      screenshot: packageData.screenshot,
      viewport: fallbackViewport,
      fallbackFont: options.fallbackFont
    });
    const renderResult = await renderThreeFramesAsync(adapter, packageData, { originX });
    rendered.push({
      width: entry.width,
      label: entry.label,
      originX,
      packageData,
      renderResult,
      report: createImportReport(packageData, renderResult)
    });
    originX += FRAME_ROLES.length * (captureFrameSize(packageData.manifest).width + FRAME_GAP);
  }

  const primary = rendered[0];
  return {
    status: "success",
    captures: rendered,
    packageData: primary.packageData,
    renderResult: primary.renderResult,
    report: aggregateImportReports(rendered.map((entry) => entry.report))
  };
}

function sortCapturesByWidthDescending(captures) {
  return [...captures].sort((a, b) => b.width - a.width);
}

function aggregateImportReports(reports) {
  if (reports.length <= 1) {
    return reports[0];
  }

  const sum = (key) => reports.reduce((total, report) => total + (report[key] ?? 0), 0);
  return {
    ...reports[0],
    createdFrameCount: sum("createdFrameCount"),
    createdNodeCount: sum("createdNodeCount"),
    fallbackCount: sum("fallbackCount"),
    missingAssetCount: sum("missingAssetCount"),
    unsupportedStyleCount: sum("unsupportedStyleCount"),
    fontSubstitutions: reports.flatMap((report) => report.fontSubstitutions ?? []),
    autoLayoutConfidenceSummary: {
      appliedCount: reports.reduce((total, report) => total + (report.autoLayoutConfidenceSummary?.appliedCount ?? 0), 0),
      skippedCount: reports.reduce((total, report) => total + (report.autoLayoutConfidenceSummary?.skippedCount ?? 0), 0),
      averageConfidence: reports[0].autoLayoutConfidenceSummary?.averageConfidence ?? 0,
      skippedReasons: reports.flatMap((report) => report.autoLayoutConfidenceSummary?.skippedReasons ?? [])
    }
  };
}

export function registerFigmaPluginRuntime(figmaApi = globalThis.figma, options = {}) {
  if (!figmaApi?.ui) {
    return false;
  }

  if (typeof figmaApi.showUI === "function") {
    figmaApi.showUI(typeof __html__ === "undefined" ? "" : __html__, {
      width: options.width ?? 380,
      height: options.height ?? 600
    });
  }

  const packageTransferReceiver = createImportPackageTransferReceiver();

  figmaApi.ui.onmessage = async (message) => {
    let importMessage = message;
    try {
      if (isImportPackageTransferMessage(message)) {
        const transferResult = packageTransferReceiver.accept(message);
        if (!transferResult || transferResult.status !== "complete") {
          if (transferResult?.status === "pending") {
            figmaApi.ui.postMessage(createImportProgressMessage({
              phase: transferResult.phase,
              processed: transferResult.processed,
              total: transferResult.total,
              label: transferResult.filename,
              message: "Receiving .figcapture…"
            }));
          }
          return;
        }
        importMessage = transferResult.message;
      }

      if (!isImportPackageMessage(importMessage) || importMessage.type !== IMPORT_PACKAGE) {
        return;
      }

      const result = await importPackageBytes(importMessage.bytes, {
        figmaApi,
        fallbackFont: options.fallbackFont
      });
      if (result.status === "error") {
        figmaApi.ui.postMessage(createImportErrorMessage(result.error));
        return;
      }

      figmaApi.ui.postMessage(createImportSuccessMessage(result.report));
    } catch (error) {
      figmaApi.ui.postMessage(createImportErrorMessage(error));
    }
  };

  return true;
}

if (globalThis.figma?.ui) {
  registerFigmaPluginRuntime(globalThis.figma);
}
