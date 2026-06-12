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

---
### Requirement: Semantic layer names from captured semantics
The Figma import SHALL derive human-readable layer names from captured semantic data using a fixed priority chain: (1) HTML semantic tag mapping, (2) ARIA role mapping, (3) geometric heuristics for frames, (4) class token mapping, (5) the existing default technical name. The first matching level SHALL win. When no level matches, the import SHALL keep the existing default name unchanged. Interactive or heading layers named by levels 1, 2, or 4 SHALL append an `aria-label` or single-line visible text suffix in the format `<Name> / <text>` with the suffix truncated to 32 characters. Semantic name derivation failures SHALL fall back to the default name and SHALL NOT fail the import.

#### Scenario: Semantic HTML tags map to readable names
- **WHEN** a captured node has tag `header`, `nav`, `footer`, `aside`, `button`, `ul`, or `li`
- **THEN** the imported layer is named `Header`, `Navigation`, `Footer`, `Sidebar`, `Button`, `List`, or `List Item` respectively

#### Scenario: ARIA roles map when tag is non-semantic
- **WHEN** a captured `div` node has `role="banner"`, `role="navigation"`, `role="contentinfo"`, or `role="dialog"`
- **THEN** the imported layer is named `Header`, `Navigation`, `Footer`, or `Modal` respectively

#### Scenario: Interactive layer appends label suffix
- **WHEN** a captured `button` node has `aria-label` value `登入` or single-line visible text `登入`
- **THEN** the imported layer is named `Button / 登入`

#### Scenario: Geometric header heuristic for div-only sites
- **WHEN** a captured `div` frame without semantic tag, role, or class token match touches the viewport top within 2px, spans at least 90% of viewport width, and is at most 25% of viewport height
- **THEN** the imported layer is named `Header`

#### Scenario: Class tokens match whole tokens only
- **WHEN** a captured `div` node has class `product-card` and another has class `scarden`
- **THEN** the first imports as `Card` and the second keeps the default name, because token matching does not match substrings

#### Scenario: Unmatched nodes keep default names
- **WHEN** a captured `div` node matches no semantic tag, role, heuristic, or class token
- **THEN** the imported layer keeps the existing default name such as `Frame / div`


<!-- @trace
source: semantic-layer-naming-and-grouping
updated: 2026-06-12
code:
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/package.json
  - scripts/build.mjs
  - docs/v1-usage-and-acceptance.md
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/report.ts
  - apps/chrome-extension/manifest.json
  - .version-state.json
  - apps/figma-plugin/ui.html
  - apps/figma-plugin/src/code-classic.js
  - package.json
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
tests:
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
-->

---
### Requirement: Repeated sibling group naming
The Figma import SHALL detect repeated sibling structures under the same parent using a structural signature composed of tag name, class tokens, and first-level child tag sequence. Siblings sharing a signature with at least 2 members SHALL be named with the group's derived semantic name plus a 1-based index in visual order. Groups with a single member SHALL NOT receive an index.

#### Scenario: Repeated cards are numbered
- **WHEN** a container has three children with identical structural signatures deriving the name `Card`
- **THEN** the imported layers are named `Card 1`, `Card 2`, and `Card 3` in visual order

#### Scenario: Structurally different siblings are not grouped
- **WHEN** a container has two children whose first-level child tag sequences differ
- **THEN** neither child receives an index from the other's group


<!-- @trace
source: semantic-layer-naming-and-grouping
updated: 2026-06-12
code:
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/package.json
  - scripts/build.mjs
  - docs/v1-usage-and-acceptance.md
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/report.ts
  - apps/chrome-extension/manifest.json
  - .version-state.json
  - apps/figma-plugin/ui.html
  - apps/figma-plugin/src/code-classic.js
  - package.json
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
tests:
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
-->

---
### Requirement: Non-visual wrapper collapsing
The Figma import SHALL collapse a frame into its only child when all of the following hold: the frame has exactly one renderable child, no direct text, no asset or fallback reference, no visible background, border, shadow, gradient, transform, reduced opacity, or content clipping, its rect matches the child rect within 1px on every edge, it has no applied Auto Layout, it is not a direct child of an applied Auto Layout frame, and it has no semantic name match. Collapsing SHALL preserve the absolute position and size of every remaining node and SHALL apply recursively to chained wrappers. The collapse step SHALL NOT alter Auto Layout inference results.

#### Scenario: Transparent same-size wrapper is removed
- **WHEN** a non-visual `div` wrapper contains exactly one child whose rect matches the wrapper rect within 1px
- **THEN** the imported layer tree contains the child at the wrapper's tree position with an unchanged absolute rect, and the wrapper layer does not appear

#### Scenario: Semantic wrappers are preserved
- **WHEN** a transparent same-size wrapper is a `nav` element
- **THEN** the wrapper imports as a `Navigation` frame and is not collapsed

#### Scenario: Auto Layout children are not collapsed
- **WHEN** a transparent same-size wrapper is a direct child of an applied Auto Layout frame
- **THEN** the wrapper is not collapsed


<!-- @trace
source: semantic-layer-naming-and-grouping
updated: 2026-06-12
code:
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/package.json
  - scripts/build.mjs
  - docs/v1-usage-and-acceptance.md
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/report.ts
  - apps/chrome-extension/manifest.json
  - .version-state.json
  - apps/figma-plugin/ui.html
  - apps/figma-plugin/src/code-classic.js
  - package.json
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
tests:
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
-->

---
### Requirement: Semantic naming statistics in import report
The import report SHALL include the count of semantically named layers, the count of detected repeated sibling groups, and the count of collapsed wrappers. Missing statistics SHALL display as zero.

#### Scenario: Report shows semantic statistics
- **WHEN** an import names 12 layers semantically, detects 2 repeated groups, and collapses 5 wrappers
- **THEN** the import report shows semantic name count 12, repeated group count 2, and collapsed wrapper count 5


<!-- @trace
source: semantic-layer-naming-and-grouping
updated: 2026-06-12
code:
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/package.json
  - scripts/build.mjs
  - docs/v1-usage-and-acceptance.md
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/report.ts
  - apps/chrome-extension/manifest.json
  - .version-state.json
  - apps/figma-plugin/ui.html
  - apps/figma-plugin/src/code-classic.js
  - package.json
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
tests:
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
-->

---
### Requirement: Semantic naming runtime parity
The module runtime and the classic plugin runtime SHALL produce identical layer names, identical collapsed layer trees, and identical semantic naming statistics for the same `.figcapture` input.

#### Scenario: Classic runtime matches module runtime
- **WHEN** the same fixture package is imported through the module runtime and the classic runtime
- **THEN** both produce the same layer names, the same collapsed tree shape, and the same semantic statistics

<!-- @trace
source: semantic-layer-naming-and-grouping
updated: 2026-06-12
code:
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/package.json
  - scripts/build.mjs
  - docs/v1-usage-and-acceptance.md
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/report.ts
  - apps/chrome-extension/manifest.json
  - .version-state.json
  - apps/figma-plugin/ui.html
  - apps/figma-plugin/src/code-classic.js
  - package.json
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
tests:
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
-->

---
### Requirement: Shadow DOM content capture
The Chrome Extension SHALL capture the rendered tree of elements that host a shadow root. When an element has an accessible shadow root, the capture SHALL traverse the shadow root's child elements instead of the element's light DOM children. The shadow host's own geometry, computed styles, and attributes SHALL be captured unchanged. Light DOM children of a shadow host SHALL appear in the capture only where slots project them. Shadow DOM content SHALL be represented as ordinary element nodes in `capture.json` without schema changes.

#### Scenario: Open shadow root subtree is captured
- **WHEN** a custom element has an open shadow root containing a `div` with text and styles
- **THEN** the captured tree contains the shadow `div` as a child of the host node with its rendered rect and computed styles, and the host's unslotted light DOM children do not appear as direct children

#### Scenario: Shadow content imports into Figma
- **WHEN** a `.figcapture` containing shadow DOM content is imported
- **THEN** the shadow elements render as editable Figma layers identical to equivalent light DOM elements


<!-- @trace
source: capture-shadow-dom-content
updated: 2026-06-12
code:
  - apps/figma-plugin/src/layout-tree.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/figma-plugin/ui.html
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/chrome-extension/manifest.json
  - .version-state.json
  - apps/figma-plugin/package.json
  - package.json
  - apps/figma-plugin/src/code-classic.js
  - scripts/build.mjs
  - fixtures/web-components/manual-fixture.html
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/renderer.ts
  - apps/chrome-extension/src/asset-capture.ts
  - docs/manual-runtime-test.md
tests:
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
-->

---
### Requirement: Slot projection capture
The capture SHALL replace each `<slot>` element with its projected content at the slot's position in the rendered tree. Slots with assigned elements SHALL be expanded using flattened assignment. Slots without assigned nodes SHALL be expanded to their default content. Assigned text nodes SHALL be captured as synthetic text nodes positioned by Range-derived bounding rects when the Range API is available, and SHALL be skipped without error when it is not. The `<slot>` element itself SHALL NOT produce a captured node.

#### Scenario: Named slot projection appears at slot position
- **WHEN** a light DOM element with `slot="title"` is assigned to a named slot inside the shadow root
- **THEN** the captured tree contains that element at the slot's position in the shadow tree, and no node for the `<slot>` element itself

#### Scenario: Default slot content appears when nothing is assigned
- **WHEN** a slot has no assigned nodes and contains default fallback content
- **THEN** the captured tree contains the default content at the slot's position

#### Scenario: Nested slot projection is flattened
- **WHEN** an element is projected through a slot that is itself assigned to another slot
- **THEN** the captured tree contains the element once, at the final rendered position


<!-- @trace
source: capture-shadow-dom-content
updated: 2026-06-12
code:
  - apps/figma-plugin/src/layout-tree.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/figma-plugin/ui.html
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/chrome-extension/manifest.json
  - .version-state.json
  - apps/figma-plugin/package.json
  - package.json
  - apps/figma-plugin/src/code-classic.js
  - scripts/build.mjs
  - fixtures/web-components/manual-fixture.html
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/renderer.ts
  - apps/chrome-extension/src/asset-capture.ts
  - docs/manual-runtime-test.md
tests:
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
-->

---
### Requirement: Closed shadow root fallback
The content script SHALL attempt to access closed shadow roots through the browser-provided open-or-closed shadow root API, guarded so that an unavailable or throwing API is treated as no shadow root. A custom element whose shadow root cannot be accessed and which has no renderable light DOM children SHALL be marked as a closed shadow host. Marked hosts SHALL become raster fallback regions using the existing viewport screenshot crop, with the diagnostic reason `closed shadow root fallback`. Crop failures SHALL record a missing asset diagnostic and SHALL NOT block export or import.

#### Scenario: Accessible closed shadow root captures like open
- **WHEN** the open-or-closed shadow root API returns a closed shadow root for a host
- **THEN** the closed shadow subtree is captured identically to an open shadow root

#### Scenario: Inaccessible closed host becomes screenshot crop fallback
- **WHEN** a custom element's shadow root cannot be accessed and it has no renderable light DOM children
- **THEN** the exported package contains a fallback asset cropped from the viewport screenshot for that host's rect, and diagnostics record the reason `closed shadow root fallback`

#### Scenario: Crop failure degrades without blocking
- **WHEN** screenshot cropping is unavailable for a marked closed shadow host
- **THEN** the package still exports, the import still succeeds, and diagnostics record a missing asset


<!-- @trace
source: capture-shadow-dom-content
updated: 2026-06-12
code:
  - apps/figma-plugin/src/layout-tree.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/figma-plugin/ui.html
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/chrome-extension/manifest.json
  - .version-state.json
  - apps/figma-plugin/package.json
  - package.json
  - apps/figma-plugin/src/code-classic.js
  - scripts/build.mjs
  - fixtures/web-components/manual-fixture.html
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/renderer.ts
  - apps/chrome-extension/src/asset-capture.ts
  - docs/manual-runtime-test.md
tests:
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
-->

---
### Requirement: Shadow capture runtime parity
The pure capture module and the injected content script SHALL produce the same captured tree for the same DOM input, including shadow root traversal, slot expansion, and closed shadow host marking. The pure module SHALL accept an injected open-or-closed shadow root accessor instead of depending on browser extension APIs.

#### Scenario: Module accepts injected shadow root accessor
- **WHEN** the pure capture module is called with an injected accessor that returns a closed shadow root
- **THEN** the captured tree contains the closed shadow subtree without any browser extension API dependency

<!-- @trace
source: capture-shadow-dom-content
updated: 2026-06-12
code:
  - apps/figma-plugin/src/layout-tree.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/figma-plugin/ui.html
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/chrome-extension/manifest.json
  - .version-state.json
  - apps/figma-plugin/package.json
  - package.json
  - apps/figma-plugin/src/code-classic.js
  - scripts/build.mjs
  - fixtures/web-components/manual-fixture.html
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/renderer.ts
  - apps/chrome-extension/src/asset-capture.ts
  - docs/manual-runtime-test.md
tests:
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
-->

---
### Requirement: Editable import preserves layout hierarchy
The Figma Plugin SHALL preserve captured DOM parent-child structure in the Editable Accurate frame by creating nested Figma frames for renderable containers. The importer MUST place child nodes inside their nearest rendered parent container using parent-relative geometry. The importer MUST NOT flatten all renderable nodes as direct siblings of the Editable Accurate frame.

#### Scenario: Nested navigation import

