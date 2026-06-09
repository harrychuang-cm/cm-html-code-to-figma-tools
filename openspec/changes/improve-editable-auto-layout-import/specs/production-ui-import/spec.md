## ADDED Requirements

### Requirement: Editable import preserves layout hierarchy
The Figma Plugin SHALL preserve captured DOM parent-child structure in the Editable Accurate frame by creating nested Figma frames for renderable containers. The importer MUST place child nodes inside their nearest rendered parent container using parent-relative geometry. The importer MUST NOT flatten all renderable nodes as direct siblings of the Editable Accurate frame.

#### Scenario: Nested navigation import

- **WHEN** a package contains a captured navigation list with list item children
- **THEN** the Editable Accurate frame contains a parent frame for the navigation list and child text or image layers nested inside that parent frame

##### Example: horizontal nav structure

- **GIVEN** a nav container at x=100, y=20, width=300, height=40 with two child items at x=112 and x=180
- **WHEN** the package is imported
- **THEN** the nav frame is placed at x=100 and y=20, and its child item layers use parent-relative x positions 12 and 80

### Requirement: High-confidence flex containers become Auto Layout
The Figma Plugin SHALL convert high-confidence captured flex containers into Figma Auto Layout frames in the Editable Accurate frame. A high-confidence multi-child flex container MUST have at least two renderable child models, non-overlapping child bounds on the inferred primary axis, finite parent bounds, no fixed or sticky layout risk, and no strongly non-uniform implicit spacing that cannot be represented by a single Figma item spacing value. A high-confidence single-child text container MUST have one single-line text child, finite parent and child bounds, no fixed or sticky layout risk, no complex grid risk, no out-of-bounds child risk, and explicit alignment evidence from supported CSS flex alignment or CSS line-height line box geometry. The importer MUST infer layout axis from flex-direction when available, item spacing from CSS gap or measured child gaps for multi-child containers, supported axis alignment from CSS align-items and justify-content, and padding from child bounds relative to the parent container when the relevant axis is not already controlled by CSS alignment.

#### Scenario: Horizontal flex row becomes Auto Layout

- **WHEN** a captured flex row has non-overlapping children, flex-direction row, gap 16px, and visible bounds
- **THEN** the imported parent frame has Figma layoutMode HORIZONTAL, itemSpacing 16, fixed width and height, and child layers nested in DOM order

##### Example: row spacing inference

| Captured style | Child x positions | Expected layout |
| -------------- | ----------------- | --------------- |
| gap: 16px, flex-direction: row | 120, 176, 232 | HORIZONTAL with itemSpacing 16 |
| gap: normal, flex-direction: row | 120, 170, 220 | HORIZONTAL with itemSpacing 10 when child width is 40 |

#### Scenario: Vertical flex column becomes Auto Layout

- **WHEN** a captured flex column has non-overlapping children, flex-direction column, row-gap 12px, and visible bounds
- **THEN** the imported parent frame has Figma layoutMode VERTICAL, itemSpacing 12, fixed width and height, and child layers nested in DOM order

#### Scenario: Horizontal flex row maps center alignment

- **WHEN** a captured horizontal flex row has align-items center and visible child bounds
- **THEN** the imported parent frame has Figma counterAxisAlignItems CENTER and does not preserve inferred top or bottom padding that would cancel vertical centering

##### Example: top menu vertical centering

- **GIVEN** a top menu flex row `dom-top-menu` at x=92.91, y=0, width=833.68, height=28 with `align-items: center`, child text at y=0, width=60, height=20, and child icon at y=0, width=12, height=12
- **WHEN** the package is imported
- **THEN** `dom-top-menu` has layoutMode HORIZONTAL, counterAxisAlignItems CENTER, paddingTop 0, and paddingBottom 0

#### Scenario: Flex row maps primary axis alignment

- **WHEN** a captured horizontal flex row has justify-content center
- **THEN** the imported parent frame has Figma primaryAxisAlignItems CENTER and does not preserve inferred left or right padding that would cancel horizontal centering

##### Example: centered toolbar actions

