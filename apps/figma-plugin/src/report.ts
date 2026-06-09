export function createImportReport(packageData, renderResult) {
  const autoLayoutSummary = renderResult.autoLayoutSummary ?? {
    appliedCount: 0,
    skippedCount: 0,
    averageConfidence: 0,
    skippedReasons: []
  };

  return {
    createdFrameCount: renderResult.frames.length,
    createdNodeCount: countCreatedNodes(renderResult.frames),
    fallbackCount: packageData.diagnostics.counts.fallbacks,
    missingAssetCount: packageData.diagnostics.counts.missingAssets,
    unsupportedStyleCount: packageData.diagnostics.counts.unsupportedStyles,
    fontSubstitutions: renderResult.fontSubstitutions ?? [],
    autoLayoutConfidenceSummary: {
      appliedCount: autoLayoutSummary.appliedCount,
      skippedCount: autoLayoutSummary.skippedCount,
      averageConfidence: autoLayoutSummary.averageConfidence,
      skippedReasons: autoLayoutSummary.skippedReasons
    }
  };
}

export function renderImportReport(documentRef, report) {
  setText(documentRef, "created-frame-count", String(report.createdFrameCount));
  setText(documentRef, "created-node-count", String(report.createdNodeCount));
  setText(documentRef, "import-fallback-count", String(report.fallbackCount));
  setText(documentRef, "import-missing-asset-count", String(report.missingAssetCount));
  setText(documentRef, "import-unsupported-style-count", String(report.unsupportedStyleCount));
  setText(documentRef, "font-substitution-count", String(report.fontSubstitutions?.length ?? 0));
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
