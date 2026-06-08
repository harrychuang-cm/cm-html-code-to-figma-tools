import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

const workspaces = [
  "packages/capture-schema",
  "apps/chrome-extension",
  "apps/figma-plugin"
];

async function exists(path) {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function rewriteImports(source) {
  return source
    .replaceAll("@figma-capture/capture-schema", "../../../packages/capture-schema/dist/index.js")
    .replaceAll("./capture-core.ts", "./capture-core.js")
    .replaceAll("./asset-capture.ts", "./asset-capture.js")
    .replaceAll("./background.ts", "./background.js")
    .replaceAll("./capture-package.ts", "./capture-package.js")
    .replaceAll("./renderer.ts", "./renderer.js")
    .replaceAll("./auto-layout.ts", "./auto-layout.js")
    .replaceAll("./importer.ts", "./importer.js")
    .replaceAll("./report.ts", "./report.js");
}

async function copySource(workspace) {
  const workspaceDir = join(rootDir, workspace);
  const srcDir = join(workspaceDir, "src");
  const distDir = join(workspaceDir, "dist");

  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  const packagePath = join(workspaceDir, "package.json");
  if (!await exists(packagePath)) {
    throw new Error(`Missing package.json for ${workspace}`);
  }

  const files = await listFiles(srcDir);
  for (const file of files.filter((item) => !item.endsWith(".d.ts"))) {
    const rel = relative(srcDir, file);
    const outExt = extname(file) === ".ts" ? ".js" : extname(file);
    const outRel = extname(file) === ".ts" ? rel.slice(0, -3) + outExt : rel;
    const outPath = join(distDir, outRel);
    await mkdir(dirname(outPath), { recursive: true });

    if (extname(file) === ".ts") {
      const source = await readFile(file, "utf8");
      await writeFile(outPath, rewriteImports(source), "utf8");
    } else {
      await cp(file, outPath, { recursive: true });
    }
  }

  const declarationFiles = files.filter((file) => file.endsWith(".d.ts"));
  for (const file of declarationFiles) {
    const rel = relative(srcDir, file);
    const outPath = join(distDir, rel);
    await mkdir(dirname(outPath), { recursive: true });
    await cp(file, outPath);
  }

  for (const staticFile of ["manifest.json", "popup.html", "popup.css", "ui.html", "ui.css"]) {
    const path = join(workspaceDir, staticFile);
    if (await exists(path)) {
      await cp(path, join(distDir, staticFile));
    }
  }
}

for (const workspace of workspaces) {
  await copySource(workspace);
}

console.log(`Built ${workspaces.length} workspaces`);