- **WHEN** a package contains a captured navigation list with list item children
- **THEN** the Editable Accurate frame contains a parent frame for the navigation list and child text or image layers nested inside that parent frame

##### Example: horizontal nav structure

- **GIVEN** a nav container at x=100, y=20, width=300, height=40 with two child items at x=112 and x=180
- **WHEN** the package is imported
- **THEN** the nav frame is placed at x=100 and y=20, and its child item layers use parent-relative x positions 12 and 80


<!-- @trace
source: improve-editable-auto-layout-import
updated: 2026-06-12
code:
  - package.json
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/ui.html
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/popup.ts
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/code-classic.js
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/package.json
  - docs/manual-runtime-test.md
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/content-script.ts
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
  - apps/chrome-extension/package.json
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/chrome-extension/src/runtime.ts
  - scripts/build.mjs
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/ui.css
  - test/versioning.test.mjs
tests:
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
-->

---
### Requirement: High-confidence flex containers become Auto Layout
The Figma Plugin SHALL convert high-confidence captured flex containers into Figma Auto Layout frames in the Editable Accurate frame. A high-confidence multi-child flex container MUST have at least two renderable child models, non-overlapping child bounds on the inferred primary axis, finite parent bounds, no fixed or sticky layout risk, and no strongly non-uniform implicit spacing that cannot be represented by a single Figma item spacing value. A high-confidence single-child text container MUST have one single-line text child, finite parent and child bounds, no fixed or sticky layout risk, no complex grid risk, no out-of-bounds child risk, and explicit alignment evidence from supported CSS flex alignment or CSS line-height line box geometry. The importer MUST infer layout axis from flex-direction when available, item spacing from CSS gap or measured child gaps for multi-child containers, supported axis alignment from CSS align-items and justify-content, and padding from child bounds relative to the parent container when the relevant axis is not already controlled by CSS alignment.

#### Scenario: Horizontal flex row becomes Auto Layout

- **WHEN** a captured flex row has non-overlapping children, flex-direction row, gap 16px, and visible bounds
- **THEN** the imported parent frame has Figma layoutMode HORIZONTAL, itemSpacing 16, fixed width and height, and child layers nested in DOM order

##### Example: row spacing inference

| Captured style | Child x positions | Expected layout |
| -------------- | ----------------- | --------------- |
| gap: 16px, flex-direction: row | 120, 176, 232 | HORIZONTAL with itemSpacing 16 |
| gap: normal, flex-direction: row | 120, 170, 220 | HORIZONTAL with itemSpacing 10 when child width is 40 |

#### Scenario: Vertical flex column becomes Auto Layout

- **WHEN** a captured flex column has non-overlapping children, flex-direction column, row-gap 12px, and visible bounds
- **THEN** the imported parent frame has Figma layoutMode VERTICAL, itemSpacing 12, fixed width and height, and child layers nested in DOM order

#### Scenario: Horizontal flex row maps center alignment

- **WHEN** a captured horizontal flex row has align-items center and visible child bounds
- **THEN** the imported parent frame has Figma counterAxisAlignItems CENTER and does not preserve inferred top or bottom padding that would cancel vertical centering

##### Example: top menu vertical centering

- **GIVEN** a top menu flex row `dom-top-menu` at x=92.91, y=0, width=833.68, height=28 with `align-items: center`, child text at y=0, width=60, height=20, and child icon at y=0, width=12, height=12
- **WHEN** the package is imported
- **THEN** `dom-top-menu` has layoutMode HORIZONTAL, counterAxisAlignItems CENTER, paddingTop 0, and paddingBottom 0

#### Scenario: Flex row maps primary axis alignment

- **WHEN** a captured horizontal flex row has justify-content center
- **THEN** the imported parent frame has Figma primaryAxisAlignItems CENTER and does not preserve inferred left or right padding that would cancel horizontal centering

##### Example: centered toolbar actions

- **GIVEN** a toolbar flex row `dom-toolbar-actions` at x=0, y=0, width=320, height=40 with `justify-content: center`, child button A at x=96, y=8, width=48, height=24, and child button B at x=160, y=8, width=64, height=24
- **WHEN** the package is imported
- **THEN** `dom-toolbar-actions` has layoutMode HORIZONTAL, primaryAxisAlignItems CENTER, paddingLeft 0, and paddingRight 0

#### Scenario: Space-between flex container preserves padding

- **WHEN** a captured flex container has justify-content space-between and children inset from the parent bounds
- **THEN** the imported parent frame has Figma primaryAxisAlignItems SPACE_BETWEEN and preserves padding on the primary and counter axes

##### Example: padded chart aside panel

- **GIVEN** a flex column `dom-chart-aside` at x=1090, y=101, width=300, height=240 with `justifyContent: "space-between"`, child section at x=1106, y=117, width=268, height=60, and child chart at x=1106, y=177, width=268, height=148
- **WHEN** the package is imported
- **THEN** `dom-chart-aside` has layoutMode VERTICAL, primaryAxisAlignItems SPACE_BETWEEN, paddingLeft 16, paddingRight 16, paddingTop 16, and paddingBottom 16

#### Scenario: Reverse flex row preserves browser visual order

- **WHEN** a captured flex row has `flex-direction: row-reverse`
- **THEN** the imported Figma Auto Layout frame preserves the browser visual left-to-right order by reversing child insertion order

##### Example: article action buttons

- **GIVEN** a flex row `dom-action-row` with `flexDirection: "row-reverse"` and DOM child text labels in order `"打賞"`, `"分享"`, `"留言"`, `"讚"`
- **WHEN** the package is imported
- **THEN** `dom-action-row` has layoutMode HORIZONTAL and its Auto Layout child order is `"讚"`, `"留言"`, `"分享"`, `"打賞"`

#### Scenario: Reverse flex column preserves browser visual order

- **WHEN** a captured flex column has `flex-direction: column-reverse`
- **THEN** the imported Figma Auto Layout frame preserves the browser visual top-to-bottom order by reversing child insertion order

#### Scenario: Single-child line-height text container maps vertical centering

- **WHEN** a captured container has exactly one single-line text child, the parent height is greater than the text height, and CSS line-height evidence indicates a centered line box
- **THEN** the imported parent frame has Figma layoutMode HORIZONTAL, counterAxisAlignItems CENTER, fixed width and height, and no inferred top or bottom padding that would keep the text top-aligned

##### Example: header link list item

- **GIVEN** a list item `dom-header-link-item` at x=100, y=0, width=84, height=28 with `lineHeight: "28px"` and one text child `dom-header-link-text` at x=100, y=0, width=84, height=20 with textContent `"股市爆料同學會"`
- **WHEN** the package is imported
- **THEN** `dom-header-link-item` has layoutMode HORIZONTAL, counterAxisAlignItems CENTER, paddingLeft 0, paddingRight 0, paddingTop 0, and paddingBottom 0

#### Scenario: Single-child flex menu item with equal line box maps vertical centering

- **WHEN** a captured flex menu item has exactly one single-line text child, `align-items: center`, parent height 28, and child captured height 28
- **THEN** the imported parent frame has Figma layoutMode HORIZONTAL, counterAxisAlignItems CENTER, fixed width and height, and no inferred top or bottom padding that would keep the text top-aligned

##### Example: top menu item without dropdown arrow

- **GIVEN** a list item `dom-header-link-no-arrow` at x=184.91, y=0, width=84, height=28 with `display: "flex"` and `alignItems: "center"`, and one text child `dom-header-link-no-arrow-text` at x=184.91, y=0, width=84, height=28 with textContent `"股市爆料同學會"`
- **WHEN** the package is imported
- **THEN** `dom-header-link-no-arrow` has layoutMode HORIZONTAL, counterAxisAlignItems CENTER, paddingLeft 0, paddingRight 0, paddingTop 0, and paddingBottom 0


<!-- @trace
source: improve-editable-auto-layout-import
updated: 2026-06-12
code:
  - package.json
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/ui.html
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/popup.ts
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/code-classic.js
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/package.json
  - docs/manual-runtime-test.md
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/content-script.ts
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
  - apps/chrome-extension/package.json
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/chrome-extension/src/runtime.ts
  - scripts/build.mjs
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/ui.css
  - test/versioning.test.mjs
tests:
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
-->

---
### Requirement: Table cell text preserves CSS alignment
The Chrome Extension SHALL capture computed CSS `vertical-align` and `text-align` values for visible nodes. The Figma Plugin SHALL import direct text in `td`, `th`, or computed `display: table-cell` as a fixed-size table-cell frame with one editable text child instead of one full-height text layer. The table-cell frame MUST preserve captured cell width, height, visual style, and CSS padding. The editable text child MUST use HUG sizing for normal single-line table content. The table-cell frame MUST map CSS `vertical-align` to Figma counter-axis alignment, using CENTER when the value is missing or `middle`, MIN for top-like values, and MAX for bottom-like values. The table-cell frame MUST map CSS `text-align` to Figma primary-axis alignment; for legacy captures missing `textAlign`, it SHALL infer alignment from common utility classes such as `text-right`, `text-end`, `text-center`, `text-left`, or `text-start`.

#### Scenario: Numeric table cell text is vertically centered

- **WHEN** a captured `td` has direct text, `display: table-cell`, height greater than its line-height, padding, and `vertical-align: middle`
- **THEN** the imported Figma node is a fixed-size frame with layoutMode HORIZONTAL, counterAxisAlignItems CENTER, and a HUG editable text child

##### Example: ETF price cell

- **GIVEN** a captured `td` `dom-etf-price` at x=542, y=726, width=138.5, height=70.5 with textContent `"100.25"`, `display: "table-cell"`, `lineHeight: "16px"`, `paddingLeft: "12px"`, `paddingRight: "12px"`, `paddingTop: "3px"`, `paddingBottom: "3px"`, `verticalAlign: "middle"`, and class `"text-right"`
- **WHEN** the package is imported
- **THEN** `dom-etf-price` imports as a frame with rect width 138.5 and height 70.5, layoutMode HORIZONTAL, primaryAxisAlignItems MAX, counterAxisAlignItems CENTER, paddingRight 12, and a child TEXT layer whose text is `"100.25"` and textAutoResize is `WIDTH_AND_HEIGHT`


<!-- @trace
source: improve-editable-auto-layout-import
updated: 2026-06-12
code:
  - package.json
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/ui.html
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/popup.ts
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/code-classic.js
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/package.json
  - docs/manual-runtime-test.md
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/content-script.ts
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
  - apps/chrome-extension/package.json
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/chrome-extension/src/runtime.ts
  - scripts/build.mjs
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/ui.css
  - test/versioning.test.mjs
tests:
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
-->

---
### Requirement: CSS z-index preserves Figma stacking order
The Chrome Extension SHALL capture computed CSS `z-index` values for visible nodes. The Figma Plugin SHALL preserve numeric captured z-index values by writing `cssZIndex` plugin metadata on imported nodes. For parent frames that are not converted to Auto Layout, the importer MUST append child nodes in ascending numeric z-index order, treating missing or `auto` z-index as 0 and preserving DOM order for equal z-index values, so higher z-index children render above lower z-index children in Figma. When a child wrapper has no own numeric z-index but is non-visual and contains fixed/absolute overlay descendants with numeric z-index, the importer MUST use those descendant overlay z-index values for sibling stacking. For parent frames converted to Auto Layout, the importer MUST NOT reorder children by z-index because Auto Layout child order represents flex or inline flow; it MUST still preserve `cssZIndex` metadata for debug.

#### Scenario: Non-auto-layout overlapping children stack by z-index

- **WHEN** a captured non-Auto Layout container has overlapping children with numeric z-index values
- **THEN** the imported Figma parent frame appends lower z-index child layers before higher z-index child layers
- **AND** imported child nodes with numeric z-index expose `cssZIndex` plugin metadata

##### Example: overlay child appears above base content

- **GIVEN** a container `dom-stack` with child `dom-front` carrying `zIndex: "10"`, child `dom-middle` carrying no z-index, and child `dom-back` carrying `zIndex: "-1"`
- **WHEN** the package is imported
- **THEN** the Figma child insertion order is `dom-back`, `dom-middle`, `dom-front`
- **AND** `dom-front` has plugin metadata `cssZIndex: "10"`

#### Scenario: Auto Layout flow order is not changed by z-index

- **WHEN** a captured flex row passes Auto Layout eligibility and its children carry numeric z-index values
- **THEN** the imported Figma Auto Layout frame keeps child order from flex flow or reverse-flex visual order instead of sorting by z-index
- **AND** each imported child with numeric z-index still exposes `cssZIndex` plugin metadata

#### Scenario: Fixed overlay descendants preserve wrapper stacking

- **WHEN** two non-Auto Layout sibling wrappers have no numeric z-index, and one wrapper only hosts a fixed-position descendant with numeric z-index
- **THEN** sibling layer order uses that descendant fixed z-index for wrapper stacking
- **AND** fixed descendants with missing or `auto` z-index remain at the default stack level

##### Example: chat panel stays above page go-to-top button

- **GIVEN** a captured `forum__chat` wrapper contains fixed `chat__wrapper` with `zIndex: "7"`
- **AND** a sibling `forum__toTop` wrapper contains fixed `btn.toTop` with `zIndex: "auto"`
- **WHEN** the package is imported
- **THEN** `forum__toTop` is appended before `forum__chat` in the non-Auto Layout parent so the higher-z-index chat panel renders above the go-to-top button