- **GIVEN** a toolbar flex row `dom-toolbar-actions` at x=0, y=0, width=320, height=40 with `justify-content: center`, child button A at x=96, y=8, width=48, height=24, and child button B at x=160, y=8, width=64, height=24
- **WHEN** the package is imported
- **THEN** `dom-toolbar-actions` has layoutMode HORIZONTAL, primaryAxisAlignItems CENTER, paddingLeft 0, and paddingRight 0

#### Scenario: Space-between flex container preserves padding

- **WHEN** a captured flex container has justify-content space-between and children inset from the parent bounds
- **THEN** the imported parent frame has Figma primaryAxisAlignItems SPACE_BETWEEN and preserves padding on the primary and counter axes

##### Example: padded chart aside panel

- **GIVEN** a flex column `dom-chart-aside` at x=1090, y=101, width=300, height=240 with `justifyContent: "space-between"`, child section at x=1106, y=117, width=268, height=60, and child chart at x=1106, y=177, width=268, height=148
- **WHEN** the package is imported
- **THEN** `dom-chart-aside` has layoutMode VERTICAL, primaryAxisAlignItems SPACE_BETWEEN, paddingLeft 16, paddingRight 16, paddingTop 16, and paddingBottom 16

#### Scenario: Reverse flex row preserves browser visual order

- **WHEN** a captured flex row has `flex-direction: row-reverse`
- **THEN** the imported Figma Auto Layout frame preserves the browser visual left-to-right order by reversing child insertion order

##### Example: article action buttons

- **GIVEN** a flex row `dom-action-row` with `flexDirection: "row-reverse"` and DOM child text labels in order `"打賞"`, `"分享"`, `"留言"`, `"讚"`
- **WHEN** the package is imported
- **THEN** `dom-action-row` has layoutMode HORIZONTAL and its Auto Layout child order is `"讚"`, `"留言"`, `"分享"`, `"打賞"`

#### Scenario: Reverse flex column preserves browser visual order

- **WHEN** a captured flex column has `flex-direction: column-reverse`
- **THEN** the imported Figma Auto Layout frame preserves the browser visual top-to-bottom order by reversing child insertion order

#### Scenario: Single-child line-height text container maps vertical centering

- **WHEN** a captured container has exactly one single-line text child, the parent height is greater than the text height, and CSS line-height evidence indicates a centered line box
- **THEN** the imported parent frame has Figma layoutMode HORIZONTAL, counterAxisAlignItems CENTER, fixed width and height, and no inferred top or bottom padding that would keep the text top-aligned

##### Example: header link list item

- **GIVEN** a list item `dom-header-link-item` at x=100, y=0, width=84, height=28 with `lineHeight: "28px"` and one text child `dom-header-link-text` at x=100, y=0, width=84, height=20 with textContent `"股市爆料同學會"`
- **WHEN** the package is imported
- **THEN** `dom-header-link-item` has layoutMode HORIZONTAL, counterAxisAlignItems CENTER, paddingLeft 0, paddingRight 0, paddingTop 0, and paddingBottom 0

#### Scenario: Single-child flex menu item with equal line box maps vertical centering

- **WHEN** a captured flex menu item has exactly one single-line text child, `align-items: center`, parent height 28, and child captured height 28
- **THEN** the imported parent frame has Figma layoutMode HORIZONTAL, counterAxisAlignItems CENTER, fixed width and height, and no inferred top or bottom padding that would keep the text top-aligned

##### Example: top menu item without dropdown arrow

- **GIVEN** a list item `dom-header-link-no-arrow` at x=184.91, y=0, width=84, height=28 with `display: "flex"` and `alignItems: "center"`, and one text child `dom-header-link-no-arrow-text` at x=184.91, y=0, width=84, height=28 with textContent `"股市爆料同學會"`
- **WHEN** the package is imported
- **THEN** `dom-header-link-no-arrow` has layoutMode HORIZONTAL, counterAxisAlignItems CENTER, paddingLeft 0, paddingRight 0, paddingTop 0, and paddingBottom 0

