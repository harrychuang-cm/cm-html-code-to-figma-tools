## ADDED Requirements

### Requirement: Inline SVG presentation attributes cover fill and stroke rendering hints
When normalizing inline SVG markup for Figma vector import, the Chrome Extension SHALL inline computed values for `fill-rule`, `clip-rule`, `paint-order`, `vector-effect`, and `mix-blend-mode` as concrete SVG presentation attributes, in addition to the previously normalized fill, stroke, opacity, stroke-metric, font, and gradient-stop attributes. The Chrome Extension SHALL write each attribute only when the source node carries a class or style that affects it and the computed value is serializable and not the SVG default, and SHALL NOT write the attribute when the computed value equals the default. Both capture runtimes (the content script bundle and the module capture core) SHALL apply the same attribute set so runtime parity is preserved.

#### Scenario: Class-based fill-rule serializes as a concrete attribute

- **WHEN** an inline SVG path uses a class that resolves to computed `fill-rule: evenodd`
- **THEN** the captured `attributes.svgMarkup` serializes `fill-rule="evenodd"` on that path

#### Scenario: Rendering hints serialize when computed and non-default

- **WHEN** an inline SVG node has computed `vector-effect: non-scaling-stroke`, `mix-blend-mode: multiply`, and `paint-order: stroke` from class or style rules
- **THEN** the captured `attributes.svgMarkup` serializes `vector-effect`, `mix-blend-mode`, and `paint-order` as concrete attributes on that node

#### Scenario: Default presentation values are not inlined

- **WHEN** an inline SVG node has computed `fill-rule: nonzero` and `mix-blend-mode: normal`
- **THEN** the captured `attributes.svgMarkup` does not add `fill-rule` or `mix-blend-mode` attributes for that node