<!-- @trace
source: improve-editable-auto-layout-import
updated: 2026-06-12
code:
  - package.json
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/ui.html
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/popup.ts
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/code-classic.js
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/package.json
  - docs/manual-runtime-test.md
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/content-script.ts
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
  - apps/chrome-extension/package.json
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/chrome-extension/src/runtime.ts
  - scripts/build.mjs
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/ui.css
  - test/versioning.test.mjs
tests:
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
-->

---
### Requirement: Risky layout containers stay absolute
The Figma Plugin SHALL keep risky or low-confidence containers as ordinary nested frames without Auto Layout. The importer MUST record skipped auto layout reasons in the import report for overlapping children, fixed or sticky containers, complex grid containers, missing bounds, one-child containers that lack explicit alignment evidence, absolute-positioned decoration children, and flex containers with strongly non-uniform implicit child gaps that cannot be represented by captured CSS alignment.

#### Scenario: Overlapping container is skipped

- **WHEN** a captured container has two renderable children whose bounds overlap on the primary axis
- **THEN** the imported parent frame keeps layoutMode NONE and the import report includes skipped reason overlapping-layout for that sourceNodeId

##### Example: horizontal overlap

- **GIVEN** a flex row container `dom-overlap` at x=0, y=0, width=200, height=60 with child A at x=10, width=80 and child B at x=50, width=80
- **WHEN** the package is imported
- **THEN** `dom-overlap` is rendered as a nested frame without Auto Layout and `autoLayoutConfidenceSummary.skippedReasons` includes `{ sourceNodeId: "dom-overlap", reason: "overlapping-layout" }`

#### Scenario: Fixed overlay is skipped

- **WHEN** a captured container has position fixed or sticky
- **THEN** the imported parent frame keeps layoutMode NONE and the import report includes skipped reason fixed-or-sticky-layout for that sourceNodeId

##### Example: sticky header

- **GIVEN** a container `dom-sticky-header` with `position: sticky`, x=0, y=0, width=1200, height=64 and two non-overlapping child items
- **WHEN** the package is imported
- **THEN** `dom-sticky-header` is rendered as a nested frame without Auto Layout and `autoLayoutConfidenceSummary.skippedReasons` includes `{ sourceNodeId: "dom-sticky-header", reason: "fixed-or-sticky-layout" }`

#### Scenario: Out-of-bounds wrapper is skipped

- **WHEN** a captured flex container includes a child whose captured bounds sit outside the parent bounds or depend on a large negative parent-relative offset
- **THEN** the imported parent frame keeps layoutMode NONE and the import report includes skipped reason out-of-bounds-child for that sourceNodeId

##### Example: nonvisual wrapper

- **GIVEN** a flex row container `dom-menu-item` at x=100, y=100, width=140, height=24 with an icon child inside the bounds and a wrapper child `dom-label-wrapper` at x=-78, y=-95, width=1, height=1 containing visible text positioned back into the row
- **WHEN** the package is imported
- **THEN** `dom-menu-item` is rendered as a nested frame without Auto Layout and `autoLayoutConfidenceSummary.skippedReasons` includes `{ sourceNodeId: "dom-menu-item", reason: "out-of-bounds-child" }`

#### Scenario: Non-uniform implicit flex spacing is skipped

- **WHEN** a captured flex container has at least three children whose primary-axis gaps are strongly non-uniform, and captured CSS does not provide `justify-content: space-between` or another equivalent alignment mapping
- **THEN** the imported parent frame keeps layoutMode NONE and the import report includes skipped reason non-uniform-spacing for that sourceNodeId

##### Example: left cluster plus right-aligned response count

- **GIVEN** a flex row `dom-response-row` at x=366, y=931, width=696, height=20.1 with `justifyContent: "normal"`, child `dom-response-like` at x=366, width=52.16, child `dom-response-worth` at x=426.16, width=51.83, and child `dom-response-comments` at x=999, width=63
- **WHEN** the package is imported
- **THEN** `dom-response-row` is rendered as a nested frame without Auto Layout, its child x positions are 0, 60.16, and 633 relative to the parent, and `autoLayoutConfidenceSummary.skippedReasons` includes `{ sourceNodeId: "dom-response-row", reason: "non-uniform-spacing" }`


<!-- @trace
source: improve-editable-auto-layout-import
updated: 2026-06-12
code:
  - package.json
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/ui.html
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/popup.ts
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/code-classic.js
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/package.json
  - docs/manual-runtime-test.md
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/content-script.ts
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
  - apps/chrome-extension/package.json
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/chrome-extension/src/runtime.ts
  - scripts/build.mjs
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/ui.css
  - test/versioning.test.mjs
tests:
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
-->

---
### Requirement: Mixed inline content preserves direct text and child nodes
The Figma Plugin SHALL preserve elements that combine direct text content and renderable child elements. When a captured node has both direct `textContent` and child SVG, image, or text nodes, the importer MUST create a container frame, keep all child models, and synthesize an editable direct-text child instead of treating the original element as a text leaf.

#### Scenario: Icon and direct label both import

- **WHEN** a captured inline or flex element has a visible SVG child and direct label text
- **THEN** the imported element is a frame containing the SVG/image model and a synthesized text model for the direct label

##### Example: checkout link icon plus label

- **GIVEN** a captured link `dom-checkout-link` at x=100, y=6, width=40, height=16 with direct textContent `"結帳"` and child SVG `dom-cart-svg` at x=100, y=6, width=16, height=16
- **WHEN** the package is imported
- **THEN** `dom-checkout-link` is a HORIZONTAL frame whose children are an SVG/image model for `dom-cart-svg` followed by a TEXT model with sourceNodeId `dom-checkout-link::text` and text `"結帳"`

#### Scenario: Direct text between icon and child text keeps visual order

- **WHEN** a captured inline or flex element has a leading SVG child, direct text, and a later child text node
- **THEN** the imported frame keeps the SVG, synthesized direct text, and later child text in browser visual order

##### Example: points link icon, label, and count

- **GIVEN** a captured link `dom-member-points-link` at x=620, y=0, width=50.08, height=16 with child SVG `dom-member-points-svg` at x=620, y=0, width=16, height=16, direct textContent `"P點:"`, and child text `dom-member-points-count` at x=662.88, y=0, width=7.2, height=16 with textContent `"4"`
- **WHEN** the package is imported
- **THEN** `dom-member-points-link` is a HORIZONTAL frame whose children are an SVG/image model, a TEXT model with sourceNodeId `dom-member-points-link::text` and text `"P點:"`, and a TEXT model with text `"4"` in that order


<!-- @trace
source: improve-editable-auto-layout-import
updated: 2026-06-12
code:
  - package.json
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/ui.html
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/popup.ts
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/code-classic.js
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/package.json
  - docs/manual-runtime-test.md
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/content-script.ts
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
  - apps/chrome-extension/package.json
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/chrome-extension/src/runtime.ts
  - scripts/build.mjs
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/ui.css
  - test/versioning.test.mjs
tests:
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
-->

---
### Requirement: Visible CSS pseudo-elements import as decoration layers
The Chrome Extension SHALL capture visible CSS `::before` and `::after` pseudo-elements as synthetic child nodes when their computed styles describe a visible box, visible textual `content`, or visible image `content`. The Figma Plugin SHALL import decoration pseudo nodes as visual rectangle layers, textual pseudo nodes as editable text layers, and image pseudo nodes as image/vector layers. Containers with absolute-positioned pseudo-element children MUST keep absolute child geometry instead of treating the pseudo-element as an Auto Layout flow item. Imported pseudo decoration geometry MUST apply supported captured CSS transform translation before deriving parent-relative Figma coordinates.

#### Scenario: Active tab underline pseudo-element is captured

- **WHEN** a visible element has a displayed `::after` pseudo-element with `content`, nonzero inferred width/height, and a visible background color
- **THEN** the `.figcapture` node contains a synthetic child with `nodeType: "pseudo"`, tagName `"::after"`, computed visual styles, and viewport rect inferred from the applicable owner or positioned containing-block box and pseudo-element offsets

##### Example: tab active underline

- **GIVEN** a captured active tab element `dom-active-tab` at x=100, y=20, width=64, height=60 whose computed `::after` has `content: "\"\""`, `display: "block"`, `position: "absolute"`, `left: "16px"`, `bottom: "0px"`, `width: "32px"`, `height: "2px"`, and `backgroundColor: "rgb(194, 41, 46)"`
- **WHEN** the page is captured
- **THEN** the synthetic `::after` child has rect x=116, y=78, width=32, height=2 and `attributes["data-pseudo"]: "::after"`

#### Scenario: Textual before pseudo-element is captured and ordered before direct text

- **WHEN** a visible element has a displayed `::before` pseudo-element with textual CSS `content` such as `"..."`, no explicit width/height, and computed font metrics
- **THEN** the `.figcapture` node contains a synthetic pseudo child with editable `textContent` and an inferred text rect
- **AND** the Figma import places that `::before` text before the synthesized editable direct text

##### Example: read-more ellipsis

- **GIVEN** a captured read-more button `dom-readmore-button` at x=500, y=354, width=96, height=27 with direct textContent `"閱讀更多"` and computed `::before` content `"..."`, font-size 18px, line-height 27px
- **WHEN** the page is captured and imported
- **THEN** `dom-readmore-button-before` is a TEXT child with text `"..."` and appears before the synthesized `dom-readmore-button::text` label `"閱讀更多"`

#### Scenario: Absolute pseudo-element uses positioned containing block

- **WHEN** a visible static element owns an absolute `::after`, and its nearest positioned ancestor establishes the containing block
- **THEN** the synthetic pseudo-element rect is inferred from that positioned ancestor rather than the static owner box

##### Example: active child label underline inside positioned tab

- **GIVEN** a positioned tab item at x=100, y=20, width=64, height=60 with a static active label child at x=116, y=38, width=32, height=24 whose computed `::after` has `content: "\"\""`, `display: "block"`, `position: "absolute"`, `left: "0px"`, `top: "57px"`, `width: "64px"`, `height: "3px"`, and `backgroundColor: "rgb(194, 41, 46)"`
- **WHEN** the page is captured
- **THEN** the synthetic `::after` child has rect x=100, y=77, width=64, height=3

#### Scenario: Active tab underline imports as rectangle without Auto Layout flow

- **WHEN** a captured element has a label child and an absolute-positioned visible pseudo-element underline child
- **THEN** the imported parent stays a nested frame without Auto Layout and the pseudo-element imports as a rectangle at the captured parent-relative position

##### Example: active tab label and underline

- **GIVEN** a captured tab `dom-active-tab` at x=100, y=20, width=64, height=60 with text child `dom-active-tab-label` at x=116, y=38, width=32, height=24 and pseudo child `dom-active-tab-after` at x=116, y=78, width=32, height=2, `position: "absolute"`, and `backgroundColor: "rgb(194, 41, 46)"`
- **WHEN** the package is imported
- **THEN** `dom-active-tab` records skipped reason `absolute-position-child` and `dom-active-tab-after` is a rectangle at parent-relative x=16, y=58, width=32, height=2

#### Scenario: Translated pseudo separator stays vertically centered

- **WHEN** a captured absolute `::after` separator uses computed `top` plus CSS transform translation to center itself vertically
- **THEN** the imported pseudo rectangle applies the transform translation before parent-relative placement

##### Example: ETF nav separator with translateY centering

- **GIVEN** a captured link `dom-etf-nav-link` at x=100, y=20, width=135.38, height=48 and an absolute pseudo child `dom-etf-nav-link-after` at x=234.38, y=44, width=1, height=20 with `position: "absolute"`, `backgroundColor: "rgb(212, 212, 212)"`, and `transform: "matrix(1, 0, 0, 1, 0, -10)"`
- **WHEN** the package is imported
- **THEN** `dom-etf-nav-link-after` imports as a rectangle at parent-relative x=134.38, y=14, width=1, height=20

#### Scenario: Inline pseudo-element CSS image icon is captured and packaged

- **WHEN** a captured element has a visible `::after` pseudo-element with `display: inline-block`, explicit width and height, no positioned offsets, and a CSS image URL in `background-image`, `mask-image`, or `-webkit-mask-image`
- **THEN** the `.figcapture` node contains a synthetic pseudo child with an inferred trailing-edge rect
- **AND** asset packaging stores the CSS image as an asset for that pseudo child
- **AND** the Figma import places the `::after` icon after the synthesized editable direct text, not before it

##### Example: verified creator badge

- **GIVEN** a captured label `dom-creator-plan` at x=32, y=40, width=132, height=28 with textContent `"創作者計畫"` and an inline `::after` at width 16, height 16, `backgroundImage: "url(data:image/svg+xml,...)"`, and no `left`, `right`, `top`, or `bottom`
- **WHEN** the page is captured and packaged
- **THEN** the synthetic `::after` child has rect x=148, y=46, width=16, height=16
- **AND** that pseudo child receives an assetRef such as `assets/icon-1.svg`

#### Scenario: Pseudo-element content URL imports as an asset, not text

- **WHEN** a visible pseudo-element has `content: url("data:image/svg+xml;base64,...")`, nonzero width/height, and no textual content
- **THEN** the `.figcapture` synthetic pseudo child keeps empty `textContent`
- **AND** asset packaging stores the content URL as an SVG asset for that pseudo child
- **AND** the Figma import creates an image/vector layer instead of an editable text layer containing the raw data URL string

#### Scenario: No-offset absolute after pseudo icon uses trailing static position

