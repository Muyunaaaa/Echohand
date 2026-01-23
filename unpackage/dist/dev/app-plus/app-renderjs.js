var __renderjsModules={};

__renderjsModules["04fd029c"] = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __async = (__this, __arguments, generator) => {
    return new Promise((resolve, reject) => {
      var fulfilled = (value) => {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      };
      var rejected = (value) => {
        try {
          step(generator.throw(value));
        } catch (e) {
          reject(e);
        }
      };
      var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
      step((generator = generator.apply(__this, __arguments)).next());
    });
  };

  // <stdin>
  var stdin_exports = {};
  __export(stdin_exports, {
    default: () => stdin_default
  });
  var handsInstance = null;
  var isInitializing = false;
  var currentFacingMode = "user";
  var animationId = null;
  var videoTrack = null;
  function dbg(tag, msg, obj) {
    const time = (/* @__PURE__ */ new Date()).toISOString().slice(11, 23);
    let text = `[${time}][${tag}] ${msg}`;
    if (obj !== void 0) {
      try {
        text += " " + JSON.stringify(obj);
      } catch (e) {
      }
    }
    if (window.__MP_SENDER) {
      window.__MP_SENDER.callMethod("receiveMessage", {
        type: "log",
        content: text
      });
    }
    console.log(text);
  }
  var stdin_default = {
    mounted() {
      window.__MP_SENDER = this.$ownerInstance;
      dbg("BOOT", "renderjs mounted");
      this.waitForHandsReady();
    },
    methods: {
      sendToUI(type, content) {
        if (window.__MP_SENDER) {
          window.__MP_SENDER.callMethod("receiveMessage", { type, content });
        }
      },
      /* ===============================
          1️⃣ 稳定加载 MediaPipe
      =============================== */
      waitForHandsReady() {
        return __async(this, null, function* () {
          const p = "static/mp-hands/";
          if (!window.Hands) {
            try {
              dbg("LOAD", "loading mediapipe scripts");
              yield this.loadScript(`${p}hands.js`);
              yield this.loadScript(`${p}drawing_utils.js`);
            } catch (e) {
              this.sendToUI("error", "MediaPipe \u811A\u672C\u52A0\u8F7D\u5931\u8D25");
              return;
            }
          }
          const check = () => {
            if (typeof window.Hands === "function") {
              dbg("READY", "Hands engine ready");
            } else {
              setTimeout(check, 50);
            }
          };
          check();
        });
      },
      loadScript(url) {
        return new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = url;
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      },
      /* ===============================
          2️⃣ 切换摄像头
      =============================== */
      switchCamera() {
        return __async(this, null, function* () {
          if (isInitializing)
            return;
          currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
          dbg("CAM", "switch facingMode", currentFacingMode);
          yield this.manualStart();
        });
      },
      /* ===============================
          3️⃣ 启动摄像头（核心）
      =============================== */
      manualStart() {
        return __async(this, null, function* () {
          var _a;
          if (typeof window.Hands !== "function") {
            this.sendToUI("error", "AI \u5F15\u64CE\u672A\u5C31\u7EEA");
            return;
          }
          isInitializing = true;
          dbg("CAM", "initializing camera");
          if (animationId)
            cancelAnimationFrame(animationId);
          if (videoTrack) {
            videoTrack.stop();
            videoTrack = null;
          }
          document.querySelectorAll("video").forEach((v) => {
            if (v.srcObject)
              v.srcObject.getTracks().forEach((t) => t.stop());
            v.remove();
          });
          yield new Promise((r) => setTimeout(r, 500));
          const vContainer = document.getElementById("video_mount_container");
          const video = document.createElement("video");
          video.setAttribute("autoplay", "");
          video.setAttribute("muted", "");
          video.setAttribute("playsinline", "true");
          video.style.cssText = "position:fixed;top:-5000px;width:1280px;height:720px;";
          vContainer.appendChild(video);
          try {
            const constraints = {
              video: {
                facingMode: currentFacingMode,
                width: { exact: 1280 },
                height: { exact: 720 }
              }
            };
            dbg("CAM", "getUserMedia request", constraints);
            const stream = yield navigator.mediaDevices.getUserMedia(constraints);
            videoTrack = stream.getVideoTracks()[0];
            video.srcObject = stream;
            const caps = (_a = videoTrack.getCapabilities) == null ? void 0 : _a.call(videoTrack);
            dbg("CAM", "capabilities", caps);
            if (caps && caps.zoom) {
              yield videoTrack.applyConstraints({
                advanced: [{ zoom: 1 }]
              });
              dbg("CAM", "zoom locked to 1.0");
            }
            video.onloadedmetadata = () => {
              dbg(
                "CAM",
                "physical stream",
                `${video.videoWidth}x${video.videoHeight}`
              );
              video.play().then(() => this.initAIAndDrive(video));
            };
            this.sendToUI("ready", currentFacingMode);
          } catch (err) {
            dbg("ERR", "camera failed", err.name);
            isInitializing = false;
            this.sendToUI("error", "\u6444\u50CF\u5934\u542F\u52A8\u5931\u8D25");
          }
        });
      },
      /* ===============================
          4️⃣ AI + Canvas 驱动
      =============================== */
      initAIAndDrive(video) {
        dbg("AI", "initializing AI pipeline");
        const cContainer = document.getElementById("canvas_mount_container");
        const canvas = document.createElement("canvas");
        canvas.style.cssText = "width:100%;height:100%;display:block;object-fit:cover;";
        cContainer.innerHTML = "";
        cContainer.appendChild(canvas);
        const ctx = canvas.getContext("2d", {
          alpha: false,
          desynchronized: true
        });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        if (!handsInstance) {
          handsInstance = new window.Hands({
            locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${f}`
          });
          handsInstance.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
          });
          dbg("AI", "Hands instance created");
        }
        handsInstance.onResults((results) => {
          if (!results || !results.image)
            return;
          if (canvas.width !== video.videoWidth) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          if (results.multiHandLandmarks) {
            this.sendToUI("hand_data", results.multiHandLandmarks);
          }
          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (currentFacingMode === "user") {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(results.image, 0, 0);
          if (results.multiHandLandmarks) {
            for (const lm of results.multiHandLandmarks) {
              drawConnectors(ctx, lm, HAND_CONNECTIONS, {
                color: "#00FF00",
                lineWidth: 4
              });
              drawLandmarks(ctx, lm, {
                color: "#FF0000",
                lineWidth: 2
              });
            }
          }
          ctx.restore();
        });
        const loop = () => __async(this, null, function* () {
          if (video.readyState >= 2) {
            try {
              yield handsInstance.send({ image: video });
            } catch (e) {
              dbg("AI", "send failed");
            }
          }
          animationId = requestAnimationFrame(loop);
        });
        loop();
        isInitializing = false;
        this.sendToUI("ai_online", "");
        dbg("AI", "pipeline running");
      }
    }
  };
  return __toCommonJS(stdin_exports);
})();
