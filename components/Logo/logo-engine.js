// WebGL logo: white motion blur with a red inner-stroke trail.
export function initLogo(svg) {
  if (!svg || !svg.parentNode) return;

  var cv = document.createElement("canvas");
  cv.className = "logo";
  cv.setAttribute("role", "img");
  cv.setAttribute("aria-label", "Logo");

  var gl = null;
  var o = { alpha: true, antialias: true, premultipliedAlpha: true };
  try {
    gl = cv.getContext("webgl", o) || cv.getContext("experimental-webgl", o);
  } catch (e) {}
  if (!gl) return;

  var W = 847.68259;
  var H = 167.17739;
  var P = 4600;
  var OFF = 848;
  var TAU = 0.3;
  var SHUT = 1;
  var MAXN = 40;
  var STROKE = 4;
  var BG = [17 / 255, 17 / 255, 17 / 255];

  var verts = [];
  var groups = [];

  function polyPts(id, m) {
    var t = document
      .getElementById(id)
      .getAttribute("d")
      .match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi);
    var a = m ? m[0] : 1;
    var e = m ? m[1] : 0;
    var f = m ? m[2] : 0;
    var pts = [];
    var cx = 0;
    var cy = 0;
    var i = 0;
    var cmd = "";
    var c;
    var rel;
    var x;
    var y;
    while (i < t.length) {
      if (/[a-zA-Z]/.test(t[i])) {
        cmd = t[i++];
        if (cmd === "z" || cmd === "Z") continue;
      }
      rel = cmd === cmd.toLowerCase();
      c = cmd.toLowerCase();
      if (c === "m" || c === "l") {
        x = +t[i++];
        y = +t[i++];
        if (rel) {
          x += cx;
          y += cy;
        }
        if (c === "m") cmd = rel ? "l" : "L";
      } else if (c === "h") {
        x = +t[i++];
        x = rel ? cx + x : x;
        y = cy;
      } else if (c === "v") {
        y = +t[i++];
        y = rel ? cy + y : y;
        x = cx;
      } else {
        i++;
        continue;
      }
      cx = x;
      cy = y;
      pts.push([a * x + e - 10497.651, a * y + f + 2103.1432]);
    }
    return pts;
  }

  function addGroup(d, items) {
    var start = verts.length / 2;
    items.forEach(function (it) {
      var p = polyPts(it[0], it[1]);
      for (var k = 1; k < p.length - 1; k++) {
        verts.push(
          p[0][0],
          p[0][1],
          p[k][0],
          p[k][1],
          p[k + 1][0],
          p[k + 1][1]
        );
      }
    });
    groups.push({ d: d, s: start, n: verts.length / 2 - start });
  }

  var G2M = [0.82876389, 2355.5576, -787.91676];
  addGroup(0, [["rect1-8-2-95-8"], ["rect1-8-2-0-8-3-7"]]);
  addGroup(40, [
    ["rect1-8-2-9-1-4", G2M],
    ["rect1-8-2-9-0-2-2", G2M],
  ]);
  addGroup(120, [["G3"]]);

  function bez(x1, y1, x2, y2) {
    function ax(s) {
      var i = 1 - s;
      return 3 * i * i * s * x1 + 3 * i * s * s * x2 + s * s * s;
    }
    function ay(s) {
      var i = 1 - s;
      return 3 * i * i * s * y1 + 3 * i * s * s * y2 + s * s * s;
    }
    return function (t) {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      var lo = 0;
      var hi = 1;
      var s = 0.5;
      for (var i = 0; i < 28; i++) {
        s = (lo + hi) / 2;
        if (ax(s) < t) lo = s;
        else hi = s;
      }
      return ay(s);
    };
  }

  var easeIn = bez(0, 1, 0.12, 1);
  var easeOut = bez(0.5, 0, 0.8, 0.4);

  function pos(g, t) {
    var u = (((t - g.d) / P) % 1 + 1) % 1;
    if (u < 0.34) return OFF * (1 - easeIn(u / 0.34));
    if (u < 0.66) return 0;
    if (u < 0.86) return -OFF * easeOut((u - 0.66) / 0.2);
    return -OFF;
  }

  function sh(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s));
    }
    return s;
  }

  function prog(vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(p));
    }
    return p;
  }

  var HP =
    "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n";
  var gProg;
  var fProg;
  var dProg;
  try {
    gProg = prog(
      "attribute vec2 aPos;uniform vec2 uOff;uniform vec2 uView;" +
        "void main(){gl_Position=vec4((aPos.x+uOff.x)/uView.x*2.-1.,1.-aPos.y/uView.y*2.,0.,1.);}",
      HP + "uniform vec4 uColor;void main(){gl_FragColor=uColor;}"
    );
    var QVS =
      "attribute vec2 aPos;varying vec2 vUv;void main(){vUv=aPos*.5+.5;gl_Position=vec4(aPos,0.,1.);}";
    fProg = prog(
      QVS,
      HP +
        "uniform sampler2D uPrev;uniform vec2 uPx;uniform float uDecay;varying vec2 vUv;" +
        "void main(){float c=texture2D(uPrev,vUv).r*.5+(texture2D(uPrev,vUv+vec2(uPx.x*1.6,0.)).r+texture2D(uPrev,vUv-vec2(uPx.x*1.6,0.)).r)*.25;" +
        "c=max(c*uDecay-.006,0.);gl_FragColor=vec4(c,c,c,1.);}"
    );
    dProg = prog(
      QVS,
      HP +
        "uniform sampler2D uTrail;uniform vec3 uBg;uniform vec2 uPx;uniform float uR;varying vec2 vUv;" +
        "float tp(vec2 p){if(p.x<0.||p.x>1.||p.y<0.||p.y>1.)return 0.;return smoothstep(.03,.08,texture2D(uTrail,p).r);}" +
        "void main(){float t=texture2D(uTrail,vUv).r;float m=tp(vUv);float e=m;" +
        "for(int i=0;i<16;i++){float a=float(i)*.3926991;vec2 d=vec2(cos(a),sin(a))*uR*uPx;e=min(e,tp(vUv+d));e=min(e,tp(vUv+d*.5));}" +
        "float s=m*(1.-e)*clamp(t*1.6,0.,1.);gl_FragColor=vec4(s,0.,0.,s);}"
    );
  } catch (err) {
    return;
  }

  var geoBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, geoBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

  var quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );

  function U(p, n) {
    return gl.getUniformLocation(p, n);
  }

  var uG = {
    off: U(gProg, "uOff"),
    view: U(gProg, "uView"),
    color: U(gProg, "uColor"),
  };
  var uF = {
    prev: U(fProg, "uPrev"),
    px: U(fProg, "uPx"),
    decay: U(fProg, "uDecay"),
  };
  var uD = {
    trail: U(dProg, "uTrail"),
    bg: U(dProg, "uBg"),
    px: U(dProg, "uPx"),
    r: U(dProg, "uR"),
  };

  function quadSetup(p) {
    gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    var l = gl.getAttribLocation(p, "aPos");
    gl.enableVertexAttribArray(l);
    gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
  }

  function drawQuad(p) {
    quadSetup(p);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function geoSetup() {
    gl.useProgram(gProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, geoBuf);
    var l = gl.getAttribLocation(gProg, "aPos");
    gl.enableVertexAttribArray(l);
    gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(uG.view, W, H);
  }

  function drawGroup(g, x) {
    gl.uniform2f(uG.off, x, 0);
    gl.drawArrays(gl.TRIANGLES, g.s, g.n);
  }

  function target(old, w, h) {
    if (old) {
      gl.deleteTexture(old.t);
      gl.deleteFramebuffer(old.f);
    }
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { t: t, f: f };
  }

  var trail = [null, null];
  var cur = 0;
  var sc = 1;
  var prevKey = "";
  var lastMove = -1e9;

  function resize() {
    var w = cv.getBoundingClientRect().width || 580;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.max(2, Math.round(w * dpr));
    cv.height = Math.max(2, Math.round((w * H) / W * dpr));
    sc = cv.width / W;
    trail[0] = target(trail[0], cv.width, cv.height);
    trail[1] = target(trail[1], cv.width, cv.height);
    cur = 0;
    prevKey = "";
  }

  function render(el, dt, still) {
    var win = dt * SHUT;
    var gi;
    var i;
    var xs = [];
    var maxD = 0;
    var x0;
    for (gi = 0; gi < groups.length; gi++) {
      xs[gi] = still ? 0 : pos(groups[gi], el);
      x0 = still ? 0 : pos(groups[gi], el - win);
      maxD = Math.max(maxD, Math.abs(xs[gi] - x0));
    }
    var n = Math.max(1, Math.min(MAXN, Math.ceil((maxD * sc) / 3) + 1));
    if (n > 1) lastMove = el;
    var idle = n === 1 && el - lastMove > TAU * 1000 * 3;
    var key = cv.width + "|" + xs.join(",");
    // Skip the redraw when the logo is parked and the canvas size has not changed.
    if (idle && key === prevKey) return;
    prevKey = key;

    var nxt = 1 - cur;
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, trail[nxt].f);
    gl.viewport(0, 0, cv.width, cv.height);
    gl.useProgram(fProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, trail[cur].t);
    gl.uniform1i(uF.prev, 0);
    gl.uniform2f(uF.px, 1 / cv.width, 1 / cv.height);
    gl.uniform1f(uF.decay, still ? 0 : Math.exp(-dt / (TAU * 1000)));
    drawQuad(fProg);

    // Stack a few sub-frame positions to get the motion blur while the logo moves.
    if (n > 1 && !still) {
      geoSetup();
      gl.uniform4f(uG.color, 1, 1, 1, 1);
      for (i = 0; i < n; i++) {
        var te = el - win * (i / (n - 1));
        for (gi = 0; gi < groups.length; gi++) {
          drawGroup(groups[gi], pos(groups[gi], te));
        }
      }
    }
    cur = nxt;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cv.width, cv.height);
    gl.useProgram(dProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, trail[cur].t);
    gl.uniform1i(uD.trail, 0);
    gl.uniform3f(uD.bg, BG[0], BG[1], BG[2]);
    gl.uniform2f(uD.px, 1 / cv.width, 1 / cv.height);
    gl.uniform1f(uD.r, Math.max(1.5, STROKE * sc));
    drawQuad(dProg);

    geoSetup();
    gl.enable(gl.BLEND);
    if (n === 1) {
      gl.blendFunc(gl.ONE, gl.ZERO);
      gl.uniform4f(uG.color, 1, 1, 1, 1);
      for (gi = 0; gi < groups.length; gi++) drawGroup(groups[gi], xs[gi]);
    } else {
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
      gl.uniform4f(uG.color, 1, 1, 1, 1 / n);
      for (i = 0; i < n; i++) {
        var tw = el - win * (i / (n - 1));
        for (gi = 0; gi < groups.length; gi++) {
          drawGroup(groups[gi], pos(groups[gi], tw));
        }
      }
    }
    gl.disable(gl.BLEND);
  }

  svg.parentNode.insertBefore(cv, svg);
  resize();
  svg.style.display = "none";

  var lose = gl.getExtension("WEBGL_lose_context");
  var raf = 0;
  var still = null;

  function cleanup() {
    window.removeEventListener("resize", resize);
    if (still) window.removeEventListener("resize", still);
    if (raf) cancelAnimationFrame(raf);
    cv.remove();
    svg.style.display = "";
    if (lose) lose.loseContext();
  }

  var reduce =
    window.matchMedia &&
    matchMedia("(prefers-reduced-motion:reduce)").matches;
  // Respect reduced motion by drawing a single still frame.
  if (reduce) {
    still = function () {
      resize();
      render(0, 16, true);
    };
    still();
    window.addEventListener("resize", still);
    return cleanup;
  }

  window.addEventListener("resize", resize);
  var start = performance.now();
  var last = 0;

  function frame(now) {
    // Clamp dt so returning from a background tab does not leave a long smear.
    var dt = last ? Math.min(now - last, 34) : 16.7;
    last = now;
    render(now - start, dt, false);
    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);

  return cleanup;
}
