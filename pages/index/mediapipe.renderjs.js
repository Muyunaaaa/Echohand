import { SignLanguageProcessor } from './signLanguage.js';

let handsInstance = null;
let isInitializing = false;
let currentFacingMode = 'user';
let animationId = null;
let videoTrack = null;

// 统一日志上报：现在它能把算法内部的日志也发给 UI
function dbg(tag, msg, obj) {
    const time = new Date().toISOString().slice(11, 23);
    let text = `[${time}][${tag}] ${msg}`;
    if (obj !== undefined) {
        try { text += ' ' + (typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch (e) {}
    }
    // 关键修复：使用全局绑定的实例发送消息，防止 this 指向 undefined
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
        // 绑定全局发送器
        window.__MP_SENDER = this.$ownerInstance;
        dbg('BOOT', 'renderjs mounted');

        this.initAlgorithm();
        this.waitForHandsReady();
    },

    methods: {
        sendToUI(type, content) {
            if (window.__MP_SENDER) {
                window.__MP_SENDER.callMethod('receiveMessage', { type, content });
            }
        },

        async initAlgorithm() {
            if (!window.ort) {
                dbg('AI-INIT', '正在从网络加载 ONNX 运行库...');
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js';
                script.onload = () => {
                    dbg('AI-INIT', '库加载完成，触发算法引擎初始化');
                    SignLanguageProcessor.init(window.ort, dbg);
                };
                script.onerror = () => {
                    dbg('AI-ERR', 'ONNX 库加载失败，强制进入降级模式');
                    SignLanguageProcessor.init(null, dbg);
                };
                document.head.appendChild(script);
            } else {
                SignLanguageProcessor.init(window.ort, dbg);
            }
        },

        resetAlgorithm() {
            SignLanguageProcessor.clear();
            dbg('AI', 'Inference buffer cleared');
        },

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
                s.src = url; s.onload = resolve; s.onerror = reject;
                document.head.appendChild(s);
            });
        },

        async switchCamera() {
            if (isInitializing) return;
            currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
            dbg('CAM', 'Switching to: ' + currentFacingMode);
            await this.manualStart();
        },

        async manualStart() {
            if (typeof window.Hands !== 'function') {
                this.sendToUI('error', 'AI 引擎未就绪');
                return;
            }
            isInitializing = true;
            dbg('CAM', 'Initializing camera system');
            if (animationId) cancelAnimationFrame(animationId);
            if (videoTrack) videoTrack.stop();

            document.querySelectorAll('video').forEach(v => v.remove());
            await new Promise(r => setTimeout(r, 500));

            const vContainer = document.getElementById('video_mount_container');
            const video = document.createElement('video');
            video.setAttribute('autoplay', ''); video.setAttribute('muted', ''); video.setAttribute('playsinline', 'true');
            video.style.cssText = 'position:fixed;top:-5000px;width:1280px;height:720px;';
            vContainer.appendChild(video);

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: currentFacingMode, width: 1280, height: 720 }
                });
                videoTrack = stream.getVideoTracks()[0];
                video.srcObject = stream;
                video.onloadedmetadata = () => {
                    dbg('CAM', 'Video stream active');
                    video.play().then(() => this.initAIAndDrive(video));
                };
                this.sendToUI('ready', currentFacingMode);
            } catch (err) {
                dbg('ERR', 'Camera access failed', err);
                isInitializing = false;
                this.sendToUI('error', '摄像头启动失败');
            }
        },

        initAIAndDrive(video) {
            dbg('AI', 'Initializing AI pipeline');
            const cContainer = document.getElementById('canvas_mount_container');
            const canvas = document.createElement('canvas');
            canvas.style.cssText = 'width:100%;height:100%;display:block;object-fit:cover;';
            cContainer.innerHTML = ''; cContainer.appendChild(canvas);
            const ctx = canvas.getContext('2d', { alpha: false });

            if (!handsInstance) {
                handsInstance = new window.Hands({
                    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${f}`
                });
                handsInstance.setOptions({
                    maxNumHands: 1,
                    modelComplexity: 1,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
            }

            handsInstance.onResults(async (results) => {
                if (!results || !results.image) return;
                if (canvas.width !== video.videoWidth) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                }

                if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                    const word = await SignLanguageProcessor.analyze(results.multiHandLandmarks[0]);

                    // 核心修改：只有当识别到的词与上一次不同，或者已经消失了一阵子才发送
                    if (word && word !== this.lastSentWord) {
                        this.sendToUI('sign_word', word);
                        this.lastSentWord = word;

                        // 3秒后允许再次发送同一个词，防止识别中断
                        clearTimeout(this.wordTimeout);
                        this.wordTimeout = setTimeout(() => { this.lastSentWord = null; }, 3000);
                    }

                    // 保留用于绘制的点位数据
                    this.sendToUI('hand_data', results.multiHandLandmarks);
                }

                ctx.save();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (currentFacingMode === 'user') {
                    ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
                }
                ctx.drawImage(results.image, 0, 0);
                if (results.multiHandLandmarks) {
                    for (const lm of results.multiHandLandmarks) {
                        // 保持蓝色连线与白色点位的视觉效果
                        drawConnectors(ctx, lm, HAND_CONNECTIONS, {color: '#007AFF', lineWidth: 4});
                        drawLandmarks(ctx, lm, {color: '#FFFFFF', lineWidth: 2});
                    }
                }
                ctx.restore();
            });

            const loop = async () => {
                if (video.readyState >= 2) {
                    try { await handsInstance.send({ image: video }); } catch (e) {}
                }
                animationId = requestAnimationFrame(loop);
            };
            loop();
            isInitializing = false;
            this.sendToUI('ai_online', '');
            dbg('AI', 'Hand tracking loop started');
        }
    }
};