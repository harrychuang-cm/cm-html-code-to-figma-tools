## ADDED Requirements

### Requirement: SVG text elements always inline an explicit fill
When normalizing inline SVG markup for Figma vector import, the Chrome Extension SHALL inline an explicit `fill` attribute on SVG text-bearing elements (`text`, `tspan`, `textPath`) regardless of whether the element carries a `class` or `style`, so that Figma `createNodeFromSvg` does not fall back to the SVG default black text fill. The Chrome Extension SHALL use the computed `fill` when it is a usable non-default color, and SHALL otherwise use the computed text color (`color`, resolved `currentColor`, or `-webkit-text-fill-color`) as the `fill` when the computed `fill` is missing, unusable, or equal to the SVG default black. The Chrome Extension SHALL apply this on both capture runtimes (the content script bundle and the module capture core), and SHALL keep returning the original markup if normalization cannot serialize.

#### Scenario: Class-less white text serializes an explicit fill

- **WHEN** an inline SVG `text` and its `tspan` have no class or style, no `fill` attribute, and a computed text color of `rgb(255, 255, 255)`
- **THEN** the captured `attributes.svgMarkup` serializes `fill="rgb(255, 255, 255)"` on the text-bearing element so the imported vector renders white text

#### Scenario: Existing concrete fill is preserved

- **WHEN** an inline SVG `text` element has a computed `fill` of `rgb(144, 202, 249)`
- **THEN** the captured `attributes.svgMarkup` keeps `fill="rgb(144, 202, 249)"` and does not overwrite it with the text color

#### Scenario: Default-black fill falls back to text color

- **WHEN** an inline SVG `tspan` has a computed `fill` equal to the SVG default `rgb(0, 0, 0)` and a computed text color of `rgb(255, 255, 255)`
- **THEN** the captured `attributes.svgMarkup` serializes `fill="rgb(255, 255, 255)"` for that element
