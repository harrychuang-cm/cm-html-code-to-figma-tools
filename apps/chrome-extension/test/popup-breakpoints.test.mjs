import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const popupHtml = readFileSync(
  fileURLToPath(new URL("../dist/popup.html", import.meta.url)),
  "utf8"
);

test("popup exposes a breakpoint selection fieldset", () => {
  assert.match(popupHtml, /id="breakpoint-select"/);
});

test("popup offers the four preset breakpoint checkboxes", () => {
  for (const width of [1440, 1024, 768, 375]) {
    assert.match(
      popupHtml,
      new RegExp(`type="checkbox"[^>]*class="breakpoint-preset"[^>]*value="${width}"`),
      `expected a preset checkbox for ${width}`
    );
  }
});

test("popup provides a custom width input with an add control", () => {
  assert.match(popupHtml, /id="custom-breakpoint-input"/);
  assert.match(popupHtml, /id="add-breakpoint-button"/);
});

test("popup renders a container for the selected breakpoint list", () => {
  assert.match(popupHtml, /id="breakpoint-list"/);
});
