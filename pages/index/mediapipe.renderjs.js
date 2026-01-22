let handsInstance = null;
let cameraInstance = null;
let isInitializing = false;

export default {
    mounted() {
        window.__MP_SENDER = this.$ownerInstance;
        this.prepareEnvironment();
    },
    methods: {
        sendToUI(type, content) {
            if (window.__MP_SENDER) {
                window.__MP_SENDER.callMethod('receiveMessage', { type, content });
            }
        },
        // 带有时间戳的增强型日志
        log(msg) {
            const now = new Date();
            const time = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
            this.sendToUI('log', `[${time}] ${msg}`);
            console.log(`[MediaPipe] ${msg}`);
        },
        async prepareEnvironment() {
            if (window.Hands) return this.log("资源已在内存中");
            const p = 'static/mp-hands/';
            try {
                this.log("正在加载核心库...");
                await this.loadScript(`${p}hands.js`);
                await this.loadScript(`${p}camera_utils.js`);
                await this.loadScript(`${p}drawing_utils.js`);
                this.log("JS驱动加载完成");
            } catch (e) {
                this.sendToUI('error', "脚本加载失败，请确认为 static/mp-hands 目录");
            }
        },
        loadScript(url) {
            return new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = url;
                s.onload = () => { this.log(`已载入: ${url.split('/').pop()}`); resolve(); };
                s.onerror = reject;
                document.head.appendChild(s);
            });
        },
        async manualStart() {
            if (isInitializing) return;
            isInitializing = true;
            this.log("正在准备硬件...");

            // 清理旧实例
            if (cameraInstance) { await cameraInstance.stop(); cameraInstance = null; }
            if (handsInstance) { await handsInstance.close(); handsInstance = null; }

            this.sendToUI('ready', '');

            const vContainer = document.getElementById('video_mount_container');
            const video = document.createElement('video');
            video.setAttribute('autoplay', '');
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', 'true');
            vContainer.innerHTML = '';
            vContainer.appendChild(video);

            try {
                this.log("请求相机权限...");
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: 640, height: 480 }
                });
                video.srcObject = stream;
                video.onloadedmetadata = () => {
                    this.log("视频流已挂载，初始化AI...");
                    video.play().then(() => this.initMediaPipe(video));
                };
            } catch (err) {
                isInitializing = false;
                this.log("相机开启报错: " + err.message);
                this.sendToUI('error', "无法访问相机，请检查权限");
            }
        },
        initMediaPipe(video) {
            const cContainer = document.getElementById('canvas_mount_container');
            const canvas = document.createElement('canvas');
            canvas.style.cssText = "width:100%;height:100%;display:block;object-fit:cover;";
            cContainer.innerHTML = '';
            cContainer.appendChild(canvas);
            const ctx = canvas.getContext('2d');

            try {
                // eslint-disable-next-line no-undef
                handsInstance = new Hands({
                    locateFile: (file) => {
                        this.log(`加载WASM组件: ${file}`);
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

                    // 镜像绘制底层画面
                    ctx.translate(canvas.width, 0);
                    ctx.scale(-1, 1);
                    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

                    // 绘制手势
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
                    this.sendToUI('ai_online', "");
                    this.log("系统运行中 - 窗口已合并");
                });
            } catch (err) {
                isInitializing = false;
                this.log("AI初始化崩溃: " + err.message);
            }
        }
    }
}