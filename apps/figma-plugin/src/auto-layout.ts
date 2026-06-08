export const AUTO_LAYOUT_THRESHOLD = 0.75;

export function detectAutoLayoutCandidates(capture) {
  const candidates = [];
  traverse(capture.root, (node) => {
    const pattern = classifyPattern(node);
    const risk = detectRisk(node);

    if (!pattern && !risk) {
      return;
    }

    if (risk) {
      candidates.push({
        sourceNodeId: node.sourceNodeId,
        pattern: pattern ?? "risky layout",
        confidence: 0,
        applied: false,
        skippedReason: risk
      });
      return;
    }

    const axis = inferAxis(node.children ?? []);
    const confidence = confidenceFor(node, axis);
    const applied = confidence >= AUTO_LAYOUT_THRESHOLD;
    candidates.push({
      sourceNodeId: node.sourceNodeId,
      pattern,
      direction: axis === "x" ? "HORIZONTAL" : "VERTICAL",
      confidence,
      applied,
      ...(applied ? {} : { skippedReason: "confidence below threshold" })
    });
  });
  return candidates;
}

export function createAutoLayoutNodeModels(capture) {
  return detectAutoLayoutCandidates(capture)
    .filter((candidate) => candidate.applied)
    .map((candidate) => {
      const node = findNode(capture.root, candidate.sourceNodeId);
      return {
        type: "AUTO_LAYOUT",
        name: `Auto Layout / ${candidate.pattern}`,
        sourceNodeId: candidate.sourceNodeId,
        rect: node.rect,
        layoutMode: candidate.direction,
        confidence: candidate.confidence,
        pattern: candidate.pattern
      };
    });
}

function classifyPattern(node) {
  const tag = node.tagName;
  const role = node.attributes?.role ?? "";
  const className = node.attributes?.class ?? "";

  if (tag === "button" || role === "button") {
    return "button inner content";
  }
  if (tag === "nav" || role === "navigation" || className.includes("nav")) {
    return "navigation item list";
  }
  if (tag === "aside" || className.includes("sidebar")) {
    return "sidebar menu";
  }
  if (className.includes("card-list") || className.includes("cards")) {
    return "card list";
  }
  if (tag === "form" || className.includes("form")) {
    return "form group";
  }
  if (role === "toolbar" || className.includes("toolbar")) {
    return "toolbar group";
  }
  return null;
}

function detectRisk(node) {
  const className = node.attributes?.class ?? "";
  if (node.attributes?.["data-virtualized"] === "true" || className.includes("virtualized")) {
    return "virtualized list";
  }
  if (node.styles?.position === "fixed") {
    return "fixed overlay";
  }
  if (node.styles?.display === "grid" && hasComplexGrid(node.styles)) {
    return "complex CSS grid";
  }
  if (hasOverlappingChildren(node.children ?? [])) {
    return "overlapping layout";
  }
  return null;
}

function hasComplexGrid(styles) {
  return String(styles.gridTemplateColumns ?? "").split(" ").filter(Boolean).length > 2 ||
    String(styles.gridTemplateRows ?? "").split(" ").filter(Boolean).length > 2;
}

function confidenceFor(node, axis) {
  const children = node.children ?? [];
  if (children.length === 0) {
    return node.tagName === "button" ? 0.82 : 0.5;
  }
  if (!hasConsistentSpacing(children, axis)) {
    return 0.6;
  }
  return node.tagName === "button" ? 0.92 : 0.88;
}

function inferAxis(children) {
  if (children.length < 2) {
    return "x";
  }
  const xSpread = Math.max(...children.map((child) => child.rect.x)) - Math.min(...children.map((child) => child.rect.x));
  const ySpread = Math.max(...children.map((child) => child.rect.y)) - Math.min(...children.map((child) => child.rect.y));
  return xSpread >= ySpread ? "x" : "y";
}

function hasConsistentSpacing(children, axis) {
  if (children.length < 2) {
    return true;
  }
  const sorted = [...children].sort((a, b) => a.rect[axis] - b.rect[axis]);
  const sizeKey = axis === "x" ? "width" : "height";
  const gaps = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    gaps.push(current.rect[axis] - (previous.rect[axis] + previous.rect[sizeKey]));
  }
  const first = gaps[0];
  return gaps.every((gap) => Math.abs(gap - first) <= 2);
}

function hasOverlappingChildren(children) {
  for (let left = 0; left < children.length; left += 1) {
    for (let right = left + 1; right < children.length; right += 1) {
      if (rectsOverlap(children[left].rect, children[right].rect)) {
        return true;
      }
    }
  }
  return false;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;
}

function findNode(node, sourceNodeId) {
  if (node.sourceNodeId === sourceNodeId) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findNode(child, sourceNodeId);
    if (found) {
      return found;
    }
  }
  return null;
}

function traverse(node, visit) {
  visit(node);
  for (const child of node.children ?? []) {
    traverse(child, visit);
  }
}
