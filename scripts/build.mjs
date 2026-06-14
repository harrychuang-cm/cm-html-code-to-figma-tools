import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bumpVersionIfChanged } from "./versioning.mjs";

const rootDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

const workspaces = [
  "packages/capture-schema",
  "apps/chrome-extension",
  "apps/figma-plugin"
];

const IMPORT_RE = /import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];?/g;

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

function rewriteImports(source, workspace) {
  const schemaImport = workspace.startsWith("apps/")
    ? "./vendor/capture-schema.js"
    : "../../../packages/capture-schema/dist/index.js";

  return source
    .replaceAll("@figma-capture/capture-schema", schemaImport)
    .replaceAll("./capture-core.ts", "./capture-core.js")
    .replaceAll("./asset-capture.ts", "./asset-capture.js")
    .replaceAll("./background.ts", "./background.js")
    .replaceAll("./runtime.ts", "./runtime.js")
    .replaceAll("./screenshot.ts", "./screenshot.js")
    .replaceAll("./breakpoints.ts", "./breakpoints.js")
    .replaceAll("./device-emulation.ts", "./device-emulation.js")
    .replaceAll("./content.ts", "./content.js")
    .replaceAll("./capture-package.ts", "./capture-package.js")
    .replaceAll("./stitch-screenshot.ts", "./stitch-screenshot.js")
    .replaceAll("./renderer.ts", "./renderer.js")
    .replaceAll("./layout-tree.ts", "./layout-tree.js")
    .replaceAll("./semantic-naming.ts", "./semantic-naming.js")
    .replaceAll("./auto-layout.ts", "./auto-layout.js")
    .replaceAll("./importer.ts", "./importer.js")
    .replaceAll("./report.ts", "./report.js")
    .replaceAll("./message-bridge.ts", "./message-bridge.js")
    .replaceAll("./figma-adapter.ts", "./figma-adapter.js")
    .replaceAll("./code.ts", "./code.js")
    .replaceAll("./ui.ts", "./ui.js");
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
  const workspacePackage = JSON.parse(await readFile(packagePath, "utf8"));
  const workspaceVersion = workspacePackage.version;

  const files = await listFiles(srcDir);
  for (const file of files.filter((item) => !item.endsWith(".d.ts"))) {
    const rel = relative(srcDir, file);
    const outExt = extname(file) === ".ts" ? ".js" : extname(file);
    const outRel = extname(file) === ".ts" ? rel.slice(0, -3) + outExt : rel;
    const outPath = join(distDir, outRel);
    await mkdir(dirname(outPath), { recursive: true });

    if (extname(file) === ".ts") {
      const source = await readFile(file, "utf8");
      await writeFile(outPath, rewriteImports(source, workspace), "utf8");
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
      const source = await readFile(path, "utf8");
      await writeFile(
        join(distDir, staticFile),
        applyStaticTemplates(source, {
          workspace,
          staticFile,
          version: workspaceVersion
        }),
        "utf8"
      );
    }
  }

  if (workspace.startsWith("apps/")) {
    const vendorDir = join(distDir, "vendor");
    await mkdir(vendorDir, { recursive: true });
    await cp(
      join(rootDir, "packages/capture-schema/dist/index.js"),
      join(vendorDir, "capture-schema.js")
    );
  }
}

function applyStaticTemplates(source, { workspace, staticFile, version }) {
  const output = source
    .replaceAll("__APP_VERSION__", version)
    .replaceAll("__PLUGIN_VERSION__", version);

  if (workspace === "apps/figma-plugin" && staticFile === "manifest.json") {
    const manifest = JSON.parse(output);
    manifest.name = `${manifest.name.replace(/\s+v\d+\.\d+\.\d+$/, "")} v${version}`;
    return `${JSON.stringify(manifest, null, 2)}\n`;
  }

  return output;
}

const versionResult = await bumpVersionIfChanged({ rootDir });
if (versionResult.status === "bumped") {
  console.log(`Version bumped ${versionResult.previousVersion} -> ${versionResult.version}`);
} else if (versionResult.status === "initialized") {
  console.log(`Version tracking initialized at ${versionResult.version}`);
}

for (const workspace of workspaces) {
  await copySource(workspace);
}

await createFigmaPluginClassicRuntime();

console.log(`Built ${workspaces.length} workspaces`);

