import { detectAutoLayoutCandidates } from "./auto-layout.ts";

export function createImportReport(packageData, renderResult) {
  const autoLayoutCandidates = detectAutoLayoutCandidates(packageData.capture);
  const applied = autoLayoutCandidates.filter((candidate) => candidate.applied);
  const skipped = autoLayoutCandidates.filter((candidate) => !candidate.applied);
  const confidenceValues = applied.map((candidate) => candidate.confidence);

  return {
    createdFrameCount: renderResult.frames.length,
    createdNodeCount: countCreatedNodes(renderResult.frames),
    fallbackCount: packageData.diagnostics.counts.fallbacks,
    missingAssetCount: packageData.diagnostics.counts.missingAssets,
    unsupportedStyleCount: packageData.diagnostics.counts.unsupportedStyles,
    autoLayoutConfidenceSummary: {
      appliedCount: applied.length,
      skippedCount: skipped.length,
      averageConfidence: confidenceValues.length === 0 ? 0 : round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length),
      skippedReasons: skipped.map((candidate) => ({
        sourceNodeId: candidate.sourceNodeId,
        reason: candidate.skippedReason
      }))
    }
  };
}

export function renderImportReport(documentRef, report) {
  setText(documentRef, "created-frame-count", String(report.createdFrameCount));
  setText(documentRef, "created-node-count", String(report.createdNodeCount));
  setText(documentRef, "import-fallback-count", String(report.fallbackCount));
  setText(documentRef, "import-missing-asset-count", String(report.missingAssetCount));
  setText(documentRef, "import-unsupported-style-count", String(report.unsupportedStyleCount));
  setText(documentRef, "auto-layout-confidence-summary", `${report.autoLayoutConfidenceSummary.appliedCount} applied / ${report.autoLayoutConfidenceSummary.skippedCount} skipped / ${report.autoLayoutConfidenceSummary.averageConfidence}`);

  const root = documentRef.getElementById("import-report");
  if (root) {
    root.hidden = false;
  }
}

function countCreatedNodes(frames) {
  let count = 0;
  for (const frame of frames) {
    count += countChildren(frame.children ?? []);
  }
  return count;
}

function countChildren(children) {
  let count = children.length;
  for (const child of children) {
    count += countChildren(child.children ?? []);
  }
  return count;
}

function setText(documentRef, id, text) {
  const element = documentRef.getElementById(id);
  if (element) {
    element.textContent = text;
  }
}

function round(value) {
  return Math.round(value * 100) / 100;
}