### Requirement: Risky layout containers stay absolute
The Figma Plugin SHALL keep risky or low-confidence containers as ordinary nested frames without Auto Layout. The importer MUST record skipped auto layout reasons in the import report for overlapping children, fixed or sticky containers, complex grid containers, missing bounds, one-child containers that lack explicit alignment evidence, absolute-positioned decoration children, and flex containers with strongly non-uniform implicit child gaps that cannot be represented by captured CSS alignment.

#### Scenario: Overlapping container is skipped

- **WHEN** a captured container has two renderable children whose bounds overlap on the primary axis
- **THEN** the imported parent frame keeps layoutMode NONE and the import report includes skipped reason overlapping-layout for that sourceNodeId

##### Example: horizontal overlap

- **GIVEN** a flex row container `dom-overlap` at x=0, y=0, width=200, height=60 with child A at x=10, width=80 and child B at x=50, width=80
- **WHEN** the package is imported
- **THEN** `dom-overlap` is rendered as a nested frame without Auto Layout and `autoLayoutConfidenceSummary.skippedReasons` includes `{ sourceNodeId: "dom-overlap", reason: "overlapping-layout" }`

#### Scenario: Fixed overlay is skipped

- **WHEN** a captured container has position fixed or sticky
- **THEN** the imported parent frame keeps layoutMode NONE and the import report includes skipped reason fixed-or-sticky-layout for that sourceNodeId

##### Example: sticky header

- **GIVEN** a container `dom-sticky-header` with `position: sticky`, x=0, y=0, width=1200, height=64 and two non-overlapping child items
- **WHEN** the package is imported
- **THEN** `dom-sticky-header` is rendered as a nested frame without Auto Layout and `autoLayoutConfidenceSummary.skippedReasons` includes `{ sourceNodeId: "dom-sticky-header", reason: "fixed-or-sticky-layout" }`

#### Scenario: Out-of-bounds wrapper is skipped

- **WHEN** a captured flex container includes a child whose captured bounds sit outside the parent bounds or depend on a large negative parent-relative offset
- **THEN** the imported parent frame keeps layoutMode NONE and the import report includes skipped reason out-of-bounds-child for that sourceNodeId

##### Example: nonvisual wrapper

- **GIVEN** a flex row container `dom-menu-item` at x=100, y=100, width=140, height=24 with an icon child inside the bounds and a wrapper child `dom-label-wrapper` at x=-78, y=-95, width=1, height=1 containing visible text positioned back into the row
- **WHEN** the package is imported
- **THEN** `dom-menu-item` is rendered as a nested frame without Auto Layout and `autoLayoutConfidenceSummary.skippedReasons` includes `{ sourceNodeId: "dom-menu-item", reason: "out-of-bounds-child" }`

#### Scenario: Non-uniform implicit flex spacing is skipped

- **WHEN** a captured flex container has at least three children whose primary-axis gaps are strongly non-uniform, and captured CSS does not provide `justify-content: space-between` or another equivalent alignment mapping
- **THEN** the imported parent frame keeps layoutMode NONE and the import report includes skipped reason non-uniform-spacing for that sourceNodeId

##### Example: left cluster plus right-aligned response count

- **GIVEN** a flex row `dom-response-row` at x=366, y=931, width=696, height=20.1 with `justifyContent: "normal"`, child `dom-response-like` at x=366, width=52.16, child `dom-response-worth` at x=426.16, width=51.83, and child `dom-response-comments` at x=999, width=63
- **WHEN** the package is imported
- **THEN** `dom-response-row` is rendered as a nested frame without Auto Layout, its child x positions are 0, 60.16, and 633 relative to the parent, and `autoLayoutConfidenceSummary.skippedReasons` includes `{ sourceNodeId: "dom-response-row", reason: "non-uniform-spacing" }`

### Requirement: Mixed inline content preserves direct text and child nodes
The Figma Plugin SHALL preserve elements that combine direct text content and renderable child elements. When a captured node has both direct `textContent` and child SVG, image, or text nodes, the importer MUST create a container frame, keep all child models, and synthesize an editable direct-text child instead of treating the original element as a text leaf.

#### Scenario: Icon and direct label both import

