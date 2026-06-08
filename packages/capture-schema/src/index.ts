export const CURRENT_SCHEMA_VERSION = "1.0.0";

export const REQUIRED_FIGCAPTURE_FILES = [
  "manifest.json",
  "capture.json",
  "figma-plan.json",
  "screenshot.png",
  "diagnostics.json"
];

export const ERROR_CODES = {
  INVALID_JSON: "invalid-json",
  MISSING_FILE: "missing-file",
  MISSING_FIELD: "missing-field",
  INVALID_FIELD: "invalid-field",
  UNSUPPORTED_SCHEMA_VERSION: "unsupported-schema-version"
};

export class FigcaptureValidationError extends Error {
  constructor(message, errors) {
    super(message);
    this.name = "FigcaptureValidationError";
    this.errors = errors;
  }
}

export function describeCaptureSchema() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    requiredFiles: [...REQUIRED_FIGCAPTURE_FILES]
  };
}

export function createEmptyDiagnostics(overrides = {}) {
  return {
    status: "success",
    warnings: [],
    counts: {
      fallbacks: 0,
      missingAssets: 0,
      unsupportedStyles: 0
    },
    fallbackReasons: [],
    missingAssets: [],
    unsupportedStyles: [],
    autoLayoutCandidates: [],
    ...overrides
  };
}

export function validateManifest(value) {
  const errors = [];
  if (!isRecord(value)) {
    return fail(ERROR_CODES.INVALID_FIELD, "manifest.json must contain an object", "manifest");
  }

  requireString(value, "schemaVersion", "manifest.schemaVersion", errors);
  requireString(value, "generatorVersion", "manifest.generatorVersion", errors);
  requireString(value, "sourceUrl", "manifest.sourceUrl", errors);
  requireString(value, "captureTimestamp", "manifest.captureTimestamp", errors);
  requirePositiveNumber(value, "viewportWidth", "manifest.viewportWidth", errors);
  requirePositiveNumber(value, "viewportHeight", "manifest.viewportHeight", errors);
  requirePositiveNumber(value, "devicePixelRatio", "manifest.devicePixelRatio", errors);
  requireNumber(value, "scrollX", "manifest.scrollX", errors);
  requireNumber(value, "scrollY", "manifest.scrollY", errors);

  if (typeof value.schemaVersion === "string" && value.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    errors.push(error(
      ERROR_CODES.UNSUPPORTED_SCHEMA_VERSION,
      `Unsupported schemaVersion ${value.schemaVersion}`,
      "manifest.schemaVersion"
    ));
  }

  if ("deviceLabel" in value && typeof value.deviceLabel !== "string") {
    errors.push(error(ERROR_CODES.INVALID_FIELD, "deviceLabel must be a string", "manifest.deviceLabel"));
  }

  return result(errors);
}

export function validateCapture(value) {
  const errors = [];
  if (!isRecord(value)) {
    return fail(ERROR_CODES.INVALID_FIELD, "capture.json must contain an object", "capture");
  }

  validateViewport(value.viewport, "capture.viewport", errors);
  requireString(value, "sourceUrl", "capture.sourceUrl", errors);
  if ("title" in value && typeof value.title !== "string") {
    errors.push(error(ERROR_CODES.INVALID_FIELD, "title must be a string", "capture.title"));
  }
  validateNode(value.root, "capture.root", errors);

  return result(errors);
}

export function validateFigmaPlan(value) {
  const errors = [];
  if (!isRecord(value)) {
    return fail(ERROR_CODES.INVALID_FIELD, "figma-plan.json must contain an object", "figmaPlan");
  }

  requireString(value, "planVersion", "figmaPlan.planVersion", errors);
  validateArray(value.frames, "figmaPlan.frames", errors, (frame, path) => {
    if (!isRecord(frame)) {
      errors.push(error(ERROR_CODES.INVALID_FIELD, "frame must be an object", path));
      return;
    }
    requireString(frame, "id", `${path}.id`, errors);
    requireString(frame, "role", `${path}.role`, errors);
    requireString(frame, "name", `${path}.name`, errors);
    validateArray(frame.nodes ?? [], `${path}.nodes`, errors, (node, nodePath) => {
      validatePlanNode(node, nodePath, errors);
    });
  });

  if (!Array.isArray(value.sourceNodeMap)) {
    errors.push(error(ERROR_CODES.INVALID_FIELD, "sourceNodeMap must be an array", "figmaPlan.sourceNodeMap"));
  }

  return result(errors);
}

