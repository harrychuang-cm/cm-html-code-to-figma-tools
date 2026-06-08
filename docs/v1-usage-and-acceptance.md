# V1 Usage and Acceptance

## Scope

V1 is a local-first Production UI to Figma import flow for UI designers. The designer opens the production page in Chrome, including logged-in or logged-out states, captures the current visible viewport, downloads one `.figcapture` file, and imports that file with the Figma Plugin.

V1 does not use a backend, cloud capture link, managed credentials, capture history, or team sharing. The designer's existing Chrome session is the source of truth.

## Flow

1. Open the target production page in Chrome.
2. Use the Chrome Extension to capture the active tab's visible viewport.
3. Review the capture preview before download.
4. Confirm export to download one `.figcapture` package.
5. Open the Figma Plugin.
6. Select the `.figcapture` file.
7. Review the generated frames and import report in Figma.

## Capture Contract

The Chrome Extension captures only the current visible viewport. It records `viewportWidth`, `viewportHeight`, `devicePixelRatio`, `scrollX`, `scrollY`, source URL, capture timestamp, DOM tree data, computed style data, layout boxes, semantic attributes, source node identifiers, asset references, fallback references, screenshot reference, and diagnostics.

The `.figcapture` package contains:

- `manifest.json`
- `capture.json`
- `figma-plan.json`
- `screenshot.png`
- `diagnostics.json`
- `assets/` when image or fallback assets exist

## Figma Output

The Figma Plugin creates three same-size frames:

- `Source Screenshot`: locked screenshot reference for visual comparison.
- `Editable Accurate`: visual-first editable output using measured geometry. Text becomes editable text where possible, image elements become image layers, visual boxes become shape layers, and unsupported regions become raster fallback layers.
- `Auto Layout Experimental`: conservative auto layout output for eligible simple groups such as button content, navigation lists, sidebar menus, card lists, form groups, and toolbar groups.

Frame names include source identity, viewport size, and role, for example:

- `Dashboard / 1440x900 / Source Screenshot`
- `Dashboard / 1440x900 / Editable Accurate`
- `Dashboard / 1440x900 / Auto Layout Experimental`

## Fallback Types

V1 uses image or raster fallback output for surfaces that cannot be represented reliably as editable Figma nodes in the first phase:

- `img`: image layer with asset reference.
- `canvas`: raster fallback with `canvas fallback` reason.
- `iframe`: raster fallback with `iframe fallback` reason.
- `video`: raster fallback with `video fallback` reason.
- complex `svg`: raster fallback with `complex svg fallback` reason.

Fallback counts and reasons are visible in diagnostics and import report output.

## Acceptance Checks

Run the workspace checks:

```bash
corepack pnpm build
corepack pnpm test
corepack pnpm test:e2e
```

The e2e smoke must prove that a SaaS/dashboard visible viewport fixture can be captured, exported as `.figcapture`, validated by the Figma Plugin importer, and rendered through a mocked Figma API into exactly three frames.

The import report must show created frame count, created node count, fallback count, missing asset count, unsupported style count, and auto layout confidence summary without requiring raw JSON inspection.

## Future Scope

These capabilities are intentionally outside V1:

- full-page segmented capture
- multi-viewport batch capture for desktop, tablet, and mobile
- cloud capture links or backend storage
- Figma variables
- Figma components and component variants
- hover, disabled, pressed, or other interactive state variants
- auth or session management inside the product
- production deployment pipeline

Capture metadata is preserved so later changes can add full-page capture, multi-viewport capture, variables, components, and state variants without replacing the V1 package boundary.