- **WHEN** a captured inline or flex element has a visible SVG child and direct label text
- **THEN** the imported element is a frame containing the SVG/image model and a synthesized text model for the direct label

##### Example: checkout link icon plus label

- **GIVEN** a captured link `dom-checkout-link` at x=100, y=6, width=40, height=16 with direct textContent `"結帳"` and child SVG `dom-cart-svg` at x=100, y=6, width=16, height=16
- **WHEN** the package is imported
- **THEN** `dom-checkout-link` is a HORIZONTAL frame whose children are an SVG/image model for `dom-cart-svg` followed by a TEXT model with sourceNodeId `dom-checkout-link::text` and text `"結帳"`

#### Scenario: Direct text between icon and child text keeps visual order

- **WHEN** a captured inline or flex element has a leading SVG child, direct text, and a later child text node
- **THEN** the imported frame keeps the SVG, synthesized direct text, and later child text in browser visual order

##### Example: points link icon, label, and count

- **GIVEN** a captured link `dom-member-points-link` at x=620, y=0, width=50.08, height=16 with child SVG `dom-member-points-svg` at x=620, y=0, width=16, height=16, direct textContent `"P點:"`, and child text `dom-member-points-count` at x=662.88, y=0, width=7.2, height=16 with textContent `"4"`
- **WHEN** the package is imported
- **THEN** `dom-member-points-link` is a HORIZONTAL frame whose children are an SVG/image model, a TEXT model with sourceNodeId `dom-member-points-link::text` and text `"P點:"`, and a TEXT model with text `"4"` in that order

### Requirement: Visible CSS pseudo-elements import as decoration layers
The Chrome Extension SHALL capture visible CSS `::before` and `::after` pseudo-elements as synthetic child nodes when their computed styles describe a visible box. The Figma Plugin SHALL import those synthetic nodes as visual rectangle layers. Containers with absolute-positioned pseudo-element children MUST keep absolute child geometry instead of treating the pseudo-element as an Auto Layout flow item.

#### Scenario: Active tab underline pseudo-element is captured

- **WHEN** a visible element has a displayed `::after` pseudo-element with `content`, nonzero inferred width/height, and a visible background color
- **THEN** the `.figcapture` node contains a synthetic child with `nodeType: "pseudo"`, tagName `"::after"`, computed visual styles, and viewport rect inferred from the applicable owner or positioned containing-block box and pseudo-element offsets

##### Example: tab active underline

- **GIVEN** a captured active tab element `dom-active-tab` at x=100, y=20, width=64, height=60 whose computed `::after` has `content: "\"\""`, `display: "block"`, `position: "absolute"`, `left: "16px"`, `bottom: "0px"`, `width: "32px"`, `height: "2px"`, and `backgroundColor: "rgb(194, 41, 46)"`
- **WHEN** the page is captured
- **THEN** the synthetic `::after` child has rect x=116, y=78, width=32, height=2 and `attributes["data-pseudo"]: "::after"`

#### Scenario: Absolute pseudo-element uses positioned containing block

- **WHEN** a visible static element owns an absolute `::after`, and its nearest positioned ancestor establishes the containing block
- **THEN** the synthetic pseudo-element rect is inferred from that positioned ancestor rather than the static owner box

##### Example: active child label underline inside positioned tab

- **GIVEN** a positioned tab item at x=100, y=20, width=64, height=60 with a static active label child at x=116, y=38, width=32, height=24 whose computed `::after` has `content: "\"\""`, `display: "block"`, `position: "absolute"`, `left: "0px"`, `top: "57px"`, `width: "64px"`, `height: "3px"`, and `backgroundColor: "rgb(194, 41, 46)"`
- **WHEN** the page is captured
- **THEN** the synthetic `::after` child has rect x=100, y=77, width=64, height=3

#### Scenario: Active tab underline imports as rectangle without Auto Layout flow

- **WHEN** a captured element has a label child and an absolute-positioned visible pseudo-element underline child
- **THEN** the imported parent stays a nested frame without Auto Layout and the pseudo-element imports as a rectangle at the captured parent-relative position

##### Example: active tab label and underline

