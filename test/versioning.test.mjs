import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { bumpVersionIfChanged } from "../scripts/versioning.mjs";

test("version sync initializes tracking without changing the current version", async () => {
  const rootDir = await createVersionFixture("0.1.1");

  const result = await bumpVersionIfChanged({ rootDir });
  const unchanged = await bumpVersionIfChanged({ rootDir });

  assert.equal(result.status, "initialized");
  assert.equal(result.version, "0.1.1");
  assert.equal(unchanged.status, "unchanged");
  assert.equal(unchanged.version, "0.1.1");
  assert.equal(await readVersion(rootDir, "package.json"), "0.1.1");
  assert.equal(await readVersion(rootDir, "apps/chrome-extension/manifest.json"), "0.1.1");
});

test("version sync bumps patch once when tracked source changes", async () => {
  const rootDir = await createVersionFixture("0.1.1");

  await bumpVersionIfChanged({ rootDir });
  await writeFile(join(rootDir, "apps/figma-plugin/src/code.ts"), "export const changed = true;\n", "utf8");

  const bumped = await bumpVersionIfChanged({ rootDir });
  const unchanged = await bumpVersionIfChanged({ rootDir });

  assert.equal(bumped.status, "bumped");
  assert.equal(bumped.previousVersion, "0.1.1");
  assert.equal(bumped.version, "0.1.2");
  assert.equal(unchanged.status, "unchanged");
  assert.equal(unchanged.version, "0.1.2");
  assert.equal(await readVersion(rootDir, "package.json"), "0.1.2");
  assert.equal(await readVersion(rootDir, "apps/chrome-extension/package.json"), "0.1.2");
  assert.equal(await readVersion(rootDir, "apps/chrome-extension/manifest.json"), "0.1.2");
  assert.equal(await readVersion(rootDir, "apps/figma-plugin/package.json"), "0.1.2");
  assert.equal(await readVersion(rootDir, "packages/capture-schema/package.json"), "0.1.2");
});

async function createVersionFixture(version) {
  const rootDir = await mkdtemp(join(tmpdir(), "figcapture-versioning-"));
  await writeJson(join(rootDir, "package.json"), {
    name: "fixture",
    version,
    scripts: {}
  });
  await writeText(join(rootDir, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n  - packages/*\n");
  await writeJson(join(rootDir, "apps/chrome-extension/package.json"), {
    name: "@fixture/chrome-extension",
    version
  });
  await writeJson(join(rootDir, "apps/chrome-extension/manifest.json"), {
    manifest_version: 3,
    name: "Fixture Capture",
    version
  });
  await writeJson(join(rootDir, "apps/figma-plugin/package.json"), {
    name: "@fixture/figma-plugin",
    version
  });
  await writeJson(join(rootDir, "packages/capture-schema/package.json"), {
    name: "@fixture/capture-schema",
    version
  });
  await writeText(join(rootDir, "apps/chrome-extension/src/background.ts"), "export const fixture = true;\n");
  await writeText(join(rootDir, "apps/figma-plugin/src/code.ts"), "export const fixture = true;\n");
  await writeText(join(rootDir, "packages/capture-schema/src/index.ts"), "export const fixture = true;\n");
  return rootDir;
}

async function readVersion(rootDir, relPath) {
  const json = JSON.parse(await readFile(join(rootDir, relPath), "utf8"));
  return json.version;
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, "utf8");
}
