## ADDED Requirements

### Requirement: SVG vector assets import at rendered size

When importing an SVG vector asset into Figma, the Figma plugin SHALL create the SVG node using the asset's fitted rendered size rather than creating it at only its viewBox/intrinsic size and relying on a later Figma resize. The plugin SHALL preserve existing aspect-ratio fitting, wrapper placement, rotation, and metadata behavior.

#### Scenario: Stroked checked icon with larger viewBox

- **GIVEN** a captured SVG asset whose DOM rect is `14x14`
- **AND** the SVG markup declares `viewBox="0 0 24 24"` and a stroked check path with `stroke-width="4px"`
- **WHEN** the Figma plugin imports the SVG asset
- **THEN** the SVG text passed to `createNodeFromSvg` includes `width="14"` and `height="14"`
- **AND** the imported layer remains a vector SVG layer rather than a raster fallback