- **GIVEN** a captured tab `dom-active-tab` at x=100, y=20, width=64, height=60 with text child `dom-active-tab-label` at x=116, y=38, width=32, height=24 and pseudo child `dom-active-tab-after` at x=116, y=78, width=32, height=2, `position: "absolute"`, and `backgroundColor: "rgb(194, 41, 46)"`
- **WHEN** the package is imported
- **THEN** `dom-active-tab` records skipped reason `absolute-position-child` and `dom-active-tab-after` is a rectangle at parent-relative x=16, y=58, width=32, height=2

### Requirement: Editable text preserves visual bounds
The Figma Plugin SHALL choose a text resize mode that matches captured text geometry when creating editable text layers. Text nodes captured as single-line content MUST use auto-width behavior so Figma font substitution does not wrap labels, usernames, stock codes, or short numbers into multiple lines. Auto-width text MUST also use Figma Auto Layout child HUG sizing when the host API supports it, so navigation labels size to their content inside top bars and menu rows. Text nodes captured as multiline or constrained content MUST keep their captured width so Figma auto-resize does not turn wrapped production text into overflowing single-line text. Text nodes with visible background, visible border, or shadow MUST preserve that visual backing while keeping the text editable. Text nodes with only invisible decorative styles, such as transparent background plus border radius and no visible border or shadow, MUST remain editable text without a fixed-width backing frame.

#### Scenario: Single-line text uses auto width

- **WHEN** a captured text node has content without explicit newline and captured height no larger than one line-height
- **THEN** the imported Figma text node uses auto-width behavior

##### Example: username label

- **GIVEN** a captured text node `dom-user-name` with content `harry_chuang`, x=60, y=12, width=108, height=24, font size 16px, and line-height 24px
- **WHEN** the package is imported
- **THEN** `dom-user-name` uses Figma `WIDTH_AND_HEIGHT` text auto-resize behavior

#### Scenario: Top bar menu text uses Hug child sizing

- **WHEN** a captured top bar menu label is a single-line text node inside a flex Auto Layout menu row
- **THEN** the imported Figma text node uses `WIDTH_AND_HEIGHT` text auto-resize and horizontal HUG child sizing rather than fixed or fill width

##### Example: menu label beside dropdown arrow

- **GIVEN** a captured menu row `dom-top-menu-item` with `display: "flex"`, `alignItems: "center"`, a text child `dom-top-menu-label` with textContent `"理財寶商城"`, and a 12px dropdown arrow child
- **WHEN** the package is imported
- **THEN** `dom-top-menu-label` has `textAutoResize: "WIDTH_AND_HEIGHT"` and `layoutSizingHorizontal: "HUG"`

#### Scenario: Clipped single-line text keeps fixed width

- **WHEN** a captured single-line text node has CSS inline clipping such as `white-space: nowrap` plus `overflow: hidden`, and the full text would exceed the captured rect width
- **THEN** the imported Figma text node keeps fixed horizontal sizing and uses truncate/fixed text behavior instead of HUG sizing

##### Example: clipped account name in top bar

- **GIVEN** a captured text node `dom-member-name` with textContent `"harry_chuang"`, x=1468, y=6, width=48, height=16, `fontSize: "12px"`, `lineHeight: "16px"`, `whiteSpace: "nowrap"`, `overflow: "hidden"`, and `width: "48px"`
- **WHEN** the package is imported
- **THEN** `dom-member-name` has `textAutoResize: "TRUNCATE"`, `layoutSizingHorizontal: "FIXED"`, and width 48

#### Scenario: Long text keeps captured width

- **WHEN** a captured text node has width 244, height 40, and long content that wraps inside a right rail list item
- **THEN** the imported Figma text node has width 244 and uses an auto-height or fixed-width behavior rather than width-and-height auto-resize

#### Scenario: Text background is preserved

- **WHEN** a captured text node has visible background color and text content
- **THEN** the imported editable output contains a visual backing frame or rectangle with the captured background and a nested text layer using parent-relative geometry

##### Example: stock price badge

