// Bundles the Electron main and preload entries into single CommonJS files
// using esbuild. All workspace TypeScript packages get inlined so the runtime
// only has to resolve Electron's own Node API and the published deps that we
// keep external (better-sqlite3 because it's a native module, electron itself).
//
// Usage:
//   node scripts/build-main.mjs              # one-shot
//   node scripts/build-main.mjs --watch      # watch mode

import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

/** Deps that should NOT be bundled (native, electron internals, large CJS). */
const EXTERNAL = [
  "electron",
  "better-sqlite3",
];

/** @type {esbuild.BuildOptions} */
const sharedOptions = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  logLevel: "info",
  external: EXTERNAL,
};

const mainOptions = {
  ...sharedOptions,
  entryPoints: [path.join(root, "src/main/index.ts")],
  outfile: path.join(root, "dist/main/index.cjs"),
};

const preloadOptions = {
  ...sharedOptions,
  entryPoints: [path.join(root, "src/preload/index.ts")],
  outfile: path.join(root, "dist/preload/index.cjs"),
};

const watch = process.argv.includes("--watch");

if (watch) {
  const [mainCtx, preloadCtx] = await Promise.all([
    esbuild.context(mainOptions),
    esbuild.context(preloadOptions),
  ]);
  await Promise.all([mainCtx.watch(), preloadCtx.watch()]);
  console.log("[build-main] watching for changes");
} else {
  await Promise.all([esbuild.build(mainOptions), esbuild.build(preloadOptions)]);
  console.log("[build-main] built");
}
