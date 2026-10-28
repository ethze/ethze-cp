import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    // The model packages import MediaPipe at module scope; we only use the tfjs runtime.
    resolveAlias: {
      "@mediapipe/hands": "./lib/mediapipe-hands.js",
      "@mediapipe/face_mesh": "./lib/mediapipe-face-mesh.js",
    },
  },
};

export default nextConfig;
