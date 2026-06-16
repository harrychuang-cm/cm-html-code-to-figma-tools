import assert from "node:assert/strict";
import test from "node:test";
import { createValidPackage } from "../../../packages/capture-schema/fixtures/valid-package.mjs";
import {
  createEditableLayoutNodeModels,
  summarizeAutoLayoutModels,
  summarizeSemanticNamingModels
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

test("placeholder input creates editable placeholder text from captured metadata", () => {
  const searchInput = node("dom-search-input", "input", { x: 808, y: 42, width: 450, height: 32 }, {
    attributes: {
      id: "SearchbarSearchInput",
      placeholder: "搜尋股票/ETF代碼、名稱或人名"
    },
    styles: {
      display: "block",
      width: "450px",
      height: "32px",
      paddingLeft: "36px",
      paddingRight: "8px",
      fontSize: "14px",
      lineHeight: "21px",
      color: "rgb(0, 0, 0)",
      placeholderColor: "rgb(143, 143, 143)",
      backgroundColor: "rgb(247, 247, 247)",
      overflow: "clip",
      overflowX: "clip",
      overflowY: "clip",
      textOverflow: "clip"
    }
  });

  const model = createEditableLayoutNodeModels(packageWithRoot(searchInput))[0];
  const placeholder = model.children.find((child) => child.sourceNodeId === "dom-search-input::placeholder");

  assert.equal(model.type, "FRAME");
  assert.equal(model.name, "Input / 搜尋股票/ETF代碼、名稱或人名");
  assert.equal(placeholder.type, "TEXT");
  assert.equal(placeholder.text, "搜尋股票/ETF代碼、名稱或人名");
  assert.equal(placeholder.textAutoResize, "TRUNCATE");
  assert.equal(placeholder.layoutSizingHorizontal, "FIXED");
  assert.deepEqual(placeholder.rect, { x: 36, y: 5.5, width: 406, height: 21 });
  assert.equal(placeholder.style.text.color, "rgb(143, 143, 143)");
});

test("placeholder input skips placeholder text when capture reports a value", () => {
  const filledInput = node("dom-filled-input", "input", { x: 808, y: 42, width: 450, height: 32 }, {
    attributes: {
      placeholder: "搜尋股票/ETF代碼、名稱或人名",
      "data-has-value": "true"
    },
    styles: {
      display: "block",
      width: "450px",
      height: "32px",
      backgroundColor: "rgb(247, 247, 247)"
    }
  });

  const model = createEditableLayoutNodeModels(packageWithRoot(filledInput))[0];

  assert.equal(model.type, "RECTANGLE");
  assert.equal(model.children.length, 0);
});

test("near-fit explicit-width text keeps hug sizing to avoid Figma wrapping", () => {
  const memberCount = node("dom-member-count", "div", { x: 683.78, y: 341, width: 49, height: 24 }, {
    textContent: "63334",
    styles: {
      display: "block",
      width: "49px",
      height: "24px",
      fontSize: "16px",
      lineHeight: "24px",
      color: "rgb(51, 51, 51)"
    }
  });

  const model = createEditableLayoutNodeModels(packageWithRoot(memberCount))[0];

  assert.equal(model.type, "TEXT");
  assert.equal(model.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(model.layoutSizingHorizontal, "HUG");
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

test("edge-pinned two-child flex infers space-between to preserve right-aligned search", () => {
  const headerMiddle = node("dom-header-middle", "div", { x: 368, y: 28, width: 890, height: 60 }, {
    styles: {
      display: "flex",
      flexDirection: "row",
      gap: "24px",
      columnGap: "24px",
      alignItems: "center"
    },
    children: [
      node("dom-header-nav", "nav", { x: 368, y: 28, width: 317.79, height: 60 }, {
        children: [
          text("dom-discuss", "討論", { x: 368, y: 46, width: 32, height: 24 })
        ]
      }),
      node("dom-header-search", "div", { x: 808, y: 28, width: 450, height: 60 }, {
        styles: {
          display: "block",
          width: "450px",
          height: "60px"
        },
        children: [
          node("dom-search-input", "input", { x: 808, y: 42, width: 450, height: 32 }, {
            attributes: { placeholder: "搜尋股票/ETF代碼、名稱或人名" },
            styles: {
              display: "block",
              width: "450px",
              height: "32px",
              paddingLeft: "36px",
              paddingRight: "8px",
              fontSize: "14px",
              lineHeight: "21px",
              backgroundColor: "rgb(247, 247, 247)"
            }
          })
        ]
      })
    ]
  });

  const model = createEditableLayoutNodeModels(packageWithRoot(headerMiddle))[0];

  assert.equal(model.autoLayout.applied, true);
  assert.equal(model.autoLayout.layoutMode, "HORIZONTAL");
  assert.equal(model.autoLayout.primaryAxisAlignItems, "SPACE_BETWEEN");
  assert.equal(model.autoLayout.itemSpacing, 0);
  assert.equal(model.autoLayout.paddingLeft, 0);
  assert.equal(model.autoLayout.paddingRight, 0);
  assert.deepEqual(model.children.map((child) => child.sourceNodeId), ["dom-header-nav", "dom-header-search"]);
  assert.deepEqual(model.children.map((child) => child.rect.x), [0, 440]);
});

test("transparent transformed carousel track uses visible child bounds", () => {
  const carousel = node("dom-carousel", "div", { x: 0, y: 159, width: 390, height: 93.75 }, {
    styles: {
      display: "block",
      position: "relative",
      width: "390px",
      height: "93.75px",
      overflow: "hidden",
      overflowX: "hidden",
      overflowY: "hidden"
    },
    children: [
      node("dom-carousel-track", "div", { x: -390, y: 159, width: 390, height: 93.75 }, {
        styles: {
          display: "flex",
          width: "390px",
          height: "93.75px",
          transform: "matrix(1, 0, 0, 1, -390, 0)"
        },
        children: [
          node("dom-carousel-slide", "div", { x: 0, y: 159, width: 390, height: 93.75 }, {
            styles: {
              display: "block",
              position: "relative",
              width: "390px",
              height: "93.75px"
            },
            children: [
              node("dom-carousel-image", "img", { x: 0, y: 159, width: 390, height: 93.75 }, {
                assetRef: "assets/image-9.webp",
                attributes: { assetKind: "raster", alt: "0經驗也能上手，從基金起步" },
                styles: {
                  display: "block",
                  width: "390px",
                  height: "93.75px",
                  objectFit: "cover"
                }
              })
            ]
          })
        ]
      })
    ]
  });

  const model = createEditableLayoutNodeModels(packageWithRoot(carousel))[0];
  const [track] = model.children;
  const [image] = track.children;

  assert.equal(model.clipsContent, true);
  assert.deepEqual(track.rect, { x: 0, y: 0, width: 390, height: 93.75 });
  assert.deepEqual(track.absoluteRect, { x: 0, y: 159, width: 390, height: 93.75 });
  assert.equal(image.type, "IMAGE");
  assert.equal(image.sourceNodeId, "dom-carousel-image");
  assert.deepEqual(image.rect, { x: 0, y: 0, width: 390, height: 93.75 });
  assert.deepEqual(image.absoluteRect, { x: 0, y: 159, width: 390, height: 93.75 });
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

test("fixed overlay descendants in nonvisual wrappers preserve page stacking", () => {
  const stack = node("dom-footer", "div", { x: 0, y: 2132.41, width: 1548, height: 0 }, {
    styles: { display: "block" },
    children: [
      node("dom-forum-chat", "div", { x: 0, y: 2132.41, width: 1548, height: 0 }, {
        styles: { display: "block" },
        children: [
          node("dom-chat-wrapper", "div", { x: 927, y: 493, width: 601, height: 520 }, {
            styles: {
              position: "fixed",
              zIndex: "7",
              backgroundColor: "rgb(255, 255, 255)"
            }
          })
        ]
      }),
      node("dom-forum-to-top", "div", { x: 0, y: 2132.41, width: 1548, height: 0 }, {
        styles: { display: "block" },
        children: [
          node("dom-to-top", "div", { x: 1464, y: 897, width: 44, height: 44 }, {
            styles: {
              position: "fixed",
              zIndex: "auto",
              backgroundColor: "rgb(176, 176, 176)"
            }
          })
        ]
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(stack))[0];

  assert.equal(model.autoLayout, null);
  assert.deepEqual(model.children.map((child) => child.sourceNodeId), ["dom-forum-to-top", "dom-forum-chat"]);
  assert.equal(model.children[1].children[0].sourceNodeId, "dom-chat-wrapper");
  assert.equal(model.children[1].children[0].cssZIndex, "7");
});

test("descendant z-index does not promote static sibling containers above fixed footer content", () => {
  const stack = node("dom-page", "div", { x: 0, y: 0, width: 390, height: 844 }, {
    styles: { display: "block", position: "relative" },
    children: [
      node("dom-body", "div", { x: 0, y: 0, width: 390, height: 844 }, {
        children: [
          text("dom-deep-popup", "Deep popup", { x: 16, y: 16, width: 100, height: 24 }, {
            position: "relative",
            zIndex: "100"
          })
        ]
      }),
      node("dom-footer", "div", { x: 0, y: 7800, width: 390, height: 0 }, {
        children: [
          node("dom-fixed-cta", "div", { x: 95, y: 732, width: 200, height: 100 }, {
            styles: {
              position: "fixed",
              zIndex: "3",
              transform: "matrix(1, 0, 0, 1, -100, 0)"
            },
            children: [
              node("dom-fixed-cta-image", "img", { x: 95, y: 732, width: 200, height: 100 }, {
                assetRef: "assets/app-download.png"
              })
            ]
          })
        ]
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(stack))[0];

  assert.equal(model.autoLayout, null);
  assert.deepEqual(model.children.map((child) => child.sourceNodeId), ["dom-body", "dom-footer"]);
  assert.equal(model.children[1].children[0].sourceNodeId, "dom-fixed-cta");
  assert.deepEqual(model.children[1].children[0].absoluteRect, { x: 95, y: 732, width: 200, height: 100 });
});

test("absolute active indicator is layered between radio group background and labels", () => {
  const switcher = node("dom-switcher-wrapper", "div", { x: 0, y: 0, width: 104, height: 24 }, {
    styles: { display: "block", position: "relative" },
    children: [
      node("dom-switcher-group", "div", { x: 0, y: 0, width: 104, height: 24 }, {
        styles: {
          display: "flex",
          flexDirection: "row",
          gap: "4px",
          paddingTop: "2px",
          paddingRight: "2px",
          paddingBottom: "2px",
          paddingLeft: "2px",
          backgroundColor: "rgb(228, 228, 228)"
        },
        children: [
          node("dom-switcher-day", "label", { x: 2, y: 2, width: 48, height: 20 }, {
            styles: { position: "relative", zIndex: "1" },
            children: [
              node("dom-switcher-day-text", "span", { x: 2, y: 2, width: 48, height: 20 }, {
                textContent: "日盤",
                styles: {
                  display: "inline-block",
                  width: "48px",
                  height: "20px",
                  paddingTop: "1px",
                  paddingRight: "10.5px",
                  paddingBottom: "1px",
                  paddingLeft: "10.5px",
                  fontSize: "12px",
                  lineHeight: "16px",
                  textAlign: "center",
                  whiteSpace: "nowrap"
                }
              })
            ]
          }),
          node("dom-switcher-night", "label", { x: 54, y: 2, width: 48, height: 20 }, {
            styles: { position: "relative", zIndex: "1" },
            children: [
              node("dom-switcher-night-text", "span", { x: 54, y: 2, width: 48, height: 20 }, {
                textContent: "夜盤",
                styles: {
                  display: "inline-block",
                  width: "48px",
                  height: "20px",
                  paddingTop: "1px",
                  paddingRight: "10.5px",
                  paddingBottom: "1px",
                  paddingLeft: "10.5px",
                  fontSize: "12px",
                  lineHeight: "16px",
                  textAlign: "center",
                  whiteSpace: "nowrap"
                }
              })
            ]
          })
        ]
      }),
      node("dom-switcher-active-bg", "div", { x: 2, y: 2, width: 48, height: 20 }, {
        styles: {
          position: "absolute",
          backgroundColor: "rgb(255, 255, 255)",
          borderTopLeftRadius: "4px",
          borderTopRightRadius: "4px",
          borderBottomRightRadius: "4px",
          borderBottomLeftRadius: "4px"
        }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(switcher))[0];
  const [group] = model.children;
  const [activeBg, dayLabel, nightLabel] = group.children;
  const dayText = dayLabel.children[0];
  const nightText = nightLabel.children[0];

  assert.equal(model.autoLayout, null);
  assert.deepEqual(model.children.map((child) => child.sourceNodeId), ["dom-switcher-group"]);
  assert.equal(group.autoLayout.applied, true);
  assert.deepEqual(group.children.map((child) => child.sourceNodeId), [
    "dom-switcher-active-bg",
    "dom-switcher-day",
    "dom-switcher-night"
  ]);
  assert.equal(activeBg.layoutPositioning, "ABSOLUTE");
  assert.deepEqual(activeBg.rect, { x: 2, y: 2, width: 48, height: 20 });
  assert.deepEqual([dayText.text, nightText.text], ["日盤", "夜盤"]);
  assert.deepEqual([dayText.rect.y, dayText.rect.height], [2, 16]);
  assert.deepEqual([nightText.rect.y, nightText.rect.height], [2, 16]);
});

test("static after pseudo icon in flex flow uses trailing edge when captured rect overlaps text", () => {
  const sortButton = node("dom-sort-selected", "div", { x: 100, y: 40, width: 40, height: 29 }, {
    styles: {
      display: "flex",
      flexDirection: "row",
      paddingTop: "4px",
      paddingBottom: "4px",
      whiteSpace: "nowrap"
    },
    children: [
      text("dom-sort-label", "最熱", { x: 100, y: 44, width: 28, height: 21 }, {
        fontSize: "14px",
        lineHeight: "21px"
      }),
      node("dom-sort-arrow", "::after", { x: 100, y: 40, width: 8, height: 21 }, {
        nodeType: "pseudo",
        styles: {
          content: "url(\"data:image/svg+xml;base64,PHN2Zy8+\")",
          display: "block",
          width: "8px",
          height: "21px"
        },
        assetRef: "assets/sort-arrow.svg",
        attributes: { "data-pseudo": "::after" }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(sortButton))[0];

  assert.equal(model.autoLayout.applied, true);
  assert.deepEqual(model.children.map((child) => child.sourceNodeId), ["dom-sort-label", "dom-sort-arrow"]);
  assert.deepEqual(model.children.map((child) => child.rect.x), [0, 32]);
  assert.equal(model.autoLayout.itemSpacing, 4);
});

test("absolute read-more overlays with ellipsis pseudo inherit nearest backdrop fill", () => {
  const card = node("dom-card", "section", { x: 0, y: 0, width: 728, height: 180 }, {
    styles: { backgroundColor: "rgb(255, 255, 255)" },
    children: [
      node("dom-text-rule", "div", { x: 16, y: 16, width: 696, height: 135 }, {
        styles: {
          position: "relative",
          overflow: "hidden",
          overflowX: "hidden",
          overflowY: "hidden"
        },
        children: [
          node("dom-long-line", "div", { x: 16, y: 97, width: 696, height: 54 }, {
            children: [
              text("dom-long-text", "會不會因此讓美股大跌？這也是大多數台股分析師都很擔憂的事。", {
                x: 16,
                y: 98,
                width: 690,
                height: 52
              })
            ]
          }),
          node("dom-read-more", "button", { x: 624, y: 126, width: 88, height: 25 }, {
            textContent: "閱讀更多",
            styles: {
              position: "absolute",
              left: "608px",
              top: "110px",
              fontSize: "18px",
              color: "rgb(194, 41, 46)",
              backgroundColor: "rgba(0, 0, 0, 0)",
              whiteSpace: "nowrap"
            },
            children: [
              node("dom-read-more-ellipsis", "::before", { x: 624, y: 128, width: 30, height: 22 }, {
                nodeType: "pseudo",
                textContent: "...",
                styles: {
                  content: "\"...\"",
                  display: "inline",
                  fontSize: "18px",
                  color: "rgb(54, 54, 54)"
                },
                attributes: { "data-pseudo": "::before" }
              })
            ]
          })
        ]
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(card))[0];
  const readMore = model.children[0].children.find((child) => child.sourceNodeId === "dom-read-more");

  assert.deepEqual(readMore.style.fills, ["rgb(255, 255, 255)"]);
  assert.equal(readMore.layoutPositioning, "ABSOLUTE");
  assert.deepEqual(readMore.children.map((child) => child.text), ["...", "閱讀更多"]);
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
        styles: {
          color: "color(srgb 0.85098 0.866667 0.894118)"
        },
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
  assert.equal(icon.style.color, "color(srgb 0.85098 0.866667 0.894118)");
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

test("mixed direct text merges inline separator text into a single readable line", () => {
  const quoteTime = node("dom-quote-time", "div", { x: 100, y: 20, width: 142.27, height: 16 }, {
    textContent: "報價時間 06/11 10:42",
    styles: {
      display: "block",
      fontSize: "14px",
      lineHeight: "16px",
      color: "rgb(143, 143, 143)"
    },
    children: [
      text("dom-quote-time-separator", "|", { x: 160.67, y: 18, width: 2.73, height: 20 }, {
        fontSize: "14px",
        lineHeight: "16px",
        color: "rgb(229, 229, 229)"
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(quoteTime))[0];
  const [label] = model.children;

  assert.equal(model.type, "FRAME");
  assert.equal(model.children.length, 1);
  assert.equal(label.type, "TEXT");
  assert.equal(label.text, "報價時間 | 06/11 10:42");
  assert.equal(label.rect.x, 0);
  assert(label.rect.width > 130);
});

test("multiline mixed direct text keeps the paragraph text box instead of shifting after inline children", () => {
  const desc = node("dom-club-desc", "p", { x: 366, y: 373, width: 696, height: 40 }, {
    textContent: "歡迎來到盤中強勢股社團！ 新手小白有興趣不知道從何開始❓ 快加入盤中強勢股討論社的討論，讓你快速成為股市大神🤩",
    styles: {
      display: "block",
      width: "696px",
      height: "40px",
      fontSize: "14px",
      lineHeight: "20px",
      whiteSpace: "normal",
      color: "rgb(103, 103, 103)"
    },
    children: [
      node("dom-club-desc-read-more", "span", { x: 441.87, y: 393, width: 68.49, height: 20 }, {
        textContent: "...繼續閱讀",
        styles: {
          display: "inline-block",
          width: "68.49px",
          height: "20px",
          fontSize: "14px",
          lineHeight: "20px",
          color: "rgb(194, 41, 46)"
        }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(desc))[0];
  const paragraphText = model.children.find((child) => child.sourceNodeId === "dom-club-desc::text");
  const readMore = model.children.find((child) => child.sourceNodeId === "dom-club-desc-read-more");

  assert.equal(model.type, "FRAME");
  assert(paragraphText);
  assert(readMore);
  assert.deepEqual(paragraphText.rect, { x: 0, y: 0, width: 696, height: 40 });
  assert.equal(paragraphText.textAutoResize, "HEIGHT");
  assert.equal(paragraphText.layoutSizingHorizontal, "FIXED");
  assert.deepEqual(readMore.rect, { x: 75.87, y: 20, width: 68.49, height: 20 });
});

test("auto-layout keeps before pseudo-elements at the start of the flex flow", () => {
  const member = node("dom-member-meta", "li", { x: 100, y: 20, width: 100.97, height: 24 }, {
    styles: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      gap: "4px"
    },
    children: [
      text("dom-member-label", "成員", { x: 115.57, y: 20, width: 32.41, height: 24 }, {
        fontSize: "16px",
        lineHeight: "24px"
      }),
      text("dom-member-count", "63334", { x: 151.97, y: 20, width: 49, height: 24 }, {
        fontSize: "16px",
        lineHeight: "24px"
      }),
      node("dom-member-before", "::before", { x: 100, y: 20, width: 11.56, height: 24 }, {
        nodeType: "pseudo",
        textContent: "|",
        styles: {
          content: "\"|\"",
          display: "block",
          fontSize: "16px",
          lineHeight: "24px",
          color: "rgb(212, 212, 212)"
        },
        attributes: { "data-pseudo": "::before" }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(member))[0];

  assert.equal(model.autoLayout.applied, true);
  assert.deepEqual(model.children.map((child) => child.text), ["|", "成員", "63334"]);
  assert.equal(model.children[0].pseudoType, "::before");
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

test("flex header text with explicit CSS column widths stays fixed in auto layout", () => {
  const header = node("dom-stock-header", "div", { x: 366, y: 868, width: 492, height: 36 }, {
    styles: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center"
    },
    children: [
      node("dom-stock-header-rank", "div", { x: 366, y: 878, width: 40, height: 16 }, {
        textContent: "排名",
        styles: {
          display: "block",
          width: "40px",
          height: "16px",
          fontSize: "14px",
          lineHeight: "16px",
          textAlign: "center"
        }
      }),
      node("dom-stock-header-symbol", "div", { x: 406, y: 878, width: 115, height: 16 }, {
        textContent: "股票",
        styles: {
          display: "block",
          width: "115px",
          height: "16px",
          paddingLeft: "8px",
          paddingRight: "8px",
          fontSize: "14px",
          lineHeight: "16px",
          textAlign: "left"
        }
      }),
      node("dom-stock-header-price", "div", { x: 521, y: 878, width: 132, height: 16 }, {
        textContent: "股價",
        styles: {
          display: "block",
          width: "132px",
          height: "16px",
          paddingLeft: "8px",
          paddingRight: "8px",
          fontSize: "14px",
          lineHeight: "16px",
          textAlign: "right"
        }
      }),
      node("dom-stock-header-trend", "div", { x: 653, y: 878, width: 205, height: 16 }, {
        textContent: "今日走勢",
        styles: {
          display: "block",
          width: "205px",
          height: "16px",
          paddingLeft: "8px",
          paddingRight: "8px",
          fontSize: "14px",
          lineHeight: "16px",
          textAlign: "center"
        }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(header))[0];
  const [rank, symbol, price, trend] = model.children;

  assert.equal(model.autoLayout.applied, true);
  assert.deepEqual(model.children.map((child) => child.rect.width), [40, 115, 132, 205]);
  assert.deepEqual(model.children.map((child) => child.textAutoResize), ["HEIGHT", "HEIGHT", "HEIGHT", "HEIGHT"]);
  assert.deepEqual(model.children.map((child) => child.layoutSizingHorizontal), ["FIXED", "FIXED", "FIXED", "FIXED"]);
  assert.equal(rank.style.text.textAlign, "center");
  assert.equal(symbol.style.text.textAlign, "left");
  assert.equal(price.style.text.textAlign, "right");
  assert.equal(trend.style.text.textAlign, "center");
});

test("background-clipped linear-gradient text imports as text fill without backing frame", () => {
  const gradient = "linear-gradient(to right, rgb(222, 190, 135), rgb(192, 139, 78))";
  const rank = node("dom-rank", "span", { x: 48, y: 18, width: 40, height: 33 }, {
    textContent: "1",
    styles: {
      backgroundColor: "rgba(0, 0, 0, 0)",
      backgroundImage: gradient,
      backgroundClip: "text",
      webkitBackgroundClip: "text",
      webkitTextFillColor: "rgba(0, 0, 0, 0)",
      color: "rgb(149, 149, 149)",
      fontFamily: "Inter",
      fontSize: "28px",
      fontWeight: "700",
      lineHeight: "33px"
    }
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(rank))[0];

  assert.equal(model.type, "TEXT");
  assert.equal(model.name, "Text / 1");
  assert.deepEqual(model.style.fills, []);
  assert.deepEqual(model.style.text.fills, [gradient]);
  assert.equal(model.style.text.color, "rgb(149, 149, 149)");
});

test("ancestor background-clipped gradient imports as descendant text fill", () => {
  const gradient = "linear-gradient(45deg, rgb(255, 23, 85), rgb(47, 84, 197))";
  const button = node("dom-remove-ads", "button", { x: 1144, y: 12, width: 112, height: 36 }, {
    attributes: { class: "button-remove-ads" },
    styles: {
      backgroundColor: "rgba(0, 0, 0, 0)",
      backgroundImage: gradient,
      backgroundClip: "text",
      webkitBackgroundClip: "text",
      webkitTextFillColor: "rgba(0, 0, 0, 0)",
      color: "rgba(255, 255, 255, 0.8)",
      overflow: "hidden",
      overflowX: "hidden",
      overflowY: "hidden"
    },
    children: [
      node("dom-remove-ads-content", "div", { x: 1159, y: 20, width: 82, height: 20 }, {
        textContent: "享受無廣告",
        styles: {
          backgroundColor: "rgba(0, 0, 0, 0)",
          backgroundImage: "none",
          color: "rgba(255, 255, 255, 0.8)",
          webkitTextFillColor: "rgba(0, 0, 0, 0)",
          fontSize: "13px",
          lineHeight: "20px"
        }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(button))[0];
  const label = model.children[0];

  assert.equal(model.type, "FRAME");
  assert.deepEqual(model.style.fills, []);
  assert.equal(label.type, "TEXT");
  assert.equal(label.text, "享受無廣告");
  assert.deepEqual(label.style.text.fills, [gradient]);
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

test("block button with one padded text child maps to centered auto layout", () => {
  const button = node("dom-buy-button", "button", { x: 157, y: 579, width: 240, height: 46 }, {
    styles: {
      display: "block",
      position: "relative",
      backgroundColor: "rgb(255, 76, 106)",
      borderTopLeftRadius: "6px",
      borderTopRightRadius: "6px",
      borderBottomRightRadius: "6px",
      borderBottomLeftRadius: "6px",
      textAlign: "center",
      lineHeight: "24px"
    },
    children: [
      node("dom-buy-button-label", "div", { x: 158, y: 580, width: 238, height: 44 }, {
        textContent: "立即購買 NT$ 6,080",
        styles: {
          display: "block",
          position: "relative",
          color: "rgb(255, 255, 255)",
          fontSize: "16px",
          lineHeight: "24px",
          whiteSpace: "nowrap",
          textAlign: "center",
          paddingTop: "10px",
          paddingRight: "16px",
          paddingBottom: "10px",
          paddingLeft: "16px"
        }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(button))[0];
  const label = model.children[0];

  assert.equal(model.type, "FRAME");
  assert.equal(model.autoLayout.applied, true);
  assert.equal(model.autoLayout.layoutMode, "HORIZONTAL");
  assert.equal(model.autoLayout.primaryAxisAlignItems, "CENTER");
  assert.equal(model.autoLayout.counterAxisAlignItems, "CENTER");
  assert.equal(label.type, "TEXT");
  assert.equal(label.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(label.layoutSizingHorizontal, "HUG");
  assert.equal(label.layoutSizingVertical, "HUG");
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

test("vertical flex column infers centered cross-axis alignment from geometry", () => {
  const productSections = node("dom-products", "div", { x: 0, y: 1267.52, width: 1434, height: 1131.25 }, {
    styles: {
      display: "flex",
      flexDirection: "column",
      gap: "120px",
      alignItems: "normal"
    },
    children: [
      node("dom-product-a", "div", { x: 117, y: 1367.52, width: 1200, height: 455.63 }, {
        styles: {
          marginLeft: "117px",
          marginRight: "117px"
        },
        children: [
          text("dom-product-a-title", "向大師學習", { x: 117, y: 1367.52, width: 160, height: 40 })
        ]
      }),
      node("dom-product-b", "div", { x: 117, y: 1943.15, width: 1200, height: 455.62 }, {
        styles: {
          marginLeft: "117px",
          marginRight: "117px"
        },
        children: [
          text("dom-product-b-title", "放大你的資產", { x: 117, y: 1943.15, width: 192, height: 40 })
        ]
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(productSections))[0];

  assert.equal(model.autoLayout.applied, true);
  assert.equal(model.autoLayout.layoutMode, "VERTICAL");
  assert.equal(model.autoLayout.counterAxisAlignItems, "CENTER");
  assert.deepEqual(model.children.map((child) => child.rect.x), [117, 117]);
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

test("CSS background image assets with children import as background layers", () => {
  const logo = node("dom-logo", "div", { x: 20, y: 4, width: 90, height: 46 }, {
    assetRef: "assets/icon-1.svg",
    attributes: {
      assetKind: "svg",
      assetRole: "css-background"
    },
    styles: {
      backgroundImage: "url(\"https://cdn.example.com/logo.svg\")",
      backgroundPosition: "50% 50%",
      backgroundRepeat: "no-repeat",
      backgroundSize: "100% auto"
    },
    children: [
      text("dom-logo-version", "v6.11.0", { x: 89.63, y: 43.1, width: 35.75, height: 7.8 }, {
        color: "rgb(133, 133, 133)"
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(logo))[0];

  assert.equal(model.type, "FRAME");
  assert.equal(model.children.length, 2);
  assert.equal(model.children[0].type, "IMAGE");
  assert.equal(model.children[0].name, "Background image");
  assert.equal(model.children[0].assetRef, "assets/icon-1.svg");
  assert.equal(model.children[0].assetRole, "css-background");
  assert.equal(model.children[0].layoutPositioning, "ABSOLUTE");
  assert.deepEqual(model.children[0].rect, { x: 0, y: 0, width: 90, height: 46 });
  assert.equal(model.children[0].style.imageScaleMode, "FILL");
  assert.equal(model.children[0].style.backgroundPosition, "50% 50%");
  assert.equal(model.children[0].style.backgroundRepeat, "no-repeat");
  assert.equal(model.children[0].style.backgroundSize, "100% auto");
  assert.equal(model.children[1].type, "TEXT");
  assert.equal(model.children[1].text, "v6.11.0");
});

test("missing CSS background image assets fall back to screenshot crop layers", () => {
  const logo = node("dom-logo", "div", { x: 20, y: 4, width: 90, height: 46 }, {
    styles: {
      backgroundImage: "url(\"https://cdn.example.com/logo.svg\")"
    },
    children: [
      text("dom-logo-version", "v6.11.0", { x: 89.63, y: 43.1, width: 35.75, height: 7.8 })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(logo))[0];

  assert.equal(model.type, "FRAME");
  assert.equal(model.children[0].type, "IMAGE");
  assert.equal(model.children[0].assetRef, null);
  assert.equal(model.children[0].assetKind, "svg");
  assert.equal(model.children[0].assetRole, "css-background");
  assert.equal(model.children[0].fallbackReason, "missing css background asset");
});

test("transparent avatar picture wrappers mirror child image radius and clipping", () => {
  const avatar = node("dom-avatar", "picture", { x: 232.5, y: 763, width: 24, height: 24 }, {
    attributes: { class: "avatar" },
    styles: {
      display: "block",
      overflow: "visible",
      backgroundColor: "rgba(0, 0, 0, 0)"
    },
    children: [
      node("dom-avatar-img", "img", { x: 232.5, y: 763, width: 24, height: 24 }, {
        assetRef: "assets/avatar.jpg",
        attributes: {
          alt: "awwrated | 咖啡上癮症患者",
          assetKind: "raster"
        },
        styles: {
          display: "inline",
          overflow: "clip",
          overflowX: "clip",
          overflowY: "clip",
          borderTopLeftRadius: "12px",
          borderTopRightRadius: "12px",
          borderBottomRightRadius: "12px",
          borderBottomLeftRadius: "12px"
        }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(avatar))[0];

  assert.equal(model.type, "FRAME");
  assert.equal(model.style.cornerRadius, 12);
  assert.equal(model.clipsContent, true);
  assert.equal(model.children[0].type, "IMAGE");
  assert.equal(model.children[0].style.cornerRadius, 12);
});

test("masked pseudo gradient backgrounds import as gradient strokes", () => {
  const border = node("dom-button-before", "::before", { x: 1144, y: 12, width: 112, height: 36 }, {
    nodeType: "pseudo",
    styles: {
      backgroundColor: "rgba(0, 0, 0, 0)",
      backgroundImage: "linear-gradient(45deg, rgb(255, 23, 85), rgb(47, 84, 197))",
      maskImage: "linear-gradient(rgb(255, 255, 255) 0px, rgb(255, 255, 255) 0px), linear-gradient(rgb(255, 255, 255) 0px, rgb(255, 255, 255) 0px)",
      paddingTop: "2.6px",
      paddingRight: "2.6px",
      paddingBottom: "2.6px",
      paddingLeft: "2.6px",
      borderTopLeftRadius: "20px",
      borderTopRightRadius: "20px",
      borderBottomRightRadius: "20px",
      borderBottomLeftRadius: "20px"
    }
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(border))[0];

  assert.equal(model.type, "RECTANGLE");
  assert.deepEqual(model.style.fills, []);
  assert.deepEqual(model.style.strokes, [{
    color: "linear-gradient(45deg, rgb(255, 23, 85), rgb(47, 84, 197))",
    width: 2.6
  }]);
  assert.equal(model.style.cornerRadius, 20);
});

test("rounded video cards keep top-right ranking badges", () => {
  const card = node("dom-video-card", "a", { x: 142.5, y: 223, width: 105, height: 140 }, {
    assetRef: "assets/poster.jpg",
    attributes: {
      assetKind: "raster",
      assetRole: "css-background"
    },
    styles: {
      overflow: "hidden",
      overflowX: "hidden",
      overflowY: "hidden",
      borderTopLeftRadius: "8px",
      borderTopRightRadius: "8px",
      borderBottomRightRadius: "8px",
      borderBottomLeftRadius: "8px",
      backgroundImage: "url(\"https://cdn.example.com/poster.jpg\")",
      backgroundSize: "cover"
    },
    children: [
      text("dom-card-title", "鐵拳教育", { x: 152.5, y: 337, width: 85, height: 16 }, {
        color: "rgb(255, 255, 255)",
        fontSize: "12px",
        lineHeight: "16px"
      }),
      node("dom-card-rank", "b", { x: 219.5, y: 223, width: 28, height: 28 }, {
        textContent: "1",
        styles: {
          display: "flex",
          position: "absolute",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(0, 0, 0, 0)",
          backgroundImage: "linear-gradient(223deg, rgb(0, 63, 255) 0%, rgb(255, 0, 68) 100%)",
          color: "rgb(255, 255, 255)",
          fontSize: "14px",
          fontWeight: "700",
          lineHeight: "14px",
          borderTopRightRadius: "8px",
          borderBottomLeftRadius: "8px"
        }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(card))[0];
  const rank = model.children.find((child) => child.sourceNodeId === "dom-card-rank");

  assert.equal(model.type, "FRAME");
  assert.equal(model.style.cornerRadius, 8);
  assert.equal(model.clipsContent, true);
  assert(rank);
  assert.equal(rank.rect.x, 77);
  assert.equal(rank.rect.y, 0);
  assert.deepEqual(rank.style.cornerRadii, {
    topLeft: 0,
    topRight: 8,
    bottomRight: 0,
    bottomLeft: 8
  });
  assert.equal(rank.autoLayout.primaryAxisAlignItems, "CENTER");
  assert.equal(rank.autoLayout.counterAxisAlignItems, "CENTER");
  assert.equal(rank.children[0].type, "TEXT");
  assert.equal(rank.children[0].text, "1");
  assert.equal(rank.children[0].layoutPositioning, undefined);
  assert.equal(rank.children[0].layoutSizingHorizontal, "HUG");
  assert.equal(rank.children[0].layoutSizingVertical, "HUG");
  assert.equal(rank.children[0].style.text.color, "rgb(255, 255, 255)");
  assert.deepEqual(rank.children[0].style.text.fills, []);
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

test("rounded partial borders import as native side strokes instead of square border rectangles", () => {
  const moreButton = node("dom-more-button", "button", { x: 322.93, y: 60, width: 67.07, height: 48 }, {
    textContent: "更多",
    styles: {
      display: "flex",
      width: "67.0703px",
      height: "48px",
      paddingLeft: "8px",
      paddingRight: "8px",
      borderTopWidth: "1px",
      borderTopStyle: "solid",
      borderTopColor: "rgb(229, 229, 229)",
      borderLeftWidth: "1px",
      borderLeftStyle: "solid",
      borderLeftColor: "rgb(229, 229, 229)",
      borderTopLeftRadius: "100px",
      borderTopRightRadius: "4px",
      borderBottomRightRadius: "4px",
      borderBottomLeftRadius: "100px",
      fontSize: "16px",
      lineHeight: "24px"
    },
    children: [
      node("dom-more-icon", "img", { x: 366, y: 76.5, width: 16, height: 16 }, {
        assetRef: "assets/more.svg",
        attributes: { assetKind: "svg" }
      })
    ]
  });

  const model = createEditableLayoutNodeModels(packageWithRoot(moreButton))[0];

  assert.equal(model.type, "FRAME");
  assert.deepEqual(model.style.strokes, [{ color: "rgb(229, 229, 229)", width: 1 }]);
  assert.deepEqual(model.style.borderSides, [
    { side: "top", color: "rgb(229, 229, 229)", width: 1 },
    { side: "left", color: "rgb(229, 229, 229)", width: 1 }
  ]);
  assert.equal(model.style.cornerRadius, 100);
  assert.equal(model.children.some((child) => child.name === "Border / top" || child.name === "Border / left"), false);
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

test("padded single-line chat bubbles keep hug text inside fixed backing", () => {
  const bubble = text("dom-chat-unsend", "Tim.JJ2fv1已收回訊息", { x: 1209, y: 621, width: 199.15, height: 33 }, {
    display: "block",
    width: "199.148px",
    height: "33px",
    backgroundColor: "rgb(248, 248, 248)",
    backgroundImage: "none",
    color: "rgb(143, 143, 143)",
    webkitTextFillColor: "rgb(143, 143, 143)",
    fontFamily: "Inter, \"Noto Sans TC\", \"Pingfang TC\", \"Microsoft Jhenghei\", Helvetica, Arial, sans-serif",
    fontSize: "16px",
    fontStyle: "normal",
    fontWeight: "400",
    lineHeight: "16px",
    whiteSpace: "normal",
    textAlign: "start",
    letterSpacing: "normal",
    paddingTop: "8px",
    paddingRight: "20px",
    paddingBottom: "8px",
    paddingLeft: "20px",
    borderTopWidth: "0.5px",
    borderRightWidth: "0.5px",
    borderBottomWidth: "0.5px",
    borderLeftWidth: "0.5px",
    borderTopStyle: "solid",
    borderRightStyle: "solid",
    borderBottomStyle: "solid",
    borderLeftStyle: "solid",
    borderTopColor: "rgb(212, 212, 212)",
    borderRightColor: "rgb(212, 212, 212)",
    borderBottomColor: "rgb(212, 212, 212)",
    borderLeftColor: "rgb(212, 212, 212)",
    borderTopLeftRadius: "19px",
    borderTopRightRadius: "19px",
    borderBottomRightRadius: "19px",
    borderBottomLeftRadius: "19px",
    boxShadow: "none",
    overflow: "visible",
    overflowX: "visible",
    overflowY: "visible",
    maxWidth: "none",
    maxHeight: "none",
    textOverflow: "clip"
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(bubble))[0];
  const label = model.children[0];

  assert.equal(model.type, "FRAME");
  assert.equal(model.name, "Text Background / Tim.JJ2fv1已收回訊息");
  assert.equal(model.autoLayout.applied, true);
  assert.equal(model.autoLayout.layoutMode, "HORIZONTAL");
  assert.equal(model.autoLayout.primaryAxisAlignItems, "CENTER");
  assert.equal(model.autoLayout.counterAxisAlignItems, "CENTER");
  assert.equal(model.autoLayout.paddingLeft, 20);
  assert.equal(model.autoLayout.paddingRight, 20);
  assert.equal(model.autoLayout.paddingTop, 8);
  assert.equal(model.autoLayout.paddingBottom, 8);
  assert.equal(label.type, "TEXT");
  assert.equal(label.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(label.layoutSizingHorizontal, "HUG");
  assert.equal(label.layoutSizingVertical, "HUG");
  assert.deepEqual(label.rect, { x: 20, y: 8, width: 159.15, height: 17 });
});

test("transparent padded emoji text uses content box inside parent bubble", () => {
  const bubble = node("dom-chat-bubble", "div", { x: 1209, y: 712, width: 54, height: 39 }, {
    styles: {
      display: "block",
      position: "relative",
      width: "54px",
      height: "39px",
      backgroundColor: "rgb(240, 240, 240)",
      borderTopLeftRadius: "19px",
      borderTopRightRadius: "19px",
      borderBottomRightRadius: "19px",
      borderBottomLeftRadius: "19px"
    },
    children: [
      node("dom-chat-emoji", "pre", { x: 1209, y: 712, width: 54, height: 39 }, {
        textContent: "🥰",
        attributes: { class: "message__pre text-dark-800" },
        styles: {
          display: "block",
          width: "54px",
          height: "39px",
          backgroundColor: "rgba(0, 0, 0, 0)",
          color: "rgb(54, 54, 54)",
          fontSize: "16px",
          lineHeight: "21px",
          whiteSpace: "pre-wrap",
          paddingLeft: "19px",
          paddingRight: "19px",
          paddingTop: "9px",
          paddingBottom: "9px"
        }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(bubble))[0];
  const label = model.children.find((child) => child.sourceNodeId === "dom-chat-emoji");

  assert.equal(model.type, "FRAME");
  assert.equal(label.type, "TEXT");
  assert.equal(label.text, "🥰");
  assert.equal(label.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(label.layoutSizingHorizontal, "HUG");
  assert.equal(label.layoutSizingVertical, "HUG");
  assert.deepEqual(label.rect, { x: 19, y: 9, width: 16, height: 21 });
});

test("transparent padded interactive tabs preserve wrapper frames in flex rows", () => {
  const nav = node("dom-etf-subtabs", "nav", { x: 271, y: 420, width: 992, height: 37 }, {
    styles: {
      display: "flex",
      flexDirection: "row",
      gap: "4px",
      columnGap: "4px",
      width: "992px",
      height: "37px",
      paddingLeft: "8px",
      paddingRight: "8px",
      paddingTop: "0px",
      paddingBottom: "0px",
      overflow: "auto",
      overflowX: "auto",
      overflowY: "hidden"
    },
    children: [
      node("dom-etf-subtab-hot", "a", { x: 279, y: 420, width: 69.875, height: 37 }, {
        nodeType: "element",
        textContent: "熱門ETF",
        attributes: {
          class: "etfRankPage__subTab etfRankPage__subTab--active"
        },
        styles: {
          display: "flex",
          alignItems: "center",
          width: "69.875px",
          height: "37px",
          backgroundColor: "rgba(0, 0, 0, 0)",
          color: "rgb(54, 54, 54)",
          fontSize: "14px",
          fontWeight: "500",
          lineHeight: "21px",
          whiteSpace: "nowrap",
          paddingLeft: "8px",
          paddingRight: "8px",
          paddingTop: "8px",
          paddingBottom: "8px"
        }
      }),
      node("dom-etf-subtab-dividend", "a", { x: 352.875, y: 420, width: 44.063, height: 37 }, {
        nodeType: "element",
        textContent: "配息",
        attributes: {
          class: "etfRankPage__subTab"
        },
        styles: {
          display: "flex",
          alignItems: "center",
          width: "44.063px",
          height: "37px",
          backgroundColor: "rgba(0, 0, 0, 0)",
          color: "rgb(54, 54, 54)",
          fontSize: "14px",
          fontWeight: "500",
          lineHeight: "21px",
          whiteSpace: "nowrap",
          paddingLeft: "8px",
          paddingRight: "8px",
          paddingTop: "8px",
          paddingBottom: "8px"
        }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(nav))[0];
  const [hotTab, dividendTab] = model.children;
  const hotLabel = hotTab.children[0];

  assert.equal(model.autoLayout.applied, true);
  assert.equal(model.autoLayout.layoutMode, "HORIZONTAL");
  assert.equal(model.autoLayout.itemSpacing, 4);
  assert.equal(model.autoLayout.paddingLeft, 8);
  assert.equal(model.autoLayout.paddingRight, 8);
  assert.deepEqual(model.children.map((child) => child.type), ["FRAME", "FRAME"]);
  assert.deepEqual(model.children.map((child) => child.sourceNodeId), [
    "dom-etf-subtab-hot",
    "dom-etf-subtab-dividend"
  ]);
  assert.deepEqual(hotTab.rect, { x: 8, y: 0, width: 69.875, height: 37 });
  assert.equal(hotTab.autoLayout.applied, true);
  assert.equal(hotTab.autoLayout.layoutMode, "HORIZONTAL");
  assert.equal(hotTab.autoLayout.primaryAxisAlignItems, "CENTER");
  assert.equal(hotTab.autoLayout.counterAxisAlignItems, "CENTER");
  assert.equal(hotTab.autoLayout.paddingLeft, 8);
  assert.equal(hotTab.autoLayout.paddingRight, 8);
  assert.equal(hotTab.autoLayout.paddingTop, 8);
  assert.equal(hotTab.autoLayout.paddingBottom, 8);
  assert.equal(hotLabel.type, "TEXT");
  assert.equal(hotLabel.sourceNodeId, "dom-etf-subtab-hot::text");
  assert.equal(hotLabel.text, "熱門ETF");
  assert.equal(hotLabel.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(hotLabel.layoutSizingHorizontal, "HUG");
  assert.equal(hotLabel.layoutSizingVertical, "HUG");
  assert.deepEqual(hotLabel.rect, { x: 8, y: 8, width: 53.88, height: 21 });
  assert.deepEqual(dividendTab.rect, { x: 81.88, y: 0, width: 44.063, height: 37 });
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

test("transparent padded nav link centers single-line hug text within content box", () => {
  const navLink = node("dom-learning-link", "a", { x: 1185.87, y: 0, width: 96.13, height: 64 }, {
    nodeType: "element",
    textContent: "我的學習",
    styles: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      width: "96.13px",
      height: "64px",
      paddingTop: "10px",
      paddingRight: "16px",
      paddingBottom: "10px",
      paddingLeft: "16px",
      fontSize: "16px",
      lineHeight: "24px",
      whiteSpace: "normal",
      color: "color(srgb 0.85098 0.866667 0.894118)",
      backgroundColor: "rgba(0, 0, 0, 0)"
    },
    attributes: {
      href: "/learning",
      class: "flex items-center justify-center py-10px px-16px h-full text-label-medium"
    }
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(navLink))[0];
  const label = model.children.find((child) => child.sourceNodeId === "dom-learning-link::text");

  assert.equal(model.type, "FRAME");
  assert.equal(model.autoLayout.applied, true);
  assert.equal(model.autoLayout.counterAxisAlignItems, "CENTER");
  assert(label);
  assert.equal(label.text, "我的學習");
  assert.deepEqual(label.rect, { x: 16, y: 20, width: 64.13, height: 24 });
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

test("tiny viewport-clipped explicit-width text is omitted instead of showing an ellipsis", () => {
  const navValue = node("dom-fund-nav-value", "div", { x: 388, y: 613.75, width: 2, height: 24 }, {
    textContent: "751.12",
    styles: {
      display: "block",
      width: "66px",
      height: "24px",
      fontSize: "16px",
      lineHeight: "24px",
      color: "rgb(54, 54, 54)"
    }
  });

  const models = createEditableLayoutNodeModels(packageWithRoot(navValue));

  assert.equal(models.length, 0);
});

test("viewport-clipped empty table spacer does not push visible columns", () => {
  const headerRow = node("dom-header-row", "tr", { x: 16, y: 543.75, width: 374, height: 55 }, {
    styles: {
      display: "flex",
      width: "900px",
      height: "55px"
    },
    children: [
      node("dom-rank-heading", "th", { x: 16, y: 543.75, width: 45, height: 55 }, {
        textContent: "排名",
        styles: {
          display: "flex",
          width: "45px",
          height: "55px",
          backgroundColor: "rgb(240, 240, 240)",
          fontSize: "14px",
          lineHeight: "21px"
        }
      }),
      node("dom-name-heading", "th", { x: 61, y: 543.75, width: 150, height: 55 }, {
        textContent: "基金名稱",
        styles: {
          display: "flex",
          width: "150px",
          height: "55px",
          backgroundColor: "rgb(240, 240, 240)",
          fontSize: "14px",
          lineHeight: "21px"
        }
      }),
      node("dom-hidden-nav-heading", "th", { x: 376, y: 543.75, width: 14, height: 55 }, {
        styles: {
          display: "flex",
          width: "90px",
          height: "55px",
          backgroundColor: "rgba(0, 0, 0, 0)"
        }
      }),
      node("dom-return-heading", "th", { x: 211, y: 543.75, width: 165, height: 55 }, {
        styles: {
          display: "flex",
          width: "165px",
          height: "55px"
        },
        children: [
          text("dom-return-heading-text", "1年", { x: 348.33, y: 560.75, width: 19.67, height: 21 }, {
            fontSize: "14px",
            lineHeight: "21px"
          })
        ]
      })
    ]
  });

  const table = node("dom-table", "table", { x: 16, y: 543.75, width: 374, height: 55 }, {
    styles: {
      display: "table",
      width: "900px",
      height: "55px"
    },
    children: [headerRow]
  });
  const wrapper = node("dom-table-wrapper", "div", { x: 16, y: 543.75, width: 358, height: 55 }, {
    styles: {
      display: "block",
      width: "358px",
      height: "55px",
      overflow: "auto hidden",
      overflowX: "auto",
      overflowY: "hidden"
    },
    children: [table]
  });

  const model = createEditableLayoutNodeModels(packageWithRoot(wrapper))[0];
  const row = model.children[0].children[0];
  const returnHeading = row.children.find((child) => child.sourceNodeId === "dom-return-heading");
  const hiddenSpacer = row.children.find((child) => child.sourceNodeId === "dom-hidden-nav-heading");

  assert.equal(hiddenSpacer, undefined);
  assert.equal(returnHeading.rect.x, 195);
  assert.equal(returnHeading.children[0].rect.x, 137.33);
});

test("overflow-hidden multiline text keeps a fixed clipped text box", () => {
  const fundName = node("dom-fund-name", "a", { x: 73, y: 682.75, width: 126, height: 48 }, {
    textContent: "國泰趨勢ETF傘型基金之臺韓科技基金",
    styles: {
      display: "flow-root",
      width: "126px",
      height: "48px",
      fontSize: "16px",
      lineHeight: "24px",
      color: "rgb(54, 54, 54)",
      whiteSpace: "normal",
      overflow: "hidden",
      overflowX: "hidden",
      overflowY: "hidden"
    }
  });

  const model = createEditableLayoutNodeModels(packageWithRoot(fundName))[0];

  assert.equal(model.type, "TEXT");
  assert.equal(model.textAutoResize, "TRUNCATE");
  assert.equal(model.layoutSizingHorizontal, "FIXED");
  assert.deepEqual(model.rect, { x: 73, y: 682.75, width: 126, height: 48 });
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

test("semantic tags produce readable layer names in the layout tree", () => {
  const root = node("dom-root", "body", { x: 0, y: 0, width: 1440, height: 900 }, {
    children: [
      node("dom-header", "header", { x: 0, y: 0, width: 1440, height: 64 }, {
        styles: { backgroundColor: "rgb(255, 255, 255)" },
        children: [
          node("dom-nav", "nav", { x: 32, y: 12, width: 400, height: 40 }, {
            styles: { backgroundColor: "rgb(247, 247, 247)" }
          })
        ]
      }),
      node("dom-login", "button", { x: 1300, y: 16, width: 80, height: 32 }, {
        textContent: "登入",
        styles: { fontSize: "14px", color: "rgb(17, 24, 39)" }
      }),
      node("dom-footer", "footer", { x: 0, y: 836, width: 1440, height: 64 }, {
        styles: { backgroundColor: "rgb(17, 24, 39)" }
      })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(root))[0];

  const names = model.children.map((child) => child.name);
  assert.ok(names.includes("Header"), `expected Header in ${JSON.stringify(names)}`);
  assert.ok(names.includes("Button / 登入"), `expected Button / 登入 in ${JSON.stringify(names)}`);
  assert.ok(names.includes("Footer"), `expected Footer in ${JSON.stringify(names)}`);
  const header = model.children.find((child) => child.name === "Header");
  assert.equal(header.children[0].name, "Navigation");
});

test("repeated sibling cards are numbered in visual order", () => {
  const card = (id, x) => node(id, "div", { x, y: 200, width: 200, height: 180 }, {
    attributes: { class: "card" },
    styles: { backgroundColor: "rgb(255, 255, 255)" },
    children: [
      text(`${id}-title`, "標題", { x: x + 16, y: 216, width: 80, height: 20 })
    ]
  });
  const root = node("dom-root", "body", { x: 0, y: 0, width: 1440, height: 900 }, {
    children: [card("dom-card-a", 20), card("dom-card-b", 240)]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(root))[0];

  assert.equal(model.children[0].name, "Card 1");
  assert.equal(model.children[1].name, "Card 2");
});

test("transparent same-size wrapper collapses and keeps child absolute rect", () => {
  const inner = node("dom-inner", "div", { x: 100, y: 100, width: 300, height: 200 }, {
    styles: { backgroundColor: "rgb(255, 0, 0)" },
    children: [text("dom-label", "內容", { x: 116, y: 116, width: 60, height: 20 })]
  });
  const wrapper = node("dom-wrapper", "div", { x: 100, y: 100, width: 300, height: 200 }, {
    children: [inner]
  });
  const root = node("dom-root", "body", { x: 0, y: 0, width: 1440, height: 900 }, {
    children: [
      wrapper,
      text("dom-other", "其他", { x: 500, y: 100, width: 60, height: 20 })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(root))[0];

  const collapsed = model.children.find((child) => child.sourceNodeId === "dom-inner");
  assert.ok(collapsed, "expected wrapper to collapse into dom-inner");
  assert.equal(model.children.some((child) => child.sourceNodeId === "dom-wrapper"), false);
  assert.deepEqual(collapsed.absoluteRect, { x: 100, y: 100, width: 300, height: 200 });
  assert.deepEqual(collapsed.rect, { x: 100, y: 100, width: 300, height: 200 });
  assert.deepEqual(summarizeSemanticNamingModels([model]).collapsedWrappers >= 1, true);
});

test("semantic nav wrapper is preserved instead of collapsed", () => {
  const inner = node("dom-menu", "div", { x: 0, y: 0, width: 600, height: 40 }, {
    styles: { backgroundColor: "rgb(247, 247, 247)" }
  });
  const navWrapper = node("dom-nav", "nav", { x: 0, y: 0, width: 600, height: 40 }, {
    children: [inner]
  });
  const root = node("dom-root", "body", { x: 0, y: 0, width: 1440, height: 900 }, {
    children: [
      navWrapper,
      text("dom-other", "其他", { x: 700, y: 10, width: 60, height: 20 })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(root))[0];

  const nav = model.children.find((child) => child.sourceNodeId === "dom-nav");
  assert.ok(nav, "expected nav wrapper to be preserved");
  assert.equal(nav.name, "Navigation");
  assert.equal(nav.children[0].sourceNodeId, "dom-menu");
});

test("direct children of applied auto layout frames are not collapsed", () => {
  const wrapped = (id, x) => node(id, "div", { x, y: 10, width: 60, height: 20 }, {
    children: [text(`${id}-text`, "項目", { x, y: 10, width: 60, height: 20 })]
  });
  const row = node("dom-row", "div", { x: 0, y: 0, width: 400, height: 40 }, {
    styles: {
      display: "flex",
      flexDirection: "row",
      gap: "20px",
      alignItems: "center",
      paddingTop: "10px",
      paddingBottom: "10px"
    },
    children: [wrapped("dom-item-a", 0), wrapped("dom-item-b", 80), wrapped("dom-item-c", 160)]
  });
  const root = node("dom-root", "body", { x: 0, y: 0, width: 1440, height: 900 }, {
    children: [
      row,
      text("dom-other", "其他", { x: 700, y: 100, width: 60, height: 20 })
    ]
  });
  const model = createEditableLayoutNodeModels(packageWithRoot(root))[0];

  const rowModel = model.children.find((child) => child.sourceNodeId === "dom-row");
  assert.equal(rowModel.autoLayout?.applied, true, "expected row to apply auto layout");
  assert.equal(
    rowModel.children.filter((child) => child.sourceNodeId.startsWith("dom-item-")).length,
    3,
    "expected wrappers inside applied auto layout to be preserved"
  );
});