- **WHEN** a captured `::after` pseudo-element uses a CSS image, has `position: absolute`, explicit width and height, and no `left`, `right`, `top`, or `bottom`
- **THEN** capture infers its static pseudo position on the owner's trailing edge rather than the owner or containing-block leading edge


<!-- @trace
source: improve-editable-auto-layout-import
updated: 2026-06-12
code:
  - package.json
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/ui.html
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/popup.ts
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/code-classic.js
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/package.json
  - docs/manual-runtime-test.md
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/content-script.ts
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
  - apps/chrome-extension/package.json
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/chrome-extension/src/runtime.ts
  - scripts/build.mjs
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/ui.css
  - test/versioning.test.mjs
tests:
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
-->

---
### Requirement: CSS gradient backgrounds import as visible fills
The Figma Plugin SHALL treat supported CSS `linear-gradient(...)` backgrounds as visible fills. Layout model generation MUST NOT drop nodes whose only visual style is a linear gradient, and Figma adapters MUST convert supported gradient fills into Figma gradient paints.

#### Scenario: Carousel fade overlay keeps its gradient

- **WHEN** a captured overlay element has `backgroundImage: "linear-gradient(to right, rgba(255, 255, 255, 0), rgb(255, 255, 255))"` and no solid background color
- **THEN** the layout model keeps that element as a visible shape or frame
- **AND** the imported Figma node has a `GRADIENT_LINEAR` fill

#### Scenario: Read-more mask keeps its gradient

- **WHEN** a captured read-more control uses a `linear-gradient(...)` background to hide overflowing text under its label
- **THEN** the imported Figma frame keeps a visible gradient fill behind the editable read-more text


<!-- @trace
source: improve-editable-auto-layout-import
updated: 2026-06-12
code:
  - package.json
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/ui.html
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/popup.ts
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/code-classic.js
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/package.json
  - docs/manual-runtime-test.md
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/content-script.ts
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
  - apps/chrome-extension/package.json
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/chrome-extension/src/runtime.ts
  - scripts/build.mjs
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/ui.css
  - test/versioning.test.mjs
tests:
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
-->

---
### Requirement: Editable text preserves visual bounds
The Figma Plugin SHALL choose a text resize mode that matches captured text geometry when creating editable text layers. Text nodes captured as single-line content MUST use auto-width behavior so Figma font substitution does not wrap labels, usernames, stock codes, or short numbers into multiple lines. Auto-width text MUST also use Figma Auto Layout child HUG sizing when the host API supports it, so navigation labels size to their content inside top bars and menu rows. Text nodes captured as multiline or constrained content MUST keep their captured width so Figma auto-resize does not turn wrapped production text into overflowing single-line text. Text nodes with visible background, visible border, or shadow MUST preserve that visual backing while keeping the text editable. Text nodes with only invisible decorative styles, such as transparent background plus border radius and no visible border or shadow, MUST remain editable text without a fixed-width backing frame.

#### Scenario: Single-line text uses auto width

- **WHEN** a captured text node has content without explicit newline and captured height no larger than one line-height
- **THEN** the imported Figma text node uses auto-width behavior

##### Example: username label

- **GIVEN** a captured text node `dom-user-name` with content `harry_chuang`, x=60, y=12, width=108, height=24, font size 16px, and line-height 24px
- **WHEN** the package is imported
- **THEN** `dom-user-name` uses Figma `WIDTH_AND_HEIGHT` text auto-resize behavior

#### Scenario: Top bar menu text uses Hug child sizing

- **WHEN** a captured top bar menu label is a single-line text node inside a flex Auto Layout menu row
- **THEN** the imported Figma text node uses `WIDTH_AND_HEIGHT` text auto-resize and horizontal HUG child sizing rather than fixed or fill width

##### Example: menu label beside dropdown arrow

- **GIVEN** a captured menu row `dom-top-menu-item` with `display: "flex"`, `alignItems: "center"`, a text child `dom-top-menu-label` with textContent `"理財寶商城"`, and a 12px dropdown arrow child
- **WHEN** the package is imported
- **THEN** `dom-top-menu-label` has `textAutoResize: "WIDTH_AND_HEIGHT"` and `layoutSizingHorizontal: "HUG"`

#### Scenario: Mixed direct tab text uses Hug sizing when it fits on one line

- **WHEN** a captured link, tab, or button has direct text plus a pseudo/icon child, and the synthesized direct text has no newline with estimated single-line width fitting the available text segment
- **THEN** the imported synthesized text node uses `WIDTH_AND_HEIGHT` text auto-resize and horizontal HUG child sizing
- **AND** a tall parent line box or pseudo separator MUST NOT force that label into fixed-width multiline text

##### Example: ETF nav link with separator

- **GIVEN** a captured link `dom-etf-nav-link` at x=100, y=20, width=135.38, height=48 with direct textContent `"熱門ETF排行榜"`, font size 18px, line-height 27px, and a `::after` separator child at x=234.38, y=44, width=1, height=20
- **WHEN** the package is imported
- **THEN** the synthesized text node `dom-etf-nav-link::text` uses `WIDTH_AND_HEIGHT` text auto-resize and horizontal HUG child sizing instead of fixed width

#### Scenario: Mixed direct tab text respects parent padding

- **WHEN** a captured mixed-content link has parent padding and a trailing absolute pseudo separator outside the padded content box
- **THEN** the synthesized direct-text node starts inside the padded content box
- **AND** the trailing separator does not consume the label's padded gap

##### Example: ETF nav padded link segment

- **GIVEN** a captured link `dom-etf-region-link` at x=509.38, y=367, width=114.19, height=48 with direct textContent `"依區域選股"`, padding left/right 12px, font size 18px, line-height 27px, and an absolute `::after` separator at x=622.56, y=391, width=1, height=20
- **WHEN** the package is imported
- **THEN** the synthesized text node `dom-etf-region-link::text` is parent-relative x=12, y=10.5, width=90, height=27 and uses `WIDTH_AND_HEIGHT` text auto-resize with horizontal HUG sizing

#### Scenario: Direct interactive tab text uses Hug sizing when it fits on one line

- **WHEN** a captured link, tab, menuitem, or button has direct text without pseudo/icon children, no newline, and estimated single-line width fitting the captured box
- **THEN** the imported text node uses `WIDTH_AND_HEIGHT` text auto-resize and horizontal HUG child sizing
- **AND** non-interactive wide text boxes such as table cells remain fixed-width when their captured box represents a layout cell rather than the text glyph bounds

##### Example: final ETF nav link without separator

- **GIVEN** a captured link `dom-about-etf-link` at x=737.75, y=367, width=81.27, height=48 with textContent `"關於ETF"`, font size 18px, and line-height 27px
- **WHEN** the package is imported
- **THEN** `dom-about-etf-link` uses `WIDTH_AND_HEIGHT` text auto-resize and horizontal HUG child sizing

#### Scenario: Tall single-line tab labels center after Hug normalization

- **WHEN** a captured direct tab, link, menuitem, or button label uses a taller browser line box than its CSS line-height, has no newline, and still qualifies for `WIDTH_AND_HEIGHT` HUG sizing
- **THEN** the imported Figma text rect is reduced to the captured CSS line-height and vertically centered inside the original captured line box
- **AND** the label remains HUG-sized horizontally so tab and menu text does not wrap

##### Example: ETF rank tab button

- **GIVEN** a captured button `dom-rank-tab-popular` at x=366, y=615, width=61.41, height=47 with textContent `"熱門ETF"`, font size 16px, and line-height 24px
- **WHEN** the package is imported
- **THEN** `dom-rank-tab-popular` has `textAutoResize: "WIDTH_AND_HEIGHT"`, `layoutSizingHorizontal: "HUG"`, y `626.5`, and height `24`

#### Scenario: Clipped single-line text keeps fixed width

- **WHEN** a captured single-line text node has CSS inline clipping such as `white-space: nowrap` plus `overflow: hidden`, and the full text would exceed the captured rect width
- **THEN** the imported Figma text node keeps fixed horizontal sizing and uses truncate/fixed text behavior instead of HUG sizing

##### Example: clipped account name in top bar

- **GIVEN** a captured text node `dom-member-name` with textContent `"harry_chuang"`, x=1468, y=6, width=48, height=16, `fontSize: "12px"`, `lineHeight: "16px"`, `whiteSpace: "nowrap"`, `overflow: "hidden"`, and `width: "48px"`
- **WHEN** the package is imported
- **THEN** `dom-member-name` has `textAutoResize: "TRUNCATE"`, `layoutSizingHorizontal: "FIXED"`, and width 48

#### Scenario: Long text keeps captured width

- **WHEN** a captured text node has width 244, height 40, and long content that wraps inside a right rail list item
- **THEN** the imported Figma text node has width 244 and uses an auto-height or fixed-width behavior rather than width-and-height auto-resize

#### Scenario: Text background is preserved

- **WHEN** a captured text node has visible background color and text content
- **THEN** the imported editable output contains a visual backing frame or rectangle with the captured background and a nested text layer using parent-relative geometry

##### Example: stock price badge

- **GIVEN** a captured text node `dom-price` with content `48.35`, x=24, y=84, width=47, height=24, background color `rgb(0, 131, 83)`, corner radius 2px, and text color white
- **WHEN** the package is imported
- **THEN** `dom-price` creates a visual backing frame at x=24, y=84, width=47, height=24, and a nested editable text layer at x=0, y=0, width=47, height=24

#### Scenario: Padded visible text backing keeps CSS padding

- **WHEN** a captured single-line text node has visible background, text content, and explicit CSS padding
- **THEN** the imported editable output contains a fixed-size Auto Layout backing frame whose padding matches the captured CSS padding and whose nested text uses auto-width HUG sizing

##### Example: compact reaction badge

- **GIVEN** a captured text node `dom-mark` with content `讚`, x=380, y=904.6, width=20, height=20.5, background color `rgb(54, 54, 54)`, corner radius 27px, text color white, and padding top/right/bottom/left of 2px/4px/2px/4px
- **WHEN** the package is imported
- **THEN** `dom-mark` creates a visual backing frame at x=380, y=904.6, width=20, height=20.5 with Auto Layout padding left/right/top/bottom of 4/4/2/2 and a nested editable text layer using `WIDTH_AND_HEIGHT` auto-resize and horizontal HUG sizing

#### Scenario: Padded chat bubble text does not wrap from inner fixed width

- **WHEN** a captured single-line visible text backing has explicit CSS width and padding, and that explicit width describes the outer border box
- **THEN** the nested editable text uses auto-width HUG sizing unless captured CSS shows real inline clipping
- **AND** the fixed-size backing frame preserves captured width, height, padding, border, and corner radius

##### Example: unsent chat message pill

- **GIVEN** a captured message node `dom-chat-unsend` with content `Tim.JJ2fv1已收回訊息`, x=1209, y=621, width=199.15, height=33, `width: "199.148px"`, `lineHeight: "16px"`, padding left/right/top/bottom `20px/20px/8px/8px`, visible border, and corner radius 19px
- **WHEN** the package is imported
- **THEN** `dom-chat-unsend` creates a fixed backing frame with Auto Layout padding left/right/top/bottom of 20/20/8/8 and a nested editable text layer using `WIDTH_AND_HEIGHT` auto-resize and horizontal HUG sizing

#### Scenario: Transparent rounded button label uses auto width

- **WHEN** a captured single-line button text node has transparent background, border radius, no visible border, no visible shadow, and no explicit newline after whitespace normalization
- **THEN** the imported editable output keeps the node as a text layer using auto-width behavior instead of creating a fixed-width Text Background frame

##### Example: article answer count button

- **GIVEN** a captured `button.articleResponse__comment` node `dom-answer-count` with textContent `"9則回答"`, x=1011, y=884, width=54, height=20, `backgroundColor: "rgba(0, 0, 0, 0)"`, `borderTopLeftRadius: "4px"`, and border widths `0px`
- **WHEN** the package is imported
- **THEN** `dom-answer-count` is a TEXT model with `textAutoResize: "WIDTH_AND_HEIGHT"` and no parent model named `Text Background / 9則回答`

#### Scenario: Transparent padded emoji text uses content box

- **WHEN** a captured emoji-only message text node has transparent visual styles but explicit CSS padding
- **THEN** the imported editable text layer is placed at the padded content box instead of the outer border box
- **AND** the text keeps HUG sizing when the emoji fits on one line

##### Example: emoji-only chat bubble text

- **GIVEN** a captured `pre.message__pre` node `dom-chat-emoji` with content `🥰`, x=1209, y=712, width=54, height=39, `lineHeight: "21px"`, padding left/right/top/bottom `19px/19px/9px/9px`, and transparent background
- **WHEN** the package is imported
- **THEN** `dom-chat-emoji` imports as editable text at x=19, y=9, width=16, height=21 relative to its parent bubble
- **AND** `dom-chat-emoji` uses `WIDTH_AND_HEIGHT` auto-resize and horizontal HUG sizing

#### Scenario: Transparent padded interactive tabs preserve wrapper frames

- **WHEN** a captured single-line link/button/tab/menuitem has transparent visual styles, explicit CSS padding, and explicit captured width/height that define the interactive hit area
- **THEN** the imported editable output preserves the outer element as a fixed-size Auto Layout frame with matching padding
- **AND** the nested editable text sits in the padded content box and uses HUG sizing when the text fits on one line
- **AND** parent Auto Layout rows keep those tab/link frames as children instead of direct text nodes, preserving browser tab height and spacing

