## ADDED Requirements

### Requirement: Calendar date table cells import as centered auto layout containers
The Figma Plugin SHALL import table-cell nodes with exactly one renderable child as centered auto layout containers when captured geometry shows that the child is centered horizontally and vertically within the table cell. The imported table-cell model MUST use applied auto layout with horizontal layout mode, primary-axis center alignment, and counter-axis center alignment. If the child is not centered or bounds are unusable, the importer MUST preserve the existing non-auto-layout behavior.

#### Scenario: Google Calendar mini date cell centers its button
- **WHEN** a captured `td` node is 30.71 by 28 pixels, contains one 24 by 24 pixel date button, and the button center matches the `td` center on both axes
- **THEN** the imported `td` frame has applied auto layout with `layoutMode` `HORIZONTAL`
- **AND** the imported `td` frame has `primaryAxisAlignItems` `CENTER` and `counterAxisAlignItems` `CENTER`

### Requirement: Visually hidden accessibility headings are omitted from editable import
The Figma Plugin SHALL omit visually hidden accessibility text nodes from the Editable Accurate frame when the captured node is absolute or fixed positioned, has an explicit tiny width and height, clips overflow, and contains text that is larger than its visible box. These nodes MUST NOT be imported as TEXT layers that render ellipsis. Visible headings, visible clipped text, and pseudo-element ellipsis used as visible UI content MUST remain on their existing import paths.

#### Scenario: Google Calendar hidden day heading is suppressed
- **WHEN** a captured `h2` node has text `6月 28日 (星期日)沒有活動`, a 1 by 1 pixel rect, CSS width `1px`, CSS height `1px`, `position` `absolute`, and clipped overflow
- **THEN** the importer omits that node from the Editable Accurate frame
- **AND** the imported frame contains no TEXT layer whose content is `6月 28日 (星期日)沒有活動` or a visible ellipsis generated from that node
