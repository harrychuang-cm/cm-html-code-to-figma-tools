const SEMANTIC_TAG_NAMES = {
  header: "Header",
  footer: "Footer",
  nav: "Navigation",
  aside: "Sidebar",
  main: "Main",
  section: "Section",
  article: "Article",
  form: "Form",
  button: "Button",
  table: "Table",
  thead: "Table Head",
  tbody: "Table Body",
  tr: "Table Row",
  ul: "List",
  ol: "List",
  li: "List Item",
  a: "Link",
  input: "Input",
  select: "Select",
  textarea: "Text Area",
  label: "Label",
  h1: "Heading",
  h2: "Heading",
  h3: "Heading",
  h4: "Heading",
  h5: "Heading",
  h6: "Heading",
  dialog: "Modal",
  figure: "Figure",
  img: "Image",
  video: "Video"
};

const ARIA_ROLE_NAMES = {
  banner: "Header",
  navigation: "Navigation",
  contentinfo: "Footer",
  complementary: "Sidebar",
  main: "Main",
  search: "Search",
  form: "Form",
  region: "Section",
  button: "Button",
  tab: "Tab",
  tablist: "Tab List",
  dialog: "Modal",
  menu: "Menu",
  menuitem: "Menu Item",
  menubar: "Menu Bar",
  listbox: "List",
  list: "List",
  listitem: "List Item",
  checkbox: "Checkbox",
  radio: "Radio",
  switch: "Switch",
  textbox: "Input",
  toolbar: "Toolbar",
  tooltip: "Tooltip",
  alert: "Alert",
  progressbar: "Progress Bar"
};

const CLASS_TOKEN_NAMES = {
  btn: "Button",
  button: "Button",
  card: "Card",
  nav: "Navigation",
  navbar: "Navigation",
  menu: "Navigation",
  modal: "Modal",
  dialog: "Modal",
  popup: "Modal",
  badge: "Badge",
  tag: "Badge",
  chip: "Badge",
  avatar: "Avatar",
  icon: "Icon",
  header: "Header",
  footer: "Footer",
  sidebar: "Sidebar",
  aside: "Sidebar",
  tab: "Tab",
  tooltip: "Tooltip",
  banner: "Hero",
  hero: "Hero",
  form: "Form",
  search: "Search",
  list: "List",
  item: "List Item",
  title: "Heading",
  heading: "Heading",
  logo: "Logo"
};

const LABEL_SUFFIX_NAMES = new Set([
  "Button",
  "Tab",
  "Link",
  "Heading",
  "Menu Item"
]);

const MAX_NAME_SUFFIX_LENGTH = 32;
const EDGE_SNAP_TOLERANCE = 2;
const HEADER_FOOTER_MIN_WIDTH_RATIO = 0.9;
const HEADER_FOOTER_MAX_HEIGHT_RATIO = 0.25;
const CARD_MIN_CORNER_RADIUS = 4;
const MIN_REPEATED_GROUP_SIZE = 2;

export function semanticNameForNode(node, context = {}) {
  try {
    return deriveSemanticName(node, context);
  } catch {
    return null;
  }
}

export function annotateRepeatedSiblingGroups(children, context = {}) {
  const overrides = new Map();
  try {
    collectRepeatedGroupOverrides(children, context, overrides);
  } catch {
    overrides.clear();
  }
  return overrides;
}

export function createSemanticNameMap(root, viewport) {
  const names = new Map();
  let repeatedGroupCount = 0;

  try {
    const context = { viewport: viewport ?? null };
    walkCaptureNodes(root, (node) => {
      const groupOverrides = annotateRepeatedSiblingGroups(node.children ?? [], context);
      repeatedGroupCount += countDistinctGroups(groupOverrides);
      for (const [sourceNodeId, name] of groupOverrides) {
        names.set(sourceNodeId, name);
      }
      if (!names.has(node.sourceNodeId)) {
        const name = semanticNameForNode(node, context);
        if (name) {
          names.set(node.sourceNodeId, name);
        }
      }
    });
  } catch {
    return { names: new Map(), repeatedGroupCount: 0 };
  }

  return { names, repeatedGroupCount };
}

function deriveSemanticName(node, context) {
  if (!node || node.nodeType === "pseudo" || node.nodeType === "text") {
    return null;
  }

  const tagName = normalizeKeyword(node.tagName);
  const tagBaseName = SEMANTIC_TAG_NAMES[tagName];
  if (tagBaseName) {
    return withLabelSuffix(tagBaseName, node);
  }

  const role = normalizeKeyword(node.attributes?.role);
  const roleBaseName = ARIA_ROLE_NAMES[role];
  if (roleBaseName) {
    return withLabelSuffix(roleBaseName, node);
  }

  const heuristicName = geometricHeuristicName(node, context.viewport);
  if (heuristicName) {
    return heuristicName;
  }

  const tokenBaseName = classTokenName(node.attributes?.class);
  if (tokenBaseName) {
    return withLabelSuffix(tokenBaseName, node);
  }

  return null;
}

