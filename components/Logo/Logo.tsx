"use client";

import { useEffect, useRef } from "react";
import { initLogo } from "./logo-engine";

export default function Logo() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    return initLogo(svgRef.current);
  }, []);

  return (
    <svg
      ref={svgRef}
      className="logo"
      aria-label="Logo"
      viewBox="0 0 847.68259 167.17739"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="translate(-10497.651,2103.1432)">
        <g className="anim-target anim-g2">
          <g
            transform="matrix(0.82876389,0,0,0.82876389,2355.5576,-787.91676)"
            fill="#fff"
          >
            <path
              id="rect1-8-2-9-1-4"
              d="m 10601.67,-1586.9735 -119.405,68.9379 h 245.541 l 119.404,-68.9379 z"
            />
            <path
              id="rect1-8-2-9-0-2-2"
              d="m 10532.731,-1586.9733 137.877,-5e-4 -212.645,122.7705 h -137.876 z"
            />
          </g>
        </g>
        <g className="anim-target anim-g1" fill="#fff">
          <path
            id="rect1-8-2-95-8"
            d="m 10596.609,-2026.3201 -98.958,57.1332 h 203.495 l 98.957,-57.1332 z"
          />
          <path
            id="rect1-8-2-0-8-3-7"
            d="m 10877.376,-2070.9341 h 114.268 l -176.232,101.7472 h -114.266 z"
          />
        </g>
        <path
          className="anim-target anim-g3"
          id="G3"
          fill="#fff"
          d="m 11137.005,-2001.3956 h -114.266 l 113.328,65.4297 114.266,-2e-4 z"
        />
      </g>
    </svg>
  );
}
