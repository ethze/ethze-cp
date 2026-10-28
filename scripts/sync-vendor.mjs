// OpenCV ships as an Emscripten bundle; copy it into public/ so the browser can load it as a script.
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "@techstark", "opencv-js", "dist", "opencv.js");
const to = join(root, "public", "vendor", "opencv.js");

if (!existsSync(from)) {
  console.warn("[sync-vendor] opencv.js not found, skipping");
  process.exit(0);
}

mkdirSync(dirname(to), { recursive: true });

if (existsSync(to) && statSync(to).size === statSync(from).size) {
  process.exit(0);
}

copyFileSync(from, to);
console.log("[sync-vendor] opencv.js disalin");
