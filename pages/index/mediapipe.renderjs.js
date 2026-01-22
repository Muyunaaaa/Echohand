/* ===============================
   EchoHand Stable Camera Engine
   =============================== */

let handsInstance = null;
let isInitializing = false;
let currentFacingMode = 'user';
let animationId = null;
let videoTrack = null;

function dbg(tag, msg, obj) {
    const time = new Date().toISOString().slice(11, 23);
    let text = `[${time}][${tag}] ${msg}`;
    if (obj !== undefined) {
        try { text += ' ' + JSON.stringify(obj); } catch (e) {}
    }
    if (window.__MP_SENDER) {
        window.__MP_SENDER.callMethod('receiveMessage', {
            type: 'log',
            content: text
        });
    }
    console.log(text);
}

export default {
    mounted() {
        window.__MP_SENDER = this.$ownerInstance;
        dbg('BOOT', 'renderjs mounted');
        this.waitForHandsReady();
    },

    methods: {
        sendToUI(type, content) {
            if (window.__MP_SENDER) {
                window.__MP_SENDER.callMethod('receiveMessage', { type, content });
            }
        },

        /* ===============================
           1️⃣ 稳定加载 MediaPipe
        =============================== */
        async waitForHandsReady() {
            const p = 'static/mp-hands/';
            if (!window.Hands) {
                try {
                    dbg('LOAD', 'loading mediapipe scripts');
                    await this.loadScript(`${p}hands.js`);
                    await this.loadScript(`${p}drawing_utils.js`);
                } catch (e) {
                    this.sendToUI('error', 'MediaPipe 脚本加载失败');
                    return;
                }
            }

            const check = () => {
                if (typeof window.Hands === 'function') {
                    dbg('READY', 'Hands engine ready');
                } else {
                    setTimeout(check, 50);
                }
            };
            check();
        },

        loadScript(url) {
            return new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = url;
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        },

        /* ===============================
           2️⃣ 切换摄像头
        =============================== */
        async switchCamera() {
            if (isInitializing) return;
            currentFacingMode =
                currentFacingMode === 'user' ? 'environment' : 'user';
            dbg('CAM', 'switch facingMode', currentFacingMode);
            await this.manualStart();
        },

        /* ===============================
           3️⃣ 启动摄像头（核心）
        =============================== */
        async manualStart() {
            if (typeof window.Hands !== 'function') {
                this.sendToUI('error', 'AI 引擎未就绪');
                return;
            }

            isInitializing = true;
            dbg('CAM', 'initializing camera');

            if (animationId) cancelAnimationFrame(animationId);
            if (videoTrack) {
                videoTrack.stop();
                videoTrack = null;
            }

            document.querySelectorAll('video').forEach(v => {
                if (v.srcObject) v.srcObject.getTracks().forEach(t => t.stop());
                v.remove();
            });

            await new Promise(r => setTimeout(r, 500));

            const vContainer = document.getElementById('video_mount_container');
            const video = document.createElement('video');
            video.setAttribute('autoplay', '');
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', 'true');
            video.style.cssText =
                'position:fixed;top:-5000px;width:1280px;height:720px;';
            vContainer.appendChild(video);

            try {
                /* ★ 关键：exact 分辨率，阻止系统裁剪 */
                const constraints = {
                    video: {
                        facingMode: currentFacingMode,
                        width: { exact: 1280 },
                        height: { exact: 720 }
                    }
                };

                dbg('CAM', 'getUserMedia request', constraints);
                const stream = await navigator.mediaDevices.getUserMedia(constraints);

                videoTrack = stream.getVideoTracks()[0];
                video.srcObject = stream;

                /* ★ 锁定 zoom = 1.0（核心修复） */
                const caps = videoTrack.getCapabilities?.();
                dbg('CAM', 'capabilities', caps);

                if (caps && caps.zoom) {
                    await videoTrack.applyConstraints({
                        advanced: [{ zoom: 1.0 }]
                    });
                    dbg('CAM', 'zoom locked to 1.0');
                }

                video.onloadedmetadata = () => {
                    dbg(
                        'CAM',
                        'physical stream',
                        `${video.videoWidth}x${video.videoHeight}`
                    );
                    video.play().then(() => this.initAIAndDrive(video));
                };

                this.sendToUI('ready', currentFacingMode);
            } catch (err) {
                dbg('ERR', 'camera failed', err.name);
                isInitializing = false;
                this.sendToUI('error', '摄像头启动失败');
            }
        },

        /* ===============================
           4️⃣ AI + Canvas 驱动
        =============================== */
        initAIAndDrive(video) {
            dbg('AI', 'initializing AI pipeline');

            const cContainer = document.getElementById('canvas_mount_container');
            const canvas = document.createElement('canvas');
            canvas.style.cssText =
                'width:100%;height:100%;display:block;object-fit:cover;';
            cContainer.innerHTML = '';
            cContainer.appendChild(canvas);

            const ctx = canvas.getContext('2d', {
                alpha: false,
                desynchronized: true
            });

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            if (!handsInstance) {
                handsInstance = new window.Hands({
                    locateFile: f =>
                        `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${f}`
                });
                handsInstance.setOptions({
                    maxNumHands: 1,
                    modelComplexity: 1,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                dbg('AI', 'Hands instance created');
            }

            handsInstance.onResults(results => {
                if (!results || !results.image) return;

                if (canvas.width !== video.videoWidth) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                }

                ctx.save();
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                if (currentFacingMode === 'user') {
                    ctx.translate(canvas.width, 0);
                    ctx.scale(-1, 1);
                }

                ctx.drawImage(results.image, 0, 0);

                if (results.multiHandLandmarks) {
                    for (const lm of results.multiHandLandmarks) {
                        drawConnectors(ctx, lm, HAND_CONNECTIONS, {
                            color: '#00FF00',
                            lineWidth: 4
                        });
                        drawLandmarks(ctx, lm, {
                            color: '#FF0000',
                            lineWidth: 2
                        });
                    }
                }
                ctx.restore();
            });

            const loop = async () => {
                if (video.readyState >= 2) {
                    try {
                        await handsInstance.send({ image: video });
                    } catch (e) {
                        dbg('AI', 'send failed');
                    }
                }
                animationId = requestAnimationFrame(loop);
            };

            loop();
            isInitializing = false;
            this.sendToUI('ai_online', '');
            dbg('AI', 'pipeline running');
        }
    }
};