async function createFigmaPluginClassicRuntime() {
  const pluginDir = join(rootDir, "apps/figma-plugin");
  const distDir = join(pluginDir, "dist");
  const pluginPackage = JSON.parse(await readFile(join(pluginDir, "package.json"), "utf8"));
  const version = pluginPackage.version;
  const css = applyStaticTemplates(await readFile(join(pluginDir, "ui.css"), "utf8"), {
    workspace: "apps/figma-plugin",
    staticFile: "ui.css",
    version
  });
  const html = applyStaticTemplates(await readFile(join(pluginDir, "ui.html"), "utf8"), {
    workspace: "apps/figma-plugin",
    staticFile: "ui.html",
    version
  });
  const uiBundle = await bundleClassicScript(join(pluginDir, "src/ui.ts"));
  const codeBundle = await readFile(join(pluginDir, "src/code-classic.js"), "utf8");

  await cp(join(distDir, "code.js"), join(distDir, "code-module.js"));
  await cp(join(distDir, "ui.js"), join(distDir, "ui-module.js"));
  await writeFile(join(distDir, "code.js"), codeBundle.endsWith("\n") ? codeBundle : `${codeBundle}\n`, "utf8");
  await writeFile(join(distDir, "ui-bundle.js"), `${uiBundle}\n`, "utf8");
  await writeFile(join(distDir, "ui.html"), inlineFigmaUiHtml(html, css, uiBundle), "utf8");
}

async function bundleClassicScript(entryPath) {
  const moduleIds = new Map();
  const modules = [];

  await visit(resolve(entryPath));

  return [
    "(function () {",
    ...modules.map((module) => module.code),
    "}());"
  ].join("\n\n");

  async function visit(filePath) {
    const absolutePath = resolve(filePath);
    if (moduleIds.has(absolutePath)) {
      return moduleIds.get(absolutePath);
    }

    const moduleId = `__figcapture_module_${moduleIds.size}`;
    moduleIds.set(absolutePath, moduleId);
    const source = await readFile(absolutePath, "utf8");
    const imports = parseImports(source, absolutePath);

    for (const item of imports) {
      await visit(item.resolvedPath);
    }

    const withoutImports = source.replace(IMPORT_RE, "");
    const { code, exports } = transformExports(withoutImports);
    const importPreamble = imports
      .map((item) => `  const ${item.bindings} = ${moduleIds.get(item.resolvedPath)};`)
      .join("\n");
    const returnMap = exports.length === 0
      ? "{}"
      : `{ ${exports.join(", ")} }`;

    modules.push({
      id: moduleId,
      code: [
        `const ${moduleId} = (function () {`,
        importPreamble,
        indent(code.trim()),
        `  return ${returnMap};`,
        "}());"
      ].filter(Boolean).join("\n")
    });

    return moduleId;
  }
}

function parseImports(source, ownerPath) {
  const imports = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    imports.push({
      bindings: parseNamedImportBindings(match[1]),
      specifier: match[2],
      resolvedPath: resolveImportPath(ownerPath, match[2])
    });
  }
  return imports;
}

function parseNamedImportBindings(rawBindings) {
  const bindings = rawBindings.trim();
  if (!bindings.startsWith("{") || !bindings.endsWith("}")) {
    throw new Error(`Unsupported import binding: ${bindings}`);
  }

  const entries = bindings
    .slice(1, -1)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [imported, local] = item.split(/\s+as\s+/);
      return local ? `${imported.trim()}: ${local.trim()}` : imported.trim();
    });

  return `{ ${entries.join(", ")} }`;
}

function resolveImportPath(ownerPath, specifier) {
  if (specifier === "@figma-capture/capture-schema") {
    return join(rootDir, "packages/capture-schema/src/index.ts");
  }

  if (!specifier.startsWith(".")) {
    throw new Error(`Unsupported classic bundle import: ${specifier}`);
  }

  return resolve(dirname(ownerPath), specifier);
}

function transformExports(source) {
  const exports = [];
  let code = source
    .replace(/export\s+async\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g, (_match, name) => {
      exports.push(name);
      return `async function ${name}(`;
    })
    .replace(/export\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g, (_match, name) => {
      exports.push(name);
      return `function ${name}(`;
    })
    .replace(/export\s+class\s+([A-Za-z_$][\w$]*)/g, (_match, name) => {
      exports.push(name);
      return `class ${name}`;
    })
    .replace(/export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/g, (_match, keyword, name) => {
      exports.push(name);
      return `${keyword} ${name}`;
    })
    .replace(/export\s*\{([^}]+)\};?/g, (_match, names) => {
      for (const item of names.split(",").map((entry) => entry.trim()).filter(Boolean)) {
        const [original, exported] = item.split(/\s+as\s+/);
        exports.push((exported ?? original).trim());
      }
      return "";
    });

  return {
    code,
    exports: [...new Set(exports)]
  };
}

function inlineFigmaUiHtml(html, css, uiBundle) {
  return html
    .replace(/<link rel="stylesheet" href="ui\.css">/, `<style>\n${css}\n</style>`)
    .replace(/<script type="module" src="ui\.js"><\/script>/, `<script>\n${uiBundle}\n</script>`);
}

function indent(source) {
  return source
    .split("\n")
    .map((line) => line.length === 0 ? line : `  ${line}`)
    .join("\n");
}
