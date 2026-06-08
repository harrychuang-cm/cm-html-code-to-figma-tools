import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

const roots = [
  "test",
  "packages/capture-schema/test",
  "apps/chrome-extension/test",
  "apps/figma-plugin/test"
];

async function listTestFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listTestFiles(fullPath));
    } else if (entry.name.endsWith(".test.mjs")) {
      files.push(fullPath);
    }
  }
  return files;
}

const testFiles = (await Promise.all(roots.map(listTestFiles))).flat();

if (testFiles.length === 0) {
  throw new Error("No test files found");
}

const child = spawn(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit"
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
