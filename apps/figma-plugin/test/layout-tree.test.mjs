import assert from "node:assert/strict";
import test from "node:test";
import { createValidPackage } from "../../../packages/capture-schema/fixtures/valid-package.mjs";
import {
  createEditableLayoutNodeModels,
  summarizeAutoLayoutModels
} from "../dist/layout-tree.js";

function node(sourceNodeId, tagName, rect, options = {}) {
  return {
    id: sourceNodeId,
    sourceNodeId,
    nodeType: options.nodeType ?? "element",
    tagName,
    textContent: options.textContent ?? "",
    rect,
    styles: options.styles ?? {},
    attributes: options.attributes ?? {},
    ...(options.assetRef ? { assetRef: options.assetRef } : {}),
    ...(options.fallbackRef ? { fallbackRef: options.fallbackRef } : {}),
    children: options.children ?? []
  };
}

function text(sourceNodeId, textContent, rect, styles = {}) {
  return node(sourceNodeId, "#text", rect, {
    nodeType: "text",
    textContent,
    styles: {
      fontSize: "14px",
      color: "rgb(17, 24, 39)",
      ...styles
    }
  });
}

function packageWithRoot(root) {
  const base = createValidPackage();
  return {
    ...base,
    capture: {
      ...base.capture,
      root
    },
    diagnostics: {
      ...base.diagnostics,
      fallbackReasons: []
    }
  };
}

test("layout tree preserves parent-child hierarchy and parent-relative geometry", () => {
  const nav = node("dom-nav", "nav", { x: 100, y: 20, width: 300, height: 40 }, {
    styles: { display: "flex", flexDirection: "row", gap: "16px" },
    children: [
      text("dom-a", "討論", { x: 112, y: 30, width: 32, height: 20 }),
      text("dom-b", "台股", { x: 160, y: 30, width: 32, height: 20 })
    ]
  });
  const models = createEditableLayoutNodeModels(packageWithRoot(nav));
  const navModel = models[0];

  assert.equal(navModel.type, "FRAME");
  assert.equal(navModel.sourceNodeId, "dom-nav");
  assert.deepEqual(navModel.rect, { x: 100, y: 20, width: 300, height: 40 });
  assert.equal(navModel.children.length, 2);
  assert.deepEqual(navModel.children[0].rect, { x: 12, y: 10, width: 32, height: 20 });
  assert.deepEqual(navModel.children[1].rect, { x: 60, y: 10, width: 32, height: 20 });
});