function withLabelSuffix(baseName, node) {
  if (baseName === "Image" || baseName === "Video") {
    const alt = normalizeLabel(node.attributes?.alt ?? node.attributes?.["aria-label"]);
    return alt ? `${baseName} / ${alt}` : baseName;
  }
  if (baseName === "Input" || baseName === "Select" || baseName === "Text Area") {
    const placeholder = normalizeLabel(node.attributes?.placeholder);
    return placeholder ? `${baseName} / ${placeholder}` : baseName;
  }
  if (!LABEL_SUFFIX_NAMES.has(baseName)) {
    return baseName;
  }
  const label = normalizeLabel(node.attributes?.["aria-label"]) || singleLineSubtreeText(node);
  return label ? `${baseName} / ${label}` : baseName;
}

function normalizeLabel(value) {
  const label = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!label || label.includes("\n")) {
    return "";
  }
  return label.slice(0, MAX_NAME_SUFFIX_LENGTH);
}

function singleLineSubtreeText(node, depth = 0) {
  if (!node || depth > 4) {
    return "";
  }
  const direct = String(node.textContent ?? "").trim();
  if (direct) {
    return direct.includes("\n") ? "" : direct.slice(0, MAX_NAME_SUFFIX_LENGTH);
  }
  for (const child of node.children ?? []) {
    if (child.nodeType === "pseudo") {
      continue;
    }
    const text = singleLineSubtreeText(child, depth + 1);
    if (text) {
      return text;
    }
  }
  return "";
}

function geometricHeuristicName(node, viewport) {
  const rect = node.rect;
  if (!rect || (node.children ?? []).length === 0) {
    return null;
  }

  if (viewport && viewport.width > 0 && viewport.height > 0) {
    const wideEnough = rect.width >= viewport.width * HEADER_FOOTER_MIN_WIDTH_RATIO;
    const shortEnough = rect.height > 0 && rect.height <= viewport.height * HEADER_FOOTER_MAX_HEIGHT_RATIO;
    if (wideEnough && shortEnough && rect.y <= EDGE_SNAP_TOLERANCE) {
      return "Header";
    }
    if (wideEnough && shortEnough && rect.y + rect.height >= viewport.height - EDGE_SNAP_TOLERANCE) {
      return "Footer";
    }
  }

  if (
    visibleColor(node.styles?.backgroundColor) &&
    (maxCornerRadius(node.styles) >= CARD_MIN_CORNER_RADIUS || visibleShadow(node.styles?.boxShadow)) &&
    countRenderableChildren(node) >= 2
  ) {
    return "Card";
  }

  return null;
}

function classTokenName(className) {
  for (const token of classTokens(className)) {
    const name = CLASS_TOKEN_NAMES[token];
    if (name) {
      return name;
    }
  }
  return null;
}

function classTokens(className) {
  return String(className ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function collectRepeatedGroupOverrides(children, context, overrides) {
  const groups = new Map();
  for (const child of children ?? []) {
    if (!child || child.nodeType !== "element" || !child.sourceNodeId) {
      continue;
    }
    const signature = structuralSignature(child);
    if (!groups.has(signature)) {
      groups.set(signature, []);
    }
    groups.get(signature).push(child);
  }

  for (const members of groups.values()) {
    if (members.length < MIN_REPEATED_GROUP_SIZE) {
      continue;
    }
    const baseName = groupBaseName(members[0], context);
    if (!baseName) {
      continue;
    }
    const ordered = [...members].sort(byVisualOrder);
    ordered.forEach((member, index) => {
      overrides.set(member.sourceNodeId, `${baseName} ${index + 1}`);
    });
  }
}

function groupBaseName(node, context) {
  const name = semanticNameForNode(node, context);
  if (!name) {
    return null;
  }
  return name.split(" / ")[0];
}

function structuralSignature(node) {
  const tokens = [...new Set(classTokens(node.attributes?.class))].sort().join(".");
  const childTags = (node.children ?? [])
    .filter((child) => child.nodeType === "element")
    .map((child) => normalizeKeyword(child.tagName))
    .join(",");
  return `${normalizeKeyword(node.tagName)}|${tokens}|${childTags}`;
}

function byVisualOrder(a, b) {
  const ay = a.rect?.y ?? 0;
  const by = b.rect?.y ?? 0;
  if (Math.abs(ay - by) > 1) {
    return ay - by;
  }
  return (a.rect?.x ?? 0) - (b.rect?.x ?? 0);
}

function countDistinctGroups(overrides) {
  const baseNames = new Set();
  for (const name of overrides.values()) {
    baseNames.add(name.replace(/ \d+$/, ""));
  }
  return baseNames.size;
}

function countRenderableChildren(node) {
  return (node.children ?? []).filter((child) =>
    child.textContent ||
    child.assetRef ||
    child.fallbackRef ||
    (child.children ?? []).length > 0 ||
    visibleColor(child.styles?.backgroundColor)
  ).length;
}

function walkCaptureNodes(node, visit) {
  if (!node) {
    return;
  }
  visit(node);
  for (const child of node.children ?? []) {
    walkCaptureNodes(child, visit);
  }
}

function maxCornerRadius(styles = {}) {
  return Math.max(
    parseCssNumber(styles.borderTopLeftRadius),
    parseCssNumber(styles.borderTopRightRadius),
    parseCssNumber(styles.borderBottomRightRadius),
    parseCssNumber(styles.borderBottomLeftRadius)
  );
}

function normalizeKeyword(value) {
  return String(value ?? "").trim().toLowerCase();
}

function parseCssNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function visibleColor(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value !== "transparent" &&
    value !== "rgba(0, 0, 0, 0)";
}

function visibleShadow(value) {
  return typeof value === "string" && value.length > 0 && value !== "none";
}
