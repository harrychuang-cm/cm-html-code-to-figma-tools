import {
  ERROR_CODES,
  FigcaptureValidationError,
  unpackFigcapture
} from "@figma-capture/capture-schema";

export function validatePackageBytes(bytes) {
  try {
    return {
      ok: true,
      packageData: unpackFigcapture(bytes),
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      packageData: null,
      error: mapImportError(error)
    };
  }
}

export async function readSelectedFigcapture(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return validatePackageBytes(bytes);
}

export function createImportUiState(validation) {
  if (validation.ok) {
    return {
      status: "ready",
      message: "Package is ready to import",
      canImport: true
    };
  }

  return {
    status: "error",
    message: validation.error.message,
    category: validation.error.category,
    canImport: false
  };
}

export function mapImportError(error) {
  if (error instanceof FigcaptureValidationError && error.errors.length > 0) {
    const first = error.errors[0];
    if (first.code === ERROR_CODES.MISSING_FILE && first.path === "manifest.json") {
      return {
        category: "missing-manifest",
        message: "Package metadata is missing"
      };
    }
    if (first.code === ERROR_CODES.MISSING_FILE && first.path === "screenshot.png") {
      return {
        category: "missing-screenshot",
        message: "Source screenshot is missing"
      };
    }
    if (first.code === ERROR_CODES.UNSUPPORTED_SCHEMA_VERSION) {
      return {
        category: "unsupported-schema-version",
        message: "Capture package schema version is unsupported"
      };
    }
    if (first.code === ERROR_CODES.INVALID_JSON) {
      return {
        category: "invalid-json",
        message: first.message
      };
    }
    return {
      category: first.code,
      message: first.message
    };
  }

  return {
    category: "invalid-package",
    message: error?.message ?? "Package could not be imported"
  };
}