export function validateDiagnostics(value) {
  const errors = [];
  if (!isRecord(value)) {
    return fail(ERROR_CODES.INVALID_FIELD, "diagnostics.json must contain an object", "diagnostics");
  }

  if (!["success", "warning", "error"].includes(value.status)) {
    errors.push(error(ERROR_CODES.INVALID_FIELD, "status must be success, warning, or error", "diagnostics.status"));
  }

  validateArray(value.warnings, "diagnostics.warnings", errors, requireStringItem);
  validateArray(value.fallbackReasons, "diagnostics.fallbackReasons", errors, validateReason);
  validateArray(value.missingAssets, "diagnostics.missingAssets", errors, requireStringItem);
  validateArray(value.unsupportedStyles, "diagnostics.unsupportedStyles", errors, requireStringItem);
  validateArray(value.autoLayoutCandidates, "diagnostics.autoLayoutCandidates", errors, validateAutoLayoutCandidate);

  if (!isRecord(value.counts)) {
    errors.push(error(ERROR_CODES.MISSING_FIELD, "counts must be an object", "diagnostics.counts"));
  } else {
    requireNonNegativeInteger(value.counts, "fallbacks", "diagnostics.counts.fallbacks", errors);
    requireNonNegativeInteger(value.counts, "missingAssets", "diagnostics.counts.missingAssets", errors);
    requireNonNegativeInteger(value.counts, "unsupportedStyles", "diagnostics.counts.unsupportedStyles", errors);
  }

  return result(errors);
}

export function validateCapturePackage(packageData) {
  const errors = [];

  if (!isRecord(packageData)) {
    return fail(ERROR_CODES.INVALID_FIELD, "package data must be an object", "package");
  }

  appendErrors(validateManifest(packageData.manifest), errors);
  appendErrors(validateCapture(packageData.capture), errors);
  appendErrors(validateFigmaPlan(packageData.figmaPlan), errors);
  appendErrors(validateDiagnostics(packageData.diagnostics), errors);

  if (!isBinaryLike(packageData.screenshot)) {
    errors.push(error(ERROR_CODES.MISSING_FIELD, "screenshot must be binary data", "screenshot"));
  }

  if (!isRecord(packageData.assets)) {
    errors.push(error(ERROR_CODES.INVALID_FIELD, "assets must be an object", "assets"));
  } else {
    for (const [assetName, assetValue] of Object.entries(packageData.assets)) {
      if (!assetName.startsWith("assets/")) {
        errors.push(error(ERROR_CODES.INVALID_FIELD, "asset names must be rooted under assets/", `assets.${assetName}`));
      }
      if (!isBinaryLike(assetValue)) {
        errors.push(error(ERROR_CODES.INVALID_FIELD, "asset value must be binary data", `assets.${assetName}`));
      }
    }
  }

  return result(errors);
}

export function assertValidCapturePackage(packageData) {
  const validation = validateCapturePackage(packageData);
  if (!validation.ok) {
    throw new FigcaptureValidationError("Invalid .figcapture package", validation.errors);
  }
  return packageData;
}

export function createFigcaptureFileMap(packageData) {
  const files = {
    "manifest.json": encodeJson(packageData.manifest),
    "capture.json": encodeJson(packageData.capture),
    "figma-plan.json": encodeJson(packageData.figmaPlan),
    "diagnostics.json": encodeJson(packageData.diagnostics),
    "screenshot.png": toUint8Array(packageData.screenshot)
  };

  for (const [assetName, assetValue] of Object.entries(packageData.assets ?? {})) {
    files[assetName] = toUint8Array(assetValue);
  }

  return files;
}

