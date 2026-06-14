import assert from "node:assert/strict";
import test from "node:test";
import {
  PRESET_BREAKPOINT_WIDTHS,
  MIN_BREAKPOINT_WIDTH,
  MAX_BREAKPOINT_WIDTH,
  parseCustomBreakpointWidth,
  normalizeBreakpointWidths,
  breakpointLabel
} from "../dist/breakpoints.js";

test("preset breakpoints expose the four responsive widths", () => {
  assert.deepEqual(PRESET_BREAKPOINT_WIDTHS, [1440, 1024, 768, 375]);
});

test("parseCustomBreakpointWidth accepts a valid positive integer width", () => {
  assert.deepEqual(parseCustomBreakpointWidth("1280"), { ok: true, width: 1280 });
  assert.deepEqual(parseCustomBreakpointWidth(640), { ok: true, width: 640 });
});

test("parseCustomBreakpointWidth rejects non-integer and non-positive widths", () => {
  assert.equal(parseCustomBreakpointWidth("1280.5").ok, false);
  assert.equal(parseCustomBreakpointWidth("abc").ok, false);
  assert.equal(parseCustomBreakpointWidth("").ok, false);
  assert.equal(parseCustomBreakpointWidth("-100").ok, false);
});

test("parseCustomBreakpointWidth enforces the allowed range bounds", () => {
  assert.equal(parseCustomBreakpointWidth(String(MIN_BREAKPOINT_WIDTH - 1)).ok, false);
  assert.equal(parseCustomBreakpointWidth(String(MAX_BREAKPOINT_WIDTH + 1)).ok, false);
  assert.equal(parseCustomBreakpointWidth(String(MIN_BREAKPOINT_WIDTH)).ok, true);
  assert.equal(parseCustomBreakpointWidth(String(MAX_BREAKPOINT_WIDTH)).ok, true);
});

test("normalizeBreakpointWidths de-duplicates repeated widths", () => {
  assert.deepEqual(normalizeBreakpointWidths([1440, 768, 768, 375, 1440]), [1440, 768, 375]);
});

test("normalizeBreakpointWidths sorts widths from widest to narrowest", () => {
  assert.deepEqual(normalizeBreakpointWidths([375, 1440, 768, 1024]), [1440, 1024, 768, 375]);
});

test("normalizeBreakpointWidths drops invalid entries", () => {
  assert.deepEqual(normalizeBreakpointWidths([1440, 0, -5, "abc", 1024.5, "768"]), [1440, 768]);
});

test("breakpointLabel renders the width as a string", () => {
  assert.equal(breakpointLabel(375), "375");
});
