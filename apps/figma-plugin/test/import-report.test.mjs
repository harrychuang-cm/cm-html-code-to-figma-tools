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

  assert.equal(report.createdFrameCount, 2);
  assert(report.createdNodeCount >= 3);
  assert.equal(report.fallbackCount, 2);
  assert.equal(report.missingAssetCount, 1);
  assert.equal(report.unsupportedStyleCount, 3);
  assert.equal(report.autoLayoutConfidenceSummary.appliedCount, 0);
  assert.equal(report.autoLayoutConfidenceSummary.skippedCount, 1);
  assert.equal(report.autoLayoutConfidenceSummary.skippedReasons[0].reason, "complex-grid");
});

test("plugin UI renders import report numbers without raw JSON inspection", () => {
  const elements = new Map([
    ["import-report", { hidden: true }],
    ["created-frame-count", { textContent: "" }],
    ["created-node-count", { textContent: "" }],
    ["import-fallback-count", { textContent: "" }],
    ["import-missing-asset-count", { textContent: "" }],
    ["import-unsupported-style-count", { textContent: "" }],
    ["font-substitution-count", { textContent: "" }],
    ["font-substitution-summary", { textContent: "" }],
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
  assert.equal(elements.get("created-frame-count").textContent, "2");
  assert.equal(elements.get("import-fallback-count").textContent, "2");
  assert.equal(elements.get("import-missing-asset-count").textContent, "1");
  assert.equal(elements.get("import-unsupported-style-count").textContent, "3");
  assert.equal(elements.get("font-substitution-count").textContent, "0");
  assert.equal(elements.get("font-substitution-summary").textContent, "");
  assert.equal(elements.get("auto-layout-confidence-summary").textContent, "0 applied / 1 skipped / 0");
});

test("plugin UI renders font substitution details for debugging", () => {
  const elements = new Map([
    ["import-report", { hidden: true }],
    ["created-frame-count", { textContent: "" }],
    ["created-node-count", { textContent: "" }],
    ["import-fallback-count", { textContent: "" }],
    ["import-missing-asset-count", { textContent: "" }],
    ["import-unsupported-style-count", { textContent: "" }],
    ["font-substitution-count", { textContent: "" }],
    ["font-substitution-summary", { textContent: "" }],
    ["auto-layout-confidence-summary", { textContent: "" }]
  ]);
  const documentRef = {
    getElementById(id) {
      return elements.get(id);
    }
  };

  renderImportReport(documentRef, {
    createdFrameCount: 2,
    createdNodeCount: 8,
    fallbackCount: 0,
    missingAssetCount: 0,
    unsupportedStyleCount: 0,
    fontSubstitutions: [{
      requested: { family: "Missing Webfont", style: "Bold Italic" },
      requestedStack: [
        { family: "Missing Webfont", style: "Bold Italic" },
        { family: "Available Sans", style: "Bold Italic" },
        { family: "Available Sans", style: "Regular" }
      ],
      used: { family: "Available Sans", style: "Regular" }
    }],
    autoLayoutConfidenceSummary: {
      appliedCount: 0,
      skippedCount: 0,
      averageConfidence: 0
    }
  });

  assert.equal(elements.get("font-substitution-count").textContent, "1");
  assert.equal(elements.get("font-substitution-summary").textContent, "Missing Webfont Bold Italic -> Available Sans Regular");
});

test("import report includes semantic naming statistics from the renderer", () => {
  const packageData = createReportPackage();
  const report = createImportReport(packageData, {
    frames: [],
    autoLayoutSummary: { appliedCount: 0, skippedCount: 0, averageConfidence: 0, skippedReasons: [] },
    semanticNamingSummary: { semanticNames: 12, repeatedGroups: 2, collapsedWrappers: 5 }
  });

  assert.equal(report.semanticNamingSummary.semanticNames, 12);
  assert.equal(report.semanticNamingSummary.repeatedGroups, 2);
  assert.equal(report.semanticNamingSummary.collapsedWrappers, 5);
});

test("import report defaults missing semantic naming statistics to zero", () => {
  const packageData = createReportPackage();
  const report = createImportReport(packageData, {
    frames: [],
    autoLayoutSummary: { appliedCount: 0, skippedCount: 0, averageConfidence: 0, skippedReasons: [] }
  });

  assert.equal(report.semanticNamingSummary.semanticNames, 0);
  assert.equal(report.semanticNamingSummary.repeatedGroups, 0);
  assert.equal(report.semanticNamingSummary.collapsedWrappers, 0);
});

test("plugin UI renders semantic naming summary text", () => {
  const elements = new Map([
    ["import-report", { hidden: true }],
    ["semantic-naming-summary", { textContent: "" }]
  ]);
  const documentRef = {
    getElementById(id) {
      return elements.get(id);
    }
  };
  const packageData = createReportPackage();
  const renderResult = renderThreeFrames(createMemoryFigmaAdapter(), packageData);
  const report = createImportReport(packageData, renderResult);

  renderImportReport(documentRef, report);

  assert.match(elements.get("semantic-naming-summary").textContent, /^\d+ named \/ \d+ groups \/ \d+ collapsed$/);

  renderImportReport(documentRef, { ...report, semanticNamingSummary: undefined, autoLayoutConfidenceSummary: report.autoLayoutConfidenceSummary });
  assert.equal(elements.get("semantic-naming-summary").textContent, "0 named / 0 groups / 0 collapsed");
});
