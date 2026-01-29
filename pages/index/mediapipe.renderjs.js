import { SignLanguageProcessor } from './signLanguage.js';

let handsInstance = null;
let currentFacingMode = 'user';
let animationId = null;
let videoTrack = null;
let owner = null;

function internalSend(type, content) {
    if (owner && owner.callMethod) {
        owner.callMethod('receiveMessage', { type, content });
    }
}

function dbg(tag, msg, obj) {
    const time = new Date().toISOString().slice(11, 23);
    let text = `[${time}][${tag}] ${msg}`;
    if (obj !== undefined) {
        try { text += ' ' + (typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch (e) {}
    }
    console.log(text);
    internalSend('log', text);
}

function runInitAlgorithm() {
    if (!window.ort) {
        dbg('AI-INIT', '从 CDN 加载库...');
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js';
        script.onload = () => SignLanguageProcessor.init(window.ort, dbg);
        script.onerror = () => dbg('AI-ERR', 'CDN 库加载失败');
        document.head.appendChild(script);
    } else {
        SignLanguageProcessor.init(window.ort, dbg);
    }
}

export default {
    mounted() {
        owner = this.$ownerInstance;
        dbg('BOOT', 'Renderjs 已就绪并挂载');
        runInitAlgorithm();
    },
    methods: {
        // 核心修复：接收 Vue 层的数据变化
        onAlgoTrigger(newValue) {
            if (!newValue || !newValue.mode) return;
            dbg('TRIGGER', `监听到属性变化: ${newValue.mode}`);

            if (newValue.mode === 'reset') {
                this.resetAlgorithm();
            } else {
                this.switchAlgoMode(newValue.mode);
            }
        },

        switchAlgoMode(mode) {
            dbg('MODE-CHANGE', `执行切换: ${mode}`);
            try {
                if (mode === 'basic') {
                    SignLanguageProcessor.session = null;
                    dbg('MODE-CHANGE', '✅ 已切换至基础几何识别');
                } else {
                    dbg('MODE-CHANGE', '正在激活 AI 推理...');
                    runInitAlgorithm();
                }
                internalSend('mode_status', mode);
            } catch (e) {
                dbg('MODE-ERR', '切换过程崩溃', e.message);
            }
        },

        resetAlgorithm() {
            SignLanguageProcessor.clear();
            dbg('AI', '识别缓冲已重置');
        },

        async switchCamera() {
            currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
            dbg('CAM', '切换摄像头为: ' + currentFacingMode);
            this.manualStart();
        },

        async manualStart() {
            dbg('SYS', '尝试激活视觉引擎...');
            if (typeof window.Hands !== 'function') {
                dbg('LOAD', '加载 MediaPipe 核心脚本...');
                const p = 'static/mp-hands/';
                const load = (src) => new Promise((res, rej) => {
                    const s = document.createElement('script');
                    s.src = src; s.onload = res; s.onerror = rej;
                    document.head.appendChild(s);
                });
                try {
                    await load(`${p}hands.js`);
                    await load(`${p}drawing_utils.js`);
                } catch (e) {
                    dbg('ERR', '脚本加载失败');
                    return;
                }
            }

            if (videoTrack) videoTrack.stop();
            document.querySelectorAll('video').forEach(v => v.remove());

            const vContainer = document.getElementById('video_mount_container');
            const video = document.createElement('video');
            video.setAttribute('autoplay', '');
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', 'true');
            video.style.cssText = 'position:fixed;top:-5000px;width:1280px;height:720px;';
            vContainer.appendChild(video);

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: currentFacingMode, width: 1280, height: 720 }
                });
                videoTrack = stream.getVideoTracks()[0];
                video.srcObject = stream;
                video.onloadedmetadata = () => {
                    video.play().then(() => {
                        this.initAIAndDrive(video);
                    });
                };
                internalSend('ready', currentFacingMode);
            } catch (err) {
                dbg('ERR', '摄像头权限失败', err.message);
            }
        },

        initAIAndDrive(video) {
            const cContainer = document.getElementById('canvas_mount_container');
            const canvas = document.createElement('canvas');
            canvas.style.cssText = 'width:100%;height:100%;display:block;object-fit:cover;';
            cContainer.innerHTML = '';
            cContainer.appendChild(canvas);
            const ctx = canvas.getContext('2d', { alpha: false });

            if (!handsInstance) {
                handsInstance = new window.Hands({
                    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${f}`
                });
                handsInstance.setOptions({
                    maxNumHands: 2,
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

                if (results.multiHandLandmarks && results.multiHandedness) {
                    // 传入坐标、左右手信息、是否前置摄像头
                    const isUser = currentFacingMode === 'user';
                    const word = await SignLanguageProcessor.analyze(
                        results.multiHandLandmarks,
                        results.multiHandedness,
                        isUser
                    );
                    if (word) internalSend('sign_word', word);
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
                        drawConnectors(ctx, lm, HAND_CONNECTIONS, {color: '#007AFF', lineWidth: 4});
                        drawLandmarks(ctx, lm, {color: '#FFFFFF', lineWidth: 2});
                    }
                }
                ctx.restore();
            });

            const tick = async () => {
                if (video.readyState >= 2) {
                    try { await handsInstance.send({ image: video }); } catch (e) {}
                }
                animationId = requestAnimationFrame(tick);
            };
            tick();
        }
    }
};