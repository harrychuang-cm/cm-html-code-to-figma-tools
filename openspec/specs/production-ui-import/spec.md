# production-ui-import Specification

## Purpose

TBD - created by archiving change 'import-production-ui-to-figma'. Update Purpose after archive.

## Requirements

### Requirement: Capture current visible viewport from Chrome
The system SHALL let a designer capture the currently visible viewport from the active Chrome tab using the designer's existing browser session. The system SHALL NOT require the designer to provide credentials to the capture tool.

#### Scenario: Capture authenticated dashboard viewport

- **WHEN** a designer is logged in to a SaaS dashboard page and starts capture from the Chrome Extension
- **THEN** the system captures the visible viewport of the active tab using the current browser session

#### Scenario: Capture unauthenticated page viewport

- **WHEN** a designer starts capture from an unauthenticated page in the active Chrome tab
- **THEN** the system captures the visible viewport without requesting login credentials from the tool


<!-- @trace
source: import-production-ui-to-figma
updated: 2026-06-08
code:
  - packages/capture-schema/fixtures/valid-package.mjs
  - packages/capture-schema/package.json
  - pnpm-workspace.yaml
  - apps/chrome-extension/src/content.ts
  - scripts/build.mjs
  - scripts/e2e.mjs
  - test/e2e-smoke.test.mjs
  - test/workspace.test.mjs
  - apps/chrome-extension/src/popup.ts
  - apps/figma-plugin/ui.css
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.html
  - docs/v1-usage-and-acceptance.md
  - packages/capture-schema/src/index.d.ts
  - scripts/test.mjs
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/importer.ts
  - apps/figma-plugin/manifest.json
  - apps/chrome-extension/src/background.ts
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/popup.css
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/package.json
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/auto-layout.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/report.ts
  - fixtures/dashboard/visible-viewport.fixture.mjs
  - apps/figma-plugin/src/renderer.ts
  - package.json
  - apps/chrome-extension/src/capture-core.ts
tests:
  - packages/capture-schema/test/schema-scaffold.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
-->

---
### Requirement: Export a debuggable .figcapture package
The system SHALL export one .figcapture package for a confirmed viewport capture. The package MUST contain manifest.json, capture.json, figma-plan.json, screenshot.png, diagnostics.json, and an assets directory when image or fallback assets exist.

#### Scenario: Export package after confirmation

- **WHEN** a designer confirms export after capture preview
- **THEN** the system downloads one .figcapture package containing the required debug artifacts

##### Example: minimum archive contents

- **GIVEN** a captured viewport with one image element and one canvas fallback
- **WHEN** the designer exports the capture
- **THEN** the archive contains manifest.json, capture.json, figma-plan.json, screenshot.png, diagnostics.json, assets/image-1.*, and assets/fallback-1.*


<!-- @trace
source: import-production-ui-to-figma
updated: 2026-06-08
code:
  - packages/capture-schema/fixtures/valid-package.mjs
  - packages/capture-schema/package.json
  - pnpm-workspace.yaml
  - apps/chrome-extension/src/content.ts
  - scripts/build.mjs
  - scripts/e2e.mjs
  - test/e2e-smoke.test.mjs
  - test/workspace.test.mjs
  - apps/chrome-extension/src/popup.ts
  - apps/figma-plugin/ui.css
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.html
  - docs/v1-usage-and-acceptance.md
  - packages/capture-schema/src/index.d.ts
  - scripts/test.mjs
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/importer.ts
  - apps/figma-plugin/manifest.json
  - apps/chrome-extension/src/background.ts
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/popup.css
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/package.json
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/auto-layout.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/report.ts
  - fixtures/dashboard/visible-viewport.fixture.mjs
  - apps/figma-plugin/src/renderer.ts
  - package.json
  - apps/chrome-extension/src/capture-core.ts
tests:
  - packages/capture-schema/test/schema-scaffold.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
-->