##### Example: ETF rank sub tab

- **GIVEN** a captured `a.etfRankPage__subTab` node `dom-etf-subtab-hot` with text `熱門ETF`, x=279, y=420, width=69.875, height=37, `display: "flex"`, `alignItems: "center"`, `lineHeight: "21px"`, transparent background, and padding top/right/bottom/left `8px/8px/8px/8px`
- **AND** its parent `nav.etfRankPage__subTabs` is a horizontal flex row with gap 4px and left/right padding 8px
- **WHEN** the package is imported
- **THEN** `dom-etf-subtab-hot` imports as a FRAME at x=8, y=0, width=69.875, height=37 relative to the nav with Auto Layout padding left/right/top/bottom of 8/8/8/8
- **AND** the nested editable text imports at x=8, y=8, width=53.88, height=21 relative to the tab frame with `WIDTH_AND_HEIGHT` auto-resize and horizontal HUG sizing


<!-- @trace
source: improve-editable-auto-layout-import
updated: 2026-06-12
code:
  - package.json
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/ui.html
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/popup.ts
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/code-classic.js
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/package.json
  - docs/manual-runtime-test.md
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/content-script.ts
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
  - apps/chrome-extension/package.json
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/chrome-extension/src/runtime.ts
  - scripts/build.mjs
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/ui.css
  - test/versioning.test.mjs
tests:
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
-->

---
### Requirement: CSS box shadows import as Figma effects
The Figma Plugin SHALL convert captured visible CSS `box-shadow` values into Figma `DROP_SHADOW` effects for imported visual boxes. The converter MUST support browser-ordered shadow strings where the color appears before the length values, and it MUST preserve the parsed color alpha, x/y offset, blur radius, and spread when present. Module and classic runtimes MUST apply the same shadow conversion.

#### Scenario: Chat panel shadow imports from browser computed style

- **WHEN** a captured panel has `boxShadow: "rgba(0, 0, 0, 0.2) 0px 4px 36px 0px"`
- **THEN** the imported Figma node has a `DROP_SHADOW` effect with color alpha 0.2, offset x 0, offset y 4, radius 36, and spread 0

##### Example: floating chat area panel

- **GIVEN** a captured `div.chat__area` node `dom-chat-panel` at width 601 and height 520 with corner radius 15px and `boxShadow: "rgba(0, 0, 0, 0.2) 0px 4px 36px 0px"`
- **WHEN** the package is imported through either module or classic runtime
- **THEN** `dom-chat-panel` imports as a frame with a visible Figma `DROP_SHADOW` matching the captured CSS shadow values


<!-- @trace
source: improve-editable-auto-layout-import
updated: 2026-06-12
code:
  - package.json
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/ui.html
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/popup.ts
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/code-classic.js
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/package.json
  - docs/manual-runtime-test.md
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/content-script.ts
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
  - apps/chrome-extension/package.json
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/chrome-extension/src/runtime.ts
  - scripts/build.mjs
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/ui.css
  - test/versioning.test.mjs
tests:
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
-->

---
### Requirement: Captured font stacks choose available Figma fonts
The Chrome Extension SHALL capture computed CSS text font data including `font-family`, `font-style`, `font-weight`, `font-size`, and `line-height`. The Figma Plugin SHALL parse the captured CSS `font-family` stack and try concrete font family candidates in order when loading Figma text fonts. The importer MUST ignore generic CSS family names such as `sans-serif`, `serif`, `system-ui`, and `monospace`. For each concrete family, the importer MUST try the requested Figma style derived from CSS weight/style and MUST try `Regular` for the same family before moving to the next family when the requested style is not already `Regular`. The importer MUST use the configured default fallback font only after concrete CSS stack candidates fail. When the loaded Figma font differs from the first requested CSS candidate, the import report MUST include font substitution details with the source node, requested first font, requested stack, attempted fonts, and final used font.

#### Scenario: Later CSS font-family candidate is used before default fallback

- **WHEN** a captured text node has `fontFamily: "\"Missing Webfont\", \"Available Sans\", sans-serif"`, `fontStyle: "italic"`, and `fontWeight: "700"`
- **AND** Figma cannot load `Missing Webfont Bold Italic`, `Missing Webfont Regular`, or `Available Sans Bold Italic`
- **AND** Figma can load `Available Sans Regular`
- **THEN** the imported Figma text node uses fontName `{ family: "Available Sans", style: "Regular" }`
- **AND** the import report includes a font substitution from `Missing Webfont Bold Italic` to `Available Sans Regular`

#### Scenario: Exact first CSS font candidate is available

- **WHEN** a captured text node has a concrete first font-family candidate and Figma can load that family/style
- **THEN** the imported Figma text node uses that first requested font
- **AND** the import report does not count a font substitution for that text node

##### Example: first font candidate exists locally

- **GIVEN** a captured text node `dom-heading` with `fontFamily: "\"Noto Sans TC\", \"PingFang TC\", sans-serif"`, `fontStyle: "normal"`, and `fontWeight: "700"`
- **AND** Figma can load `Noto Sans TC Bold`
- **WHEN** the package is imported
- **THEN** `dom-heading` uses fontName `{ family: "Noto Sans TC", style: "Bold" }`
- **AND** the import report has no font substitution entry for `dom-heading`


<!-- @trace
source: improve-editable-auto-layout-import
updated: 2026-06-12
code:
  - package.json
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/ui.html
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/popup.ts
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/code-classic.js
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/package.json
  - docs/manual-runtime-test.md
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/content-script.ts
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
  - apps/chrome-extension/package.json
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/chrome-extension/src/runtime.ts
  - scripts/build.mjs
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/ui.css
  - test/versioning.test.mjs
tests:
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
-->

---
### Requirement: Clipped overflow containers preserve browser clipping
The Chrome Extension SHALL capture computed overflow and max-size values that affect visible clipping, including `overflow`, `overflow-x`, `overflow-y`, `max-width`, `max-height`, and `text-overflow`. The Figma Plugin SHALL import containers with clipping overflow on either axis as fixed-size frames with `clipsContent` enabled. The importer MUST preserve nested children at parent-relative positions for editing and debugging, but content outside the captured frame bounds MUST remain clipped in Figma.

#### Scenario: Limited read-more text clips hidden lines

- **WHEN** a captured container has `overflow-y: hidden`, `max-height: 81px`, captured height 81, and child text lines continuing beyond that height
- **THEN** the imported Figma frame keeps height 81 and has `clipsContent: true`
- **AND** nested child line layers beyond y=81 remain inside the frame but are visually clipped

##### Example: article preview limited to three lines

- **GIVEN** a captured `dom-readmore-text` container at x=24, y=40, width=540, height=81 with `overflowY: "hidden"`, `maxHeight: "81px"`, `lineHeight: "27px"`, and a fourth line child at y=121
- **WHEN** the package is imported
- **THEN** `dom-readmore-text` is a FRAME with `clipsContent: true`, height 81, and child `dom-readmore-line-4` at parent-relative y=81 or greater


<!-- @trace
source: improve-editable-auto-layout-import
updated: 2026-06-12
code:
  - package.json
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/ui.html
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/popup.ts
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/code-classic.js
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/package.json
  - docs/manual-runtime-test.md
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/content-script.ts
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
  - apps/chrome-extension/package.json
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/chrome-extension/src/runtime.ts
  - scripts/build.mjs
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/ui.css
  - test/versioning.test.mjs
tests:
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
-->

---
### Requirement: Captured text preserves browser whitespace semantics
The Chrome Extension SHALL normalize direct text content according to captured CSS `white-space` semantics before writing `textContent` into `.figcapture`. For `white-space: normal`, `nowrap`, missing, or unsupported values, the capture MUST collapse consecutive whitespace characters into a single space and trim leading and trailing whitespace. For `white-space: pre`, `pre-wrap`, or `break-spaces`, the capture MUST preserve raw direct text whitespace. For `white-space: pre-line`, the capture MUST preserve line breaks while collapsing horizontal whitespace within each line and removing indentation-only leading and trailing whitespace.

#### Scenario: Normal text collapses template indentation

- **WHEN** a visible element has `white-space: normal` and its direct DOM text contains HTML template indentation and line breaks
- **THEN** the captured node textContent contains the browser-visible text with collapsed spacing

##### Example: volume row

- **GIVEN** a direct text node value `"\n          成交量\n          44,279 張\n        "` with captured `whiteSpace: "normal"`
- **WHEN** the page is captured
- **THEN** the captured element textContent is `"成交量 44,279 張"`

#### Scenario: Preformatted text preserves raw whitespace

- **WHEN** a visible element has `white-space: pre`, `pre-wrap`, or `break-spaces`
- **THEN** the captured node textContent preserves direct DOM text whitespace instead of collapsing indentation or line breaks

##### Example: code-like label

| Captured whiteSpace | Direct text value | Expected textContent |
| ------------------- | ----------------- | -------------------- |
| pre | `" A\n  B "` | `" A\n  B "` |
| pre-wrap | `" A\n  B "` | `" A\n  B "` |
| break-spaces | `" A\n  B "` | `" A\n  B "` |

#### Scenario: Pre-line preserves line breaks but removes indentation

- **WHEN** a visible element has `white-space: pre-line`
- **THEN** the captured node textContent preserves meaningful line breaks while collapsing indentation within each line

##### Example: multiline copy

- **GIVEN** a direct text node value `"\n          第一行\n          第二行\n        "` with captured `whiteSpace: "pre-line"`
- **WHEN** the page is captured
- **THEN** the captured element textContent is `"第一行\n第二行"`


<!-- @trace
source: improve-editable-auto-layout-import
updated: 2026-06-12
code:
  - package.json
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/ui.html
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/popup.ts
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/code-classic.js
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/package.json
  - docs/manual-runtime-test.md
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/content-script.ts
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
  - apps/chrome-extension/package.json
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/chrome-extension/src/runtime.ts
  - scripts/build.mjs
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/ui.css
  - test/versioning.test.mjs
tests:
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
-->

---
### Requirement: Captured box spacing preserves browser padding
The Chrome Extension SHALL include computed padding values in captured styles so Figma import can map box insets to Auto Layout padding without relying only on child geometry.

#### Scenario: Computed padding is captured

- **WHEN** a visible DOM element has computed padding values
- **THEN** the `.figcapture` node styles include `paddingTop`, `paddingRight`, `paddingBottom`, and `paddingLeft`

##### Example: right rail chart card

- **GIVEN** a `div.chartContainerTrend.page__aside` has computed `padding: 16px`
- **WHEN** the extension captures the visible viewport
- **THEN** that captured node has `styles.paddingTop: "16px"`, `styles.paddingRight: "16px"`, `styles.paddingBottom: "16px"`, and `styles.paddingLeft: "16px"`


<!-- @trace
source: improve-editable-auto-layout-import
updated: 2026-06-12
code:
  - package.json
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/ui.html
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/popup.ts
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/code-classic.js
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/package.json
  - docs/manual-runtime-test.md
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/content-script.ts
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
  - apps/chrome-extension/package.json
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/chrome-extension/src/runtime.ts
  - scripts/build.mjs
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/ui.css
  - test/versioning.test.mjs
tests:
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
-->

---
### Requirement: Canvas fallback captures current bitmap
The Chrome Extension SHALL package a canvas element's current bitmap as the fallback asset when browser APIs permit serialization. When direct canvas serialization is unavailable or produces only the transparent placeholder, the extension SHALL attempt to crop the same viewport region from the captured visible screenshot and use that PNG as the fallback asset. The extension MUST keep the existing canvas fallback diagnostic, and it MUST fall back to the transparent placeholder only when both direct serialization and screenshot crop fallback fail.

#### Scenario: Canvas bitmap fallback is available

- **WHEN** a visible canvas element can be serialized to a PNG data URL
- **THEN** the `.figcapture` package contains PNG bytes for that canvas fallback asset instead of the transparent placeholder

#### Scenario: Screenshot crop fallback is available for unserializable canvas

- **WHEN** a visible canvas element cannot be serialized but a visible viewport screenshot is available and browser crop APIs are available
- **THEN** the `.figcapture` package contains a PNG crop for that canvas fallback asset using the canvas viewport rect
- **AND** the package records the canvas fallback diagnostic for debugging

#### Scenario: Canvas bitmap fallback fails safely

- **WHEN** a visible canvas element throws during serialization because it is tainted or unsupported and screenshot crop fallback is unavailable
- **THEN** the `.figcapture` package still imports with a transparent fallback asset and records a canvas fallback diagnostic


<!-- @trace
source: improve-editable-auto-layout-import
updated: 2026-06-12
code:
  - package.json
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/ui.html
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/popup.ts
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/code-classic.js
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/package.json
  - docs/manual-runtime-test.md
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/content-script.ts
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
  - apps/chrome-extension/package.json
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/chrome-extension/src/runtime.ts
  - scripts/build.mjs
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/ui.css
  - test/versioning.test.mjs
tests:
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
-->

---
### Requirement: Visible viewport capture clips exported geometry
The Chrome Extension SHALL write visible-viewport `.figcapture` geometry using viewport-clipped rectangles. Elements that intersect the visible viewport MUST keep only the intersection with the viewport in their captured `rect`, while offscreen elements without visible children MUST remain excluded. This MUST prevent root, body, or long document containers from producing full-page-height frames when the capture scope is visible viewport only.

#### Scenario: Long body is clipped to viewport height

