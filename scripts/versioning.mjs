import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRootDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

export const VERSION_STATE_FILE = ".version-state.json";

const trackedPaths = [
  "package.json",
  "pnpm-workspace.yaml",
  "scripts/bump-version-if-changed.mjs",
  "scripts/build.mjs",
  "scripts/versioning.mjs",
  "apps/chrome-extension/package.json",
  "apps/chrome-extension/manifest.json",
  "apps/chrome-extension/popup.html",
  "apps/chrome-extension/popup.css",
  "apps/chrome-extension/src",
  "apps/figma-plugin/package.json",
  "apps/figma-plugin/manifest.json",
  "apps/figma-plugin/ui.html",
  "apps/figma-plugin/ui.css",
  "apps/figma-plugin/src",
  "packages/capture-schema/package.json",
  "packages/capture-schema/src"
];

const versionFiles = [
  "package.json",
  "apps/chrome-extension/package.json",
  "apps/chrome-extension/manifest.json",
  "apps/figma-plugin/package.json",
  "packages/capture-schema/package.json"
];

const versionFileSet = new Set(versionFiles);

export async function bumpVersionIfChanged(options = {}) {
  const rootDir = options.rootDir ?? defaultRootDir;
  const statePath = join(rootDir, VERSION_STATE_FILE);
  const version = await readCurrentVersion(rootDir);
  const fingerprint = await computeSourceFingerprint(rootDir);
  const state = await readVersionState(statePath);

  if (!state) {
    await writeVersionState(statePath, { version, fingerprint });
    return {
      status: "initialized",
      version,
      previousVersion: null,
      fingerprint
    };
  }

  if (state.fingerprint === fingerprint) {
    if (state.version !== version) {
      await writeVersionState(statePath, { version, fingerprint });
    }
    return {
      status: "unchanged",
      version,
      previousVersion: state.version,
      fingerprint
    };
  }

  const nextVersion = incrementPatchVersion(version);
  await writeVersionToFiles(rootDir, nextVersion);
  await writeVersionState(statePath, { version: nextVersion, fingerprint });

  return {
    status: "bumped",
    version: nextVersion,
    previousVersion: version,
    fingerprint
  };
}

export async function computeSourceFingerprint(rootDir = defaultRootDir) {
  const files = [];
  for (const trackedPath of trackedPaths) {
    files.push(...await listTrackedFiles(join(rootDir, trackedPath), rootDir));
  }

  const hash = createHash("sha256");
  for (const file of files.sort()) {
    const relPath = relative(rootDir, file);
    hash.update(relPath);
    hash.update("\0");
    hash.update(await readNormalizedTrackedFile(file, relPath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function incrementPatchVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }

  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

async function readCurrentVersion(rootDir) {
  const json = await readJson(join(rootDir, "package.json"));
  if (typeof json.version !== "string") {
    throw new Error("Root package.json version is missing");
  }
  return json.version;
}

async function writeVersionToFiles(rootDir, version) {
  for (const relPath of versionFiles) {
    const filePath = join(rootDir, relPath);
    const json = await readJson(filePath);
    json.version = version;
    await writeJson(filePath, json);
  }
}

async function listTrackedFiles(path, rootDir) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOTDIR") {
      return [path];
    }
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const fullPath = join(path, entry.name);
    const relPath = relative(rootDir, fullPath);
    if (shouldSkipPath(relPath)) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...await listTrackedFiles(fullPath, rootDir));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function shouldSkipPath(relPath) {
  return relPath === VERSION_STATE_FILE
    || relPath.includes("/dist/")
    || relPath.includes("/node_modules/");
}

async function readNormalizedTrackedFile(filePath, relPath) {
  const source = await readFile(filePath, "utf8");
  if (!versionFileSet.has(relPath)) {
    return source;
  }

  const json = JSON.parse(source);
  delete json.version;
  return `${stableJsonStringify(json)}\n`;
}

function stableJsonStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function readVersionState(statePath) {
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeVersionState(statePath, state) {
  await writeJson(statePath, {
    ...state,
    updatedAt: new Date().toISOString()
  });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
