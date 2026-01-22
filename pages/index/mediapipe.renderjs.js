let handsInstance = null;
let isInitializing = false;
let currentFacingMode = 'user';
let frameCounter = 0;
let animationId = null;

export default {
    mounted() {
        window.__MP_SENDER = this.$ownerInstance;
        this.prepareEnvironment();
    },
    methods: {
        sendToUI(type, content) {
            if (window.__MP_SENDER) window.__MP_SENDER.callMethod('receiveMessage', { type, content });
        },
        log(msg) {
            const time = new Date().toLocaleTimeString().split(' ')[0];
            this.sendToUI('log', `[${time}] ${msg}`);
            console.log(`[AI-DEBUG] ${msg}`);
        },
        async prepareEnvironment() {
            if (window.Hands) return;
            const p = 'static/mp-hands/';
            try {
                await this.loadScript(`${p}hands.js`);
                await this.loadScript(`${p}drawing_utils.js`);
                this.log("高清引擎加载成功");
            } catch (e) {
                this.sendToUI('error', "静态资源加载失败");
            }
        },
        loadScript(url) {
            return new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = url; s.onload = resolve; s.onerror = reject;
                document.head.appendChild(s);
            });
        },
        async switchCamera() {
            if (isInitializing) return;
            currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
            this.log(`>>> 切换至: ${currentFacingMode}`);
            await this.manualStart();
        },
        async manualStart() {
            isInitializing = true;
            this.log("正在重置高清焦距...");

            if (animationId) cancelAnimationFrame(animationId);

            const allVideos = document.querySelectorAll('video');
            allVideos.forEach(v => {
                if (v.srcObject) {
                    v.srcObject.getTracks().forEach(t => t.stop());
                    v.srcObject = null;
                }
                v.remove();
            });

            await new Promise(r => setTimeout(r, 750));

            const vContainer = document.getElementById('video_mount_container');
            const video = document.createElement('video');
            video.setAttribute('autoplay', '');
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', 'true');
            // 物理 video 设置为实际请求的大小
            video.style.cssText = "position:fixed;top:-2000px;width:720px;height:1280px;opacity:0.01;";
            vContainer.appendChild(video);

            try {
                this.log(`激活 ${currentFacingMode} 并请求对焦...`);

                // 1. 请求高清流
                const constraints = {
                    video: {
                        facingMode: currentFacingMode,
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    }
                };

                const stream = await navigator.mediaDevices.getUserMedia(constraints);

                // 2. 核心补丁：强制开启硬件持续自动对焦 (Focus Mode)
                const track = stream.getVideoTracks()[0];
                if (track.getCapabilities) {
                    const caps = track.getCapabilities();
                    if (caps.focusMode && caps.focusMode.includes('continuous')) {
                        this.log("硬件支持自动对焦，正在强制开启...");
                        try {
                            await track.applyConstraints({
                                advanced: [{ focusMode: 'continuous' }]
                            });
                        } catch (e) {
                            this.log("应用对焦约束失败，将依赖硬件自启");
                        }
                    }
                }

                video.srcObject = stream;
                this.sendToUI('ready', currentFacingMode);

                video.onloadedmetadata = () => {
                    this.log(`链路就绪: ${video.videoWidth}x${video.videoHeight}`);
                    video.play().then(() => this.initAIAndDrive(video));
                };
            } catch (err) {
                this.log(`高级模式不匹配: ${err.name}，降级启动...`);
                this.manualStartLowRes(video);
            }
        },
        async manualStartLowRes(video) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: currentFacingMode }
                });
                video.srcObject = stream;
                video.onloadedmetadata = () => {
                    video.play().then(() => this.initAIAndDrive(video));
                };
            } catch (e) {
                isInitializing = false;
                this.sendToUI('error', "硬件唤醒失败");
            }
        },
        initAIAndDrive(video) {
            const cContainer = document.getElementById('canvas_mount_container');
            const canvas = document.createElement('canvas');
            // 样式补丁：增加 image-rendering 属性，防止浏览器对 Canvas 进行平滑模糊处理
            canvas.style.cssText = "width:100%;height:100%;display:block;object-fit:cover;image-rendering: -webkit-optimize-contrast; image-rendering: pixelated;";
            cContainer.innerHTML = '';
            cContainer.appendChild(canvas);
            const ctx = canvas.getContext('2d', { alpha: false });

            // 彻底关闭 Canvas 内部的图像平滑
            ctx.imageSmoothingEnabled = false;

            if (!handsInstance) {
                // eslint-disable-next-line no-undef
                handsInstance = new Hands({
                    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`
                });
                handsInstance.setOptions({
                    maxNumHands: 1,
                    modelComplexity: 1, // 0 性能最好, 1 精准度均衡
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
            }

            handsInstance.onResults((results) => {
                frameCounter++;
                if (frameCounter % 100 === 0) this.log(`AI 心跳: ${video.videoWidth}p 高清模式`);

                if (!results || !results.image) return;

                if (canvas.width !== video.videoWidth) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                }

                ctx.save();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (currentFacingMode === 'user') {
                    ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
                }

                // 绘制原始图像
                ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

                if (results.multiHandLandmarks) {
                    for (const landmarks of results.multiHandLandmarks) {
                        // eslint-disable-next-line no-undef
                        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 4});
                        // eslint-disable-next-line no-undef
                        drawLandmarks(ctx, landmarks, {color: '#FF0000', lineWidth: 2});
                    }
                }
                ctx.restore();
            });

            const runDrive = async () => {
                if (!video || video.paused || video.ended) return;
                if (video.readyState >= 2) {
                    try { await handsInstance.send({ image: video }); } catch (e) {}
                }
                animationId = requestAnimationFrame(runDrive);
            };

            runDrive();
            isInitializing = false;
            this.sendToUI('ai_online', '');
            this.log(">>> 高清链路已就绪");
        }
    }
}