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
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(root))[0];
  const [userName, topic, volume] = model.children;

  assert.equal(userName.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(userName.layoutSizingHorizontal, "HUG");
  assert.equal(userName.layoutSizingVertical, "HUG");
  assert.equal(topic.textAutoResize, "HEIGHT");
  assert.equal(topic.layoutSizingHorizontal, "FIXED");
  assert.equal(topic.layoutSizingVertical, "HUG");
  assert.equal(volume.textAutoResize, "HEIGHT");
  assert.equal(volume.layoutSizingHorizontal, "FIXED");
  assert.equal(volume.layoutSizingVertical, "HUG");
});