- **WHEN** the captured body has rect x=0, y=0, width=1440, height=3200 and the viewport is width=1440, height=900
- **THEN** the captured root rect is x=0, y=0, width=1440, height=900

#### Scenario: Partially visible container is clipped to the visible intersection

- **WHEN** a captured container has rect x=100, y=800, width=300, height=400 and the viewport is width=1440, height=900
- **THEN** the captured container rect is x=100, y=800, width=300, height=100


<!-- @trace
source: improve-editable-auto-layout-import
updated: 2026-06-12
code:
  - package.json
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/ui.html
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/popup.ts
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/code-classic.js
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/package.json
  - docs/manual-runtime-test.md
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/content-script.ts
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
  - apps/chrome-extension/package.json
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/chrome-extension/src/runtime.ts
  - scripts/build.mjs
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/ui.css
  - test/versioning.test.mjs
tests:
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
-->

---
### Requirement: Lazy image sources resolve before placeholders
The Chrome Extension SHALL choose a real image source candidate for `img` assets before packaging a placeholder. If `currentSrc` or `src` is missing or is a transparent placeholder data URL, the extension MUST evaluate captured lazy image attributes such as `data-src`, `data-original`, `data-lazy-src`, `srcset`, and `data-srcset`. The selected candidate MUST preserve SVG vs raster asset kind detection.

#### Scenario: Lazy SVG icon uses data-src instead of transparent GIF

- **WHEN** an image has `currentSrc` and `src` set to a transparent 1x1 GIF placeholder and `data-src` set to a data URL SVG plus icon
- **THEN** the `.figcapture` package stores the SVG bytes from `data-src`
- **AND** the captured node asset kind is `svg`

#### Scenario: Loaded responsive image keeps currentSrc

- **WHEN** an image has a non-placeholder `currentSrc` and a different `data-src`
- **THEN** the `.figcapture` package uses `currentSrc` as the selected image source


<!-- @trace
source: improve-editable-auto-layout-import
updated: 2026-06-12
code:
  - package.json
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/ui.html
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/popup.ts
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/code-classic.js
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/package.json
  - docs/manual-runtime-test.md
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/content-script.ts
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
  - apps/chrome-extension/package.json
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/chrome-extension/src/runtime.ts
  - scripts/build.mjs
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/ui.css
  - test/versioning.test.mjs
tests:
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
-->

---
### Requirement: SVG image transforms preserve browser rendering
The Chrome Extension SHALL include computed `transform` and `transformOrigin` values in captured styles. The Figma Plugin SHALL preserve SVG image intrinsic aspect ratio inside the captured image box unless the SVG explicitly opts out of aspect-ratio preservation, and it SHALL apply supported CSS rotation transforms to the imported vector layer while positioning the vector by its rotated bounding box before clipping.

#### Scenario: Rotated SVG image keeps its visual aspect

- **WHEN** a captured `img` points to an SVG asset with intrinsic size 10x17, captured rect 16x16, and computed transform `matrix(-1, 0, 0, -1, 0, 0)`
- **THEN** the imported editable output contains a 16x16 wrapper frame
- **AND** the nested SVG vector is sized proportionally to approximately 9.41x16, rotated 180 degrees, and positioned by the rotated bounding box so it remains visible inside the clipped wrapper


<!-- @trace
source: improve-editable-auto-layout-import
updated: 2026-06-12
code:
  - package.json
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/ui.html
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/popup.ts
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/code-classic.js
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/package.json
  - docs/manual-runtime-test.md
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/content-script.ts
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
  - apps/chrome-extension/package.json
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/chrome-extension/src/runtime.ts
  - scripts/build.mjs
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/ui.css
  - test/versioning.test.mjs
tests:
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
-->

---
### Requirement: Visible borders and outlines import as editable strokes
The Chrome Extension SHALL capture computed border side styles and outline styles for visible elements. The Figma Plugin SHALL derive an editable stroke from a uniform visible four-side border, and SHALL use a visible outline as the stroke fallback when no visible border exists. The Figma Plugin MUST NOT map one-sided or non-uniform borders to a normal Figma node stroke, because Figma strokes render all four sides. Instead, the importer SHALL create editable rectangle decoration layers for the visible border sides.

#### Scenario: Outline-only button keeps a visible stroke

- **WHEN** a captured button has `outlineWidth: "2px"`, `outlineStyle: "solid"`, and `outlineColor: "rgb(31, 95, 191)"` with no visible border
- **THEN** the imported editable output contains a Figma frame for that button with stroke weight 2 and stroke color `rgb(31, 95, 191)`

#### Scenario: Single-side border imports as underline decoration

- **WHEN** a captured element has a visible `borderBottomWidth`, `borderBottomStyle`, and `borderBottomColor` but no top border
- **THEN** the layout model includes a bottom-edge rectangle decoration with the captured border width and color, and the parent node does not receive a four-sided stroke

##### Example: active article tab underline

- **GIVEN** a captured tab item `dom-article-tab-active` at x=52, y=28, width=164, height=256 with `borderBottomWidth: "2px"`, `borderBottomStyle: "solid"`, `borderBottomColor: "rgb(194, 41, 46)"`, and all other border side widths `0px`
- **WHEN** the package is imported
- **THEN** `dom-article-tab-active` contains a rectangle decoration with sourceNodeId `dom-article-tab-active::border-bottom`, x=0, y=254, width=164, height=2, and fill color `rgb(194, 41, 46)`

<!-- @trace
source: improve-editable-auto-layout-import
updated: 2026-06-12
code:
  - package.json
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/ui.html
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/popup.ts
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/code-classic.js
  - apps/chrome-extension/src/content.ts
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/package.json
  - docs/manual-runtime-test.md
  - apps/figma-plugin/src/renderer.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/asset-capture.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/chrome-extension/src/capture-package.ts
  - apps/figma-plugin/src/report.ts
  - apps/figma-plugin/src/layout-tree.ts
  - packages/capture-schema/package.json
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/content-script.ts
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
  - apps/chrome-extension/package.json
  - apps/chrome-extension/popup.html
  - packages/capture-schema/src/index.ts
  - apps/chrome-extension/src/runtime.ts
  - scripts/build.mjs
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/src/code.ts
  - apps/figma-plugin/ui.css
  - test/versioning.test.mjs
tests:
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
-->

---
### Requirement: Capture usable visual asset bytes
The Chrome Extension SHALL include usable visual asset bytes in the `.figcapture` package whenever the asset can be read locally during export. The exporter MUST support data URL images, resolved `img` current source URLs through an asset resolver, inline SVG markup, and parseable CSS image URLs from background or mask styles. The exporter MUST record missing asset diagnostics instead of aborting when an asset cannot be read.

#### Scenario: Data URL image is packaged as raster bytes

- **WHEN** a captured `img` node has `src` or `currentSrc` equal to a PNG data URL
- **THEN** the package contains an `assets/image-*` entry with PNG bytes and the node references that asset through `assetRef`

##### Example: inline PNG data URL

- **GIVEN** an image node `dom-img` with `currentSrc` `data:image/png;base64,iVBORw0KGgo=`
- **WHEN** the designer exports the capture
- **THEN** `capture.json` contains `assetRef` for `dom-img` and `assets/image-1.png` starts with PNG signature bytes

#### Scenario: Remote image resolver success is packaged as image bytes

- **WHEN** a captured `img` node has a remote `currentSrc` and the asset resolver returns JPEG, PNG, WebP, or GIF bytes
- **THEN** the package stores those bytes in `assets/image-*` instead of a JSON external reference

#### Scenario: Extension has host permission for remote asset fetch

- **WHEN** the Chrome Extension is installed for V1 capture
- **THEN** its manifest declares host permissions that allow the local background runtime to fetch image and SVG assets referenced by the captured page

#### Scenario: Remote image resolver failure records diagnostics

- **WHEN** a captured visual asset source cannot be fetched or decoded
- **THEN** the package still exports and `diagnostics.missingAssets` includes that source node id with a readable warning


<!-- @trace
source: capture-real-images-and-svg-icons
updated: 2026-06-12
code:
  - apps/figma-plugin/ui.html
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/content.ts
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/stitch-screenshot.ts
  - docs/manual-runtime-test.md
  - apps/chrome-extension/package.json
  - apps/chrome-extension/src/asset-capture.ts
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/src/popup.ts
  - scripts/build.mjs
  - apps/chrome-extension/src/capture-core.ts
  - apps/figma-plugin/package.json
  - apps/figma-plugin/src/code.ts
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/src/runtime.ts
  - apps/chrome-extension/src/capture-package.ts
  - docs/v1-usage-and-acceptance.md
  - test/versioning.test.mjs
  - apps/chrome-extension/popup.html
  - apps/figma-plugin/ui.css
  - apps/figma-plugin/src/code-classic.js
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/figma-plugin/src/ui.ts
  - package.json
  - packages/capture-schema/package.json
  - apps/figma-plugin/src/renderer.ts
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/layout-tree.ts
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/manifest.json
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/src/report.ts
  - scripts/bump-version-if-changed.mjs
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
tests:
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
-->

---
### Requirement: Import SVG assets as editable vectors
The Figma Plugin SHALL import SVG assets as editable vector nodes when SVG bytes are available and the Figma runtime supports SVG node creation. The importer MUST fall back without aborting if SVG creation fails.

#### Scenario: Inline SVG becomes Figma vector

- **WHEN** a package contains an inline SVG asset referenced by a captured node
- **THEN** the imported Editable Accurate frame contains a vector/group node created from the SVG markup at the captured node geometry

##### Example: chevron icon

- **GIVEN** a captured SVG node `dom-chevron` with width 12, height 12, and markup `<svg viewBox="0 0 12 12"><path d="M4 2l4 4-4 4"/></svg>`
- **WHEN** the package is imported
- **THEN** the created node has plugin metadata `assetRef` for `dom-chevron` and is positioned at the captured rect


<!-- @trace
source: capture-real-images-and-svg-icons
updated: 2026-06-12
code:
  - apps/figma-plugin/ui.html
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/content.ts
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/stitch-screenshot.ts
  - docs/manual-runtime-test.md
  - apps/chrome-extension/package.json
  - apps/chrome-extension/src/asset-capture.ts
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/src/popup.ts
  - scripts/build.mjs
  - apps/chrome-extension/src/capture-core.ts
  - apps/figma-plugin/package.json
  - apps/figma-plugin/src/code.ts
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/src/runtime.ts
  - apps/chrome-extension/src/capture-package.ts
  - docs/v1-usage-and-acceptance.md
  - test/versioning.test.mjs
  - apps/chrome-extension/popup.html
  - apps/figma-plugin/ui.css
  - apps/figma-plugin/src/code-classic.js
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/figma-plugin/src/ui.ts
  - package.json
  - packages/capture-schema/package.json
  - apps/figma-plugin/src/renderer.ts
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/layout-tree.ts
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/manifest.json
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/src/report.ts
  - scripts/bump-version-if-changed.mjs
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
tests:
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
-->

---
### Requirement: Capture CSS image icons
The Chrome Extension SHALL capture parseable CSS `background-image`, `mask-image`, and `-webkit-mask-image` URLs as visual assets for non-image DOM nodes. The exporter MUST use the first parseable `url(...)` in V1 and MUST ignore unsupported CSS image values without aborting capture.

#### Scenario: CSS mask icon is packaged

- **WHEN** a captured button icon node has `mask-image: url(data:image/svg+xml;base64,...)`
- **THEN** the package contains a SVG asset for that icon and the captured node references it through `assetRef`

#### Scenario: Unsupported CSS gradient is ignored

- **WHEN** a captured node has `background-image: linear-gradient(...)`
- **THEN** no asset is created for that style and capture continues normally

<!-- @trace
source: capture-real-images-and-svg-icons
updated: 2026-06-12
code:
  - apps/figma-plugin/ui.html
  - fixtures/web-components/manual-fixture.html
  - apps/chrome-extension/src/content.ts
  - apps/figma-plugin/src/message-bridge.ts
  - apps/chrome-extension/src/stitch-screenshot.ts
  - docs/manual-runtime-test.md
  - apps/chrome-extension/package.json
  - apps/chrome-extension/src/asset-capture.ts
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/src/popup.ts
  - scripts/build.mjs
  - apps/chrome-extension/src/capture-core.ts
  - apps/figma-plugin/package.json
  - apps/figma-plugin/src/code.ts
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/src/runtime.ts
  - apps/chrome-extension/src/capture-package.ts
  - docs/v1-usage-and-acceptance.md
  - test/versioning.test.mjs
  - apps/chrome-extension/popup.html
  - apps/figma-plugin/ui.css
  - apps/figma-plugin/src/code-classic.js
  - apps/figma-plugin/src/figma-adapter.ts
  - apps/figma-plugin/src/ui.ts
  - package.json
  - packages/capture-schema/package.json
  - apps/figma-plugin/src/renderer.ts
  - test/e2e-smoke.test.mjs
  - apps/figma-plugin/src/layout-tree.ts
  - apps/chrome-extension/src/screenshot.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/manifest.json
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/src/report.ts
  - scripts/bump-version-if-changed.mjs
  - fixtures/dashboard/manual-fixture.html
  - .version-state.json
  - scripts/versioning.mjs
tests:
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
-->

---
### Requirement: Chrome extension runtime captures and previews active tab
The system SHALL connect the Chrome Extension popup, background runtime, content runtime, and visible screenshot adapter so a designer can capture the active tab current visible viewport with preview before export. The preview payload MUST include screenshot data URL, source URL, viewport width and height, diagnostics summary, and package status.

