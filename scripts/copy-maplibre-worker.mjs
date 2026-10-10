// MapLibre v6 runs its tile parsing in a module worker. Serve it from /public so the
// bundler never has to resolve the worker URL from inside node_modules.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = dirname(require.resolve("maplibre-gl/package.json"));
const src = join(pkg, "dist", "maplibre-gl-worker.mjs");
const destDir = join(root, "public");
if (!existsSync(src)) {
  console.warn(`[maplibre] worker not found at ${src}`);
  process.exit(0);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, join(destDir, "maplibre-gl-worker.mjs"));
console.log("[maplibre] worker copied to public/maplibre-gl-worker.mjs");
