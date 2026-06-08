import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("workspace manifests define the required packages", async () => {
  const rootPackage = JSON.parse(await readFile("package.json", "utf8"));
  const workspace = await readFile("pnpm-workspace.yaml", "utf8");

  assert.equal(rootPackage.scripts.build, "node scripts/build.mjs");
  assert.equal(rootPackage.scripts.test, "node scripts/test.mjs");
  assert.match(workspace, /packages\/\*/);
  assert.match(workspace, /apps\/\*/);
});
