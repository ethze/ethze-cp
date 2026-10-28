"use client";

import { useEffect } from "react";
import { initCamera } from "./camera-engine";

export default function Camera() {
  useEffect(() => initCamera(), []);

  return (
    <>
      <video id="vid" playsInline muted />
      <canvas id="fx" />
      <canvas id="ov" />
      <div id="camwrap">
        <div id="cb">
          <button id="cam" type="button">
            Open camera
          </button>
          <div id="hint">
            <span>Hand detection: thumb &amp; index finger</span>
          </div>
        </div>
        <div id="lg" />
      </div>
    </>
  );
}
