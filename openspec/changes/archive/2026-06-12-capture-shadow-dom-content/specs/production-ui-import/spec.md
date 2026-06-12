## ADDED Requirements

### Requirement: Shadow DOM content capture
The Chrome Extension SHALL capture the rendered tree of elements that host a shadow root. When an element has an accessible shadow root, the capture SHALL traverse the shadow root's child elements instead of the element's light DOM children. The shadow host's own geometry, computed styles, and attributes SHALL be captured unchanged. Light DOM children of a shadow host SHALL appear in the capture only where slots project them. Shadow DOM content SHALL be represented as ordinary element nodes in `capture.json` without schema changes.

#### Scenario: Open shadow root subtree is captured
- **WHEN** a custom element has an open shadow root containing a `div` with text and styles
- **THEN** the captured tree contains the shadow `div` as a child of the host node with its rendered rect and computed styles, and the host's unslotted light DOM children do not appear as direct children

#### Scenario: Shadow content imports into Figma
- **WHEN** a `.figcapture` containing shadow DOM content is imported
- **THEN** the shadow elements render as editable Figma layers identical to equivalent light DOM elements

### Requirement: Slot projection capture
The capture SHALL replace each `<slot>` element with its projected content at the slot's position in the rendered tree. Slots with assigned elements SHALL be expanded using flattened assignment. Slots without assigned nodes SHALL be expanded to their default content. Assigned text nodes SHALL be captured as synthetic text nodes positioned by Range-derived bounding rects when the Range API is available, and SHALL be skipped without error when it is not. The `<slot>` element itself SHALL NOT produce a captured node.

#### Scenario: Named slot projection appears at slot position
- **WHEN** a light DOM element with `slot="title"` is assigned to a named slot inside the shadow root
- **THEN** the captured tree contains that element at the slot's position in the shadow tree, and no node for the `<slot>` element itself

#### Scenario: Default slot content appears when nothing is assigned
- **WHEN** a slot has no assigned nodes and contains default fallback content
- **THEN** the captured tree contains the default content at the slot's position

#### Scenario: Nested slot projection is flattened
- **WHEN** an element is projected through a slot that is itself assigned to another slot
- **THEN** the captured tree contains the element once, at the final rendered position

### Requirement: Closed shadow root fallback
The content script SHALL attempt to access closed shadow roots through the browser-provided open-or-closed shadow root API, guarded so that an unavailable or throwing API is treated as no shadow root. A custom element whose shadow root cannot be accessed and which has no renderable light DOM children SHALL be marked as a closed shadow host. Marked hosts SHALL become raster fallback regions using the existing viewport screenshot crop, with the diagnostic reason `closed shadow root fallback`. Crop failures SHALL record a missing asset diagnostic and SHALL NOT block export or import.

#### Scenario: Accessible closed shadow root captures like open
- **WHEN** the open-or-closed shadow root API returns a closed shadow root for a host
- **THEN** the closed shadow subtree is captured identically to an open shadow root

#### Scenario: Inaccessible closed host becomes screenshot crop fallback
- **WHEN** a custom element's shadow root cannot be accessed and it has no renderable light DOM children
- **THEN** the exported package contains a fallback asset cropped from the viewport screenshot for that host's rect, and diagnostics record the reason `closed shadow root fallback`

#### Scenario: Crop failure degrades without blocking
- **WHEN** screenshot cropping is unavailable for a marked closed shadow host
- **THEN** the package still exports, the import still succeeds, and diagnostics record a missing asset

### Requirement: Shadow capture runtime parity
The pure capture module and the injected content script SHALL produce the same captured tree for the same DOM input, including shadow root traversal, slot expansion, and closed shadow host marking. The pure module SHALL accept an injected open-or-closed shadow root accessor instead of depending on browser extension APIs.

#### Scenario: Module accepts injected shadow root accessor
- **WHEN** the pure capture module is called with an injected accessor that returns a closed shadow root
- **THEN** the captured tree contains the closed shadow subtree without any browser extension API dependency