export function packFigcapture(packageData) {
  assertValidCapturePackage(packageData);
  return packFigcaptureFiles(createFigcaptureFileMap(packageData));
}

export function packFigcaptureFiles(files) {
  if (!isRecord(files)) {
    throw new FigcaptureValidationError("Invalid archive file map", [
      error(ERROR_CODES.INVALID_FIELD, "files must be an object", "files")
    ]);
  }

  const entries = Object.entries(files).map(([name, value]) => {
    if (typeof name !== "string" || name.length === 0) {
      throw new FigcaptureValidationError("Invalid archive file name", [
        error(ERROR_CODES.INVALID_FIELD, "file name must be a non-empty string", "files")
      ]);
    }
    return {
      name,
      bytes: toUint8Array(value)
    };
  });

  return writeZip(entries);
}

export function unpackFigcapture(bytes) {
  const files = readFigcaptureFiles(bytes);
  const missing = REQUIRED_FIGCAPTURE_FILES
    .filter((fileName) => !(fileName in files))
    .map((fileName) => error(ERROR_CODES.MISSING_FILE, `${fileName} is required`, fileName));

  if (missing.length > 0) {
    throw new FigcaptureValidationError("Invalid .figcapture package", missing);
  }

  const packageData = {
    manifest: decodeJsonFile(files, "manifest.json"),
    capture: decodeJsonFile(files, "capture.json"),
    figmaPlan: decodeJsonFile(files, "figma-plan.json"),
    diagnostics: decodeJsonFile(files, "diagnostics.json"),
    screenshot: files["screenshot.png"],
    assets: Object.fromEntries(Object.entries(files).filter(([name]) => name.startsWith("assets/")))
  };

  return assertValidCapturePackage(packageData);
}

export function readFigcaptureFiles(bytes) {
  return readZip(toUint8Array(bytes));
}

export function summarizeDiagnostics(diagnostics) {
  const validation = validateDiagnostics(diagnostics);
  if (!validation.ok) {
    throw new FigcaptureValidationError("Invalid diagnostics", validation.errors);
  }

  return {
    fallbackCount: diagnostics.counts.fallbacks,
    missingAssetCount: diagnostics.counts.missingAssets,
    unsupportedStyleCount: diagnostics.counts.unsupportedStyles,
    autoLayoutCandidateCount: diagnostics.autoLayoutCandidates.length,
    status: diagnostics.status
  };
}

function validateViewport(value, path, errors) {
  if (!isRecord(value)) {
    errors.push(error(ERROR_CODES.MISSING_FIELD, "viewport must be an object", path));
    return;
  }
  requirePositiveNumber(value, "width", `${path}.width`, errors);
  requirePositiveNumber(value, "height", `${path}.height`, errors);
  requirePositiveNumber(value, "devicePixelRatio", `${path}.devicePixelRatio`, errors);
  requireNumber(value, "scrollX", `${path}.scrollX`, errors);
  requireNumber(value, "scrollY", `${path}.scrollY`, errors);
}