test("horizontal flex row receives auto layout with explicit gap and inferred padding", () => {
  const toolbar = node("dom-toolbar", "div", { x: 100, y: 20, width: 240, height: 48 }, {
    styles: { display: "flex", flexDirection: "row", gap: "16px" },
    children: [
      text("dom-a", "A", { x: 112, y: 32, width: 40, height: 20 }),
      text("dom-b", "B", { x: 168, y: 32, width: 40, height: 20 }),
      text("dom-c", "C", { x: 224, y: 32, width: 40, height: 20 })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(toolbar))[0];

  assert.equal(model.autoLayout.applied, true);
  assert.equal(model.autoLayout.layoutMode, "HORIZONTAL");
  assert.equal(model.autoLayout.itemSpacing, 16);
  assert.equal(model.autoLayout.paddingLeft, 12);
  assert.equal(model.autoLayout.paddingTop, 12);
  assert.equal(model.autoLayout.paddingRight, 76);
  assert.equal(model.autoLayout.paddingBottom, 16);
});

test("space-between flex column preserves inferred padding", () => {
  const panel = node("dom-chart-aside", "div", { x: 1090, y: 101, width: 300, height: 240 }, {
    styles: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between"
    },
    children: [
      node("dom-chart-summary", "section", { x: 1106, y: 117, width: 268, height: 60 }, {
        children: [
          text("dom-chart-title", "加權指數", { x: 1106, y: 117, width: 64, height: 20 })
        ]
      }),
      node("dom-chart", "div", { x: 1106, y: 177, width: 268, height: 148 }, {
        children: [
          node("dom-canvas-fallback", "canvas", { x: 1106, y: 181, width: 268, height: 144 }, {
            fallbackRef: "assets/fallback-chart.png"
          })
        ]
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(panel))[0];

  assert.equal(model.autoLayout.applied, true);
  assert.equal(model.autoLayout.layoutMode, "VERTICAL");
  assert.equal(model.autoLayout.primaryAxisAlignItems, "SPACE_BETWEEN");
  assert.equal(model.autoLayout.paddingLeft, 16);
  assert.equal(model.autoLayout.paddingRight, 16);
  assert.equal(model.autoLayout.paddingTop, 16);
  assert.equal(model.autoLayout.paddingBottom, 16);
});

test("explicit CSS padding overrides geometry inference", () => {
  const toolbar = node("dom-padded-toolbar", "div", { x: 0, y: 0, width: 320, height: 48 }, {
    styles: {
      display: "flex",
      flexDirection: "row",
      justifyContent: "center",
      paddingLeft: "16px",
      paddingRight: "16px",
      paddingTop: "8px",
      paddingBottom: "8px"
    },
    children: [
      text("dom-a", "A", { x: 112, y: 14, width: 40, height: 20 }),
      text("dom-b", "B", { x: 168, y: 14, width: 40, height: 20 })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(toolbar))[0];

  assert.equal(model.autoLayout.applied, true);
  assert.equal(model.autoLayout.primaryAxisAlignItems, "CENTER");
  assert.equal(model.autoLayout.paddingLeft, 16);
  assert.equal(model.autoLayout.paddingRight, 16);
  assert.equal(model.autoLayout.paddingTop, 8);
  assert.equal(model.autoLayout.paddingBottom, 8);
});

test("row-reverse flex preserves browser visual child order", () => {
  const actionRow = node("dom-action-row", "div", { x: 0, y: 0, width: 696, height: 38 }, {
    styles: {
      display: "flex",
      flexDirection: "row-reverse"
    },
    children: [
      text("dom-tip", "打賞", { x: 534, y: 0, width: 162, height: 38 }),
      text("dom-share", "分享", { x: 356, y: 0, width: 162, height: 38 }),
      text("dom-comment", "留言", { x: 178, y: 0, width: 162, height: 38 }),
      text("dom-like", "讚", { x: 0, y: 0, width: 162, height: 38 })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(actionRow))[0];

  assert.equal(model.autoLayout.applied, true);
  assert.equal(model.autoLayout.layoutMode, "HORIZONTAL");
  assert.equal(model.autoLayout.reversedChildren, true);
  assert.deepEqual(model.children.map((child) => child.text), ["讚", "留言", "分享", "打賞"]);
});

test("non-auto-layout siblings use numeric CSS z-index for Figma layer stacking order", () => {
  const stack = node("dom-stack", "div", { x: 0, y: 0, width: 120, height: 40 }, {
    styles: { display: "block" },
    children: [
      text("dom-front", "Front", { x: 0, y: 0, width: 48, height: 20 }, { zIndex: "10" }),
      text("dom-middle", "Middle", { x: 0, y: 0, width: 56, height: 20 }),
      text("dom-back", "Back", { x: 0, y: 0, width: 40, height: 20 }, { zIndex: "-1" })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(stack))[0];

  assert.equal(model.autoLayout, null);
  assert.deepEqual(model.children.map((child) => child.sourceNodeId), ["dom-back", "dom-middle", "dom-front"]);
  assert.equal(model.children[0].cssZIndex, "-1");
  assert.equal(model.children[2].cssZIndex, "10");
});

test("auto-layout siblings keep flow order even when they carry CSS z-index metadata", () => {
  const toolbar = node("dom-toolbar-z", "div", { x: 0, y: 0, width: 160, height: 40 }, {
    styles: { display: "flex", flexDirection: "row", gap: "16px" },
    children: [
      text("dom-a", "A", { x: 8, y: 10, width: 40, height: 20 }, { zIndex: "10" }),
      text("dom-b", "B", { x: 64, y: 10, width: 40, height: 20 }, { zIndex: "1" })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(toolbar))[0];

  assert.equal(model.autoLayout.applied, true);
  assert.deepEqual(model.children.map((child) => child.sourceNodeId), ["dom-a", "dom-b"]);
  assert.equal(model.children[0].cssZIndex, "10");
  assert.equal(model.children[1].cssZIndex, "1");
});

test("non-uniform implicit flex spacing remains absolute instead of using a single large gap", () => {
  const responseRow = node("dom-response-row", "div", { x: 366, y: 931, width: 696, height: 20.1 }, {
    styles: {
      display: "flex",
      flexDirection: "row",
      gap: "normal",
      justifyContent: "normal"
    },
    children: [
      text("dom-response-like", "313", { x: 366, y: 931, width: 52.16, height: 20.1 }),
      text("dom-response-worth", "50P", { x: 426.16, y: 931, width: 51.83, height: 20.1 }),
      text("dom-response-comments", "82則留言", { x: 999, y: 931, width: 63, height: 20.1 })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(responseRow))[0];

  assert.equal(model.autoLayout.applied, false);
  assert.equal(model.autoLayout.skippedReason, "non-uniform-spacing");
  assert.deepEqual(model.children.map((child) => child.rect.x), [0, 60.16, 633]);
});

test("mixed direct text and SVG children preserve all inline content", () => {
  const link = node("dom-checkout-link", "a", { x: 100, y: 6, width: 40, height: 16 }, {
    textContent: "結帳",
    styles: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      fontSize: "12px",
      lineHeight: "16px"
    },
    children: [
      node("dom-cart-svg", "svg", { x: 100, y: 6, width: 16, height: 16 }, {
        attributes: { assetKind: "svg", svgMarkup: "<svg />" },
        assetRef: "assets/cart.svg"
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(link))[0];
  const [icon, label] = model.children;

  assert.equal(model.type, "FRAME");
  assert.equal(model.autoLayout.applied, true);
  assert.equal(model.autoLayout.layoutMode, "HORIZONTAL");
  assert.equal(icon.type, "IMAGE");
  assert.equal(icon.assetKind, "svg");
  assert.equal(label.type, "TEXT");
  assert.equal(label.text, "結帳");
  assert.equal(label.sourceNodeId, "dom-checkout-link::text");
  assert.deepEqual(label.rect, { x: 16, y: 0, width: 24, height: 16 });
});

test("mixed direct text between SVG and child text keeps visual order", () => {
  const link = node("dom-points-link", "a", { x: 0, y: 0, width: 50.08, height: 16 }, {
    textContent: "P點:",
    styles: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      fontSize: "12px",
      lineHeight: "16px"
    },
    children: [
      node("dom-points-svg", "svg", { x: 0, y: 0, width: 16, height: 16 }, {
        attributes: { assetKind: "svg", svgMarkup: "<svg />" },
        assetRef: "assets/points.svg"
      }),
      text("dom-points-count", "4", { x: 42.88, y: 0, width: 7.2, height: 16 }, {
        fontSize: "12px",
        lineHeight: "16px"
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(link))[0];
  const [icon, label, count] = model.children;

  assert.equal(model.type, "FRAME");
  assert.equal(model.autoLayout.applied, true);
  assert.equal(icon.type, "IMAGE");
  assert.equal(label.type, "TEXT");
  assert.equal(label.text, "P點:");
  assert(label.rect.x > 19 && label.rect.x < 21);
  assert(label.rect.width > 22 && label.rect.width < 23);
  assert.equal(count.type, "TEXT");
  assert.equal(count.text, "4");
});

test("mixed direct text keeps after pseudo icon after the label", () => {
  const label = node("dom-creator-label", "div", { x: 100, y: 20, width: 120, height: 28 }, {
    textContent: "創作者計畫",
    styles: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      fontSize: "16px",
      lineHeight: "28px"
    },
    children: [
      node("dom-creator-label-after", "::after", { x: 100, y: 26, width: 16, height: 16 }, {
        nodeType: "pseudo",
        assetRef: "assets/check.svg",
        attributes: { "data-pseudo": "::after", assetKind: "svg" },
        styles: {
          display: "inline-block",
          backgroundImage: "url(data:image/svg+xml,%3Csvg%2F%3E)"
        }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(label))[0];
  const [textLabel, checkIcon] = model.children;

  assert.equal(model.type, "FRAME");
  assert.equal(textLabel.type, "TEXT");
  assert.equal(textLabel.text, "創作者計畫");
  assert.equal(checkIcon.type, "IMAGE");
  assert.equal(checkIcon.pseudoType, "::after");
});

test("mixed direct text keeps textual before pseudo before the label", () => {
  const button = node("dom-readmore-button", "button", { x: 500, y: 54, width: 96, height: 27 }, {
    textContent: "閱讀更多",
    styles: {
      display: "inline-flex",
      flexDirection: "row",
      alignItems: "center",
      backgroundImage: "linear-gradient(to right, rgba(255, 255, 255, 0), rgb(255, 255, 255))",
      fontSize: "18px",
      lineHeight: "27px",
      color: "rgb(194, 41, 46)"
    },
    children: [
      node("dom-readmore-button-before", "::before", { x: 500, y: 54, width: 30, height: 27 }, {
        nodeType: "pseudo",
        textContent: "...",
        styles: {
          content: "\"...\"",
          display: "inline",
          fontSize: "18px",
          lineHeight: "27px",
          color: "rgb(54, 54, 54)"
        },
        attributes: { "data-pseudo": "::before" }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(button))[0];
  const [ellipsis, label] = model.children;

  assert.equal(model.type, "FRAME");
  assert.deepEqual(model.style.fills, [
    "linear-gradient(to right, rgba(255, 255, 255, 0), rgb(255, 255, 255))"
  ]);
  assert.equal(ellipsis.type, "TEXT");
  assert.equal(ellipsis.text, "...");
  assert.equal(ellipsis.pseudoType, "::before");
  assert.equal(label.type, "TEXT");
  assert.equal(label.text, "閱讀更多");
});

test("linear-gradient background imports as a visible fill", () => {
  const fade = node("dom-carousel-fade", "div", { x: 672, y: 234, width: 56, height: 330 }, {
    styles: {
      backgroundColor: "rgba(0, 0, 0, 0)",
      backgroundImage: "linear-gradient(to right, rgba(255, 255, 255, 0), rgb(255, 255, 255))"
    }
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(fade))[0];

  assert.equal(model.type, "RECTANGLE");
  assert.deepEqual(model.style.fills, [
    "linear-gradient(to right, rgba(255, 255, 255, 0), rgb(255, 255, 255))"
  ]);
});

test("visible pseudo-element decoration imports as a rectangle child", () => {
  const tab = node("dom-tab-active", "div", { x: 100, y: 20, width: 64, height: 60 }, {
    attributes: { class: "nav__cate nav__item--active" },
    children: [
      text("dom-tab-label", "討論", { x: 116, y: 38, width: 32, height: 24 }, {
        fontSize: "16px",
        lineHeight: "24px"
      }),
      node("dom-tab-active-after", "::after", { x: 116, y: 78, width: 32, height: 2 }, {
        nodeType: "pseudo",
        styles: {
          content: "\"\"",
          display: "block",
          position: "absolute",
          backgroundColor: "rgb(194, 41, 46)"
        },
        attributes: { "data-pseudo": "::after" }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(tab))[0];
  const [label, underline] = model.children;

  assert.equal(model.type, "FRAME");
  assert.equal(label.type, "TEXT");
  assert.equal(label.text, "討論");
  assert.equal(underline.type, "RECTANGLE");
  assert.equal(underline.sourceNodeId, "dom-tab-active-after");
  assert.deepEqual(underline.rect, { x: 16, y: 58, width: 32, height: 2 });
  assert.deepEqual(underline.style.fills, ["rgb(194, 41, 46)"]);
});

test("absolute pseudo-element decoration keeps parent out of auto layout flow", () => {
  const tab = node("dom-flex-active-tab", "div", { x: 100, y: 20, width: 64, height: 60 }, {
    styles: { display: "flex", alignItems: "center", justifyContent: "center" },
    children: [
      text("dom-flex-active-tab-label", "討論", { x: 116, y: 38, width: 32, height: 24 }, {
        fontSize: "16px",
        lineHeight: "24px"
      }),
      node("dom-flex-active-tab-after", "::after", { x: 116, y: 78, width: 32, height: 2 }, {
        nodeType: "pseudo",
        styles: {
          content: "\"\"",
          display: "block",
          position: "absolute",
          backgroundColor: "rgb(194, 41, 46)"
        },
        attributes: { "data-pseudo": "::after" }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(tab))[0];

  assert.equal(model.autoLayout.applied, false);
  assert.equal(model.autoLayout.skippedReason, "absolute-position-child");
  assert.deepEqual(model.children.map((child) => child.rect), [
    { x: 16, y: 18, width: 32, height: 24 },
    { x: 16, y: 58, width: 32, height: 2 }
  ]);
});

test("column-reverse flex preserves browser visual child order", () => {
  const stack = node("dom-stack", "div", { x: 0, y: 0, width: 120, height: 120 }, {
    styles: {
      display: "flex",
      flexDirection: "column-reverse"
    },
    children: [
      text("dom-bottom", "Bottom", { x: 0, y: 80, width: 120, height: 40 }),
      text("dom-middle", "Middle", { x: 0, y: 40, width: 120, height: 40 }),
      text("dom-top", "Top", { x: 0, y: 0, width: 120, height: 40 })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(stack))[0];

  assert.equal(model.autoLayout.applied, true);
  assert.equal(model.autoLayout.layoutMode, "VERTICAL");
  assert.equal(model.autoLayout.reversedChildren, true);
  assert.deepEqual(model.children.map((child) => child.text), ["Top", "Middle", "Bottom"]);
});

test("flex alignment maps to figma auto layout axis alignment", () => {
  const topMenu = node("dom-top-menu", "ul", { x: 92.91, y: 0, width: 833.68, height: 28 }, {
    styles: {
      display: "flex",
      flexDirection: "row",
      gap: "16px",
      alignItems: "center"
    },
    children: [
      text("dom-label", "理財寶商城", { x: 92.91, y: 0, width: 60, height: 20 }, {
        fontSize: "12px",
        lineHeight: "20px"
      }),
      node("dom-chevron", "svg", { x: 156.91, y: 0, width: 12, height: 12 }, {
        attributes: { svgMarkup: "<svg />" },
        assetRef: "assets/vector.svg"
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(topMenu))[0];

  assert.equal(model.autoLayout.applied, true);
  assert.equal(model.autoLayout.layoutMode, "HORIZONTAL");
  assert.equal(model.autoLayout.counterAxisAlignItems, "CENTER");
  assert.equal(model.autoLayout.paddingTop, 0);
  assert.equal(model.autoLayout.paddingBottom, 0);
});

test("justify-content maps to figma primary axis alignment", () => {
  const centeredRow = node("dom-centered-row", "div", { x: 0, y: 0, width: 300, height: 40 }, {
    styles: {
      display: "flex",
      flexDirection: "row",
      justifyContent: "center"
    },
    children: [
      text("dom-a", "A", { x: 100, y: 10, width: 40, height: 20 }),
      text("dom-b", "B", { x: 150, y: 10, width: 40, height: 20 })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(centeredRow))[0];

  assert.equal(model.autoLayout.applied, true);
  assert.equal(model.autoLayout.primaryAxisAlignItems, "CENTER");
  assert.equal(model.autoLayout.paddingLeft, 0);
  assert.equal(model.autoLayout.paddingRight, 0);
});

test("single-child line-height text container maps vertical centering", () => {
  const item = node("dom-header-link-item", "li", { x: 100, y: 0, width: 84, height: 28 }, {
    styles: {
      display: "list-item",
      lineHeight: "28px"
    },
    children: [
      text("dom-header-link-text", "股市爆料同學會", { x: 100, y: 0, width: 84, height: 20 }, {
        fontSize: "12px",
        lineHeight: "20px",
        color: "rgb(255, 255, 255)"
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(item))[0];
  const label = model.children[0];

  assert.equal(model.autoLayout.applied, true);
  assert.equal(model.autoLayout.layoutMode, "HORIZONTAL");
  assert.equal(model.autoLayout.counterAxisAlignItems, "CENTER");
  assert.equal(model.autoLayout.paddingLeft, 0);
  assert.equal(model.autoLayout.paddingRight, 0);
  assert.equal(model.autoLayout.paddingTop, 0);
  assert.equal(model.autoLayout.paddingBottom, 0);
  assert.equal(label.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(label.layoutSizingHorizontal, "HUG");
  assert.equal(label.layoutSizingVertical, "HUG");
});

test("single-child flex alignment maps vertical centering", () => {
  const item = node("dom-single-flex", "a", { x: 0, y: 0, width: 80, height: 32 }, {
    styles: {
      display: "flex",
      alignItems: "center"
    },
    children: [
      text("dom-single-flex-text", "設定", { x: 12, y: 0, width: 28, height: 20 })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(item))[0];

  assert.equal(model.autoLayout.applied, true);
  assert.equal(model.autoLayout.layoutMode, "HORIZONTAL");
  assert.equal(model.autoLayout.counterAxisAlignItems, "CENTER");
  assert.equal(model.autoLayout.paddingLeft, 12);
  assert.equal(model.autoLayout.paddingTop, 0);
  assert.equal(model.autoLayout.paddingBottom, 0);
});

test("single-child flex menu item maps vertical centering when child line box equals parent height", () => {
  const item = node("dom-header-link-no-arrow", "li", { x: 184.91, y: 0, width: 84, height: 28 }, {
    styles: {
      display: "flex",
      alignItems: "center",
      height: "28px"
    },
    children: [
      text("dom-header-link-no-arrow-text", "股市爆料同學會", { x: 184.91, y: 0, width: 84, height: 28 }, {
        fontSize: "12px",
        lineHeight: "20px",
        color: "rgb(255, 255, 255)"
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(item))[0];

  assert.equal(model.autoLayout.applied, true);
  assert.equal(model.autoLayout.layoutMode, "HORIZONTAL");
  assert.equal(model.autoLayout.counterAxisAlignItems, "CENTER");
  assert.equal(model.autoLayout.paddingLeft, 0);
  assert.equal(model.autoLayout.paddingRight, 0);
  assert.equal(model.autoLayout.paddingTop, 0);
  assert.equal(model.autoLayout.paddingBottom, 0);
});

test("line-height-only one-child containers still require a shorter child line box", () => {
  const item = node("dom-equal-line-height-only", "li", { x: 100, y: 0, width: 84, height: 28 }, {
    styles: {
      display: "block",
      lineHeight: "16px"
    },
    children: [
      text("dom-equal-line-height-only-text", "股市爆料同學會", { x: 100, y: 0, width: 84, height: 28 }, {
        fontSize: "12px",
        lineHeight: "20px"
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(item))[0];

  assert.equal(model.autoLayout, null);
});

test("one-child containers without alignment evidence remain absolute", () => {
  const item = node("dom-plain-wrapper", "div", { x: 0, y: 0, width: 120, height: 40 }, {
    styles: {
      display: "flex"
    },
    children: [
      text("dom-plain-text", "Plain", { x: 8, y: 8, width: 40, height: 20 })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(item))[0];

  assert.equal(model.autoLayout.applied, false);
  assert.equal(model.autoLayout.skippedReason, "one-child-container");
});

test("vertical flex column receives auto layout with measured gap fallback", () => {
  const list = node("dom-list", "ul", { x: 40, y: 80, width: 180, height: 136 }, {
    styles: { display: "flex", flexDirection: "column", rowGap: "normal" },
    children: [
      text("dom-a", "A", { x: 56, y: 92, width: 80, height: 24 }),
      text("dom-b", "B", { x: 56, y: 128, width: 80, height: 24 }),
      text("dom-c", "C", { x: 56, y: 164, width: 80, height: 24 })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(list))[0];

  assert.equal(model.autoLayout.applied, true);
  assert.equal(model.autoLayout.layoutMode, "VERTICAL");
  assert.equal(model.autoLayout.itemSpacing, 12);
});

test("risky flex containers are nested but skipped for auto layout", () => {
  const root = node("dom-root", "main", { x: 0, y: 0, width: 500, height: 400 }, {
    children: [
      node("dom-overlap", "div", { x: 0, y: 0, width: 200, height: 60 }, {
        styles: { display: "flex", flexDirection: "row" },
        children: [
          text("dom-overlap-a", "A", { x: 10, y: 10, width: 80, height: 20 }),
          text("dom-overlap-b", "B", { x: 50, y: 10, width: 80, height: 20 })
        ]
      }),
      node("dom-fixed", "div", { x: 0, y: 80, width: 200, height: 60 }, {
        styles: { display: "flex", position: "fixed" },
        children: [
          text("dom-fixed-a", "A", { x: 10, y: 90, width: 40, height: 20 }),
          text("dom-fixed-b", "B", { x: 60, y: 90, width: 40, height: 20 })
        ]
      })
    ]
  });
  const models = createEditableLayoutNodeModels(packageWithRoot(root));
  const summary = summarizeAutoLayoutModels(models);

  assert.equal(summary.appliedCount, 0);
  assert.equal(summary.skippedCount, 2);
  assert.deepEqual(summary.skippedReasons.map((item) => item.reason).sort(), [
    "fixed-or-sticky-layout",
    "overlapping-layout"
  ]);
});

test("out-of-bounds and nonvisual wrapper children skip auto layout", () => {
  const menuItem = node("dom-menu-item", "div", { x: 100, y: 100, width: 140, height: 24 }, {
    styles: { display: "flex", flexDirection: "row" },
    children: [
      node("dom-icon", "span", { x: 100, y: 102, width: 20, height: 20 }, {
        styles: { backgroundColor: "rgb(17, 24, 39)" }
      }),
      node("dom-label-wrapper", "div", { x: -78, y: -95, width: 1, height: 1 }, {
        children: [
          text("dom-label", "我的通知", { x: 128, y: 100, width: 64, height: 24 })
        ]
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(menuItem))[0];
  const summary = summarizeAutoLayoutModels([model]);

  assert.equal(model.autoLayout.applied, false);
  assert.equal(model.autoLayout.skippedReason, "out-of-bounds-child");
  assert.equal(summary.skippedCount, 1);
  assert.deepEqual(summary.skippedReasons, [
    { sourceNodeId: "dom-menu-item", reason: "out-of-bounds-child" }
  ]);
});

test("text nodes with visible backgrounds create visual backing frames", () => {
  const badge = text("dom-price", "48.35", { x: 16, y: 26, width: 47, height: 24 }, {
    backgroundColor: "rgb(0, 131, 83)",
    borderTopLeftRadius: "2px"
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(badge))[0];

  assert.equal(model.type, "FRAME");
  assert.equal(model.name, "Text Background / 48.35");
  assert.deepEqual(model.rect, { x: 16, y: 26, width: 47, height: 24 });
  assert.equal(model.children.length, 1);
  assert.equal(model.children[0].type, "TEXT");
  assert.deepEqual(model.children[0].rect, { x: 0, y: 0, width: 47, height: 24 });
  assert.equal(model.style.fills[0], "rgb(0, 131, 83)");
});

test("visible borders and outlines become editable stroke styles", () => {
  const outlineButton = node("dom-outline-button", "button", { x: 24, y: 32, width: 120, height: 36 }, {
    styles: {
      display: "inline-flex",
      backgroundColor: "rgba(0, 0, 0, 0)",
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: "rgb(31, 95, 191)"
    },
    children: [
      text("dom-outline-button-text", "取消", { x: 64, y: 40, width: 32, height: 20 })
    ]
  });
  const bottomBorder = node("dom-bottom-border", "div", { x: 24, y: 88, width: 120, height: 1 }, {
    styles: {
      borderBottomWidth: "1px",
      borderBottomStyle: "solid",
      borderBottomColor: "rgb(194, 41, 46)"
    }
  });
  const root = node("dom-root", "main", { x: 0, y: 0, width: 200, height: 140 }, {
    children: [outlineButton, bottomBorder]
  });
  const models = createEditableLayoutNodeModels(packageWithRoot(root))[0].children;

  assert.deepEqual(models[0].style.strokes, [{ color: "rgb(31, 95, 191)", width: 2 }]);
  assert.deepEqual(models[1].style.strokes, []);
  assert.equal(models[1].children[0].name, "Border / bottom");
  assert.deepEqual(models[1].children[0].rect, { x: 0, y: 0, width: 120, height: 1 });
  assert.equal(models[1].children[0].style.fills[0], "rgb(194, 41, 46)");
});

test("active tab bottom border imports as underline decoration instead of all-side stroke", () => {
  const activeTab = node("dom-active-tab", "li", { x: 366, y: 320, width: 32.07, height: 50 }, {
    styles: {
      borderBottomWidth: "2px",
      borderBottomStyle: "solid",
      borderBottomColor: "rgb(194, 41, 46)"
    },
    children: [
      node("dom-active-tab-link", "a", { x: 366, y: 320, width: 32.07, height: 48 }, {
        children: [
          text("dom-active-tab-text", "人氣", { x: 366, y: 332, width: 32.07, height: 24 }, {
            color: "rgb(194, 41, 46)",
            whiteSpace: "nowrap"
          })
        ]
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(activeTab))[0];
  const underline = model.children.find((child) => child.sourceNodeId === "dom-active-tab::border-bottom");

  assert.equal(model.type, "FRAME");
  assert.deepEqual(model.style.strokes, []);
  assert(underline);
  assert.equal(underline.type, "RECTANGLE");
  assert.deepEqual(underline.rect, { x: 0, y: 48, width: 32.07, height: 2 });
  assert.equal(underline.style.fills[0], "rgb(194, 41, 46)");
});

test("text backing frames with CSS padding become padded auto layout", () => {
  const badge = text("dom-mark", "讚", { x: 380, y: 904.6, width: 20, height: 20.5 }, {
    backgroundColor: "rgb(54, 54, 54)",
    color: "rgb(255, 255, 255)",
    fontSize: "12px",
    lineHeight: "normal",
    paddingTop: "2px",
    paddingRight: "4px",
    paddingBottom: "2px",
    paddingLeft: "4px",
    borderTopLeftRadius: "27px",
    borderTopRightRadius: "27px",
    borderBottomRightRadius: "27px",
    borderBottomLeftRadius: "27px"
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(badge))[0];
  const label = model.children[0];

  assert.equal(model.type, "FRAME");
  assert.equal(model.name, "Text Background / 讚");
  assert.equal(model.autoLayout.applied, true);
  assert.equal(model.autoLayout.layoutMode, "HORIZONTAL");
  assert.equal(model.autoLayout.primaryAxisAlignItems, "CENTER");
  assert.equal(model.autoLayout.counterAxisAlignItems, "CENTER");
  assert.equal(model.autoLayout.paddingLeft, 4);
  assert.equal(model.autoLayout.paddingRight, 4);
  assert.equal(model.autoLayout.paddingTop, 2);
  assert.equal(model.autoLayout.paddingBottom, 2);
  assert.equal(label.type, "TEXT");
  assert.equal(label.text, "讚");
  assert.equal(label.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(label.layoutSizingHorizontal, "HUG");
  assert.equal(label.layoutSizingVertical, "HUG");
  assert.deepEqual(label.rect, { x: 4, y: 2, width: 12, height: 16.5 });
});

test("multiline text backing frames preserve padding without centering paragraphs", () => {
  const note = text("dom-note", "第一行\n第二行", { x: 24, y: 32, width: 120, height: 56 }, {
    backgroundColor: "rgb(255, 255, 255)",
    borderTopWidth: "1px",
    borderTopColor: "rgb(229, 231, 235)",
    fontSize: "14px",
    lineHeight: "20px",
    paddingTop: "8px",
    paddingRight: "12px",
    paddingBottom: "8px",
    paddingLeft: "12px"
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(note))[0];
  const label = model.children[0];

  assert.equal(model.type, "FRAME");
  assert.equal(model.autoLayout.applied, true);
  assert.equal(model.autoLayout.primaryAxisAlignItems, "MIN");
  assert.equal(model.autoLayout.counterAxisAlignItems, "MIN");
  assert.equal(model.autoLayout.paddingLeft, 12);
  assert.equal(model.autoLayout.paddingTop, 8);
  assert.equal(label.textAutoResize, "HEIGHT");
  assert.equal(label.layoutSizingHorizontal, "FIXED");
  assert.deepEqual(label.rect, { x: 12, y: 8, width: 96, height: 40 });
});

test("transparent rounded button text stays auto width without visual backing", () => {
  const answerButton = text("dom-answer-count", "9則回答", { x: 1011, y: 884, width: 54, height: 20 }, {
    backgroundColor: "rgba(0, 0, 0, 0)",
    borderTopLeftRadius: "4px",
    borderTopRightRadius: "4px",
    borderBottomRightRadius: "4px",
    borderBottomLeftRadius: "4px",
    borderTopWidth: "0px",
    borderRightWidth: "0px",
    borderBottomWidth: "0px",
    borderLeftWidth: "0px",
    fontSize: "15px",
    lineHeight: "20.1px"
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(answerButton))[0];

  assert.equal(model.type, "TEXT");
  assert.equal(model.name, "Text / 9則回答");
  assert.equal(model.text, "9則回答");
  assert.equal(model.textAutoResize, "WIDTH_AND_HEIGHT");
});

test("mixed direct nav text keeps hug sizing when parent line box is tall", () => {
  const navLink = node("dom-etf-nav-link", "a", { x: 100, y: 20, width: 135.38, height: 48 }, {
    nodeType: "element",
    textContent: "熱門ETF排行榜",
    styles: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      fontSize: "18px",
      lineHeight: "27px",
      whiteSpace: "normal",
      color: "rgb(194, 41, 46)"
    },
    children: [
      node("dom-etf-nav-link-after", "::after", { x: 234.38, y: 44, width: 1, height: 20 }, {
        nodeType: "pseudo",
        styles: {
          position: "absolute",
          backgroundColor: "rgb(212, 212, 212)"
        },
        attributes: { "data-pseudo": "::after" }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(navLink))[0];
  const label = model.children.find((child) => child.sourceNodeId === "dom-etf-nav-link::text");

  assert(label);
  assert.equal(label.text, "熱門ETF排行榜");
  assert.deepEqual(label.rect, { x: 0, y: 10.5, width: 120.24, height: 27 });
  assert.equal(label.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(label.layoutSizingHorizontal, "HUG");
  assert.equal(label.layoutSizingVertical, "HUG");
});

test("mixed direct tab text respects parent padding and translated pseudo separators", () => {
  const navLink = node("dom-etf-region-link", "a", { x: 509.38, y: 367, width: 114.19, height: 48 }, {
    nodeType: "element",
    textContent: "依區域選股",
    styles: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      fontSize: "18px",
      lineHeight: "27px",
      whiteSpace: "normal",
      paddingLeft: "12px",
      paddingRight: "12px",
      color: "rgb(194, 41, 46)"
    },
    children: [
      node("dom-etf-region-link-after", "::after", { x: 622.56, y: 391, width: 1, height: 20 }, {
        nodeType: "pseudo",
        styles: {
          position: "absolute",
          backgroundColor: "rgb(212, 212, 212)",
          transform: "matrix(1, 0, 0, 1, 0, -10)"
        },
        attributes: { "data-pseudo": "::after" }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(navLink))[0];
  const label = model.children.find((child) => child.sourceNodeId === "dom-etf-region-link::text");
  const separator = model.children.find((child) => child.sourceNodeId === "dom-etf-region-link-after");

  assert(label);
  assert(separator);
  assert.deepEqual(label.rect, { x: 12, y: 10.5, width: 90, height: 27 });
  assert.equal(label.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(label.layoutSizingHorizontal, "HUG");
  assert.deepEqual(separator.rect, { x: 113.18, y: 14, width: 1, height: 20 });
});

test("single-line link labels keep hug sizing when parent line box is tall", () => {
  const root = node("dom-root", "main", { x: 0, y: 0, width: 360, height: 120 }, {
    children: [
      node("dom-about-etf-link", "a", { x: 24, y: 20, width: 81.27, height: 48 }, {
        nodeType: "element",
        textContent: "關於ETF",
        styles: {
          display: "flex",
          alignItems: "center",
          fontSize: "18px",
          lineHeight: "27px",
          whiteSpace: "normal",
          color: "rgb(194, 41, 46)"
        }
      }),
      node("dom-table-header", "th", { x: 132, y: 20, width: 138.5, height: 46 }, {
        nodeType: "element",
        textContent: "成交量",
        styles: {
          display: "table-cell",
          fontSize: "16px",
          lineHeight: "24px",
          whiteSpace: "normal",
          textAlign: "right",
          verticalAlign: "middle",
          color: "rgb(54, 54, 54)"
        }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(root))[0];
  const [linkLabel, tableHeader] = model.children;

  assert.equal(linkLabel.text, "關於ETF");
  assert.deepEqual(linkLabel.rect, { x: 24, y: 30.5, width: 81.27, height: 27 });
  assert.equal(linkLabel.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(linkLabel.layoutSizingHorizontal, "HUG");
  assert.equal(linkLabel.layoutSizingVertical, "HUG");
  assert.equal(tableHeader.type, "FRAME");
  assert.equal(tableHeader.name, "Table Cell / 成交量");
  assert.equal(tableHeader.autoLayout.layoutMode, "HORIZONTAL");
  assert.equal(tableHeader.autoLayout.primaryAxisAlignItems, "MAX");
  assert.equal(tableHeader.autoLayout.counterAxisAlignItems, "CENTER");
  assert.deepEqual(tableHeader.rect, { x: 132, y: 20, width: 138.5, height: 46 });
  assert.equal(tableHeader.children[0].text, "成交量");
  assert.equal(tableHeader.children[0].textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(tableHeader.children[0].layoutSizingHorizontal, "HUG");
  assert.equal(tableHeader.children[0].layoutSizingVertical, "HUG");
});

test("direct table-cell text imports as fixed cell with vertically centered editable text", () => {
  const row = node("dom-etf-row", "tr", { x: 367, y: 726, width: 830, height: 70.5 }, {
    styles: {
      display: "table-row"
    },
    children: [
      node("dom-etf-price", "td", { x: 542, y: 726, width: 138.5, height: 70.5 }, {
        nodeType: "element",
        textContent: "100.25",
        attributes: {
          class: "text-right"
        },
        styles: {
          display: "table-cell",
          fontSize: "16px",
          lineHeight: "16px",
          whiteSpace: "normal",
          verticalAlign: "middle",
          paddingTop: "3px",
          paddingRight: "12px",
          paddingBottom: "3px",
          paddingLeft: "12px",
          color: "rgb(38, 38, 38)"
        }
      }),
      node("dom-etf-change", "td", { x: 680.5, y: 726, width: 138.5, height: 70.5 }, {
        nodeType: "element",
        textContent: "-3.25",
        styles: {
          display: "table-cell",
          fontSize: "16px",
          lineHeight: "16px",
          whiteSpace: "normal",
          textAlign: "right",
          verticalAlign: "middle",
          paddingTop: "3px",
          paddingRight: "12px",
          paddingBottom: "3px",
          paddingLeft: "12px",
          color: "rgb(0, 163, 108)"
        }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(row))[0];
  const [priceCell, changeCell] = model.children;

  assert.equal(priceCell.type, "FRAME");
  assert.equal(priceCell.name, "Table Cell / 100.25");
  assert.deepEqual(priceCell.rect, { x: 175, y: 0, width: 138.5, height: 70.5 });
  assert.equal(priceCell.autoLayout.layoutMode, "HORIZONTAL");
  assert.equal(priceCell.autoLayout.primaryAxisAlignItems, "MAX");
  assert.equal(priceCell.autoLayout.counterAxisAlignItems, "CENTER");
  assert.equal(priceCell.autoLayout.paddingLeft, 12);
  assert.equal(priceCell.autoLayout.paddingRight, 12);
  assert.equal(priceCell.autoLayout.paddingTop, 3);
  assert.equal(priceCell.autoLayout.paddingBottom, 3);
  assert.equal(priceCell.children[0].type, "TEXT");
  assert.equal(priceCell.children[0].text, "100.25");
  assert.equal(priceCell.children[0].textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(priceCell.children[0].layoutSizingHorizontal, "HUG");
  assert.equal(priceCell.children[0].layoutSizingVertical, "HUG");
  assert.equal(changeCell.children[0].style.text.color, "rgb(0, 163, 108)");
});

test("tall single-line tab buttons center text geometry after hug normalization", () => {
  const rankTab = node("dom-rank-tab-popular", "button", { x: 366, y: 615, width: 61.41, height: 47 }, {
    nodeType: "element",
    textContent: "熱門ETF",
    styles: {
      display: "inline-block",
      fontSize: "16px",
      lineHeight: "24px",
      whiteSpace: "normal",
      color: "rgb(194, 41, 46)",
      backgroundColor: "rgba(0, 0, 0, 0)"
    }
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(rankTab))[0];

  assert.equal(model.type, "TEXT");
  assert.equal(model.text, "熱門ETF");
  assert.deepEqual(model.rect, { x: 366, y: 626.5, width: 61.41, height: 24 });
  assert.equal(model.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(model.layoutSizingHorizontal, "HUG");
  assert.equal(model.layoutSizingVertical, "HUG");
});

test("text resize mode uses auto width only for captured single-line text", () => {
  const root = node("dom-root", "main", { x: 0, y: 0, width: 500, height: 240 }, {
    children: [
      text("dom-user-name", "harry_chuang", { x: 60, y: 12, width: 108, height: 24 }, {
        fontSize: "16px",
        lineHeight: "24px"
      }),
      text("dom-topic", "費半狂瀉點燃賣壓，台股寫史上最大盤中跌點！", { x: 24, y: 52, width: 244, height: 40 }, {
        fontSize: "16px",
        lineHeight: "20px"
      }),
      text("dom-volume", "成交量\n          44,279 張", { x: 24, y: 108, width: 226, height: 42 }, {
        fontSize: "14px",
        lineHeight: "21px"
      }),
      text("dom-member-name", "harry_chuang", { x: 24, y: 168, width: 48, height: 16 }, {
        fontSize: "12px",
        lineHeight: "16px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        width: "48px"
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(root))[0];
  const [userName, topic, volume, memberName] = model.children;

  assert.equal(userName.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(userName.layoutSizingHorizontal, "HUG");
  assert.equal(userName.layoutSizingVertical, "HUG");
  assert.equal(topic.textAutoResize, "HEIGHT");
  assert.equal(topic.layoutSizingHorizontal, "FIXED");
  assert.equal(topic.layoutSizingVertical, "HUG");
  assert.equal(volume.textAutoResize, "HEIGHT");
  assert.equal(volume.layoutSizingHorizontal, "FIXED");
  assert.equal(volume.layoutSizingVertical, "HUG");
  assert.equal(memberName.textAutoResize, "TRUNCATE");
  assert.equal(memberName.layoutSizingHorizontal, "FIXED");
  assert.equal(memberName.layoutSizingVertical, "HUG");
  assert.equal(memberName.rect.width, 48);
});

test("max-height overflow text containers clip overflowing read-more lines", () => {
  const limitedText = node("dom-readmore-text", "div", { x: 24, y: 40, width: 540, height: 81 }, {
    styles: {
      display: "block",
      overflowX: "visible",
      overflowY: "hidden",
      maxHeight: "81px",
      lineHeight: "27px"
    },
    children: [
      text("dom-readmore-line-1", "全球最會賺航海王！專訪長榮海運董總：你有注意到我們的名片嗎？", { x: 24, y: 40, width: 540, height: 27 }, {
        lineHeight: "27px"
      }),
      text("dom-readmore-line-2", "", { x: 24, y: 67, width: 540, height: 27 }, {
        lineHeight: "27px"
      }),
      text("dom-readmore-line-3", "長榮海運不是最大，卻是全球最會賺錢的航商。", { x: 24, y: 94, width: 540, height: 27 }, {
        lineHeight: "27px"
      }),
      text("dom-readmore-line-4", "海，多變。", { x: 24, y: 121, width: 540, height: 27 }, {
        lineHeight: "27px"
      }),
      node("dom-readmore-button", "button", { x: 474, y: 94, width: 90, height: 27 }, {
        textContent: "閱讀更多",
        styles: {
          position: "absolute",
          color: "rgb(0, 122, 255)",
          fontSize: "18px",
          lineHeight: "27px"
        }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(limitedText))[0];

  assert.equal(model.type, "FRAME");
  assert.equal(model.clipsContent, true);
  assert.equal(model.rect.height, 81);
  assert(model.children.some((child) => child.sourceNodeId === "dom-readmore-line-4"));
  assert(model.children.some((child) => child.rect.y >= 81));
});
