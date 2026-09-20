import { build } from "esbuild";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [resolve(root, "src/index.js")],
  bundle: true,
  format: "esm",
  target: "es2020",
  outfile: resolve(root, "extension.js"),
  logLevel: "info",
});
