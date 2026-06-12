## ADDED Requirements

### Requirement: Semantic layer names from captured semantics
The Figma import SHALL derive human-readable layer names from captured semantic data using a fixed priority chain: (1) HTML semantic tag mapping, (2) ARIA role mapping, (3) geometric heuristics for frames, (4) class token mapping, (5) the existing default technical name. The first matching level SHALL win. When no level matches, the import SHALL keep the existing default name unchanged. Interactive or heading layers named by levels 1, 2, or 4 SHALL append an `aria-label` or single-line visible text suffix in the format `<Name> / <text>` with the suffix truncated to 32 characters. Semantic name derivation failures SHALL fall back to the default name and SHALL NOT fail the import.

#### Scenario: Semantic HTML tags map to readable names
- **WHEN** a captured node has tag `header`, `nav`, `footer`, `aside`, `button`, `ul`, or `li`
- **THEN** the imported layer is named `Header`, `Navigation`, `Footer`, `Sidebar`, `Button`, `List`, or `List Item` respectively

#### Scenario: ARIA roles map when tag is non-semantic
- **WHEN** a captured `div` node has `role="banner"`, `role="navigation"`, `role="contentinfo"`, or `role="dialog"`
- **THEN** the imported layer is named `Header`, `Navigation`, `Footer`, or `Modal` respectively

#### Scenario: Interactive layer appends label suffix
- **WHEN** a captured `button` node has `aria-label` value `登入` or single-line visible text `登入`
- **THEN** the imported layer is named `Button / 登入`

#### Scenario: Geometric header heuristic for div-only sites
- **WHEN** a captured `div` frame without semantic tag, role, or class token match touches the viewport top within 2px, spans at least 90% of viewport width, and is at most 25% of viewport height
- **THEN** the imported layer is named `Header`

#### Scenario: Class tokens match whole tokens only
- **WHEN** a captured `div` node has class `product-card` and another has class `scarden`
- **THEN** the first imports as `Card` and the second keeps the default name, because token matching does not match substrings

#### Scenario: Unmatched nodes keep default names
- **WHEN** a captured `div` node matches no semantic tag, role, heuristic, or class token
- **THEN** the imported layer keeps the existing default name such as `Frame / div`

### Requirement: Repeated sibling group naming
The Figma import SHALL detect repeated sibling structures under the same parent using a structural signature composed of tag name, class tokens, and first-level child tag sequence. Siblings sharing a signature with at least 2 members SHALL be named with the group's derived semantic name plus a 1-based index in visual order. Groups with a single member SHALL NOT receive an index.

#### Scenario: Repeated cards are numbered
- **WHEN** a container has three children with identical structural signatures deriving the name `Card`
- **THEN** the imported layers are named `Card 1`, `Card 2`, and `Card 3` in visual order

#### Scenario: Structurally different siblings are not grouped
- **WHEN** a container has two children whose first-level child tag sequences differ
- **THEN** neither child receives an index from the other's group

### Requirement: Non-visual wrapper collapsing
The Figma import SHALL collapse a frame into its only child when all of the following hold: the frame has exactly one renderable child, no direct text, no asset or fallback reference, no visible background, border, shadow, gradient, transform, reduced opacity, or content clipping, its rect matches the child rect within 1px on every edge, it has no applied Auto Layout, it is not a direct child of an applied Auto Layout frame, and it has no semantic name match. Collapsing SHALL preserve the absolute position and size of every remaining node and SHALL apply recursively to chained wrappers. The collapse step SHALL NOT alter Auto Layout inference results.

#### Scenario: Transparent same-size wrapper is removed
- **WHEN** a non-visual `div` wrapper contains exactly one child whose rect matches the wrapper rect within 1px
- **THEN** the imported layer tree contains the child at the wrapper's tree position with an unchanged absolute rect, and the wrapper layer does not appear

#### Scenario: Semantic wrappers are preserved
- **WHEN** a transparent same-size wrapper is a `nav` element
- **THEN** the wrapper imports as a `Navigation` frame and is not collapsed

#### Scenario: Auto Layout children are not collapsed
- **WHEN** a transparent same-size wrapper is a direct child of an applied Auto Layout frame
- **THEN** the wrapper is not collapsed

### Requirement: Semantic naming statistics in import report
The import report SHALL include the count of semantically named layers, the count of detected repeated sibling groups, and the count of collapsed wrappers. Missing statistics SHALL display as zero.

#### Scenario: Report shows semantic statistics
- **WHEN** an import names 12 layers semantically, detects 2 repeated groups, and collapses 5 wrappers
- **THEN** the import report shows semantic name count 12, repeated group count 2, and collapsed wrapper count 5

### Requirement: Semantic naming runtime parity
The module runtime and the classic plugin runtime SHALL produce identical layer names, identical collapsed layer trees, and identical semantic naming statistics for the same `.figcapture` input.

#### Scenario: Classic runtime matches module runtime
- **WHEN** the same fixture package is imported through the module runtime and the classic runtime
- **THEN** both produce the same layer names, the same collapsed tree shape, and the same semantic statistics