#### Scenario: Active tab capture preview

- **WHEN** the designer starts capture from the Chrome Extension popup on a loaded dashboard tab
- **THEN** the background runtime resolves the active current-window tab, collects DOM capture data from the content runtime, captures the visible screenshot, stores pending capture state, and the popup displays screenshot preview, URL metadata, viewport metadata, fallback count, missing asset count, unsupported style count, and enables export only when package status is ready

#### Scenario: Missing active tab blocks preview

- **WHEN** the active current-window tab cannot be resolved with a tab id
- **THEN** the runtime returns error category missing-active-tab and the popup keeps export disabled


<!-- @trace
source: wire-real-extension-and-figma-plugin-runtime
updated: 2026-06-12
code:
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/src/asset-capture.ts
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/ui.html
  - apps/chrome-extension/src/content.ts
  - package.json
  - scripts/versioning.mjs
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.css
  - apps/figma-plugin/package.json
  - .version-state.json
  - apps/chrome-extension/popup.html
  - apps/figma-plugin/src/report.ts
  - apps/chrome-extension/package.json
  - packages/capture-schema/package.json
  - apps/figma-plugin/src/layout-tree.ts
  - apps/chrome-extension/src/background.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/stitch-screenshot.ts
  - fixtures/dashboard/manual-fixture.html
  - apps/chrome-extension/src/capture-package.ts
  - apps/chrome-extension/src/screenshot.ts
  - docs/manual-runtime-test.md
  - apps/chrome-extension/src/popup.ts
  - apps/chrome-extension/src/runtime.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - scripts/build.mjs
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/src/code.ts
  - test/versioning.test.mjs
  - fixtures/web-components/manual-fixture.html
  - test/e2e-smoke.test.mjs
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/message-bridge.ts
  - apps/figma-plugin/src/code-classic.js
  - apps/figma-plugin/src/renderer.ts
tests:
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
-->

---
### Requirement: Chrome extension runtime downloads confirmed package
The system SHALL download one .figcapture package only after the designer confirms a ready preview. The runtime MUST build the package from pending capture data plus screenshot data and call the Chrome downloads API exactly once for a successful confirmation.

#### Scenario: Confirmed export downloads package

- **WHEN** the designer confirms export after a ready preview exists
- **THEN** the background runtime builds one .figcapture package, calls chrome.downloads.download exactly once with a filename ending in .figcapture, and returns the download id and filename

#### Scenario: Confirm export without pending capture

- **WHEN** the background runtime receives confirm export without pending capture state
- **THEN** the runtime returns error category missing-pending-capture and no download is requested

#### Scenario: Package generation failure blocks download

- **WHEN** package generation fails for pending capture state
- **THEN** the runtime returns error category package-generation-failed and no download is requested


<!-- @trace
source: wire-real-extension-and-figma-plugin-runtime
updated: 2026-06-12
code:
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/src/asset-capture.ts
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/ui.html
  - apps/chrome-extension/src/content.ts
  - package.json
  - scripts/versioning.mjs
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.css
  - apps/figma-plugin/package.json
  - .version-state.json
  - apps/chrome-extension/popup.html
  - apps/figma-plugin/src/report.ts
  - apps/chrome-extension/package.json
  - packages/capture-schema/package.json
  - apps/figma-plugin/src/layout-tree.ts
  - apps/chrome-extension/src/background.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/stitch-screenshot.ts
  - fixtures/dashboard/manual-fixture.html
  - apps/chrome-extension/src/capture-package.ts
  - apps/chrome-extension/src/screenshot.ts
  - docs/manual-runtime-test.md
  - apps/chrome-extension/src/popup.ts
  - apps/chrome-extension/src/runtime.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - scripts/build.mjs
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/src/code.ts
  - test/versioning.test.mjs
  - fixtures/web-components/manual-fixture.html
  - test/e2e-smoke.test.mjs
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/message-bridge.ts
  - apps/figma-plugin/src/code-classic.js
  - apps/figma-plugin/src/renderer.ts
tests:
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
-->

---
### Requirement: Figma plugin runtime imports package through UI-main bridge
The system SHALL connect the Figma Plugin UI and main code with typed messages so selecting one .figcapture transfers the file bytes to main code, validates the package, performs import, and returns a designer-facing report. The bridge MUST surface validation and import errors without requiring raw JSON inspection.

#### Scenario: Valid package import through bridge

- **WHEN** the designer selects a valid .figcapture file in the Figma Plugin UI
- **THEN** the UI posts IMPORT_PACKAGE with filename and bytes, main code validates schemaVersion and package structure, main code creates the import frames, and the UI renders IMPORT_SUCCESS with frame count, node count, fallback count, missing asset count, unsupported style count, and auto layout confidence summary

#### Scenario: Invalid package returns error without nodes

- **WHEN** the selected .figcapture file fails validation
- **THEN** main code posts IMPORT_ERROR with a readable category and message, and no Figma nodes are created

#### Scenario: File transfer failure returns import error

- **WHEN** the UI cannot read or transfer the selected .figcapture bytes to main code
- **THEN** the UI renders an import error message and main code does not start node creation


<!-- @trace
source: wire-real-extension-and-figma-plugin-runtime
updated: 2026-06-12
code:
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/src/asset-capture.ts
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/ui.html
  - apps/chrome-extension/src/content.ts
  - package.json
  - scripts/versioning.mjs
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.css
  - apps/figma-plugin/package.json
  - .version-state.json
  - apps/chrome-extension/popup.html
  - apps/figma-plugin/src/report.ts
  - apps/chrome-extension/package.json
  - packages/capture-schema/package.json
  - apps/figma-plugin/src/layout-tree.ts
  - apps/chrome-extension/src/background.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/stitch-screenshot.ts
  - fixtures/dashboard/manual-fixture.html
  - apps/chrome-extension/src/capture-package.ts
  - apps/chrome-extension/src/screenshot.ts
  - docs/manual-runtime-test.md
  - apps/chrome-extension/src/popup.ts
  - apps/chrome-extension/src/runtime.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - scripts/build.mjs
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/src/code.ts
  - test/versioning.test.mjs
  - fixtures/web-components/manual-fixture.html
  - test/e2e-smoke.test.mjs
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/message-bridge.ts
  - apps/figma-plugin/src/code-classic.js
  - apps/figma-plugin/src/renderer.ts
tests:
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
-->

---
### Requirement: Figma API adapter creates real editable nodes
The system SHALL map renderer output to real Figma Plugin API operations for frame, text, image, rectangle, and fallback image creation. The adapter MUST create two same-size default frames named Source Screenshot and Editable Accurate, MUST NOT emit an empty or experimental auto layout frame by default, and MUST preserve image hashes, fills, strokes, effects, font loading or fallback, locked screenshot state, and deferred auto layout summary metadata where supported by the Figma Plugin API.

#### Scenario: Valid dashboard package creates real nodes

- **WHEN** main code imports a valid dashboard .figcapture package through the Figma API adapter
- **THEN** the Source Screenshot frame contains a locked screenshot image layer, Editable Accurate contains editable text nodes, image nodes, rectangle or frame nodes, and fallback image nodes from renderer output, no Auto Layout Experimental frame is created by default, and auto layout candidates remain summarized in the report as deferred metadata

#### Scenario: Font fallback remains editable

- **WHEN** a captured text layer references a font that cannot be loaded in Figma
- **THEN** the adapter uses the configured fallback font, creates an editable text node, and records the substituted font in the import report


<!-- @trace
source: wire-real-extension-and-figma-plugin-runtime
updated: 2026-06-12
code:
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/src/asset-capture.ts
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/ui.html
  - apps/chrome-extension/src/content.ts
  - package.json
  - scripts/versioning.mjs
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.css
  - apps/figma-plugin/package.json
  - .version-state.json
  - apps/chrome-extension/popup.html
  - apps/figma-plugin/src/report.ts
  - apps/chrome-extension/package.json
  - packages/capture-schema/package.json
  - apps/figma-plugin/src/layout-tree.ts
  - apps/chrome-extension/src/background.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/stitch-screenshot.ts
  - fixtures/dashboard/manual-fixture.html
  - apps/chrome-extension/src/capture-package.ts
  - apps/chrome-extension/src/screenshot.ts
  - docs/manual-runtime-test.md
  - apps/chrome-extension/src/popup.ts
  - apps/chrome-extension/src/runtime.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - scripts/build.mjs
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/src/code.ts
  - test/versioning.test.mjs
  - fixtures/web-components/manual-fixture.html
  - test/e2e-smoke.test.mjs
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/message-bridge.ts
  - apps/figma-plugin/src/code-classic.js
  - apps/figma-plugin/src/renderer.ts
tests:
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
-->

---
### Requirement: Runtime build artifacts are browser-loadable
The system SHALL produce loadable runtime artifacts for the Chrome Extension and Figma Plugin during build. The build output MUST include manifest files and JavaScript files that can be loaded by Chrome Extension load unpacked and Figma Plugin development import, and runtime files MUST NOT contain unresolved .ts import specifiers.

#### Scenario: Build output contains loadable runtime manifests

- **WHEN** corepack pnpm build completes successfully
- **THEN** apps/chrome-extension/dist contains a Chrome Extension manifest and runtime JavaScript files, apps/figma-plugin/dist contains a Figma Plugin manifest and runtime JavaScript files, and the generated runtime files do not reference .ts import specifiers


<!-- @trace
source: wire-real-extension-and-figma-plugin-runtime
updated: 2026-06-12
code:
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/src/asset-capture.ts
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/ui.html
  - apps/chrome-extension/src/content.ts
  - package.json
  - scripts/versioning.mjs
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.css
  - apps/figma-plugin/package.json
  - .version-state.json
  - apps/chrome-extension/popup.html
  - apps/figma-plugin/src/report.ts
  - apps/chrome-extension/package.json
  - packages/capture-schema/package.json
  - apps/figma-plugin/src/layout-tree.ts
  - apps/chrome-extension/src/background.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/stitch-screenshot.ts
  - fixtures/dashboard/manual-fixture.html
  - apps/chrome-extension/src/capture-package.ts
  - apps/chrome-extension/src/screenshot.ts
  - docs/manual-runtime-test.md
  - apps/chrome-extension/src/popup.ts
  - apps/chrome-extension/src/runtime.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - scripts/build.mjs
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/src/code.ts
  - test/versioning.test.mjs
  - fixtures/web-components/manual-fixture.html
  - test/e2e-smoke.test.mjs
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/message-bridge.ts
  - apps/figma-plugin/src/code-classic.js
  - apps/figma-plugin/src/renderer.ts
tests:
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
-->

---
### Requirement: Manual runtime demo is documented and repeatable
The system SHALL provide manual runtime test documentation that lets a reviewer build the workspace, load the Chrome Extension from dist output, capture a page, download a .figcapture package, load the Figma Plugin from dist output, import the package, and verify the resulting frames and report without modifying source code.

#### Scenario: Reviewer completes local manual demo

- **WHEN** a reviewer follows docs/manual-runtime-test.md from a clean checkout with dependencies installed
- **THEN** the reviewer can run the build command, load apps/chrome-extension/dist in Chrome, capture a deterministic local fixture or active product page, download one .figcapture file, load apps/figma-plugin/dist/manifest.json in Figma, import the package, and confirm two imported default frames plus a readable import report

#### Scenario: Documentation lists V1 limitations

- **WHEN** a reviewer reads docs/manual-runtime-test.md before manual testing
- **THEN** the document identifies V1 limits for visible viewport only, no backend, no full-page capture, no multi-viewport batch, no variables, no components, no variants, no interactive states, and diagnostics for blocked assets

<!-- @trace
source: wire-real-extension-and-figma-plugin-runtime
updated: 2026-06-12
code:
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/src/asset-capture.ts
  - scripts/bump-version-if-changed.mjs
  - apps/figma-plugin/ui.html
  - apps/chrome-extension/src/content.ts
  - package.json
  - scripts/versioning.mjs
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.css
  - apps/figma-plugin/package.json
  - .version-state.json
  - apps/chrome-extension/popup.html
  - apps/figma-plugin/src/report.ts
  - apps/chrome-extension/package.json
  - packages/capture-schema/package.json
  - apps/figma-plugin/src/layout-tree.ts
  - apps/chrome-extension/src/background.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/figma-plugin/src/ui.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/src/stitch-screenshot.ts
  - fixtures/dashboard/manual-fixture.html
  - apps/chrome-extension/src/capture-package.ts
  - apps/chrome-extension/src/screenshot.ts
  - docs/manual-runtime-test.md
  - apps/chrome-extension/src/popup.ts
  - apps/chrome-extension/src/runtime.ts
  - apps/figma-plugin/src/figma-adapter.ts
  - scripts/build.mjs
  - docs/v1-usage-and-acceptance.md
  - apps/figma-plugin/src/code.ts
  - test/versioning.test.mjs
  - fixtures/web-components/manual-fixture.html
  - test/e2e-smoke.test.mjs
  - apps/chrome-extension/manifest.json
  - apps/figma-plugin/src/message-bridge.ts
  - apps/figma-plugin/src/code-classic.js
  - apps/figma-plugin/src/renderer.ts
tests:
  - apps/chrome-extension/test/popup-preview.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
  - apps/figma-plugin/test/auto-layout.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/runtime-import.test.mjs
  - apps/figma-plugin/test/importer-validation.test.mjs
  - packages/capture-schema/test/figcapture-archive.test.mjs
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/figma-plugin/test/editable-accurate.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/chrome-extension/test/manifest.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/chrome-extension/test/export-flow.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
-->

