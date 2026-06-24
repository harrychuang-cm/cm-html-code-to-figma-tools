export type ValidationErrorCode =
  | "invalid-json"
  | "missing-file"
  | "missing-field"
  | "invalid-field"
  | "unsupported-schema-version";

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  path: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

export interface CaptureSchemaDescription {
  schemaVersion: string;
  requiredFiles: string[];
}

export interface CaptureManifest {
  schemaVersion: string;
  generatorVersion: string;
  sourceUrl: string;
  captureTimestamp: string;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  scrollX: number;
  scrollY: number;
  deviceLabel?: string;
  includeScreenshot?: boolean;
  captureMode?: "viewport" | "full-page" | "element";
  documentWidth?: number;
  documentHeight?: number;
}

export interface CaptureViewport {
  width: number;
  height: number;
  devicePixelRatio: number;
  scrollX: number;
  scrollY: number;
}

export interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureNode {
  id: string;
  sourceNodeId: string;
  nodeType: string;
  tagName: string;
  rect: CaptureRect;
  styles: Record<string, string>;
  attributes: Record<string, string>;
  textContent?: string;
  assetRef?: string;
  fallbackRef?: string;
  children: CaptureNode[];
}

export interface CaptureDocument {
  sourceUrl: string;
  title?: string;
  captureMode?: "viewport" | "full-page" | "element";
  documentWidth?: number;
  documentHeight?: number;
  viewport: CaptureViewport;
  root: CaptureNode;
}

export interface FigmaPlanNode {
  id: string;
  type: string;
  sourceNodeId: string;
  rect: CaptureRect;
  confidence?: number;
}

export interface FigmaPlanFrame {
  id: string;
  role: string;
  name: string;
  nodes: FigmaPlanNode[];
}

export interface FigmaImportPlan {
  planVersion: string;
  frames: FigmaPlanFrame[];
  sourceNodeMap: Array<Record<string, string>>;
}

export interface Diagnostics {
  status: "success" | "warning" | "error";
  warnings: string[];
  counts: {
    fallbacks: number;
    missingAssets: number;
    unsupportedStyles: number;
  };
  fallbackReasons: Array<{ sourceNodeId: string; reason: string }>;
  missingAssets: string[];
  unsupportedStyles: string[];
  autoLayoutCandidates: Array<{
    sourceNodeId: string;
    pattern: string;
    confidence: number;
    applied?: boolean;
    skippedReason?: string;
  }>;
}

export interface CapturePackageData {
  manifest: CaptureManifest;
  capture: CaptureDocument;
  figmaPlan: FigmaImportPlan;
  diagnostics: Diagnostics;
  screenshot: Uint8Array | ArrayBuffer;
  assets: Record<string, Uint8Array | ArrayBuffer>;
}

export interface MaterialIconAssetSource {
  bytes: Uint8Array;
  extension: "svg";
  assetKind: "svg";
  assetRole: "icon-font";
  assetSource: string;
  iconFontLigature: string;
}

export interface MultiCaptureEntry {
  index: number;
  width: number;
  label: string;
  packageData: CapturePackageData;
}

export interface MultiCaptureBundle {
  bundleVersion: string;
  captures: MultiCaptureEntry[];
}

export interface MultiCaptureBundleInput {
  captures: Array<{
    width?: number;
    label?: string;
    packageData: CapturePackageData;
  }>;
}

export declare const CURRENT_SCHEMA_VERSION: string;
export declare const MULTI_CAPTURE_BUNDLE_VERSION: string;
export declare const MULTI_CAPTURE_INDEX_FILE: string;
export declare const MULTI_CAPTURE_BUNDLE_TYPE: string;
export declare const REQUIRED_FIGCAPTURE_FILES: string[];
export declare const ERROR_CODES: Record<string, ValidationErrorCode>;

export declare class FigcaptureValidationError extends Error {
  errors: ValidationError[];
  constructor(message: string, errors: ValidationError[]);
}

export declare function describeCaptureSchema(): CaptureSchemaDescription;
export declare function createEmptyDiagnostics(overrides?: Partial<Diagnostics>): Diagnostics;
export declare function materialIconAssetSourceForNode(node: unknown): MaterialIconAssetSource | null;
export declare function materialIconLigatureForNode(node: unknown): string;
export declare function validateManifest(value: unknown): ValidationResult;
export declare function validateCapture(value: unknown): ValidationResult;
export declare function validateFigmaPlan(value: unknown): ValidationResult;
export declare function validateDiagnostics(value: unknown): ValidationResult;
export declare function validateCapturePackage(packageData: unknown): ValidationResult;
export declare function assertValidCapturePackage<T extends CapturePackageData>(packageData: T): T;
export declare function createFigcaptureFileMap(packageData: CapturePackageData): Record<string, Uint8Array>;
export declare function packFigcapture(packageData: CapturePackageData): Uint8Array;
export declare function packFigcaptureFiles(files: Record<string, Uint8Array | ArrayBuffer | string>): Uint8Array;
export declare function unpackFigcapture(bytes: Uint8Array | ArrayBuffer): CapturePackageData;
export declare function readFigcaptureFiles(bytes: Uint8Array | ArrayBuffer): Record<string, Uint8Array>;
export declare function packMultiCaptureFigcapture(bundle: MultiCaptureBundleInput): Uint8Array;
export declare function unpackMultiCaptureFigcapture(bytes: Uint8Array | ArrayBuffer): MultiCaptureBundle;
export declare function summarizeDiagnostics(diagnostics: Diagnostics): {
  fallbackCount: number;
  missingAssetCount: number;
  unsupportedStyleCount: number;
  autoLayoutCandidateCount: number;
  status: Diagnostics["status"];
};
