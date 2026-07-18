import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

const DEFAULT_ROOT = path.resolve(
  fileURLToPath(new URL("..", import.meta.url))
);

async function listFilesRecursive(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async entry => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listFilesRecursive(fullPath);
      }

      return [fullPath];
    })
  );

  return files.flat();
}

function escapeInlineScript(source) {
  return source.replace(/<\/script/gi, "<\\/script");
}

function escapeInlineStyle(source) {
  return source.replace(/<\/style/gi, "<\\/style");
}

export function renderStandaloneHtml({ css = "", js }) {
  if (!js) {
    throw new Error("Standalone HTML requires bundled JavaScript.");
  }

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Triangle standalone</title>
  <style>
${escapeInlineStyle(css)}
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
${escapeInlineScript(js)}
  </script>
</body>
</html>
`;
}

function assertSelfContained(html) {
  const forbidden = [
    /<script\b[^>]*\bsrc=/i,
    /<link\b[^>]*\bhref=/i,
    /\/src\/main\.js/i,
    /\/assets\//i,
    /\bsrc="\//i,
    /\bhref="\//i
  ];

  for (const pattern of forbidden) {
    if (pattern.test(html)) {
      throw new Error(
        `Standalone HTML contains an external dependency: ${pattern}`
      );
    }
  }
}

export async function buildStandalone({
  root = DEFAULT_ROOT,
  outputFile = path.join(root, "dist", "triangle-standalone.html")
} = {}) {
  const tempOutDir = path.join(root, "dist", ".standalone-build");

  await mkdir(path.dirname(outputFile), { recursive: true });
  await rm(tempOutDir, { recursive: true, force: true });

  await build({
    appType: "custom",
    configFile: false,
    publicDir: false,
    root,
    build: {
      assetsDir: ".",
      cssCodeSplit: false,
      emptyOutDir: true,
      minify: true,
      outDir: tempOutDir,
      sourcemap: false,
      target: "es2020",
      rollupOptions: {
        input: path.join(root, "src", "standalone-main.js"),
        output: {
          assetFileNames: "standalone[extname]",
          entryFileNames: "standalone.js",
          format: "iife",
          inlineDynamicImports: true,
          name: "TriangleStandalone"
        }
      }
    },
    logLevel: "warn"
  });

  const files = await listFilesRecursive(tempOutDir);
  const jsFiles = files.filter(file => file.endsWith(".js"));
  const cssFiles = files.filter(file => file.endsWith(".css"));

  if (jsFiles.length !== 1) {
    throw new Error(
      `Standalone build expected exactly one JS file, found ${jsFiles.length}.`
    );
  }

  const js = await readFile(jsFiles[0], "utf8");
  const css = (
    await Promise.all(cssFiles.map(file => readFile(file, "utf8")))
  ).join("\n");
  const html = renderStandaloneHtml({ css, js });

  assertSelfContained(html);
  await writeFile(outputFile, html, "utf8");
  await rm(tempOutDir, { recursive: true, force: true });

  return { outputFile };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildStandalone()
    .then(({ outputFile }) => {
      console.log(`Standalone Triangle written to ${outputFile}`);
    })
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}
