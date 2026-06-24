## ADDED Requirements

### Requirement: Full-length SVG stroke dash arrays import as solid strokes

When importing SVG vector assets into Figma, the Figma plugin SHALL remove `stroke-dasharray` from simple SVG stroke geometry when the first dash length covers the full geometry length and `stroke-dashoffset` is absent or zero. The plugin SHALL preserve `stroke-dasharray` when it represents a real repeating dash pattern or when geometry length cannot be safely computed.

#### Scenario: Checked icon draw-animation dash imports as solid check

- **GIVEN** a captured SVG path for a checked icon with `stroke-dasharray` equal to the path length
- **AND** no nonzero `stroke-dashoffset`
- **WHEN** the Figma plugin imports the SVG asset
- **THEN** the SVG text passed to `createNodeFromSvg` does not include `stroke-dasharray`
- **AND** the check remains an editable vector stroke

#### Scenario: Real dashed line remains dashed

- **GIVEN** a captured SVG line whose path length is much longer than its first dash length
- **WHEN** the Figma plugin imports the SVG asset
- **THEN** the SVG text passed to `createNodeFromSvg` keeps the original `stroke-dasharray`
