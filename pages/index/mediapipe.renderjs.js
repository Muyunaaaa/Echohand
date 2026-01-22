// 定义在外部，确保全局唯一
let handsInstance = null;
let cameraInstance = null;
let isInitializing = false; // 加载锁

export default {
    mounted() {
        window.__MP_SENDER = this.$ownerInstance;
        this.prepareEnvironment();
    },
    methods: {
        sendToUI(type, content) {
            if (window.__MP_SENDER) window.__MP_SENDER.callMethod('receiveMessage', { type, content });
        },
        async prepareEnvironment() {
            // 检查是否已经加载过脚本
            if (window.Hands) return this.sendToUI('log', "环境已就绪");

            const p = 'static/mp-hands/';
            try {
                // 按顺序严格加载
                await this.loadScript(`${p}hands.js`);
                await this.loadScript(`${p}camera_utils.js`);
                await this.loadScript(`${p}drawing_utils.js`);
                this.sendToUI('log', "驱动加载成功");
            } catch (e) {
                this.sendToUI('error', "核心脚本加载失败，请检查 static 目录");
            }
        },
        loadScript(url) {
            return new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = url; s.onload = resolve; s.onerror = reject;
                document.head.appendChild(s);
            });
        },
        async manualStart() {
            if (isInitializing) return;
            isInitializing = true;

            // 彻底清理旧实例，防止日志里的 Module.arguments 冲突
            if (cameraInstance) { await cameraInstance.stop(); cameraInstance = null; }
            if (handsInstance) { await handsInstance.close(); handsInstance = null; }

            this.sendToUI('ready', '');
            const vContainer = document.getElementById('video_mount_container');
            const video = document.createElement('video');
            video.setAttribute('autoplay', ''); video.setAttribute('muted', ''); video.setAttribute('playsinline', 'true');
            video.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
            vContainer.innerHTML = ''; vContainer.appendChild(video);

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: 640, height: 480 }
                });
                video.srcObject = stream;
                video.onloadedmetadata = () => {
                    video.play().then(() => this.initMediaPipe(video));
                };
            } catch (err) {
                isInitializing = false;
                this.sendToUI('error', "相机开启失败");
            }
        },
        initMediaPipe(video) {
            const cContainer = document.getElementById('canvas_mount_container');
            const canvas = document.createElement('canvas');
            canvas.style.cssText = "width:100%;height:100%;display:block;";
            cContainer.innerHTML = ''; cContainer.appendChild(canvas);
            const ctx = canvas.getContext('2d');

            // eslint-disable-next-line no-undef
            handsInstance = new Hands({
                locateFile: (file) => {
                    // 这里直接返回 CDN 完整路径，不要拼接逻辑，防止 loader.js 迷路
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`;
                }
            });

            handsInstance.setOptions({
                maxNumHands: 1,
                modelComplexity: 1,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            handsInstance.onResults((results) => {
                if (!results || !results.image) return;

                if (canvas.width !== video.videoWidth) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                }

                ctx.save();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
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

            // eslint-disable-next-line no-undef
            cameraInstance = new Camera(video, {
                onFrame: async () => {
                    if (handsInstance) await handsInstance.send({ image: video });
                },
                width: 640, height: 480
            });

            cameraInstance.start().then(() => {
                isInitializing = false;
                this.sendToUI('log', "AI 已就绪");
            });
        }
    }
}