---
### Requirement: Full-page capture mode selection
The Chrome Extension popup SHALL offer a capture mode choice between visible viewport and full page. Visible viewport SHALL remain the default. When visible viewport is selected, capture behavior, package contents, and Figma output SHALL be identical to the existing viewport-only flow.

#### Scenario: Default mode is visible viewport
- **WHEN** the designer opens the popup and captures without changing the mode
- **THEN** the produced package matches the existing visible viewport behavior with no full-page manifest fields

#### Scenario: Full page mode can be selected
- **WHEN** the designer selects full page mode and captures
- **THEN** the runtime performs segmented full-page capture and the preview shows the full-page mode and document size


<!-- @trace
source: full-page-segmented-capture
updated: 2026-06-12
code:
  - apps/chrome-extension/src/content.ts
  - apps/chrome-extension/src/runtime.ts
  - packages/capture-schema/package.json
  - apps/figma-plugin/src/renderer.ts
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/code-classic.js
  - apps/figma-plugin/src/report.ts
  - .version-state.json
  - docs/manual-runtime-test.md
  - apps/chrome-extension/popup.html
  - apps/chrome-extension/src/popup.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/manifest.json
  - fixtures/web-components/manual-fixture.html
  - scripts/build.mjs
  - package.json
  - apps/chrome-extension/src/asset-capture.ts
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/package.json
  - apps/figma-plugin/src/layout-tree.ts
  - docs/v1-usage-and-acceptance.md
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.html
tests:
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
-->

---
### Requirement: Full-page DOM capture in document coordinates
In full page mode the capture SHALL scroll to the top of the page and capture the DOM tree once, using document coordinates. The capture SHALL accept capture bounds independent of the viewport: visibility filtering and geometry clamping SHALL use the document bounds while viewport metadata still records the actual window size. Below-fold content within the document bounds SHALL be preserved without viewport clamping.

#### Scenario: Below-fold content is preserved
- **WHEN** a node lies fully below the first viewport but within the document height
- **THEN** the captured tree contains the node with its document-coordinate rect unclamped

#### Scenario: Viewport mode clipping is unchanged
- **WHEN** capture runs without capture bounds overrides
- **THEN** visibility filtering and clamping behave exactly as the existing viewport capture


<!-- @trace
source: full-page-segmented-capture
updated: 2026-06-12
code:
  - apps/chrome-extension/src/content.ts
  - apps/chrome-extension/src/runtime.ts
  - packages/capture-schema/package.json
  - apps/figma-plugin/src/renderer.ts
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/code-classic.js
  - apps/figma-plugin/src/report.ts
  - .version-state.json
  - docs/manual-runtime-test.md
  - apps/chrome-extension/popup.html
  - apps/chrome-extension/src/popup.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/manifest.json
  - fixtures/web-components/manual-fixture.html
  - scripts/build.mjs
  - package.json
  - apps/chrome-extension/src/asset-capture.ts
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/package.json
  - apps/figma-plugin/src/layout-tree.ts
  - docs/v1-usage-and-acceptance.md
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.html
tests:
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
-->

---
### Requirement: Lazy loading pre-scroll
In full page mode the runtime SHALL scroll through the page to the bottom in viewport-height steps before DOM capture, waiting for rendering to settle after each step, so lazy-loaded content is triggered. After capture completes the runtime SHALL restore the original scroll position.

#### Scenario: Pre-scroll precedes DOM capture
- **WHEN** a full page capture runs
- **THEN** the runtime requests page metrics, scrolls through segments to the bottom, returns to the top, and only then captures the DOM

#### Scenario: Scroll position is restored on failure
- **WHEN** any segmented capture step fails
- **THEN** the page scroll position and any hidden pinned elements are restored and the error reports an existing runtime error category


<!-- @trace
source: full-page-segmented-capture
updated: 2026-06-12
code:
  - apps/chrome-extension/src/content.ts
  - apps/chrome-extension/src/runtime.ts
  - packages/capture-schema/package.json
  - apps/figma-plugin/src/renderer.ts
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/code-classic.js
  - apps/figma-plugin/src/report.ts
  - .version-state.json
  - docs/manual-runtime-test.md
  - apps/chrome-extension/popup.html
  - apps/chrome-extension/src/popup.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/manifest.json
  - fixtures/web-components/manual-fixture.html
  - scripts/build.mjs
  - package.json
  - apps/chrome-extension/src/asset-capture.ts
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/package.json
  - apps/figma-plugin/src/layout-tree.ts
  - docs/v1-usage-and-acceptance.md
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.html
tests:
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
-->

---
### Requirement: Segmented screenshot stitching
In full page mode the runtime SHALL capture one visible-tab screenshot per scroll segment and stitch the segments into a single full-page `screenshot.png` sized to the document dimensions multiplied by the device pixel ratio, drawing each segment at its scroll offset. The stitch function SHALL accept injected canvas and bitmap factories. When the stitching environment lacks the required canvas APIs, full page capture SHALL fail with the `screenshot-failed` category.

#### Scenario: Segments are drawn at scroll offsets
- **WHEN** three segments with scroll offsets 0, 800, and 1600 are stitched at device pixel ratio 2
- **THEN** the output canvas is the document size at 2x and each segment draws at y offsets 0, 1600, and 3200

#### Scenario: Missing canvas APIs fail cleanly
- **WHEN** the stitching environment lacks the required canvas APIs
- **THEN** full page capture reports the `screenshot-failed` category without downloading a package


<!-- @trace
source: full-page-segmented-capture
updated: 2026-06-12
code:
  - apps/chrome-extension/src/content.ts
  - apps/chrome-extension/src/runtime.ts
  - packages/capture-schema/package.json
  - apps/figma-plugin/src/renderer.ts
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/code-classic.js
  - apps/figma-plugin/src/report.ts
  - .version-state.json
  - docs/manual-runtime-test.md
  - apps/chrome-extension/popup.html
  - apps/chrome-extension/src/popup.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/manifest.json
  - fixtures/web-components/manual-fixture.html
  - scripts/build.mjs
  - package.json
  - apps/chrome-extension/src/asset-capture.ts
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/package.json
  - apps/figma-plugin/src/layout-tree.ts
  - docs/v1-usage-and-acceptance.md
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.html
tests:
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
-->

---
### Requirement: Pinned element deduplication
Fixed and sticky positioned elements SHALL appear exactly once in full-page output. The DOM capture at the top of the page SHALL contain one copy at the top-of-page position. For screenshot segments after the first, the content script SHALL temporarily hide elements whose computed position is fixed or sticky and SHALL restore their original inline styles after the last segment.

#### Scenario: Fixed header appears once
- **WHEN** a page with a fixed header is captured in full page mode
- **THEN** the captured DOM contains one header node and segments after the first hide the header before their screenshots

#### Scenario: Hidden elements are restored
- **WHEN** the segmented screenshot pass completes or fails
- **THEN** every element hidden for deduplication has its original inline style restored


<!-- @trace
source: full-page-segmented-capture
updated: 2026-06-12
code:
  - apps/chrome-extension/src/content.ts
  - apps/chrome-extension/src/runtime.ts
  - packages/capture-schema/package.json
  - apps/figma-plugin/src/renderer.ts
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/code-classic.js
  - apps/figma-plugin/src/report.ts
  - .version-state.json
  - docs/manual-runtime-test.md
  - apps/chrome-extension/popup.html
  - apps/chrome-extension/src/popup.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/manifest.json
  - fixtures/web-components/manual-fixture.html
  - scripts/build.mjs
  - package.json
  - apps/chrome-extension/src/asset-capture.ts
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/package.json
  - apps/figma-plugin/src/layout-tree.ts
  - docs/v1-usage-and-acceptance.md
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.html
tests:
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
-->

---
### Requirement: Full-page capture limits
Full page capture SHALL enforce a maximum captured document height of 20000 CSS pixels and a maximum of 25 segments, stopping at whichever limit is reached first. When truncated, the manifest SHALL record the actually captured document height and diagnostics warnings SHALL record a full-page capture truncated message. Truncation SHALL NOT fail the capture.

#### Scenario: Overlong page is truncated with diagnostics
- **WHEN** a page taller than 20000 CSS pixels is captured in full page mode
- **THEN** the package exports with a 20000-pixel document height and a truncation warning in diagnostics


<!-- @trace
source: full-page-segmented-capture
updated: 2026-06-12
code:
  - apps/chrome-extension/src/content.ts
  - apps/chrome-extension/src/runtime.ts
  - packages/capture-schema/package.json
  - apps/figma-plugin/src/renderer.ts
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/code-classic.js
  - apps/figma-plugin/src/report.ts
  - .version-state.json
  - docs/manual-runtime-test.md
  - apps/chrome-extension/popup.html
  - apps/chrome-extension/src/popup.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/manifest.json
  - fixtures/web-components/manual-fixture.html
  - scripts/build.mjs
  - package.json
  - apps/chrome-extension/src/asset-capture.ts
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/package.json
  - apps/figma-plugin/src/layout-tree.ts
  - docs/v1-usage-and-acceptance.md
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.html
tests:
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
-->

---
### Requirement: Full-page manifest fields
The manifest SHALL support optional fields `captureMode`, `documentWidth`, and `documentHeight`. Validation SHALL accept packages without these fields. When `captureMode` is present it MUST be `viewport` or `full-page`; when it is `full-page`, `documentWidth` and `documentHeight` MUST be positive numbers. Existing viewport packages SHALL remain valid without changes.

#### Scenario: Viewport packages remain valid
- **WHEN** an existing package without capture mode fields is validated
- **THEN** validation passes unchanged

#### Scenario: Invalid capture mode is rejected
- **WHEN** a manifest declares `captureMode` of `partial`
- **THEN** validation reports a manifest error


<!-- @trace
source: full-page-segmented-capture
updated: 2026-06-12
code:
  - apps/chrome-extension/src/content.ts
  - apps/chrome-extension/src/runtime.ts
  - packages/capture-schema/package.json
  - apps/figma-plugin/src/renderer.ts
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/code-classic.js
  - apps/figma-plugin/src/report.ts
  - .version-state.json
  - docs/manual-runtime-test.md
  - apps/chrome-extension/popup.html
  - apps/chrome-extension/src/popup.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/manifest.json
  - fixtures/web-components/manual-fixture.html
  - scripts/build.mjs
  - package.json
  - apps/chrome-extension/src/asset-capture.ts
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/package.json
  - apps/figma-plugin/src/layout-tree.ts
  - docs/v1-usage-and-acceptance.md
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.html
tests:
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
-->

---
### Requirement: Full-page Figma frames
When the manifest declares full-page capture, the Figma Plugin SHALL create the `Source Screenshot` and `Editable Accurate` frames sized to `documentWidth` by `documentHeight`, with the screenshot layer at the same size. The module runtime and classic runtime SHALL size frames identically. Packages without full-page fields SHALL keep viewport-sized frames.

#### Scenario: Full-page frames use document size
- **WHEN** a package with `captureMode: full-page`, document width 1440, and document height 5200 is imported
- **THEN** both frames and the screenshot layer are 1440 by 5200 in both the module and classic runtimes

#### Scenario: Viewport packages keep viewport frames
- **WHEN** a package without full-page fields is imported
- **THEN** frames use the manifest viewport width and height as today

<!-- @trace
source: full-page-segmented-capture
updated: 2026-06-12
code:
  - apps/chrome-extension/src/content.ts
  - apps/chrome-extension/src/runtime.ts
  - packages/capture-schema/package.json
  - apps/figma-plugin/src/renderer.ts
  - apps/chrome-extension/src/content-script.ts
  - apps/chrome-extension/package.json
  - apps/figma-plugin/src/code-classic.js
  - apps/figma-plugin/src/report.ts
  - .version-state.json
  - docs/manual-runtime-test.md
  - apps/chrome-extension/popup.html
  - apps/chrome-extension/src/popup.ts
  - apps/figma-plugin/src/semantic-naming.ts
  - apps/chrome-extension/src/background.ts
  - apps/chrome-extension/src/capture-core.ts
  - apps/chrome-extension/manifest.json
  - fixtures/web-components/manual-fixture.html
  - scripts/build.mjs
  - package.json
  - apps/chrome-extension/src/asset-capture.ts
  - apps/chrome-extension/src/stitch-screenshot.ts
  - apps/figma-plugin/package.json
  - apps/figma-plugin/src/layout-tree.ts
  - docs/v1-usage-and-acceptance.md
  - packages/capture-schema/src/index.ts
  - apps/figma-plugin/ui.html
tests:
  - apps/chrome-extension/test/asset-capture.test.mjs
  - apps/chrome-extension/test/popup-preview.test.mjs
  - packages/capture-schema/test/schema-validation.test.mjs
  - apps/chrome-extension/test/capture-core.test.mjs
  - apps/figma-plugin/test/plugin-scaffold.test.mjs
  - apps/figma-plugin/test/layout-tree.test.mjs
  - apps/figma-plugin/test/three-frames.test.mjs
  - apps/figma-plugin/test/import-report.test.mjs
  - apps/chrome-extension/test/runtime-flow.test.mjs
  - apps/chrome-extension/test/stitch-screenshot.test.mjs
  - apps/figma-plugin/test/semantic-naming.test.mjs
-->