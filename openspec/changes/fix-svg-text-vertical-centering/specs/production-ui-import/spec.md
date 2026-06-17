## ADDED Requirements

### Requirement: SVG text dominant-baseline resolves to a baseline y offset
When normalizing inline SVG markup for Figma vector import, the Chrome Extension SHALL convert a non-alphabetic computed `dominant-baseline` on SVG text-bearing elements (`text`, `tspan`, `textPath`) into an explicit baseline position and SHALL remove the `dominant-baseline` (and `alignment-baseline`) attribute, so that Figma `createNodeFromSvg`, which positions text by the alphabetic baseline, renders the text centered as the source page did. The offset SHALL be a factor of the computed `font-size`: `0.35` for `central`/`middle`, `0.8` for `text-before-edge`/`hanging`, and `-0.2` for `text-after-edge`/`ideographic`, applied as a downward baseline shift. The Chrome Extension SHALL apply the shift to the element's own `y` for baseline-establishing elements (`text`, `textPath`, or a `tspan` with its own numeric `y`), and SHALL only strip the attribute on inheriting `tspan` elements without their own `y` to avoid double shifting. The Chrome Extension SHALL leave geometry unchanged when the computed `dominant-baseline` is `alphabetic`, `auto`, empty, or unrecognized, or when `font-size` cannot be parsed as a positive number. Both capture runtimes (the content script bundle and the module capture core) SHALL apply identical logic, and normalization SHALL fall back to the original markup if it cannot serialize.

#### Scenario: Central baseline becomes an alphabetic baseline y

- **WHEN** an inline SVG `text` has `y="100"`, `dominant-baseline="central"`, and computed `font-size` of `45px`
- **THEN** the captured `attributes.svgMarkup` sets that `text` `y` to `115.75` and removes the `dominant-baseline` attribute

#### Scenario: Inheriting tspan only strips the attribute

- **WHEN** an inline SVG `tspan` without its own `y` has `dominant-baseline="central"` under a `text` ancestor that is shifted
- **THEN** the captured `attributes.svgMarkup` removes the `tspan` `dominant-baseline` attribute without adding or changing its `y` or `dy`

#### Scenario: Alphabetic or unparseable values leave geometry unchanged

- **WHEN** an inline SVG `text` has `dominant-baseline="alphabetic"`, or its computed `font-size` cannot be parsed as a positive number
- **THEN** the captured `attributes.svgMarkup` keeps the original `y` and does not shift the baseline