function validateNode(value, path, errors) {
  if (!isRecord(value)) {
    errors.push(error(ERROR_CODES.INVALID_FIELD, "node must be an object", path));
    return;
  }

  requireString(value, "id", `${path}.id`, errors);
  requireString(value, "sourceNodeId", `${path}.sourceNodeId`, errors);
  requireString(value, "nodeType", `${path}.nodeType`, errors);
  requireString(value, "tagName", `${path}.tagName`, errors);
  validateRect(value.rect, `${path}.rect`, errors);

  if (!isRecord(value.styles)) {
    errors.push(error(ERROR_CODES.MISSING_FIELD, "styles must be an object", `${path}.styles`));
  }

  if (!isRecord(value.attributes)) {
    errors.push(error(ERROR_CODES.MISSING_FIELD, "attributes must be an object", `${path}.attributes`));
  }

  if ("textContent" in value && typeof value.textContent !== "string") {
    errors.push(error(ERROR_CODES.INVALID_FIELD, "textContent must be a string", `${path}.textContent`));
  }

  if ("assetRef" in value && typeof value.assetRef !== "string") {
    errors.push(error(ERROR_CODES.INVALID_FIELD, "assetRef must be a string", `${path}.assetRef`));
  }

  if ("fallbackRef" in value && typeof value.fallbackRef !== "string") {
    errors.push(error(ERROR_CODES.INVALID_FIELD, "fallbackRef must be a string", `${path}.fallbackRef`));
  }

  validateArray(value.children, `${path}.children`, errors, (child, childPath) => {
    validateNode(child, childPath, errors);
  });
}

function validateRect(value, path, errors) {
  if (!isRecord(value)) {
    errors.push(error(ERROR_CODES.MISSING_FIELD, "rect must be an object", path));
    return;
  }
  requireNumber(value, "x", `${path}.x`, errors);
  requireNumber(value, "y", `${path}.y`, errors);
  requireNonNegativeNumber(value, "width", `${path}.width`, errors);
  requireNonNegativeNumber(value, "height", `${path}.height`, errors);
}

function validatePlanNode(value, path, errors) {
  if (!isRecord(value)) {
    errors.push(error(ERROR_CODES.INVALID_FIELD, "plan node must be an object", path));
    return;
  }
  requireString(value, "id", `${path}.id`, errors);
  requireString(value, "type", `${path}.type`, errors);
  requireString(value, "sourceNodeId", `${path}.sourceNodeId`, errors);
  validateRect(value.rect, `${path}.rect`, errors);
  if ("confidence" in value) {
    requireNumber(value, "confidence", `${path}.confidence`, errors);
  }
}

function validateReason(value, path, errors) {
  if (!isRecord(value)) {
    errors.push(error(ERROR_CODES.INVALID_FIELD, "fallback reason must be an object", path));
    return;
  }
  requireString(value, "sourceNodeId", `${path}.sourceNodeId`, errors);
  requireString(value, "reason", `${path}.reason`, errors);
}

function validateAutoLayoutCandidate(value, path, errors) {
  if (!isRecord(value)) {
    errors.push(error(ERROR_CODES.INVALID_FIELD, "auto layout candidate must be an object", path));
    return;
  }
  requireString(value, "sourceNodeId", `${path}.sourceNodeId`, errors);
  requireString(value, "pattern", `${path}.pattern`, errors);
  requireNumber(value, "confidence", `${path}.confidence`, errors);
  if ("applied" in value && typeof value.applied !== "boolean") {
    errors.push(error(ERROR_CODES.INVALID_FIELD, "applied must be a boolean", `${path}.applied`));
  }
  if ("skippedReason" in value && typeof value.skippedReason !== "string") {
    errors.push(error(ERROR_CODES.INVALID_FIELD, "skippedReason must be a string", `${path}.skippedReason`));
  }
}

function validateArray(value, path, errors, validateItem) {
  if (!Array.isArray(value)) {
    errors.push(error(ERROR_CODES.INVALID_FIELD, `${path} must be an array`, path));
    return;
  }
  value.forEach((item, index) => validateItem(item, `${path}[${index}]`, errors));
}

function requireStringItem(value, path, errors) {
  if (typeof value !== "string") {
    errors.push(error(ERROR_CODES.INVALID_FIELD, `${path} must be a string`, path));
  }
}

function requireString(parent, key, path, errors) {
  if (typeof parent[key] !== "string" || parent[key].length === 0) {
    errors.push(error(ERROR_CODES.MISSING_FIELD, `${key} must be a non-empty string`, path));
  }
}

function requireNumber(parent, key, path, errors) {
  if (!Number.isFinite(parent[key])) {
    errors.push(error(ERROR_CODES.INVALID_FIELD, `${key} must be a finite number`, path));
  }
}

