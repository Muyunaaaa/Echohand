let handsInstance = null;
let isInitializing = false;
let currentFacingMode = 'user';
let animationId = null;
let videoTrack = null;

function dbg(tag, msg, obj) {
    const time = new Date().toISOString().slice(11, 23);
    let text = `[${time}][${tag}] ${msg}`;

    if (obj !== undefined) {
        try {
            text += ' ' + JSON.stringify(obj);
        } catch (e) {
            text += ' [object]';
        }
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
        dbg('BOOT', 'renderjs mounted');
        window.__MP_SENDER = this.$ownerInstance;
        dbg('BOOT', '__MP_SENDER 绑定完成', !!window.__MP_SENDER);
        this.waitForHandsReady();
    },

    methods: {
        sendToUI(type, content) {
            if (!window.__MP_SENDER) {
                dbg('UI', '❌ __MP_SENDER 不存在，消息丢弃', { type, content });
                return;
            }
            dbg('UI', '→ sendToUI', { type, content });
            window.__MP_SENDER.callMethod('receiveMessage', { type, content });
        },

        log(msg) {
            const time = new Date().toLocaleTimeString().split(' ')[0];
            this.sendToUI('log', `[${time}] ${msg}`);
            dbg('LOG', msg);
        },

        /* ===============================
           ① Hands 加载 & 就绪检测
        =============================== */
        async waitForHandsReady() {
            dbg('HANDS', '开始检测 Hands 环境');
            const p = 'static/mp-hands/';

            if (!window.Hands) {
                dbg('HANDS', 'Hands 不存在，开始加载脚本');
                try {
                    await this.loadScript(`${p}hands.js`);
                    dbg('HANDS', 'hands.js 加载完成');
                    await this.loadScript(`${p}drawing_utils.js`);
                    dbg('HANDS', 'drawing_utils.js 加载完成');
                } catch (e) {
                    dbg('HANDS', '❌ 脚本加载失败', e);
                    this.sendToUI('error', 'MediaPipe 脚本加载失败');
                    return;
                }
            } else {
                dbg('HANDS', 'Hands 已存在（可能是缓存）');
            }

            let retry = 0;
            const check = () => {
                retry++;
                dbg('HANDS', `检查 Hands 可用性 #${retry}`, typeof window.Hands);

                if (typeof window.Hands === 'function') {
                    dbg('HANDS', '✅ Hands 构造函数可用');
                    this.log('超清引擎就绪');
                } else {
                    setTimeout(check, 50);
                }
            };
            check();
        },

        loadScript(url) {
            return new Promise((resolve, reject) => {
                dbg('SCRIPT', '开始加载', url);
                const s = document.createElement('script');
                s.src = url;
                s.onload = () => {
                    dbg('SCRIPT', '加载成功', url);
                    resolve();
                };
                s.onerror = e => {
                    dbg('SCRIPT', '❌ 加载失败', url);
                    reject(e);
                };
                document.head.appendChild(s);
            });
        },

        /* ===============================
           ② 摄像头控制
        =============================== */
        async switchCamera() {
            dbg('CAM', '请求切换摄像头');
            if (isInitializing) {
                dbg('CAM', '❌ 初始化中，拒绝切换');
                return;
            }
            currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
            this.log(`>>> 强制切换链路: ${currentFacingMode}`);
            await this.manualStart();
        },

        async manualStart() {
            dbg('START', 'manualStart 触发');

            if (typeof window.Hands !== 'function') {
                dbg('START', '❌ Hands 未就绪');
                this.sendToUI('error', 'AI 引擎未就绪');
                return;
            }

            isInitializing = true;
            this.log('正在重构像素矩阵...');

            if (animationId) {
                dbg('CLEAN', '取消 animationFrame', animationId);
                cancelAnimationFrame(animationId);
            }

            if (videoTrack) {
                dbg('CLEAN', '停止 videoTrack');
                videoTrack.stop();
                videoTrack = null;
            }

            document.querySelectorAll('video').forEach(v => {
                dbg('CLEAN', '移除旧 video 元素');
                if (v.srcObject) v.srcObject.getTracks().forEach(t => t.stop());
                v.remove();
            });

            await new Promise(r => setTimeout(r, 600));

            const vContainer = document.getElementById('video_mount_container');
            dbg('DOM', 'video_mount_container', vContainer);

            const video = document.createElement('video');
            video.setAttribute('autoplay', '');
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', 'true');
            video.style.cssText = 'position:fixed;top:-5000px;width:1280px;height:720px;';
            vContainer.appendChild(video);

            try {
                dbg('CAM', '请求 getUserMedia 高分辨率');
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: currentFacingMode,
                        width: { min: 1280, ideal: 1920 },
                        height: { min: 720, ideal: 1080 }
                    }
                });

                dbg('CAM', 'getUserMedia 成功', stream);
                videoTrack = stream.getVideoTracks()[0];
                video.srcObject = stream;

                video.onloadedmetadata = () => {
                    dbg('VIDEO', 'metadata ready', {
                        w: video.videoWidth,
                        h: video.videoHeight
                    });
                    video.play().then(() => this.initAIAndDrive(video));
                };

                this.sendToUI('ready', currentFacingMode);
            } catch (err) {
                dbg('CAM', '❌ 高分失败，降级', err);
                this.manualStartLowRes(video);
            }
        },

        async manualStartLowRes(video) {
            dbg('CAM', '进入低分辨率模式');
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: currentFacingMode }
                });
                video.srcObject = stream;
                video.onloadedmetadata = () =>
                    video.play().then(() => this.initAIAndDrive(video));
            } catch (e) {
                dbg('CAM', '❌ 低分也失败', e);
                isInitializing = false;
                this.sendToUI('error', '硬件调用失败');
            }
        },

        /* ===============================
           ③ AI 主循环
        =============================== */
        initAIAndDrive(video) {
            dbg('AI', 'initAIAndDrive 启动');

            const cContainer = document.getElementById('canvas_mount_container');
            dbg('DOM', 'canvas_mount_container', cContainer);

            const canvas = document.createElement('canvas');
            canvas.style.cssText =
                'width:100%;height:100%;display:block;object-fit:cover;image-rendering:-webkit-optimize-contrast;';
            cContainer.innerHTML = '';
            cContainer.appendChild(canvas);

            const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
            dbg('CTX', 'Canvas Context 创建成功', ctx);

            if (!handsInstance) {
                dbg('AI', '创建 Hands 实例');
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
            } else {
                dbg('AI', '复用 Hands 实例');
            }

            handsInstance.onResults(results => {
                if (!results || !results.image) return;

                if (canvas.width !== video.videoWidth) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    dbg('CANVAS', '尺寸同步', canvas.width, canvas.height);
                }

                ctx.save();
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                if (currentFacingMode === 'user') {
                    ctx.translate(canvas.width, 0);
                    ctx.scale(-1, 1);
                }

                ctx.drawImage(results.image, 0, 0);

                if (results.multiHandLandmarks) {
                    // dbg('AI', '识别到手', results.multiHandLandmarks.length);
                    for (const landmarks of results.multiHandLandmarks) {
                        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
                        drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 2 });
                    }
                }

                ctx.restore();
            });

            const drive = async () => {
                if (!video || video.paused || video.ended) {
                    dbg('LOOP', '视频中断，退出循环');
                    return;
                }
                try {
                    await handsInstance.send({ image: video });
                } catch (e) {
                    dbg('LOOP', 'send 失败', e);
                }
                animationId = requestAnimationFrame(drive);
            };

            dbg('LOOP', '主循环启动');
            drive();

            isInitializing = false;
            this.sendToUI('ai_online', '');
        }
    }
};
