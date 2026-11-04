// Copy OpenCV and MediaPipe WASM/model assets into public/vendor/ so the browser can load them directly.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function syncFile(from, to) {
  if (!existsSync(from)) return false;
  mkdirSync(dirname(to), { recursive: true });
  if (existsSync(to) && statSync(to).size === statSync(from).size) {
    return false;
  }
  copyFileSync(from, to);
  return true;
}

function syncDir(fromDir, toDir, exts, exclude = []) {
  if (!existsSync(fromDir)) {
    console.warn(`[sync-vendor] ${fromDir} not found, skipping`);
    return 0;
  }
  mkdirSync(toDir, { recursive: true });
  let copied = 0;
  for (const entry of readdirSync(fromDir)) {
    if (exclude.includes(entry)) continue;
    if (exts.includes(extname(entry))) {
      if (syncFile(join(fromDir, entry), join(toDir, entry))) {
        copied++;
      }
    }
  }
  return copied;
}

const opencvFrom = join(root, "node_modules", "@techstark", "opencv-js", "dist", "opencv.js");
const opencvTo = join(root, "public", "vendor", "opencv.js");
if (syncFile(opencvFrom, opencvTo)) {
  console.log("[sync-vendor] opencv.js disalin");
}

const assetExts = [".js", ".wasm", ".data", ".tflite", ".binarypb"];
const handsCopied = syncDir(
  join(root, "node_modules", "@mediapipe", "hands"),
  join(root, "public", "vendor", "hands"),
  assetExts,
  ["hand_landmark_full.tflite"]
);
if (handsCopied > 0) {
  console.log(`[sync-vendor] @mediapipe/hands (${handsCopied} file) disalin`);
}

const faceCopied = syncDir(
  join(root, "node_modules", "@mediapipe", "face_mesh"),
  join(root, "public", "vendor", "face_mesh"),
  assetExts
);
if (faceCopied > 0) {
  console.log(`[sync-vendor] @mediapipe/face_mesh (${faceCopied} file) disalin`);
}

const poseCopied = syncDir(
  join(root, "node_modules", "@mediapipe", "pose"),
  join(root, "public", "vendor", "pose"),
  assetExts,
  ["pose_landmark_full.tflite", "pose_landmark_heavy.tflite"]
);
if (poseCopied > 0) {
  console.log(`[sync-vendor] @mediapipe/pose (${poseCopied} file) disalin`);
}
