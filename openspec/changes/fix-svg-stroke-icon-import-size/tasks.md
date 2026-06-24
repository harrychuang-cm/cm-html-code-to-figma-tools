## 1. Figma SVG Import Size

- [x] 1.1 Implement `SVG vector assets import at rendered size` in the module Figma adapter so SVG root `width` and `height` are set to the fitted rendered size before `createNodeFromSvg`.
- [x] 1.2 Implement `SVG vector assets import at rendered size` in the classic Figma runtime with the same SVG import-size normalization.

## 2. Verification

- [x] 2.1 Add module runtime test for a 14x14 checked SVG with 24x24 viewBox and 4px stroke.
- [x] 2.2 Add classic runtime test for the same checked SVG import path.
- [x] 2.3 Run build, focused tests, full tests, and Spectra validation.
