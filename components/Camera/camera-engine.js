// Camera: webcam background, red mono glitch, aurora, OpenCV blobs, TF.js hand/eye tracking.
var cvPromise = null;

export function initCamera() {
  var btn = document.getElementById("cam");
  var lg = document.getElementById("lg");
  var video = document.getElementById("vid");
  var fx = document.getElementById("fx");
  var ov = document.getElementById("ov");
  if (!btn || !lg || !video || !fx || !ov) return;

  var fc = fx.getContext("2d");
  var oc = ov.getContext("2d");
  var sc = document.createElement("canvas");
  var sx = sc.getContext("2d", { willReadFrequently: true });
  var W = 480;
  var H = 270;
  var HW = 240;
  var HH = 135;
  var stream = null;
  var run = false;
  var prev;
  var gr;
  var mo;
  var aur;
  var cur;
  var mask;
  var kS = 0.1;
  var kT = 0.1;
  var hand = null;
  var noHand = 99;
  var lastHandT = 0;
  var blobs = [];
  var detector = null;
  var cv = null;
  var cvOk = false;
  var fr = 0;
  var hb = false;
  var cvM = {};
  var loaded = false;
  var fdet = null;
  var fb = false;
  var eye = null;
  var eyeT = null;
  var noFace = 99;
  var gb = [];
  var tt = 0;
  var wx = new Float32Array(W);
  var jx = new Int8Array(W);
  var scan = null;
  var t0 = 0;
  var lastBlobN = -1;
  var hadHand = false;
  var hadEye = false;
  var ignL = false;
  var RIGHT = "Right";
  var FN = ["THUMB", "INDEX", "MIDDLE", "RING", "PINKY"];
  var FI = [4, 8, 12, 16, 20];
  var CH = [
    [0, 1, 2, 3, 4],
    [0, 5, 6, 7, 8],
    [0, 9, 10, 11, 12],
    [0, 13, 14, 15, 16],
    [0, 17, 18, 19, 20],
  ];
  var rafId = 0;
  var disposed = false;

  var LOGMAX = 10;

  function log(t) {
    var d = document.createElement("div");
    var s = ((performance.now() - t0) / 1000).toFixed(1);
    d.textContent = "[" + (s.length < 5 ? "0" : "") + s + "s] " + t;
    lg.appendChild(d);
    while (lg.childNodes.length > LOGMAX) lg.removeChild(lg.firstChild);
  }

  function fit() {
    ov.width = innerWidth;
    ov.height = innerHeight;
    buildScan();
  }

  function buildScan() {
    var w = ov.width;
    var h = ov.height;
    scan = document.createElement("canvas");
    scan.width = w;
    scan.height = h;
    var c = scan.getContext("2d");
    var y;
    var g;
    for (y = 0; y < h; y += 3) {
      c.fillStyle = "rgba(0,0,0,.34)";
      c.fillRect(0, y, w, 1);
      c.fillStyle = "rgba(0,0,0,.12)";
      c.fillRect(0, y + 1, w, 1);
    }
    g = c.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.38,
      w / 2,
      h / 2,
      Math.hypot(w, h) * 0.62
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,.55)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }

  window.addEventListener("resize", fit);

  function loadJS(src) {
    return new Promise(function (r) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = r;
      s.onerror = r;
      document.head.appendChild(s);
    });
  }

  // OpenCV is a classic script so its Emscripten runtime can initialize normally.
  function loadCV() {
    if (cvPromise) return cvPromise;
    if (window.cv) {
      cvPromise = Promise.resolve();
    } else {
      cvPromise = loadJS("/vendor/opencv.js");
    }
    return cvPromise.then(function () {
      return new Promise(function (res) {
        if (typeof window.cv === "undefined") return res();
        if (typeof window.cv.then === "function") {
          window.cv.then(function (c) {
            window.cv = c;
            res();
          });
        } else if (window.cv.Mat) {
          res();
        } else {
          window.cv.onRuntimeInitialized = res;
        }
      });
    });
  }

  // Only the tfjs runtime is used; next.config.ts aliases the unused MediaPipe peers.
  async function loadTF() {
    var tf = await import("@tensorflow/tfjs-core");
    await import("@tensorflow/tfjs-converter");
    await import("@tensorflow/tfjs-backend-webgl");
    await tf.setBackend("webgl");
    await tf.ready();
    var handPoseDetection = await import(
      "@tensorflow-models/hand-pose-detection"
    );
    detector = await handPoseDetection.createDetector(
      handPoseDetection.SupportedModels.MediaPipeHands,
      {
        runtime: "tfjs",
        modelType: "lite",
        maxHands: 2,
        detectorModelUrl: "/models/hand-detector/model.json",
        landmarkModelUrl: "/models/hand-landmark/model.json",
      }
    );
  }

  async function loadModels() {
    if (loaded) return;
    loaded = true;
    log("loading opencv.js (blob tracker)...");
    try {
      await loadCV();
      cv = window.cv;
      cvOk = !!(cv && cv.Mat);
    } catch (e) {}
    log(
      cvOk
        ? "opencv ready -> blob tracking online"
        : "opencv failed -> blob tracking offline"
    );
    log("loading hand model (mediapipe hands / tfjs webgl)...");
    try {
      await loadTF();
      log("hand model ready -> 5 finger tracking online (right hand only)");
    } catch (e) {
      log("hand model failed");
    }
    log("loading eye model (face landmarks / refineLandmarks)...");
    try {
      var faceLandmarksDetection = await import(
        "@tensorflow-models/face-landmarks-detection"
      );
      fdet = await faceLandmarksDetection.createDetector(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        {
          runtime: "tfjs",
          refineLandmarks: true,
          maxFaces: 1,
          landmarkModelUrl: "/models/face-mesh/model.json",
          detectorModelUrl: "/models/face-detector/model.json",
        }
      );
      log("eye model ready -> eye tracking online");
    } catch (e) {
      log("eye model failed");
    }
  }

  async function start() {
    btn.disabled = true;
    t0 = performance.now();
    lg.textContent = "";
    log("requesting camera permission...");
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    } catch (e) {
      log("camera permission denied");
      btn.disabled = false;
      return;
    }
    if (disposed) {
      stream.getTracks().forEach(function (t) {
        t.stop();
      });
      stream = null;
      return;
    }
    video.srcObject = stream;
    await video.play();
    H = Math.round((W * video.videoHeight) / video.videoWidth) || 270;
    HW = W >> 1;
    HH = H >> 1;
    sc.width = fx.width = W;
    sc.height = fx.height = H;
    prev = new Uint8ClampedArray(W * H);
    gr = new Uint8Array(W * H);
    mo = new Uint8Array(W * H);
    aur = new Float32Array(W * H);
    cur = new Float32Array(W * H);
    mask = new Uint8Array(HW * HH);
    document.body.classList.add("cam");
    fit();
    fx.style.display = ov.style.display = "block";
    btn.textContent = "Close camera";
    btn.disabled = false;
    run = true;
    log(
      "camera online " +
        video.videoWidth +
        "x" +
        video.videoHeight +
        " -> " +
        W +
        "x" +
        H
    );
    rafId = requestAnimationFrame(loop);
    loadModels();
  }

  function stop() {
    run = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (stream)
      stream.getTracks().forEach(function (t) {
        t.stop();
      });
    stream = null;
    document.body.classList.remove("cam");
    fx.style.display = ov.style.display = "none";
    btn.textContent = "Open camera";
    blobs = [];
    hand = null;
    eye = null;
    eyeT = null;
    noFace = 99;
    gb = [];
    lastBlobN = -1;
    hadHand = false;
    hadEye = false;
    ignL = false;
    lg.textContent = "";
  }

  function onToggle() {
    run ? stop() : start();
  }

  btn.addEventListener("click", onToggle);

  var hint = document.getElementById("hint");
  var hs = hint && hint.firstElementChild;

  function fitHint() {
    if (!hint || !hs) return;
    var bw = btn.getBoundingClientRect().width;
    hint.style.fontSize = "10px";
    var tw = hs.getBoundingClientRect().width;
    if (bw && tw) hint.style.fontSize = ((10 * bw) / tw).toFixed(3) + "px";
  }

  var ro = null;
  if (window.ResizeObserver) {
    ro = new ResizeObserver(fitHint);
    ro.observe(btn);
  }
  window.addEventListener("resize", fitHint);
  window.addEventListener("load", fitHint);
  fitHint();

  function track() {
    try {
      if (cvM.n !== HW * HH) {
        ["m", "b", "d", "c", "h", "k"].forEach(function (x) {
          if (cvM[x]) cvM[x].delete();
        });
        cvM.n = HW * HH;
        cvM.m = new cv.Mat(HH, HW, cv.CV_8UC1);
        cvM.b = new cv.Mat();
        cvM.d = new cv.Mat();
        cvM.c = new cv.MatVector();
        cvM.h = new cv.Mat();
        cvM.k = cv.getStructuringElement(
          cv.MORPH_ELLIPSE,
          new cv.Size(5, 5)
        );
      }
      var x;
      var y;
      var i = 0;
      var bt = 26 - kS * 8;
      for (y = 0; y < HH; y++) {
        for (x = 0; x < HW; x++) {
          mask[i++] = mo[y * 2 * W + x * 2] > bt ? 255 : 0;
        }
      }
      cvM.m.data.set(mask);
      cv.medianBlur(cvM.m, cvM.b, 3);
      cv.dilate(cvM.b, cvM.d, cvM.k);
      cv.findContours(
        cvM.d,
        cvM.c,
        cvM.h,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_SIMPLE
      );
      var det = [];
      var c;
      var r;
      var ar;
      for (i = 0; i < cvM.c.size(); i++) {
        c = cvM.c.get(i);
        ar = cv.contourArea(c);
        if (ar > 25) {
          r = cv.boundingRect(c);
          det.push({ x: r.x * 2, y: r.y * 2, w: r.width * 2, h: r.height * 2, a: ar });
        }
        c.delete();
      }
      det.sort(function (p, q) {
        return q.a - p.a;
      });
      match(det.slice(0, 6));
    } catch (e) {
      cvOk = false;
    }
  }

  function match(det) {
    blobs.forEach(function (b) {
      b.hit = false;
    });
    det.forEach(function (d) {
      var best = null;
      var bd = 90;
      var cx = d.x + d.w / 2;
      var cy = d.y + d.h / 2;
      blobs.forEach(function (b) {
        if (b.hit) return;
        var q = Math.hypot(b.tx + b.tw / 2 - cx, b.ty + b.th / 2 - cy);
        if (q < bd) {
          bd = q;
          best = b;
        }
      });
      if (best) {
        best.tx = d.x;
        best.ty = d.y;
        best.tw = d.w;
        best.th = d.h;
        best.hit = true;
        best.age = 0;
        best.a = d.a;
      } else {
        blobs.push({
          x: d.x,
          y: d.y,
          w: d.w,
          h: d.h,
          tx: d.x,
          ty: d.y,
          tw: d.w,
          th: d.h,
          hit: true,
          age: 0,
          a: d.a,
        });
      }
    });
    blobs.forEach(function (b) {
      if (!b.hit) b.age++;
    });
    blobs = blobs.filter(function (b) {
      return b.age < 5;
    });
    blobs.sort(function (p, q) {
      return q.a - p.a;
    });
  }

  function loop() {
    if (!run) return;
    rafId = requestAnimationFrame(loop);
    if (video.readyState < 2) return;
    fr++;
    tt += 0.05;
    // Mirror the frame once; both detectors use this canvas as-is.
    sx.save();
    sx.translate(W, 0);
    sx.scale(-1, 1);
    sx.drawImage(video, 0, 0, W, H);
    sx.restore();
    var im = sx.getImageData(0, 0, W, H);
    var d = im.data;
    var n = W * H;
    var k = kS;
    var i;
    var p;
    var g;
    var m;
    var x;
    var y;
    var e;
    var a;
    var s;
    var s2;
    var v;
    var A;
    for (i = 0; i < n; i++) {
      p = i * 4;
      g = d[p] * 0.3 + d[p + 1] * 0.59 + d[p + 2] * 0.11;
      gr[i] = g;
      m = g - prev[i];
      mo[i] = m < 0 ? -m : m;
      prev[i] = g;
    }

    var oo = 1 + ((k * 2.2) | 0);
    var th = 26 - k * 14;
    var gn = 1.3 + k * 1.7;
    var dec = 0.72 + k * 0.06;
    var rise = 0.9 + k * 0.07;
    for (x = 0; x < W; x++) {
      wx[x] = 0.8 + 0.2 * Math.sin(x * 0.06 + tt);
      jx[x] = ((Math.random() * 3) | 0) - 1;
    }
    for (y = H - 1; y >= 0; y--) {
      for (x = 0; x < W; x++) {
        i = y * W + x;
        e = 0;
        if (x >= oo && x < W - oo && y >= oo && y < H - oo) {
          e = gr[i + oo] - gr[i - oo];
          if (e < 0) e = -e;
          a = gr[i + oo * W] - gr[i - oo * W];
          e += a < 0 ? -a : a;
          e = e > th ? (e - th) * gn : 0;
        }
        s = mo[i] > 12 ? (mo[i] - 12) * 5 : 0;
        if (e > s) s = e;
        a = s;
        if (y < H - 1) {
          s2 = cur[i + W + jx[x]] * rise;
          if (s2 > a) a = s2;
        }
        if (a > 255) a = 255;
        cur[i] = a;
        s2 = aur[i] * dec;
        if (a < s2) a = s2;
        aur[i] = a;
        p = i * 4;
        v = (gr[i] - 110) * (1.4 + k) + 70 + (Math.random() - 0.5) * 90 * k;
        v *= y & 1 ? 1 : 0.84;
        A = a * wx[x] * (1 + k * 1.2);
        d[p] = v + A;
        d[p + 1] = d[p + 2] = v - A * 0.85;
      }
    }
    fc.putImageData(im, 0, 0);

    var ns = (1 + k * 29) | 0;
    var h;
    var dx;
    var nb = 1 + ((k * 5) | 0);
    var bi;
    for (i = 0; i < ns; i++) {
      if (Math.random() < 0.3 + k * 0.65) {
        y = (Math.random() * H) | 0;
        h = (2 + Math.random() * (8 + k * 60)) | 0;
        dx = ((Math.random() - 0.5) * (20 + k * 420)) | 0;
        fc.drawImage(fx, 0, y, W, h, dx, y, W, h);
      }
    }
    for (bi = 0; bi < nb; bi++) {
      if (Math.random() < 0.1 + k * 0.85) {
        var bw = (20 + Math.random() * (40 + k * 200)) | 0;
        var bh = (10 + Math.random() * (30 + k * 40)) | 0;
        var bx = (Math.random() * (W - bw)) | 0;
        var by = (Math.random() * (H - bh)) | 0;
        fc.drawImage(
          fx,
          bx,
          by,
          bw,
          bh,
          bx + (Math.random() - 0.5) * (60 + k * 400),
          by + (Math.random() - 0.5) * (20 + k * 120),
          bw,
          bh
        );
      }
    }
    if (Math.random() < k * 0.6) {
      fc.fillStyle = "rgba(255,0,0," + (0.25 + Math.random() * 0.5) + ")";
      fc.fillRect(0, Math.random() * H, W, 1 + Math.random() * (2 + k * 8));
    }
    if (gb.length < 4 + ((k * 6) | 0) && Math.random() < 0.04 + k * 0.56) {
      var gw = (24 + Math.random() * (50 + k * 140)) | 0;
      var gh = (12 + Math.random() * (30 + k * 40)) | 0;
      gb.push({
        x: Math.random() * (W - gw),
        y: Math.random() * (H - gh),
        w: gw,
        h: gh,
        vx: (Math.random() - 0.5) * (10 + k * 50),
        l: 1,
      });
    }
    gb.forEach(function (b) {
      b.x += b.vx;
      b.vx *= 0.9;
      b.l -= 0.045;
      fc.drawImage(
        fx,
        b.x | 0,
        b.y | 0,
        b.w,
        b.h,
        (b.x + b.vx * 2) | 0,
        b.y | 0,
        b.w,
        b.h
      );
      fc.fillStyle = "rgba(255,0,0," + 0.22 * Math.max(0, b.l) + ")";
      fc.fillRect(b.x | 0, b.y | 0, b.w, b.h);
    });
    gb = gb.filter(function (b) {
      return b.l > 0;
    });

    if (cvOk && fr % 2 === 0) track();
    if (detector && !hb && fr % 2 === 0) {
      hb = true;
      detector
        .estimateHands(sc, { flipHorizontal: false })
        .then(function (r) {
          var R = null;
          var L = false;
          var j;
          var h;
          // Keep the strongest right hand and remember if a left hand was seen.
          for (j = 0; j < r.length; j++) {
            h = r[j];
            if (h.score !== undefined && h.score <= 0.75) continue;
            if (h.handedness === undefined || h.handedness === RIGHT) {
              if (!R || (h.score || 0) > (R.score || 0)) R = h;
            } else {
              L = true;
            }
          }
          var okH = false;
          if (R) {
            var kp = R.keypoints;
            var t = [];
            var q;
            var f;
            var ins = 0;
            for (j = 0; j < 5; j++) {
              q = kp[FI[j]];
              if (!q) continue;
              f = q.x >= 0 && q.x <= W && q.y >= 0 && q.y <= H;
              if (f) ins++;
              t.push({ n: FN[j], x: q.x, y: q.y, i: f });
            }
            if (
              t.length === 5 &&
              kp[17] &&
              kp[0] &&
              kp[9] &&
              Math.hypot(kp[0].x - kp[9].x, kp[0].y - kp[9].y) > 8
            ) {
              var ord = t.slice().sort(function (u, w) {
                return (
                  Math.hypot(w.x - kp[17].x, w.y - kp[17].y) -
                  Math.hypot(u.x - kp[17].x, u.y - kp[17].y)
                );
              });
              var th = t[0];
              var ix = t[1];
              if (
                (ord[0] === th || ord[1] === th) &&
                th.i &&
                ix.i &&
                Math.hypot(th.x - ix.x, th.y - ix.y) > 2
              ) {
                hand = { kp: kp, t: t, a: th, b: ix, s: R.score, c: ins };
                okH = true;
                noHand = 0;
                lastHandT = performance.now();
                ignL = false;
                kT = Math.min(
                  1,
                  Math.max(
                    0,
                    (Math.hypot(th.x - ix.x, th.y - ix.y) / H - 0.02) / 0.26
                  )
                );
              }
            }
          } else if (L && !ignL) {
            ignL = true;
            log("Left hand / non-right object ignored");
          }
          if (!okH && ++noHand > 2) {
            hand = null;
            kT = 0.1;
          }
          hb = false;
        })
        .catch(function () {
          hb = false;
        });
    }
    if (hand && performance.now() - lastHandT > 250) {
      hand = null;
      kT = 0.1;
    }
    if (fdet && !fb && fr % 2 === 1) {
      fb = true;
      fdet
        .estimateFaces(sc, { flipHorizontal: false })
        .then(function (r) {
          if (r.length) {
            var kp = r[0].keypoints;
            // Eye corners are 33/133; 159/145 sit above and below the iris.
            var a = kp[33];
            var b = kp[133];
            var u = kp[159];
            var l = kp[145];
            if (a && b && u && l) {
              var w = Math.hypot(a.x - b.x, a.y - b.y) * 1.5;
              var h = Math.max(Math.hypot(u.x - l.x, u.y - l.y) * 3, w * 0.45);
              eyeT = {
                x: (a.x + b.x) / 2 - w / 2,
                y: (u.y + l.y) / 2 - h / 2,
                w: w,
                h: h,
              };
              noFace = 0;
            }
          } else if (++noFace > 12) {
            eyeT = null;
          }
          fb = false;
        })
        .catch(function () {
          fb = false;
        });
    }
    kS += (kT - kS) * 0.15;
    blobs.forEach(function (b) {
      b.x += (b.tx - b.x) * 0.45;
      b.y += (b.ty - b.y) * 0.45;
      b.w += (b.tw - b.w) * 0.45;
      b.h += (b.th - b.h) * 0.45;
    });
    if (eyeT) {
      if (!eye) eye = { x: eyeT.x, y: eyeT.y, w: eyeT.w, h: eyeT.h };
      else {
        eye.x += (eyeT.x - eye.x) * 0.5;
        eye.y += (eyeT.y - eye.y) * 0.5;
        eye.w += (eyeT.w - eye.w) * 0.5;
        eye.h += (eyeT.h - eye.h) * 0.5;
      }
    } else {
      eye = null;
    }

    var cw = ov.width;
    var ch = ov.height;
    var sS = Math.max(cw / W, ch / H);
    var ox = (cw - W * sS) / 2;
    var oy = (ch - H * sS) / 2;
    oc.clearRect(0, 0, cw, ch);
    oc.lineWidth = 1;
    oc.font = "12px monospace";
    oc.lineWidth = 1;

    if (scan) oc.drawImage(scan, 0, 0);
    var by0 = ((fr * 1.6) % (ch + 160)) - 160;
    var rg = oc.createLinearGradient(0, by0, 0, by0 + 160);
    rg.addColorStop(0, "rgba(255,255,255,0)");
    rg.addColorStop(0.5, "rgba(255,255,255,.045)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    oc.fillStyle = rg;
    oc.fillRect(0, by0, cw, 160);

    function sxp(b) {
      return (ox + b.x * sS).toFixed(2);
    }
    function syp(b) {
      return (oy + b.y * sS).toFixed(2);
    }
    if (blobs.length !== lastBlobN && cvOk) {
      lastBlobN = blobs.length;
      log("blob count -> " + blobs.length);
    }
    if (cvOk && blobs.length && fr % 20 === 0) {
      var b1 = blobs[0];
      var c1x = b1.x + b1.w / 2;
      var c1y = b1.y + b1.h / 2;
      blobs.forEach(function (b, j) {
        var rel = j
          ? "dist->Blob 1 " +
            Math.hypot(b.x + b.w / 2 - c1x, b.y + b.h / 2 - c1y).toFixed(1) +
            "px"
          : "anchor";
        log(
          "Blob " +
            (j + 1) +
            "  x:" +
            sxp(b) +
            " y:" +
            syp(b) +
            "  w:" +
            (b.w * sS).toFixed(0) +
            " h:" +
            (b.h * sS).toFixed(0) +
            "  area:" +
            b.a.toFixed(0) +
            "  " +
            rel
        );
      });
    }
    if (hand && !hadHand) {
      hadHand = true;
      log(
        "Right hand detected  score:" +
          (hand.s || 0).toFixed(2) +
          "  fingers:" +
          hand.c +
          "/5"
      );
    }
    if (!hand && hadHand) {
      hadHand = false;
      log("Right hand lost");
    }
    if (hand && fr % 20 === 10) {
      log(
        "Fingers  " +
          hand.t
            .map(function (q) {
              return (
                q.n +
                ":(" +
                (ox + q.x * sS).toFixed(0) +
                "," +
                (oy + q.y * sS).toFixed(0) +
                ")"
              );
            })
            .join(" ")
      );
      log("Pinch  THUMB<->INDEX  FX " + ((kS * 100) | 0) + "%");
    }
    if (eye && !hadEye) {
      hadEye = true;
      log("Eye locked");
    }
    if (!eye && hadEye) {
      hadEye = false;
      log("Eye lost");
    }
    if (eye && fr % 40 === 30) {
      log(
        "Eye   x:" +
          sxp(eye) +
          " y:" +
          syp(eye) +
          "  w:" +
          (eye.w * sS).toFixed(0) +
          " h:" +
          (eye.h * sS).toFixed(0)
      );
    }

    if (blobs.length > 1) {
      oc.strokeStyle = "rgba(255,255,255,.55)";
      oc.beginPath();
      blobs.forEach(function (b, j) {
        var X = ox + (b.x + b.w / 2) * sS;
        var Y = oy + (b.y + b.h / 2) * sS;
        j ? oc.lineTo(X, Y) : oc.moveTo(X, Y);
      });
      if (blobs.length > 2) oc.closePath();
      oc.stroke();
    }
    function box(b, col, tag) {
      var X = ox + b.x * sS;
      var Y = oy + b.y * sS;
      var w = b.w * sS;
      var h = b.h * sS;
      oc.strokeStyle = col;
      oc.strokeRect(X + 0.5, Y + 0.5, w, h);
      oc.fillStyle = "#f00";
      oc.fillRect(X - 2, Y - 2, 5, 5);
      oc.fillRect(X + w - 2, Y + h - 2, 5, 5);
      oc.fillStyle = "#fff";
      oc.fillText(tag + X.toFixed(2) + ", " + Y.toFixed(2), X + w + 6, Y + 12);
    }
    blobs.forEach(function (b, j) {
      box(b, j ? "#fff" : "#f00", "");
    });
    if (eye) box(eye, "#fff", "EYE ");
    if (hand) {
      var ax = ox + hand.a.x * sS;
      var ay = oy + hand.a.y * sS;
      var bx2 = ox + hand.b.x * sS;
      var by2 = oy + hand.b.y * sS;
      oc.strokeStyle = "rgba(255,255,255,.3)";
      oc.lineWidth = 1;
      CH.forEach(function (c) {
        oc.beginPath();
        c.forEach(function (id, j) {
          var P = hand.kp[id];
          var X = ox + P.x * sS;
          var Y = oy + P.y * sS;
          j ? oc.lineTo(X, Y) : oc.moveTo(X, Y);
        });
        oc.stroke();
      });
      oc.font = "10px ui-monospace,Menlo,Consolas,monospace";
      hand.t.forEach(function (q) {
        var X = ox + q.x * sS;
        var Y = oy + q.y * sS;
        oc.fillStyle = q === hand.a || q === hand.b ? "#f00" : "#fff";
        oc.beginPath();
        oc.arc(X, Y, 3, 0, 6.2832);
        oc.fill();
        oc.fillStyle = "#fff";
        oc.fillText(q.n, X + 8, Y + 3);
      });
      oc.font = "12px monospace";
      oc.strokeStyle = "#f00";
      oc.lineWidth = 2;
      oc.beginPath();
      oc.moveTo(ax, ay);
      oc.lineTo(bx2, by2);
      oc.stroke();
      oc.lineWidth = 1;
      oc.fillStyle = "#f00";
      oc.fillText("FX " + ((kS * 100) | 0) + "%", (ax + bx2) / 2 + 10, (ay + by2) / 2);
    }
  }

  function cleanup() {
    disposed = true;
    stop();
    btn.removeEventListener("click", onToggle);
    window.removeEventListener("resize", fit);
    window.removeEventListener("resize", fitHint);
    window.removeEventListener("load", fitHint);
    if (ro) ro.disconnect();
    if (detector && detector.dispose) detector.dispose();
    if (fdet && fdet.dispose) fdet.dispose();
    detector = null;
    fdet = null;
    video.pause();
    video.srcObject = null;
    document.body.classList.remove("cam");
    lg.textContent = "";
  }

  return cleanup;
}
