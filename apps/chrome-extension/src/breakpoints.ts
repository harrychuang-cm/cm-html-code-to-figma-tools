export const PRESET_BREAKPOINT_WIDTHS = [1440, 1024, 768, 375];

export const MIN_BREAKPOINT_WIDTH = 200;
export const MAX_BREAKPOINT_WIDTH = 3840;

export function parseCustomBreakpointWidth(input) {
  const raw = typeof input === "string" ? input.trim() : input;
  if (raw === "" || raw === null || raw === undefined) {
    return { ok: false, error: "Enter a width in pixels" };
  }

  const value = Number(raw);
  if (!Number.isInteger(value)) {
    return { ok: false, error: "Width must be a whole number of pixels" };
  }
  if (value < MIN_BREAKPOINT_WIDTH || value > MAX_BREAKPOINT_WIDTH) {
    return {
      ok: false,
      error: `Width must be between ${MIN_BREAKPOINT_WIDTH} and ${MAX_BREAKPOINT_WIDTH} px`
    };
  }

  return { ok: true, width: value };
}

export function normalizeBreakpointWidths(widths) {
  const seen = new Set();
  const result = [];
  for (const candidate of widths ?? []) {
    const value = typeof candidate === "string" ? Number(candidate.trim()) : candidate;
    if (!Number.isInteger(value) || value <= 0) {
      continue;
    }
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result.sort((a, b) => b - a);
}

export function breakpointLabel(width) {
  return `${width}`;
}

export function describeBreakpoints() {
  return {
    presets: [...PRESET_BREAKPOINT_WIDTHS],
    minWidth: MIN_BREAKPOINT_WIDTH,
    maxWidth: MAX_BREAKPOINT_WIDTH
  };
}
