import assert from "node:assert/strict";
import test from "node:test";
import { unpackFigcapture } from "../packages/capture-schema/dist/index.js";
import { buildConfirmedExportPackage } from "../apps/chrome-extension/dist/capture-package.js";
import { validatePackageBytes } from "../apps/figma-plugin/dist/importer.js";
import { createMemoryFigmaAdapter, renderThreeFrames } from "../apps/figma-plugin/dist/renderer.js";
import { createImportReport } from "../apps/figma-plugin/dist/report.js";
import { createDashboardVisibleViewportCapture } from "../fixtures/dashboard/visible-viewport.fixture.mjs";

test("dashboard visible viewport smoke: capture, export, import, and create three frames", () => {
  const capture = createDashboardVisibleViewportCapture();
  const exportPackage = buildConfirmedExportPackage(
    capture,
    "data:image/png;base64,iVBORw0KGgo="
  );
  const unpacked = unpackFigcapture(exportPackage.bytes);
  const validation = validatePackageBytes(exportPackage.bytes);
  const adapter = createMemoryFigmaAdapter();
  const renderResult = renderThreeFrames(adapter, validation.packageData);
  const report = createImportReport(validation.packageData, renderResult);

  assert.equal(validation.ok, true);
  assert.equal(unpacked.manifest.sourceUrl, "https://app.example.com/dashboard");
  assert.equal(unpacked.capture.root.children.some((node) => node.sourceNodeId === "dom-below-fold"), false);
  assert.equal(Object.keys(unpacked.assets).includes("assets/image-1.png"), true);
  assert.equal(Object.keys(unpacked.assets).includes("assets/fallback-1.png"), true);
  assert.equal(renderResult.frames.length, 3);
  assert.deepEqual(renderResult.frames.map((frame) => frame.name), [
    "Dashboard / 1440x900 / Source Screenshot",
    "Dashboard / 1440x900 / Editable Accurate",
    "Dashboard / 1440x900 / Auto Layout Experimental"
  ]);
  assert.equal(renderResult.frames[1].children.some((node) => node.type === "TEXT" && node.characters === "Revenue"), true);
  assert.equal(renderResult.frames[1].children.some((node) => node.assetRef === "assets/image-1.png"), true);
  assert.equal(report.createdFrameCount, 3);
  assert.equal(report.fallbackCount, 1);
});