function requirePositiveNumber(parent, key, path, errors) {
  if (!Number.isFinite(parent[key]) || parent[key] <= 0) {
    errors.push(error(ERROR_CODES.INVALID_FIELD, `${key} must be a positive number`, path));
  }
}

function requireNonNegativeNumber(parent, key, path, errors) {
  if (!Number.isFinite(parent[key]) || parent[key] < 0) {
    errors.push(error(ERROR_CODES.INVALID_FIELD, `${key} must be a non-negative number`, path));
  }
}

function requireNonNegativeInteger(parent, key, path, errors) {
  if (!Number.isInteger(parent[key]) || parent[key] < 0) {
    errors.push(error(ERROR_CODES.INVALID_FIELD, `${key} must be a non-negative integer`, path));
  }
}

function appendErrors(validation, target) {
  if (!validation.ok) {
    target.push(...validation.errors);
  }
}

function result(errors) {
  return {
    ok: errors.length === 0,
    errors
  };
}

function fail(code, message, path) {
  return result([error(code, message, path)]);
}

function error(code, message, path) {
  return { code, message, path };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBinaryLike(value) {
  return value instanceof Uint8Array || value instanceof ArrayBuffer;
}

function encodeJson(value) {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function decodeJsonFile(files, name) {
  try {
    return JSON.parse(new TextDecoder().decode(files[name]));
  } catch (cause) {
    throw new FigcaptureValidationError(`Invalid JSON in ${name}`, [
      error(ERROR_CODES.INVALID_JSON, `${name} must contain valid JSON`, name)
    ]);
  }
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  throw new FigcaptureValidationError("Invalid binary value", [
    error(ERROR_CODES.INVALID_FIELD, "value must be Uint8Array, ArrayBuffer, or string", "binary")
  ]);
}

function writeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const bytes = entry.bytes;
    const crc = crc32(bytes);
    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, bytes.length, true);
    localView.setUint32(22, bytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);

    localParts.push(localHeader, nameBytes, bytes);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, bytes.length, true);
    centralView.setUint32(24, bytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralParts.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + bytes.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, centralOffset, true);
  eocdView.setUint16(20, 0, true);

  return concatUint8Arrays([...localParts, ...centralParts, eocd]);
}

function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) {
    throw new FigcaptureValidationError("Invalid .figcapture archive", [
      error(ERROR_CODES.INVALID_FIELD, "ZIP end of central directory not found", "archive")
    ]);
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  let centralOffset = view.getUint32(eocdOffset + 16, true);
  const files = {};

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(centralOffset, true) !== 0x02014b50) {
      throw new FigcaptureValidationError("Invalid .figcapture archive", [
        error(ERROR_CODES.INVALID_FIELD, "Invalid ZIP central directory header", "archive")
      ]);
    }

    const method = view.getUint16(centralOffset + 10, true);
    if (method !== 0) {
      throw new FigcaptureValidationError("Unsupported .figcapture archive", [
        error(ERROR_CODES.INVALID_FIELD, "Only stored ZIP entries are supported", "archive")
      ]);
    }

    const compressedSize = view.getUint32(centralOffset + 20, true);
    const nameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    const nameStart = centralOffset + 46;
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength));

    if (view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new FigcaptureValidationError("Invalid .figcapture archive", [
        error(ERROR_CODES.INVALID_FIELD, "Invalid ZIP local file header", name)
      ]);
    }

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    files[name] = bytes.slice(dataStart, dataStart + compressedSize);
    centralOffset = nameStart + nameLength + extraLength + commentLength;
  }

  return files;
}

function findEndOfCentralDirectory(bytes) {
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (
      bytes[offset] === 0x50 &&
      bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x05 &&
      bytes[offset + 3] === 0x06
    ) {
      return offset;
    }
  }
  return -1;
}

function concatUint8Arrays(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

let crcTable;

function crc32(bytes) {
  if (!crcTable) {
    crcTable = createCrcTable();
  }
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}