---
### Requirement: Preserve capture metadata for future import stages
The system SHALL record viewport metadata, source URL, capture timestamp, DOM tree data, computed style data, layout boxes, semantic attributes, source node identifiers, asset references, and fallback references in the capture package.

#### Scenario: Capture metadata is available to the importer

- **WHEN** a .figcapture package is opened by the Figma Plugin
- **THEN** the plugin can read viewport dimensions, source URL, DOM structure, computed styles, layout boxes, and asset references from the package


<!-- @trace
source: import-production-ui-to-figma
updated: 2026-06-08
code:
  - packages/capture-schema/fixtures/valid-package.mjs
  - packages/capture-schema/package.json
  - pnpm-workspace.yaml
  - apps/chrome-extension/src/content.ts
  - scripts/build.mjs
  - scripts/e2e.mjs
  - test/e2e-smoke.test.mjs
  - test/workspace.test.mjs
  - apps/chrome-extension/src/popup.ts
  - apps/figma-plugin/ui.css
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.html
  - docs/v1-usage-and-acceptance.md
  - packages/capture-schema/src/index.d.ts
  - scripts/test.mjs
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/importer.ts
  - apps/figma-plugin/manifest.json
  - apps/chrome-extension/src/background.ts
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/popup.css
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/package.json
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/auto-layout.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/report.ts
  - fixtures/dashboard/visible-viewport.fixture.mjs
  - apps/figma-plugin/src/renderer.ts
  - package.json
  - apps/chrome-extension/src/capture-core.ts
tests:
  - packages/capture-schema/test/schema-scaffold.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
-->

---
### Requirement: Show designer-facing capture validation before export
The system SHALL show a preview and validation summary before the designer downloads a .figcapture package. The validation summary MUST include fallback count, missing asset count, unsupported style count, and package generation status.

#### Scenario: Designer reviews capture status

- **WHEN** the Chrome Extension finishes capture
- **THEN** the designer sees the screenshot preview and validation summary before downloading the package


<!-- @trace
source: import-production-ui-to-figma
updated: 2026-06-08
code:
  - packages/capture-schema/fixtures/valid-package.mjs
  - packages/capture-schema/package.json
  - pnpm-workspace.yaml
  - apps/chrome-extension/src/content.ts
  - scripts/build.mjs
  - scripts/e2e.mjs
  - test/e2e-smoke.test.mjs
  - test/workspace.test.mjs
  - apps/chrome-extension/src/popup.ts
  - apps/figma-plugin/ui.css
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.html
  - docs/v1-usage-and-acceptance.md
  - packages/capture-schema/src/index.d.ts
  - scripts/test.mjs
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/importer.ts
  - apps/figma-plugin/manifest.json
  - apps/chrome-extension/src/background.ts
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/popup.css
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/package.json
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/auto-layout.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/report.ts
  - fixtures/dashboard/visible-viewport.fixture.mjs
  - apps/figma-plugin/src/renderer.ts
  - package.json
  - apps/chrome-extension/src/capture-core.ts
tests:
  - packages/capture-schema/test/schema-scaffold.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
-->

---
### Requirement: Import .figcapture into three Figma frames
The Figma Plugin SHALL import a valid .figcapture package into three same-size frames: Source Screenshot, Editable Accurate, and Auto Layout Experimental. The frame names MUST include the source page or URL identity, viewport size, and frame role.

#### Scenario: Import creates paired review output and experimental layout output

- **WHEN** a designer imports a valid .figcapture package into Figma
- **THEN** the plugin creates Source Screenshot, Editable Accurate, and Auto Layout Experimental frames with matching dimensions

##### Example: frame names for a dashboard capture

- **GIVEN** a package captured from https://app.example.com/dashboard at 1440x900
- **WHEN** the package is imported
- **THEN** the created frame names include Dashboard / 1440x900 / Source Screenshot, Dashboard / 1440x900 / Editable Accurate, and Dashboard / 1440x900 / Auto Layout Experimental


