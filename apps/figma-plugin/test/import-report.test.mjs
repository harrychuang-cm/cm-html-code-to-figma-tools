import assert from "node:assert/strict";
import test from "node:test";
import { createValidPackage } from "../../../packages/capture-schema/fixtures/valid-package.mjs";
import { createMemoryFigmaAdapter, renderThreeFrames } from "../dist/renderer.js";
import { createImportReport, renderImportReport } from "../dist/report.js";

function createReportPackage() {
  const base = createValidPackage();
  return {
    ...base,
    capture: {
      ...base.capture,
      root: {
        ...base.capture.root,
        children: [
          {
            id: "button",
            sourceNodeId: "dom-button",
            nodeType: "element",
            tagName: "button",
            rect: { x: 20, y: 20, width: 160, height: 40 },
            styles: {},
            attributes: {},
            children: [
              {
                id: "icon",
                sourceNodeId: "dom-icon",
                nodeType: "element",
                tagName: "span",
                rect: { x: 32, y: 30, width: 16, height: 16 },
                styles: {},
                attributes: {},
                children: []
              },
              {
                id: "label",
                sourceNodeId: "dom-label",
                nodeType: "text",
                tagName: "#text",
                textContent: "Save",
                rect: { x: 56, y: 30, width: 40, height: 16 },
                styles: { fontSize: "14px" },
                attributes: {},
                children: []
              }
            ]
          }
        ]
      }
    },
    diagnostics: {
      ...base.diagnostics,
      counts: {
        fallbacks: 2,
        missingAssets: 1,
        unsupportedStyles: 3
      }
    }
  };
}

test("import report combines renderer output and diagnostics counts", () => {
  const packageData = createReportPackage();
  const renderResult = renderThreeFrames(createMemoryFigmaAdapter(), packageData);
  const report = createImportReport(packageData, renderResult);

  assert.equal(report.createdFrameCount, 3);
  assert(report.createdNodeCount >= 3);
  assert.equal(report.fallbackCount, 2);
  assert.equal(report.missingAssetCount, 1);
  assert.equal(report.unsupportedStyleCount, 3);
  assert.equal(report.autoLayoutConfidenceSummary.appliedCount, 1);
  assert.equal(report.autoLayoutConfidenceSummary.averageConfidence, 0.92);
});

test("plugin UI renders import report numbers without raw JSON inspection", () => {
  const elements = new Map([
    ["import-report", { hidden: true }],
    ["created-frame-count", { textContent: "" }],
    ["created-node-count", { textContent: "" }],
    ["import-fallback-count", { textContent: "" }],
    ["import-missing-asset-count", { textContent: "" }],
    ["import-unsupported-style-count", { textContent: "" }],
    ["auto-layout-confidence-summary", { textContent: "" }]
  ]);
  const documentRef = {
    getElementById(id) {
      return elements.get(id);
    }
  };
  const packageData = createReportPackage();
  const report = createImportReport(packageData, renderThreeFrames(createMemoryFigmaAdapter(), packageData));

  renderImportReport(documentRef, report);

  assert.equal(elements.get("import-report").hidden, false);
  assert.equal(elements.get("created-frame-count").textContent, "3");
  assert.equal(elements.get("import-fallback-count").textContent, "2");
  assert.equal(elements.get("import-missing-asset-count").textContent, "1");
  assert.equal(elements.get("import-unsupported-style-count").textContent, "3");
  assert.equal(elements.get("auto-layout-confidence-summary").textContent, "1 applied / 0 skipped / 0.92");
});
