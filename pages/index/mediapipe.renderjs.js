let handsInstance = null;
let isInitializing = false;
let currentFacingMode = 'user';
let animationId = null;
let videoTrack = null;

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
                this.log("超清引擎就绪");
            } catch (e) {
                this.sendToUI('error', "加载失败");
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
            this.log(`>>> 强制切换链路: ${currentFacingMode}`);
            await this.manualStart();
        },
        async manualStart() {
            isInitializing = true;
            this.log("正在重构像素矩阵...");

            if (animationId) cancelAnimationFrame(animationId);
            if (videoTrack) { videoTrack.stop(); videoTrack = null; }

            document.querySelectorAll('video').forEach(v => {
                if (v.srcObject) v.srcObject.getTracks().forEach(t => t.stop());
                v.remove();
            });

            await new Promise(r => setTimeout(r, 800));

            const vContainer = document.getElementById('video_mount_container');
            const video = document.createElement('video');
            video.setAttribute('autoplay', '');
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', 'true');
            // 隐藏 Video 但给它足够大的渲染尺寸
            video.style.cssText = "position:fixed;top:-5000px;width:1280px;height:720px;";
            vContainer.appendChild(video);

            try {
                // 强制要求高分辨率，不接受妥协
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
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacingMode } });
                video.srcObject = stream;
                video.onloadedmetadata = () => video.play().then(() => this.initAIAndDrive(video));
            } catch (e) {
                isInitializing = false;
                this.sendToUI('error', "硬件调用失败");
            }
        },
        initAIAndDrive(video) {
            const cContainer = document.getElementById('canvas_mount_container');
            const canvas = document.createElement('canvas');
            // 解决拉伸模糊的关键：image-rendering
            canvas.style.cssText = "width:100%;height:100%;display:block;object-fit:cover;image-rendering:-webkit-optimize-contrast;";
            cContainer.innerHTML = '';
            cContainer.appendChild(canvas);

            const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

            // 核心修改：强制高质量
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            if (!handsInstance) {
                // eslint-disable-next-line no-undef
                handsInstance = new Hands({
                    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`
                });
                handsInstance.setOptions({
                    maxNumHands: 1,
                    modelComplexity: 1, // 后置模糊时必须用 1 增强边缘检测
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
            }

            handsInstance.onResults((results) => {
                if (!results || !results.image) return;

                // 物理分辨率对齐
                if (canvas.width !== video.videoWidth) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                }

                ctx.save();
                // 解决后置发灰模糊：手动注入锐化滤镜
                if (currentFacingMode === 'environment') {
                    // contrast(1.2) 提升对比度，brightness(1.1) 补偿暗部
                    ctx.filter = 'contrast(1.2) brightness(1.1) saturate(1.1)';
                }

                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (currentFacingMode === 'user') {
                    ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
                }

                ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

                if (results.multiHandLandmarks) {
                    for (const landmarks of results.multiHandLandmarks) {
                        // eslint-disable-next-line no-undef
                        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 5});
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
        }
    }
}