<!-- @trace
source: import-production-ui-to-figma
updated: 2026-06-08
code:
  - packages/capture-schema/fixtures/valid-package.mjs
  - packages/capture-schema/package.json
  - pnpm-workspace.yaml
  - apps/chrome-extension/src/content.ts
  - scripts/build.mjs
  - scripts/e2e.mjs
  - test/e2e-smoke.test.mjs
  - test/workspace.test.mjs
  - apps/chrome-extension/src/popup.ts
  - apps/figma-plugin/ui.css
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.html
  - docs/v1-usage-and-acceptance.md
  - packages/capture-schema/src/index.d.ts
  - scripts/test.mjs
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/importer.ts
  - apps/figma-plugin/manifest.json
  - apps/chrome-extension/src/background.ts
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/popup.css
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/package.json
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/auto-layout.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/report.ts
  - fixtures/dashboard/visible-viewport.fixture.mjs
  - apps/figma-plugin/src/renderer.ts
  - package.json
  - apps/chrome-extension/src/capture-core.ts
tests:
  - packages/capture-schema/test/schema-scaffold.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
-->

---
### Requirement: Recreate visible UI with visual-first editable layers
The Editable Accurate frame SHALL prioritize visual similarity to the source screenshot using measured geometry. Visible text MUST be represented as editable Figma text nodes unless a documented fallback reason exists. Image elements MUST be represented as Figma image layers. Unsupported canvas, iframe, video, and complex SVG regions MUST be represented as raster fallback layers with recorded fallback reasons.

#### Scenario: Import recreates dashboard viewport primitives

- **WHEN** a dashboard viewport package is imported
- **THEN** the Editable Accurate frame contains editable text for visible text, image layers for image elements, basic shape layers for visual boxes, and raster fallback layers for unsupported regions


<!-- @trace
source: import-production-ui-to-figma
updated: 2026-06-08
code:
  - packages/capture-schema/fixtures/valid-package.mjs
  - packages/capture-schema/package.json
  - pnpm-workspace.yaml
  - apps/chrome-extension/src/content.ts
  - scripts/build.mjs
  - scripts/e2e.mjs
  - test/e2e-smoke.test.mjs
  - test/workspace.test.mjs
  - apps/chrome-extension/src/popup.ts
  - apps/figma-plugin/ui.css
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.html
  - docs/v1-usage-and-acceptance.md
  - packages/capture-schema/src/index.d.ts
  - scripts/test.mjs
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/importer.ts
  - apps/figma-plugin/manifest.json
  - apps/chrome-extension/src/background.ts
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/popup.css
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/package.json
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/auto-layout.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/report.ts
  - fixtures/dashboard/visible-viewport.fixture.mjs
  - apps/figma-plugin/src/renderer.ts
  - package.json
  - apps/chrome-extension/src/capture-core.ts
tests:
  - packages/capture-schema/test/schema-scaffold.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
-->

---
### Requirement: Generate conservative auto layout experimental output
The Auto Layout Experimental frame SHALL apply auto layout only to eligible simple groups with sufficient confidence. Eligible patterns include button inner content, navigation item lists, sidebar menus, card lists, form groups, and toolbar groups. The system MUST report skipped auto layout candidates with reasons.

#### Scenario: Eligible simple group receives auto layout

- **WHEN** the importer detects a horizontal button group with consistent spacing and non-overlapping children
- **THEN** the Auto Layout Experimental frame represents that group with horizontal auto layout and records the applied confidence

#### Scenario: Risky layout remains skipped

- **WHEN** the importer detects an overlapping layout, complex CSS grid dashboard region, fixed overlay, or virtualized list
- **THEN** the Auto Layout Experimental frame does not force auto layout for that region and records the skipped reason


