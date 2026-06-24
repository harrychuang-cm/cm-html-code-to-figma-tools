import { materialIconAssetSourceForNode } from "@figma-capture/capture-schema";

export function isIconFontAssetNode(node) {
  return Boolean(node?.assetRef && node?.attributes?.assetRole === "icon-font");
}

export function iconFontImageAssetForNode(node) {
  if (isIconFontAssetNode(node)) {
    return {
      assetRef: node.assetRef,
      assetKind: "svg",
      assetRole: "icon-font",
      bytes: null,
      iconFontLigature: node.attributes?.iconFontLigature ?? ""
    };
  }
  if (node?.assetRef) {
    return null;
  }
  const source = materialIconAssetSourceForNode(node);
  if (!source) {
    return null;
  }
  return {
    assetRef: syntheticIconFontAssetRef(node, source.iconFontLigature),
    assetKind: source.assetKind,
    assetRole: source.assetRole,
    bytes: source.bytes,
    iconFontLigature: source.iconFontLigature
  };
}

function syntheticIconFontAssetRef(node, ligature) {
  const sourceId = String(node?.sourceNodeId ?? node?.id ?? ligature ?? "icon")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "icon";
  return `assets/icon-font-legacy-${sourceId}.svg`;
}
