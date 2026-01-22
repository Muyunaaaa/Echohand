let handsInstance = null;
let isInitializing = false;
let currentFacingMode = 'user';
let animationId = null;
let videoTrack = null;

export default {
    mounted() {
        window.__MP_SENDER = this.$ownerInstance;
        this.waitForHandsReady(); // ★ FIX
    },
    methods: {
        sendToUI(type, content) {
            if (window.__MP_SENDER) {
                window.__MP_SENDER.callMethod('receiveMessage', { type, content });
            }
        },
        log(msg) {
            const time = new Date().toLocaleTimeString().split(' ')[0];
            this.sendToUI('log', `[${time}] ${msg}`);
            console.log(`[AI-DEBUG] ${msg}`);
        },

        /* ================================
           ★ FIX 1：稳定等待 Hands 可用
        ================================= */
        async waitForHandsReady() {
            const p = 'static/mp-hands/';

            // 若未加载脚本，先加载
            if (!window.Hands) {
                try {
                    await this.loadScript(`${p}hands.js`);
                    await this.loadScript(`${p}drawing_utils.js`);
                } catch (e) {
                    this.sendToUI('error', 'MediaPipe 脚本加载失败');
                    return;
                }
            }

            // ★ 核心：轮询确认 Hands 真正可用
            const check = () => {
                if (typeof window.Hands === 'function') {
                    this.log('超清引擎就绪');
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

        async switchCamera() {
            if (isInitializing) return;
            currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
            this.log(`>>> 强制切换链路: ${currentFacingMode}`);
            await this.manualStart();
        },

        async manualStart() {
            if (typeof window.Hands !== 'function') {
                this.sendToUI('error', 'AI 引擎未就绪');
                return;
            }

            isInitializing = true;
            this.log('正在重构像素矩阵...');

            if (animationId) cancelAnimationFrame(animationId);
            if (videoTrack) {
                videoTrack.stop();
                videoTrack = null;
            }

            document.querySelectorAll('video').forEach(v => {
                if (v.srcObject) v.srcObject.getTracks().forEach(t => t.stop());
                v.remove();
            });

            await new Promise(r => setTimeout(r, 600));

            const vContainer = document.getElementById('video_mount_container');
            const video = document.createElement('video');
            video.setAttribute('autoplay', '');
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', 'true');
            video.style.cssText =
                'position:fixed;top:-5000px;width:1280px;height:720px;';
            vContainer.appendChild(video);

            try {
                const constraints = {
                    video: {
                        facingMode: currentFacingMode,
                        width: { min: 1280, ideal: 1920 },
                        height: { min: 720, ideal: 1080 }
                    }
                };

                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                videoTrack = stream.getVideoTracks()[0];
                video.srcObject = stream;

                video.onloadedmetadata = () => {
                    this.log(`物理像素流: ${video.videoWidth}x${video.videoHeight}`);
                    video.play().then(() => this.initAIAndDrive(video));
                };

                this.sendToUI('ready', currentFacingMode);
            } catch (err) {
                this.log(`高清模式受限: ${err.name}`);
                this.manualStartLowRes(video);
            }
        },

        async manualStartLowRes(video) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: currentFacingMode }
                });
                video.srcObject = stream;
                video.onloadedmetadata = () =>
                    video.play().then(() => this.initAIAndDrive(video));
            } catch (e) {
                isInitializing = false;
                this.sendToUI('error', '硬件调用失败');
            }
        },

        initAIAndDrive(video) {
            const cContainer = document.getElementById('canvas_mount_container');
            const canvas = document.createElement('canvas');
            canvas.style.cssText =
                'width:100%;height:100%;display:block;object-fit:cover;image-rendering:-webkit-optimize-contrast;';
            cContainer.innerHTML = '';
            cContainer.appendChild(canvas);

            const ctx = canvas.getContext('2d', {
                alpha: false,
                desynchronized: true
            });

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            /* ================================
               ★ FIX 2：永远使用 window.Hands
            ================================= */
            if (!handsInstance) {
                handsInstance = new window.Hands({
                    locateFile: file =>
                        `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`
                });
                handsInstance.setOptions({
                    maxNumHands: 1,
                    modelComplexity: 1,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
            }

            handsInstance.onResults(results => {
                if (!results || !results.image) return;

                if (canvas.width !== video.videoWidth) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                }

                ctx.save();

                if (currentFacingMode === 'environment') {
                    ctx.filter =
                        'contrast(1.2) brightness(1.1) saturate(1.1)';
                }

                ctx.clearRect(0, 0, canvas.width, canvas.height);

                if (currentFacingMode === 'user') {
                    ctx.translate(canvas.width, 0);
                    ctx.scale(-1, 1);
                }

                ctx.drawImage(results.image, 0, 0);

                if (results.multiHandLandmarks) {
                    for (const landmarks of results.multiHandLandmarks) {
                        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
                            color: '#00FF00',
                            lineWidth: 5
                        });
                        drawLandmarks(ctx, landmarks, {
                            color: '#FF0000',
                            lineWidth: 2
                        });
                    }
                }

                ctx.restore();
            });

            const drive = async () => {
                if (!video || video.paused || video.ended) return;
                if (video.readyState >= 2) {
                    try {
                        await handsInstance.send({ image: video });
                    } catch (e) {}
                }
                animationId = requestAnimationFrame(drive);
            };

            drive();
            isInitializing = false;
            this.sendToUI('ai_online', '');
        }
    }
};