- **GIVEN** a captured text node `dom-price` with content `48.35`, x=24, y=84, width=47, height=24, background color `rgb(0, 131, 83)`, corner radius 2px, and text color white
- **WHEN** the package is imported
- **THEN** `dom-price` creates a visual backing frame at x=24, y=84, width=47, height=24, and a nested editable text layer at x=0, y=0, width=47, height=24

#### Scenario: Padded visible text backing keeps CSS padding

- **WHEN** a captured single-line text node has visible background, text content, and explicit CSS padding
- **THEN** the imported editable output contains a fixed-size Auto Layout backing frame whose padding matches the captured CSS padding and whose nested text uses auto-width HUG sizing

##### Example: compact reaction badge

- **GIVEN** a captured text node `dom-mark` with content `讚`, x=380, y=904.6, width=20, height=20.5, background color `rgb(54, 54, 54)`, corner radius 27px, text color white, and padding top/right/bottom/left of 2px/4px/2px/4px
- **WHEN** the package is imported
- **THEN** `dom-mark` creates a visual backing frame at x=380, y=904.6, width=20, height=20.5 with Auto Layout padding left/right/top/bottom of 4/4/2/2 and a nested editable text layer using `WIDTH_AND_HEIGHT` auto-resize and horizontal HUG sizing

#### Scenario: Transparent rounded button label uses auto width

- **WHEN** a captured single-line button text node has transparent background, border radius, no visible border, no visible shadow, and no explicit newline after whitespace normalization
- **THEN** the imported editable output keeps the node as a text layer using auto-width behavior instead of creating a fixed-width Text Background frame

##### Example: article answer count button

- **GIVEN** a captured `button.articleResponse__comment` node `dom-answer-count` with textContent `"9則回答"`, x=1011, y=884, width=54, height=20, `backgroundColor: "rgba(0, 0, 0, 0)"`, `borderTopLeftRadius: "4px"`, and border widths `0px`
- **WHEN** the package is imported
- **THEN** `dom-answer-count` is a TEXT model with `textAutoResize: "WIDTH_AND_HEIGHT"` and no parent model named `Text Background / 9則回答`

### Requirement: Captured text preserves browser whitespace semantics
The Chrome Extension SHALL normalize direct text content according to captured CSS `white-space` semantics before writing `textContent` into `.figcapture`. For `white-space: normal`, `nowrap`, missing, or unsupported values, the capture MUST collapse consecutive whitespace characters into a single space and trim leading and trailing whitespace. For `white-space: pre`, `pre-wrap`, or `break-spaces`, the capture MUST preserve raw direct text whitespace. For `white-space: pre-line`, the capture MUST preserve line breaks while collapsing horizontal whitespace within each line and removing indentation-only leading and trailing whitespace.

#### Scenario: Normal text collapses template indentation

- **WHEN** a visible element has `white-space: normal` and its direct DOM text contains HTML template indentation and line breaks
- **THEN** the captured node textContent contains the browser-visible text with collapsed spacing

##### Example: volume row

- **GIVEN** a direct text node value `"\n          成交量\n          44,279 張\n        "` with captured `whiteSpace: "normal"`
- **WHEN** the page is captured
- **THEN** the captured element textContent is `"成交量 44,279 張"`

#### Scenario: Preformatted text preserves raw whitespace

- **WHEN** a visible element has `white-space: pre`, `pre-wrap`, or `break-spaces`
- **THEN** the captured node textContent preserves direct DOM text whitespace instead of collapsing indentation or line breaks

##### Example: code-like label

| Captured whiteSpace | Direct text value | Expected textContent |
| ------------------- | ----------------- | -------------------- |
| pre | `" A\n  B "` | `" A\n  B "` |
| pre-wrap | `" A\n  B "` | `" A\n  B "` |
| break-spaces | `" A\n  B "` | `" A\n  B "` |

#### Scenario: Pre-line preserves line breaks but removes indentation

- **WHEN** a visible element has `white-space: pre-line`
- **THEN** the captured node textContent preserves meaningful line breaks while collapsing indentation within each line

##### Example: multiline copy

- **GIVEN** a direct text node value `"\n          第一行\n          第二行\n        "` with captured `whiteSpace: "pre-line"`
- **WHEN** the page is captured
- **THEN** the captured element textContent is `"第一行\n第二行"`

