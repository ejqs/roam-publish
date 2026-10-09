import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";

const watch = process.argv.includes("--watch");
const serverUrl = process.env.ROAM_PUBLISH_SERVER ?? "https://roam.pub";
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

const ctx = await esbuild.context({
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "esm",
  target: "es2020",
  outfile: "extension.js",
  define: { __DEFAULT_SERVER__: JSON.stringify(serverUrl), __VERSION__: JSON.stringify(version) },
  logLevel: "info",
});

if (watch) await ctx.watch();
else {
  await ctx.rebuild();
  await ctx.dispose();
}
