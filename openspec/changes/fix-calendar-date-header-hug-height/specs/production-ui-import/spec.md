## ADDED Requirements

### Requirement: Transparent leading text rows hug counter-axis content

When importing a transparent horizontal row whose only children are single-line text nodes, whose child bounds start at the leading counter-axis edge, and whose child bounds are much smaller than the captured parent height, the Figma plugin SHALL set the auto-layout counter-axis sizing mode to `AUTO` and center the children on the counter axis. This requirement SHALL apply to explicit CSS flex rows and inferred non-flex horizontal flows. The decision SHALL be based on captured layout, style, and geometry signals rather than specific Figma node ids, visible text strings, DOM class names, URLs, or source application names. The plugin SHALL preserve fixed counter-axis sizing for rows with visual box styling or rows whose content fills the captured counter-axis height.

#### Scenario: Calendar date header row hugs height

- **GIVEN** a captured transparent horizontal flex row with width `157.57`, height `173.6`, and two text children `7` and `(廿二)` at `y=0`
- **AND** the text child union height is `30`
- **WHEN** the Figma plugin imports the row
- **THEN** the imported frame uses horizontal auto layout
- **AND** its `counterAxisSizingMode` is `AUTO`
- **AND** its `counterAxisAlignItems` is `CENTER`

#### Scenario: Equivalent HTML/CSS text row uses the same rule

- **GIVEN** another captured transparent horizontal flex row from a different page or DOM class
- **AND** it has only single-line text children whose union starts at the leading counter-axis edge and is much smaller than the captured parent height
- **WHEN** the Figma plugin imports the row
- **THEN** the imported frame uses `counterAxisSizingMode` `AUTO`
- **AND** its counter-axis alignment is `CENTER`

#### Scenario: Inferred non-flex date row uses the same rule

- **GIVEN** a captured transparent non-flex row whose text children are inferred as a horizontal flow
- **AND** its parent rect is `157.57` wide and `173.6` high
- **AND** its two text children have heights `16` and `30` and a union height much smaller than the parent height
- **WHEN** the Figma plugin imports the row
- **THEN** the imported frame uses horizontal auto layout
- **AND** its `counterAxisSizingMode` is `AUTO`
- **AND** its `counterAxisAlignItems` is `CENTER`

### Requirement: Accessible iframe subtrees remain editable

When capturing a visible iframe whose document is accessible through `contentDocument` or `contentWindow.document`, the extension SHALL capture the iframe document's rendered child DOM as normal editable capture nodes and translate their rectangles into parent-page coordinates. The extension SHALL NOT add an iframe raster fallback for an iframe that has captured child nodes. The extension SHALL preserve `iframe fallback` behavior for iframes whose document cannot be read or whose accessible document has no captured children.

#### Scenario: Accessible iframe children are captured instead of rasterized

- **GIVEN** a visible iframe at parent-page rect `x=1000`, `y=64`, `width=436`, `height=210`
- **AND** the iframe document is accessible and contains a visible child at iframe-local rect `x=12`, `y=8`, `width=160`, `height=24`
- **WHEN** the extension captures the page
- **THEN** the iframe node has a captured child node
- **AND** the child node rect is `x=1012`, `y=72`, `width=160`, `height=24`
- **AND** asset capture does not assign `fallbackRef` to the iframe
- **AND** diagnostics do not include an `iframe fallback` entry for that iframe

#### Scenario: Inaccessible iframe still uses fallback

- **GIVEN** a visible iframe whose document is not accessible or has no captured child nodes
- **WHEN** the extension captures visual assets
- **THEN** asset capture assigns an iframe `fallbackRef`
- **AND** diagnostics include reason `iframe fallback`
