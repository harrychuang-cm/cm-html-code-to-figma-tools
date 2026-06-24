## ADDED Requirements

### Requirement: Material icon font ligatures import as visual SVG assets
The Chrome Extension SHALL recognize supported Google Material icon font ligature nodes during `.figcapture` asset packaging. A recognized node MUST use an icon font family or class, MUST have a supported ligature text value, and MUST receive an SVG asset reference instead of relying on Figma text font rendering. The Figma Plugin SHALL import recognized icon font asset nodes as image/vector layers in the Editable Accurate frame rather than editable text layers. When importing a legacy `.figcapture` whose recognized Material icon font ligature node lacks an SVG asset reference, the Figma Plugin SHALL synthesize SVG bytes for that node during import and SHALL still create an image/vector layer instead of a TEXT layer. Unsupported icon ligature names MUST remain on the existing editable text path and MUST NOT abort capture, packaging, or import.

#### Scenario: Google Material Icons ligature becomes SVG asset
- **WHEN** a captured text node has `textContent` `search`, `fontFamily` `"Google Material Icons"`, class `google-material-icons notranslate`, and a 24 by 24 pixel rect
- **THEN** export packages an SVG asset for that node and sets `assetRef`, `assetKind` `svg`, and `assetRole` `icon-font`
- **AND** the Figma import creates an image/vector layer for the node rather than a TEXT layer whose characters are `search`

##### Example: Google Calendar toolbar icons
| Ligature text | CSS font family | Class token | Expected asset role |
| ----- | ----- | ----- | ----- |
| `search` | `"Google Material Icons"` | `google-material-icons` | `icon-font` |
| `add` | `"Google Material Icons"` | `google-material-icons` | `icon-font` |
| `arrow_drop_down` | `"Google Material Icons"` | `google-material-icons` | `icon-font` |

#### Scenario: Unsupported Material icon ligature stays editable text
- **WHEN** a captured text node has an icon font family but its `textContent` is not in the supported icon asset map
- **THEN** export leaves the node without an icon-font `assetRef`
- **AND** the Figma import keeps the node on the editable text path

#### Scenario: Legacy Material icon ligature without asset reference becomes synthesized vector
- **WHEN** a legacy captured text node has `textContent` `search`, `fontFamily` `"Google Material Icons"`, class `google-material-icons notranslate`, and no `assetRef`
- **THEN** the Figma import synthesizes SVG bytes for the `search` icon during layout modeling
- **AND** the Editable Accurate import creates an image/vector layer for the node rather than a TEXT layer whose characters are `search`