### Requirement: Captured box spacing preserves browser padding
The Chrome Extension SHALL include computed padding values in captured styles so Figma import can map box insets to Auto Layout padding without relying only on child geometry.

#### Scenario: Computed padding is captured

- **WHEN** a visible DOM element has computed padding values
- **THEN** the `.figcapture` node styles include `paddingTop`, `paddingRight`, `paddingBottom`, and `paddingLeft`

##### Example: right rail chart card

- **GIVEN** a `div.chartContainerTrend.page__aside` has computed `padding: 16px`
- **WHEN** the extension captures the visible viewport
- **THEN** that captured node has `styles.paddingTop: "16px"`, `styles.paddingRight: "16px"`, `styles.paddingBottom: "16px"`, and `styles.paddingLeft: "16px"`

### Requirement: Canvas fallback captures current bitmap
The Chrome Extension SHALL package a canvas element's current bitmap as the fallback asset when browser APIs permit serialization. When direct canvas serialization is unavailable or produces only the transparent placeholder, the extension SHALL attempt to crop the same viewport region from the captured visible screenshot and use that PNG as the fallback asset. The extension MUST keep the existing canvas fallback diagnostic, and it MUST fall back to the transparent placeholder only when both direct serialization and screenshot crop fallback fail.

#### Scenario: Canvas bitmap fallback is available

- **WHEN** a visible canvas element can be serialized to a PNG data URL
- **THEN** the `.figcapture` package contains PNG bytes for that canvas fallback asset instead of the transparent placeholder

#### Scenario: Screenshot crop fallback is available for unserializable canvas

- **WHEN** a visible canvas element cannot be serialized but a visible viewport screenshot is available and browser crop APIs are available
- **THEN** the `.figcapture` package contains a PNG crop for that canvas fallback asset using the canvas viewport rect
- **AND** the package records the canvas fallback diagnostic for debugging

#### Scenario: Canvas bitmap fallback fails safely

- **WHEN** a visible canvas element throws during serialization because it is tainted or unsupported and screenshot crop fallback is unavailable
- **THEN** the `.figcapture` package still imports with a transparent fallback asset and records a canvas fallback diagnostic

### Requirement: Visible viewport capture clips exported geometry
The Chrome Extension SHALL write visible-viewport `.figcapture` geometry using viewport-clipped rectangles. Elements that intersect the visible viewport MUST keep only the intersection with the viewport in their captured `rect`, while offscreen elements without visible children MUST remain excluded. This MUST prevent root, body, or long document containers from producing full-page-height frames when the capture scope is visible viewport only.

#### Scenario: Long body is clipped to viewport height

- **WHEN** the captured body has rect x=0, y=0, width=1440, height=3200 and the viewport is width=1440, height=900
- **THEN** the captured root rect is x=0, y=0, width=1440, height=900

#### Scenario: Partially visible container is clipped to the visible intersection

- **WHEN** a captured container has rect x=100, y=800, width=300, height=400 and the viewport is width=1440, height=900
- **THEN** the captured container rect is x=100, y=800, width=300, height=100

### Requirement: Lazy image sources resolve before placeholders
The Chrome Extension SHALL choose a real image source candidate for `img` assets before packaging a placeholder. If `currentSrc` or `src` is missing or is a transparent placeholder data URL, the extension MUST evaluate captured lazy image attributes such as `data-src`, `data-original`, `data-lazy-src`, `srcset`, and `data-srcset`. The selected candidate MUST preserve SVG vs raster asset kind detection.

#### Scenario: Lazy SVG icon uses data-src instead of transparent GIF

- **WHEN** an image has `currentSrc` and `src` set to a transparent 1x1 GIF placeholder and `data-src` set to a data URL SVG plus icon
- **THEN** the `.figcapture` package stores the SVG bytes from `data-src`
- **AND** the captured node asset kind is `svg`

#### Scenario: Loaded responsive image keeps currentSrc

- **WHEN** an image has a non-placeholder `currentSrc` and a different `data-src`
- **THEN** the `.figcapture` package uses `currentSrc` as the selected image source
