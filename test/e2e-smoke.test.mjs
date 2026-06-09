import assert from "node:assert/strict";
import test from "node:test";
import { buildConfirmedExportPackage } from "../apps/chrome-extension/dist/capture-package.js";
import { createChromeCaptureRuntime } from "../apps/chrome-extension/dist/runtime.js";
import { validatePackageBytes } from "../apps/figma-plugin/dist/importer.js";
import { importPackageBytes } from "../apps/figma-plugin/dist/code-module.js";
import { createFigmaApiAdapter, createMockFigmaApi } from "../apps/figma-plugin/dist/figma-adapter.js";
import { createDashboardVisibleViewportCapture } from "../fixtures/dashboard/visible-viewport.fixture.mjs";

test("dashboard visible viewport smoke: runtime capture, export, import, and create default frames", async () => {
  const capture = createDashboardVisibleViewportCapture();
  let downloadedPackage = null;
  const chromeRuntime = createChromeCaptureRuntime({
    chromeApi: {
      tabs: {
        async query(query) {
          assert.deepEqual(query, { active: true, currentWindow: true });
          return [{ id: 7, url: capture.sourceUrl, title: capture.title }];
        }
      }
    },
    contentMessage: async (_chromeApi, tabId) => {
      assert.equal(tabId, 7);
      return capture;
    },
    screenshotAdapter: async () => "data:image/png;base64,iVBORw0KGgo=",
    packageBuilder: buildConfirmedExportPackage,
    async downloader(_chromeApi, exportPackage) {
      downloadedPackage = exportPackage;
      return 13;
    }
  });

  const captureResponse = await chromeRuntime.captureActiveTab();
  const exportResponse = await chromeRuntime.confirmExport();
  const validation = validatePackageBytes(downloadedPackage.bytes);
  const figmaApi = createMockFigmaApi();
  const importResult = await importPackageBytes(downloadedPackage.bytes, {
    adapter: createFigmaApiAdapter(figmaApi, {
      assets: validation.packageData.assets
    })
  });

  assert.equal(captureResponse.status, "ready");
  assert.equal(captureResponse.preview.sourceUrl, "https://app.example.com/dashboard");
  assert.equal(captureResponse.preview.packageStatus, "ready");
  assert.equal(exportResponse.status, "downloaded");
  assert.equal(exportResponse.downloadId, 13);
  assert.equal(validation.ok, true);
  assert.equal(validation.packageData.manifest.sourceUrl, "https://app.example.com/dashboard");
  assert.equal(validation.packageData.capture.root.children.some((node) => node.sourceNodeId === "dom-below-fold"), false);
  assert.equal(Object.keys(validation.packageData.assets).includes("assets/image-1.png"), true);
  assert.equal(Object.keys(validation.packageData.assets).includes("assets/fallback-1.png"), true);
  assert.equal(importResult.status, "success");
  assert.equal(importResult.renderResult.frames.length, 2);
  assert.deepEqual(importResult.renderResult.frames.map((frame) => frame.name), [
    "Dashboard / 1440x900 / Source Screenshot",
    "Dashboard / 1440x900 / Editable Accurate"
  ]);
  const editableNodes = flattenNodes(importResult.renderResult.frames[1].children);
  assert.equal(editableNodes.some((node) => node.type === "TEXT" && node.characters === "Revenue"), true);
  assert.equal(editableNodes.some((node) => node.assetRef === "assets/image-1.png"), true);
  assert.equal(importResult.report.createdFrameCount, 2);
  assert.equal(importResult.report.fallbackCount, 1);
});

function flattenNodes(nodes) {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children ?? [])]);
}
