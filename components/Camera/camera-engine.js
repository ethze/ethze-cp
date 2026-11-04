// Camera: webcam background, red mono glitch, aurora, OpenCV blobs, MediaPipe hand/eye tracking.
var cvPromise = null;

export function initCamera() {
  var btn = document.getElementById("cam");
  var lg = document.getElementById("lg");
  var video = document.getElementById("vid");
  var fx = document.getElementById("fx");
  var ov = document.getElementById("ov");
  var loadBox = document.getElementById("cam-loadbox");
  var loadBar = document.getElementById("cam-loadbar");
  var loadLabel = document.getElementById("cam-loadlabel");
  var loadPct = document.getElementById("cam-loadpct");
  if (!btn || !lg || !video || !fx || !ov) return;

  var fc = fx.getContext("2d", { willReadFrequently: true });
  var oc = ov.getContext("2d");
  var sc = document.createElement("canvas");
  var sx = sc.getContext("2d", { willReadFrequently: true });
  var wingsCv = document.createElement("canvas");
  var wc = wingsCv.getContext("2d");
  var segCv = document.createElement("canvas");
  var segCtx = segCv.getContext("2d");
  var hasSegMask = false;
  var wingGlCv = document.createElement("canvas");
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
  var pdet = null;
  var pb = false;
  var pose = null;
  var poseT = null;
  var noPose = 99;
  var hadPose = false;
  var wingRenderer = null;
  var wingScene = null;
  var wingCam = null;
  var wingRoot = null;
  var leftWingPivot = null;
  var rightWingPivot = null;
  var wingRimLight = null;
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
  }

  window.addEventListener("resize", fit);

  function yieldTick(ms) {
    return new Promise(function (res) {
      setTimeout(res, ms || 20);
    });
  }

  var modelsPromise = null;
  var currentProgress = 0;

  function setProgress(pct, label) {
    if (pct > currentProgress) currentProgress = pct;
    if (loadBar) loadBar.style.width = currentProgress + "%";
    if (loadPct) loadPct.textContent = currentProgress + "%";
    if (label && loadLabel && loadLabel.firstElementChild) {
      loadLabel.firstElementChild.textContent = label;
    }
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        if (existing.getAttribute("data-loaded") === "1") {
          resolve();
          return;
        }
        existing.addEventListener("load", function () {
          resolve();
        });
        existing.addEventListener("error", function () {
          reject(new Error("Failed to load " + src));
        });
        return;
      }
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.crossOrigin = "anonymous";
      s.addEventListener("load", function () {
        s.setAttribute("data-loaded", "1");
        resolve();
      });
      s.addEventListener("error", function () {
        reject(new Error("Failed to load " + src));
      });
      document.body.appendChild(s);
    });
  }

  function loadModels() {
    if (modelsPromise) return modelsPromise;

    modelsPromise = (async function () {
      setProgress(10, "INITIALIZING...");
      await yieldTick(30);

      // Motion blob engine is instant pure JS
      cvOk = true;
      log("blob tracking online");
      setProgress(30, "BLOB ENGINE READY");
      await yieldTick(30);

      // MediaPipe Hands WASM runtime (sequential init avoids global WASM loader collision)
      setProgress(55, "LOADING MEDIAPIPE HANDS...");
      try {
        if (!window.Hands) {
          await loadScript("/vendor/hands/hands.js");
        }
        var mpHands = new window.Hands({
          locateFile: function (file) {
            return "/vendor/hands/" + file;
          },
        });
        mpHands.setOptions({
          modelComplexity: 0,
          selfieMode: false,
          maxNumHands: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        var latestHands = [];
        mpHands.onResults(function (results) {
          var w = (results.image && results.image.width) || W;
          var h = (results.image && results.image.height) || H;
          var out = [];
          if (results.multiHandLandmarks && results.multiHandedness) {
            for (var i = 0; i < results.multiHandLandmarks.length; i++) {
              var lms = results.multiHandLandmarks[i];
              var hd = results.multiHandedness[i] || {};
              var kp = new Array(lms.length);
              for (var k = 0; k < lms.length; k++) {
                kp[k] = {
                  x: lms[k].x * w,
                  y: lms[k].y * h,
                };
              }
              out.push({
                keypoints: kp,
                score: hd.score,
                handedness: hd.label,
              });
            }
          }
          latestHands = out;
        });
        await mpHands.initialize();
        detector = {
          estimateHands: async function (input) {
            await mpHands.send({ image: input });
            return latestHands;
          },
          dispose: function () {
            mpHands.close();
          },
        };
        log("mediapipe hands ready -> 5 finger tracking online (right hand only)");
      } catch (e) {
        log("hand model failed");
      }
      await yieldTick(20);

      // MediaPipe FaceMesh WASM runtime
      setProgress(70, "LOADING MEDIAPIPE FACE...");
      try {
        if (!window.FaceMesh) {
          await loadScript("/vendor/face_mesh/face_mesh.js");
        }
        var mpFace = new window.FaceMesh({
          locateFile: function (file) {
            return "/vendor/face_mesh/" + file;
          },
        });
        mpFace.setOptions({
          refineLandmarks: true,
          selfieMode: false,
          maxNumFaces: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        var latestFaces = [];
        mpFace.onResults(function (results) {
          var w = (results.image && results.image.width) || W;
          var h = (results.image && results.image.height) || H;
          var out = [];
          if (results.multiFaceLandmarks) {
            for (var i = 0; i < results.multiFaceLandmarks.length; i++) {
              var lms = results.multiFaceLandmarks[i];
              var kp = new Array(lms.length);
              for (var k = 0; k < lms.length; k++) {
                kp[k] = {
                  x: lms[k].x * w,
                  y: lms[k].y * h,
                };
              }
              out.push({ keypoints: kp });
            }
          }
          latestFaces = out;
        });
        await mpFace.initialize();
        fdet = {
          estimateFaces: async function (input) {
            await mpFace.send({ image: input });
            return latestFaces;
          },
          dispose: function () {
            mpFace.close();
          },
        };
        log("mediapipe face ready -> eye tracking online");
      } catch (e) {
        log("eye model failed");
      }
      await yieldTick(20);

      // MediaPipe Pose WASM runtime (shoulder tracking)
      setProgress(85, "LOADING MEDIAPIPE POSE...");
      try {
        if (!window.Pose) {
          await loadScript("/vendor/pose/pose.js");
        }
        var mpPose = new window.Pose({
          locateFile: function (file) {
            return "/vendor/pose/" + file;
          },
        });
        mpPose.setOptions({
          modelComplexity: 0,
          smoothLandmarks: true,
          enableSegmentation: true,
          smoothSegmentation: true,
          selfieMode: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        var latestPose = null;
        var refSw = 0;
        var refRatio = 1.15;
        var wasBack = false;
        mpPose.onResults(function (results) {
          var w = (results.image && results.image.width) || W;
          var h = (results.image && results.image.height) || H;
          if (results.segmentationMask && segCtx) {
            if (segCv.width !== w || segCv.height !== h) {
              segCv.width = w;
              segCv.height = h;
            }
            segCtx.clearRect(0, 0, w, h);
            segCtx.drawImage(results.segmentationMask, 0, 0, w, h);
            // Boost mask opacity so the body/arms/hands silhouette is 100% solid
            segCtx.drawImage(segCv, 0, 0);
            segCtx.drawImage(segCv, 0, 0);
            hasSegMask = true;
          }
          var lms = results.poseLandmarks;
          var out = null;
          if (lms && lms[11] && lms[12]) {
            var v11 = lms[11].visibility === undefined ? 1 : lms[11].visibility;
            var v12 = lms[12].visibility === undefined ? 1 : lms[12].visibility;
            if (v11 > 0.35 && v12 > 0.35) {
              // s1 = anatomical Left Shoulder (11), s2 = anatomical Right Shoulder (12)
              var s1 = {
                x: lms[11].x * w,
                y: lms[11].y * h,
                z: lms[11].z || 0,
              };
              var s2 = {
                x: lms[12].x * w,
                y: lms[12].y * h,
                z: lms[12].z || 0,
              };
              var pL = s1.x < s2.x ? s1 : s2;
              var pR = s1.x < s2.x ? s2 : s1;
              var cx = (s1.x + s2.x) * 0.5;
              var cy = (s1.y + s2.y) * 0.5;

              var sw2d = Math.hypot(s1.x - s2.x, s1.y - s2.y);

              // Measure vertical neck/head distance (invariant to sideways rotation)
              var headDy = 0;
              var headIds = [0, 7, 8];
              var hy = 0;
              var hc = 0;
              for (var hi = 0; hi < headIds.length; hi++) {
                var hp = lms[headIds[hi]];
                if (hp && (hp.visibility === undefined || hp.visibility > 0.35)) {
                  hy += hp.y * h;
                  hc++;
                }
              }
              if (hc > 0) {
                hy /= hc;
                headDy = Math.abs(cy - hy);
              }

              // Calibrate reference shoulder width ONLY when facing front with full shoulder spread
              if (s1.x - s2.x > Math.max(28, headDy * 0.85)) {
                refSw = refSw > 0 ? refSw * 0.82 + sw2d * 0.18 : sw2d;
                if (headDy > 12) {
                  var rNow = sw2d / headDy;
                  refRatio = refRatio * 0.85 + rNow * 0.15;
                }
              }

              // Hold the calibrated frontal width when turning sideways or facing back, capped so it never inflates
              var holdSw = headDy > 12 ? headDy * refRatio : refSw;
              if (refSw > 0) {
                holdSw = Math.min(refSw, Math.max(refSw * 0.85, holdSw));
              }
              var sw = refSw > 0 ? Math.min(refSw, Math.max(sw2d, holdSw)) : sw2d;

              if (sw > 18) {
                // On the mirrored canvas, facing camera => s1.x > s2.x (dx > 0).
                // Facing backward (madep belakang) => s1.x < s2.x (dx < 0).
                var dx = s1.x - s2.x;
                if (!wasBack && dx < -sw * 0.08) {
                  wasBack = true;
                } else if (wasBack && dx > sw * 0.08) {
                  wasBack = false;
                }
                var isBack = wasBack;

                var roll = Math.max(
                  -0.65,
                  Math.min(0.65, Math.atan2(pR.y - pL.y, Math.max(24, pR.x - pL.x)))
                );
                // Smooth 3D yaw that tilts sideways without collapsing the wingspan, and flips 180 deg when facing back
                var sideTurn = Math.max(
                  -0.55,
                  Math.min(0.55, ((s1.z - s2.z) * w) / Math.max(30, sw) * 0.75)
                );
                var yaw = isBack ? Math.PI - sideTurn : sideTurn;

                var arms = [];
                var armPairs = [
                  [11, 13, 15, 19],
                  [12, 14, 16, 20],
                ];
                for (var ap = 0; ap < armPairs.length; ap++) {
                  var chain = [];
                  for (var ai = 0; ai < armPairs[ap].length; ai++) {
                    var pt = lms[armPairs[ap][ai]];
                    if (pt && (pt.visibility === undefined || pt.visibility > 0.35)) {
                      chain.push({ x: pt.x * w, y: pt.y * h });
                    }
                  }
                  if (chain.length >= 2) arms.push(chain);
                }
                out = {
                  cx: cx,
                  cy: cy,
                  sw: sw,
                  roll: roll,
                  yaw: yaw,
                  isBack: isBack,
                  pL: pL,
                  pR: pR,
                  arms: arms,
                };
              }
            }
          }
          latestPose = out;
        });
        await mpPose.initialize();
        pdet = {
          estimatePose: async function (input) {
            await mpPose.send({ image: input });
            return latestPose;
          },
          dispose: function () {
            mpPose.close();
          },
        };
        log("mediapipe pose ready -> shoulder & body mask online");
      } catch (e) {
        log("pose model failed");
      }

      // Three.js 3D Angel Wings (/models/angel_wings.glb)
      setProgress(94, "LOADING 3D ANGEL WINGS...");
      if (wingsCv) {
        try {
          var THREE = await import("three");
          var gltfMod = await import("three/examples/jsm/loaders/GLTFLoader.js");
          var GLTFLoader = gltfMod.GLTFLoader;

          wingRenderer = new THREE.WebGLRenderer({
            canvas: wingGlCv,
            alpha: true,
            antialias: true,
          });
          wingRenderer.setPixelRatio(1);
          wingRenderer.setClearColor(0x000000, 0);

          wingScene = new THREE.Scene();
          wingCam = new THREE.PerspectiveCamera(45, W / Math.max(1, H), 1, 5000);
          wingCam.position.set(0, 0, H / 2 / Math.tan((45 * Math.PI) / 360));
          wingRenderer.setSize(W, H, false);
          wingsCv.width = W;
          wingsCv.height = H;

          var amb = new THREE.AmbientLight(0xffffff, 0.38);
          wingScene.add(amb);

          var keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
          keyLight.position.set(160, 340, 380);
          wingScene.add(keyLight);

          var backLight = new THREE.DirectionalLight(0xffffff, 1.05);
          backLight.position.set(-160, 320, -380);
          wingScene.add(backLight);

          wingRimLight = new THREE.PointLight(0xff1a1a, 0.8, 1800);
          wingRimLight.position.set(0, 60, -160);
          wingScene.add(wingRimLight);

          var gltf = await new Promise(function (resolve, reject) {
            new GLTFLoader().load("/models/angel_wings.glb", resolve, undefined, reject);
          });

          wingRoot = new THREE.Group();
          wingRoot.rotation.order = "ZXY";
          wingRoot.visible = false;
          wingScene.add(wingRoot);

          var wingAssembly = new THREE.Group();
          // Rotate 180 deg around Y so the front of the wings faces the camera (+Z) when facing front
          wingAssembly.rotation.y = Math.PI;
          wingAssembly.position.set(0, 0.5, 0);
          wingRoot.add(wingAssembly);

          var posWing = gltf.scene.getObjectByName("polySurface2197");
          var negWing = gltf.scene.getObjectByName("polySurface2631");

          gltf.scene.traverse(function (child) {
            if (child.isMesh && child.material) {
              child.material.side = THREE.DoubleSide;
              child.material.depthWrite = true;
              if (child.material.emissive) {
                child.material.emissive.setHex(0x000000);
                child.material.emissiveIntensity = 0;
              }
              if (child.material.color) {
                child.material.color.setHex(0xb5b5b5);
              }
              if (child.material.roughness !== undefined) {
                child.material.roughness = 0.78;
              }
              if (child.material.metalness !== undefined) {
                child.material.metalness = 0.12;
              }
              if (child.material.transparent) {
                child.material.alphaTest = 0.08;
              }
              child.material.needsUpdate = true;
            }
          });

          rightWingPivot = new THREE.Group();
          leftWingPivot = new THREE.Group();

          if (posWing && negWing) {
            rightWingPivot.position.set(0.75, 0, 0);
            posWing.position.set(-0.75, -16.4, -0.4);
            rightWingPivot.add(posWing);

            leftWingPivot.position.set(-0.75, 0, 0);
            negWing.position.set(0.75, -16.4, -0.4);
            leftWingPivot.add(negWing);

            wingAssembly.add(rightWingPivot);
            wingAssembly.add(leftWingPivot);
          } else {
            gltf.scene.position.set(0, -16.4, -0.4);
            wingAssembly.add(gltf.scene);
          }

          log("3d angel wings ready -> attached behind body");
        } catch (e) {
          log("3d wings failed to load");
        }
      }

      setProgress(100, "ALL AI ONLINE");
      loaded = true;
    })();

    return modelsPromise;
  }

  async function start() {
    btn.disabled = true;
    t0 = performance.now();

    var isPending = !loaded;
    if (isPending) {
      btn.textContent = "INITIALIZING...";
      if (loadBox) loadBox.classList.add("active");
    }

    log("requesting camera permission...");

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
    } catch (e) {
      log("camera permission denied");
      if (loadBox) loadBox.classList.remove("active");
      btn.textContent = "Open camera";
      btn.disabled = false;
      return;
    }

    if (disposed) {
      if (stream) {
        stream.getTracks().forEach(function (t) {
          t.stop();
        });
        stream = null;
      }
      return;
    }

    if (!loaded) {
      try {
        await loadModels();
      } catch (e) {
        log("ai models failed to load");
      }
    }

    if (disposed) {
      if (stream) {
        stream.getTracks().forEach(function (t) {
          t.stop();
        });
        stream = null;
      }
      return;
    }

    video.srcObject = stream;
    await video.play();
    H = Math.round((W * video.videoHeight) / video.videoWidth) || 270;
    HW = W >> 1;
    HH = H >> 1;
    sc.width = fx.width = wingsCv.width = segCv.width = W;
    sc.height = fx.height = wingsCv.height = segCv.height = H;
    if (wingRenderer && wingCam) {
      wingRenderer.setSize(W, H, false);
      wingCam.aspect = W / Math.max(1, H);
      wingCam.position.z = H / 2 / Math.tan((45 * Math.PI) / 360);
      wingCam.updateProjectionMatrix();
    }
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
    if (loadBox) {
      setTimeout(function () {
        loadBox.classList.remove("active");
      }, 400);
    }
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
    btn.disabled = false;
    if (loadBox) loadBox.classList.remove("active");
    blobs = [];
    hand = null;
    eye = null;
    eyeT = null;
    noFace = 99;
    pose = null;
    poseT = null;
    noPose = 99;
    hadPose = false;
    hasSegMask = false;
    if (wingRoot && wingRenderer && wingScene && wingCam) {
      wingRoot.visible = false;
      wingRenderer.clear();
    }
    if (wc && wingsCv) {
      wc.clearRect(0, 0, wingsCv.width, wingsCv.height);
    }
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

  var blobVisited = new Uint8Array(HW * HH);
  var blobQ = new Int32Array(HW * HH);

  function track() {
    var x;
    var y;
    var i = 0;
    var bt = 26 - kS * 8;
    for (y = 0; y < HH; y++) {
      for (x = 0; x < HW; x++) {
        mask[i++] = mo[y * 2 * W + x * 2] > bt ? 255 : 0;
      }
    }

    if (blobVisited.length !== HW * HH) {
      blobVisited = new Uint8Array(HW * HH);
      blobQ = new Int32Array(HW * HH);
    }
    blobVisited.fill(0);
    var det = [];

    for (y = 0; y < HH; y += 2) {
      for (x = 0; x < HW; x += 2) {
        var idx = y * HW + x;
        if (mask[idx] && !blobVisited[idx]) {
          var minX = x;
          var maxX = x;
          var minY = y;
          var maxY = y;
          var count = 0;
          var head = 0;
          var tail = 0;
          blobQ[tail++] = (y << 16) | x;
          blobVisited[idx] = 1;

          while (head < tail) {
            var val = blobQ[head++];
            var cy = val >> 16;
            var cx = val & 0xffff;
            count++;
            if (cx < minX) minX = cx;
            if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy;
            if (cy > maxY) maxY = cy;

            var nxs = [cx + 2, cx - 2, cx, cx];
            var nys = [cy, cy, cy + 2, cy - 2];
            for (var k = 0; k < 4; k++) {
              var nx = nxs[k];
              var ny = nys[k];
              if (nx >= 0 && nx < HW && ny >= 0 && ny < HH) {
                var nidx = ny * HW + nx;
                if (mask[nidx] && !blobVisited[nidx]) {
                  blobVisited[nidx] = 1;
                  blobQ[tail++] = (ny << 16) | nx;
                }
              }
            }
          }

          var area = count * 4;
          if (area > 25) {
            var pad = 4;
            var bx = Math.max(0, minX - pad) * 2;
            var by = Math.max(0, minY - pad) * 2;
            var bw = Math.min(HW * 2 - bx, (maxX - minX + pad * 2) * 2);
            var bh = Math.min(HH * 2 - by, (maxY - minY + pad * 2) * 2);
            det.push({ x: bx, y: by, w: bw, h: bh, a: area });
          }
        }
      }
    }

    det.sort(function (p, q) {
      return q.a - p.a;
    });
    match(det.slice(0, 6));
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

    fc.drawImage(sc, 0, 0, W, H);

    // Render 3D Angel Wings behind the body/arms/hands (or on the back when facing away) BEFORE the glitch/mono pass
    if (wingRenderer && wingScene && wingCam && wingRoot && wc && wingsCv && pose) {
      wc.clearRect(0, 0, W, H);
      wingRoot.visible = true;
      var wScale = (pose.sw / 4.7) * (pose.isBack ? 0.85 : 1.0);
      var wy = pose.isBack ? pose.cy + pose.sw * 0.08 : pose.cy;
      wingRoot.position.set(pose.cx - W * 0.5, H * 0.5 - wy, 0);
      wingRoot.scale.setScalar(wScale);
      wingRoot.rotation.set(pose.isBack ? -0.06 : 0.06, pose.yaw, -pose.roll);

      var flapPhase = tt * (0.9 + kS * 1.4);
      var flapY = Math.sin(flapPhase) * (0.22 + kS * 0.25) - 0.08;
      var flapZ = Math.cos(flapPhase) * (0.06 + kS * 0.08);
      if (rightWingPivot && leftWingPivot) {
        rightWingPivot.rotation.set(0, flapY, flapZ);
        leftWingPivot.rotation.set(0, -flapY, -flapZ);
      }
      if (wingRimLight) {
        wingRimLight.intensity = 0.6 + kS * 1.8;
      }
      wingRenderer.render(wingScene, wingCam);

      wc.globalCompositeOperation = "source-over";
      wc.drawImage(wingGlCv, 0, 0, W, H);

      wc.globalCompositeOperation = "destination-out";
      if (pose.isBack) {
        // When facing backward (madep belakang), the back/punggung faces the camera so wings sit ON TOP of the back.
        // Only mask the head above the neck so the back of the head stays in front of the upper wing arches.
        if (hasSegMask) {
          var neckY = Math.max(0, Math.round(pose.cy - pose.sw * 0.14));
          if (neckY > 0) {
            wc.drawImage(segCv, 0, 0, W, neckY, 0, 0, W, neckY);
          }
        }
      } else {
        // When facing front/side, cut out the person's real body, arms, and hands silhouette so wings stay strictly behind
        if (hasSegMask) {
          wc.drawImage(segCv, 0, 0, W, H);
        }
        wc.save();
        wc.strokeStyle = "#000";
        wc.fillStyle = "#000";
        wc.lineCap = "round";
        wc.lineJoin = "round";
        if (pose.arms && pose.arms.length) {
          wc.lineWidth = Math.max(14, pose.sw * 0.24);
          pose.arms.forEach(function (arm) {
            wc.beginPath();
            arm.forEach(function (pt, idx) {
              idx ? wc.lineTo(pt.x, pt.y) : wc.moveTo(pt.x, pt.y);
            });
            wc.stroke();
          });
        }
        if (hand && hand.kp) {
          wc.lineWidth = Math.max(10, pose.sw * 0.14);
          CH.forEach(function (c) {
            wc.beginPath();
            c.forEach(function (id, j) {
              var P = hand.kp[id];
              j ? wc.lineTo(P.x, P.y) : wc.moveTo(P.x, P.y);
            });
            wc.stroke();
          });
          var palmIds = [0, 1, 5, 9, 13, 17];
          wc.beginPath();
          palmIds.forEach(function (id, j) {
            var P = hand.kp[id];
            if (!P) return;
            j ? wc.lineTo(P.x, P.y) : wc.moveTo(P.x, P.y);
          });
          wc.closePath();
          wc.fill();
        }
        wc.restore();
      }
      wc.globalCompositeOperation = "source-over";

      fc.drawImage(wingsCv, 0, 0, W, H);
    }

    var im = fc.getImageData(0, 0, W, H);
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
      g = (d[p] * 77 + d[p + 1] * 151 + d[p + 2] * 28) >> 8;
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
        v = (gr[i] - 110) * (1.4 + k) + 70;
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
    if (detector && !hb && fr % 3 === 0) {
      hb = true;
      detector
        .estimateHands(sc)
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
    if (hand && performance.now() - lastHandT > 280) {
      hand = null;
      kT = 0.1;
    }
    if (pdet && !pb && fr % 3 === 1) {
      pb = true;
      pdet
        .estimatePose(sc)
        .then(function (p) {
          if (p) {
            poseT = p;
            noPose = 0;
          } else if (++noPose > 8) {
            poseT = null;
          }
          pb = false;
        })
        .catch(function () {
          pb = false;
        });
    }
    if (fdet && !fb && fr % 3 === 2) {
      fb = true;
      fdet
        .estimateFaces(sc)
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
    if (poseT) {
      if (!pose) {
        pose = {
          cx: poseT.cx,
          cy: poseT.cy,
          sw: poseT.sw,
          roll: poseT.roll,
          yaw: poseT.yaw,
          isBack: !!poseT.isBack,
          lx: poseT.pL.x,
          ly: poseT.pL.y,
          rx: poseT.pR.x,
          ry: poseT.pR.y,
          arms: poseT.arms || [],
        };
      } else {
        pose.cx += (poseT.cx - pose.cx) * 0.35;
        pose.cy += (poseT.cy - pose.cy) * 0.35;
        pose.sw += (poseT.sw - pose.sw) * 0.35;
        pose.roll += (poseT.roll - pose.roll) * 0.3;
        var dYaw = ((poseT.yaw - pose.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        pose.yaw += dYaw * 0.25;
        pose.isBack = !!poseT.isBack;
        pose.lx += (poseT.pL.x - pose.lx) * 0.35;
        pose.ly += (poseT.pL.y - pose.ly) * 0.35;
        pose.rx += (poseT.pR.x - pose.rx) * 0.35;
        pose.ry += (poseT.pR.y - pose.ry) * 0.35;
        pose.arms = poseT.arms || [];
      }
    } else {
      pose = null;
    }

    var cw = ov.width;
    var ch = ov.height;
    var sS = Math.max(cw / W, ch / H);
    var ox = (cw - W * sS) / 2;
    var oy = (ch - H * sS) / 2;

    oc.clearRect(0, 0, cw, ch);
    oc.lineWidth = 1;
    oc.font = "12px monospace";

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
    if (pose && !hadPose) {
      hadPose = true;
      log("Shoulders locked -> 3D wings active");
    }
    if (!pose && hadPose) {
      hadPose = false;
      log("Shoulders lost");
    }
    if (pose && fr % 40 === 15) {
      log(
        "Wings  x:" +
          (ox + pose.cx * sS).toFixed(0) +
          " y:" +
          (oy + pose.cy * sS).toFixed(0) +
          "  span:" +
          (pose.sw * sS * 4.2).toFixed(0) +
          "px"
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
    if (pose) {
      var lxS = ox + pose.lx * sS;
      var lyS = oy + pose.ly * sS;
      var rxS = ox + pose.rx * sS;
      var ryS = oy + pose.ry * sS;
      var mxS = ox + pose.cx * sS;
      var myS = oy + pose.cy * sS;
      oc.strokeStyle = "rgba(255,255,255,.35)";
      oc.beginPath();
      oc.moveTo(lxS, lyS);
      oc.lineTo(rxS, ryS);
      oc.stroke();
      oc.fillStyle = "#f00";
      oc.fillRect(lxS - 2, lyS - 2, 5, 5);
      oc.fillRect(rxS - 2, ryS - 2, 5, 5);
      oc.fillStyle = "#fff";
      oc.fillRect(mxS - 2, myS - 2, 4, 4);
      oc.fillText("WINGS", mxS + 8, myS + 4);
    }
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
    if (pdet && pdet.dispose) pdet.dispose();
    if (wingRenderer && wingRenderer.dispose) wingRenderer.dispose();
    detector = null;
    fdet = null;
    pdet = null;
    wingRenderer = null;
    wingScene = null;
    wingCam = null;
    wingRoot = null;
    video.pause();
    video.srcObject = null;
    document.body.classList.remove("cam");
    lg.textContent = "";
  }

  return cleanup;
}