<!-- @trace
source: import-production-ui-to-figma
updated: 2026-06-08
code:
  - packages/capture-schema/fixtures/valid-package.mjs
  - packages/capture-schema/package.json
  - pnpm-workspace.yaml
  - apps/chrome-extension/src/content.ts
  - scripts/build.mjs
  - scripts/e2e.mjs
  - test/e2e-smoke.test.mjs
  - test/workspace.test.mjs
  - apps/chrome-extension/src/popup.ts
  - apps/figma-plugin/ui.css
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.html
  - docs/v1-usage-and-acceptance.md
  - packages/capture-schema/src/index.d.ts
  - scripts/test.mjs
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/importer.ts
  - apps/figma-plugin/manifest.json
  - apps/chrome-extension/src/background.ts
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/popup.css
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/package.json
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/auto-layout.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/report.ts
  - fixtures/dashboard/visible-viewport.fixture.mjs
  - apps/figma-plugin/src/renderer.ts
  - package.json
  - apps/chrome-extension/src/capture-core.ts
tests:
  - packages/capture-schema/test/schema-scaffold.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
-->

---
### Requirement: Provide import report for designer verification
The Figma Plugin SHALL show an import report after import. The report MUST include created frame count, created node count, fallback count, missing asset count, unsupported style count, and auto layout confidence summary.

#### Scenario: Designer receives import quality summary

- **WHEN** a .figcapture package import completes
- **THEN** the designer sees an import report that summarizes output quality without requiring raw JSON inspection


<!-- @trace
source: import-production-ui-to-figma
updated: 2026-06-08
code:
  - packages/capture-schema/fixtures/valid-package.mjs
  - packages/capture-schema/package.json
  - pnpm-workspace.yaml
  - apps/chrome-extension/src/content.ts
  - scripts/build.mjs
  - scripts/e2e.mjs
  - test/e2e-smoke.test.mjs
  - test/workspace.test.mjs
  - apps/chrome-extension/src/popup.ts
  - apps/figma-plugin/ui.css
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.html
  - docs/v1-usage-and-acceptance.md
  - packages/capture-schema/src/index.d.ts
  - scripts/test.mjs
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/importer.ts
  - apps/figma-plugin/manifest.json
  - apps/chrome-extension/src/background.ts
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/popup.css
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/package.json
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/auto-layout.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/report.ts
  - fixtures/dashboard/visible-viewport.fixture.mjs
  - apps/figma-plugin/src/renderer.ts
  - package.json
  - apps/chrome-extension/src/capture-core.ts
tests:
  - packages/capture-schema/test/schema-scaffold.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
-->

---
### Requirement: Reject invalid capture packages with readable errors
The Figma Plugin SHALL validate package structure and schema version before importing. Invalid packages MUST be rejected with a readable error that identifies the failed validation category.

#### Scenario: Missing manifest is rejected

- **WHEN** a designer selects a .figcapture package without manifest.json
- **THEN** the plugin rejects the package and reports that package metadata is missing

#### Scenario: Unsupported schema version is rejected

- **WHEN** a designer selects a .figcapture package with an unsupported schemaVersion
- **THEN** the plugin rejects the package and reports that the schema version is unsupported

<!-- @trace
source: import-production-ui-to-figma
updated: 2026-06-08
code:
  - packages/capture-schema/fixtures/valid-package.mjs
  - packages/capture-schema/package.json
  - pnpm-workspace.yaml
  - apps/chrome-extension/src/content.ts
  - scripts/build.mjs
  - scripts/e2e.mjs
  - test/e2e-smoke.test.mjs
  - test/workspace.test.mjs
  - apps/chrome-extension/src/popup.ts
  - apps/figma-plugin/ui.css
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.html
  - docs/v1-usage-and-acceptance.md
  - packages/capture-schema/src/index.d.ts
  - scripts/test.mjs
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/importer.ts
  - apps/figma-plugin/manifest.json
  - apps/chrome-extension/src/background.ts
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/popup.css
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/package.json
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/auto-layout.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/report.ts
  - fixtures/dashboard/visible-viewport.fixture.mjs
  - apps/figma-plugin/src/renderer.ts
  - package.json
  - apps/chrome-extension/src/capture-core.ts
tests:
  - packages/capture-schema/test/schema-scaffold.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
-->