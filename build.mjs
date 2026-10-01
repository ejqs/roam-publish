import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const serverUrl = process.env.ROAM_PUBLISH_SERVER ?? "https://roam.pub";

const ctx = await esbuild.context({
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "esm",
  target: "es2020",
  outfile: "extension.js",
  define: { __DEFAULT_SERVER__: JSON.stringify(serverUrl) },
  logLevel: "info",
});

if (watch) await ctx.watch();
else {
  await ctx.rebuild();
  await ctx.dispose();
}
