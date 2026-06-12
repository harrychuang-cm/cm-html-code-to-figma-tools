export function createImportReport(packageData, renderResult) {
  const autoLayoutSummary = renderResult.autoLayoutSummary ?? {
    appliedCount: 0,
    skippedCount: 0,
    averageConfidence: 0,
    skippedReasons: []
  };
  const semanticNamingSummary = renderResult.semanticNamingSummary ?? {};

  return {
    semanticNamingSummary: {
      semanticNames: semanticNamingSummary.semanticNames ?? 0,
      repeatedGroups: semanticNamingSummary.repeatedGroups ?? 0,
      collapsedWrappers: semanticNamingSummary.collapsedWrappers ?? 0
    },
    createdFrameCount: renderResult.frames.length,
    createdNodeCount: countCreatedNodes(renderResult.frames),
    fallbackCount: packageData.diagnostics.counts.fallbacks,
    missingAssetCount: packageData.diagnostics.counts.missingAssets,
    unsupportedStyleCount: packageData.diagnostics.counts.unsupportedStyles,
    fontSubstitutions: renderResult.fontSubstitutions ?? [],
    fontSubstitutionSummary: summarizeFontSubstitutions(renderResult.fontSubstitutions ?? []),
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
  setText(documentRef, "font-substitution-summary", report.fontSubstitutionSummary ?? summarizeFontSubstitutions(report.fontSubstitutions ?? []));
  setText(documentRef, "auto-layout-confidence-summary", `${report.autoLayoutConfidenceSummary.appliedCount} applied / ${report.autoLayoutConfidenceSummary.skippedCount} skipped / ${report.autoLayoutConfidenceSummary.averageConfidence}`);
  const semanticNaming = report.semanticNamingSummary ?? {};
  setText(documentRef, "semantic-naming-summary", `${semanticNaming.semanticNames ?? 0} named / ${semanticNaming.repeatedGroups ?? 0} groups / ${semanticNaming.collapsedWrappers ?? 0} collapsed`);

  const root = documentRef.getElementById("import-report");
  if (root) {
    root.hidden = false;
  }
}

function summarizeFontSubstitutions(substitutions) {
  if (!Array.isArray(substitutions) || substitutions.length === 0) {
    return "";
  }
  const shown = substitutions.slice(0, 3).map((item) => {
    const requested = fontLabel(item.requested ?? item.requestedStack?.[0]);
    const used = fontLabel(item.used);
    return `${requested} -> ${used}`;
  });
  const remaining = substitutions.length - shown.length;
  return remaining > 0
    ? `${shown.join("; ")}; +${remaining} more`
    : shown.join("; ");
}

function fontLabel(fontName) {
  if (!fontName) {
    return "Unknown";
  }
  return `${fontName.family ?? "Unknown"} ${fontName.style ?? ""}`.trim();
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
