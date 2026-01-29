export const SignLanguageProcessor = {
    session: null,
    frameBuffer: [],
    MAX_FRAMES: 30,
    isInitializing: false,
    _logger: null,

    log(tag, msg) {
        if (this._logger) this._logger(tag, msg);
        console.log(`[Algo][${tag}]`, msg);
    },

    async init(ort, logger) {
        this._logger = logger;
        if (this.session || this.isInitializing) return;
        this.isInitializing = true;
        try {
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';
            const cloudPath = 'https://cdn.jsdelivr.net/gh/Muyunaaaa/Echohand@master/slr_model.onnx';
            this.log("MODEL-TRY", "加载云端 AI 引擎...");
            this.session = await ort.InferenceSession.create(cloudPath, { executionProviders: ['wasm'] });
            this.log("MODEL-SUCCESS", "✅ AI 推理引擎激活成功");
        } catch (e) {
            this.log("MODEL-ERROR", `AI 引擎激活失败: ${e.message}`);
            this.session = null; // 确保失败后回退到几何模式
        } finally { this.isInitializing = false; }
    },

    analyze(multiLandmarks) {
        // 核心排查点：确保 multiLandmarks 存在且有效
        if (!multiLandmarks || multiLandmarks.length === 0) {
            return null;
        }

        if (this.session) {
            // --- AI 模式逻辑 ---
            const normalize = (lm) => {
                if (!lm) return new Array(42).fill(0);
                const wrist = lm[0];
                return lm.flatMap(p => [p.x - wrist.x, p.y - wrist.y]);
            };
            const hand1 = normalize(multiLandmarks[0]);
            const hand2 = normalize(multiLandmarks[1]);
            const combinedFrame = [...hand1, ...hand2];

            this.frameBuffer.push(combinedFrame);
            if (this.frameBuffer.length > this.MAX_FRAMES) this.frameBuffer.shift();
            if (this.frameBuffer.length === this.MAX_FRAMES) return this.runInference();
        } else {
            // --- 几何模式逻辑 ---
            // 显式提取第一只手的 landmarks
            const hand = multiLandmarks[0];
            // 增加一条内部调试日志（在真机控制台看）
            // console.log("执行几何逻辑判定, 坐标点数:", hand.length);
            return this.runFallback(hand);
        }
        return null;
    },

    runFallback(landmarks) {
        // 1. 结构化判定准备
        if (!landmarks || landmarks.length < 21) return null;

        const tips = [8, 12, 16, 20];
        const bases = [6, 10, 14, 18];

        // 2. 核心算法：y 轴坐标对比（屏幕坐标系 y 越小越高）
        const s = tips.map((t, i) => landmarks[t].y < landmarks[bases[i]].y);

        // 3. 判定库 (增加日志反馈到 Renderjs 日志中)
        let result = null;
        if (s.every(v => v === true)) result = "你好";
        else if (s.every(v => v === false)) result = "谢谢";
        else if (s[0] && s[1] && !s[2] && !s[3]) result = "学习";
        else if (s[0] && !s[1] && !s[2] && !s[3]) result = "你";

        if (result) {
            // 几何模式下也打个日志，方便确认逻辑走通了
            // this.log("GEO-HIT", `匹配到手势: ${result}`);
        }
        return result;
    },

    async runInference() {
        try {
            const inputData = Float32Array.from(this.frameBuffer.flat());
            const tensor = new window.ort.Tensor('float32', inputData, [1, 30, 84]);
            const results = await this.session.run({ [this.session.inputNames[0]]: tensor });
            const output = results[this.session.outputNames[0]].data;
            const argMax = output.indexOf(Math.max(...output));
            if (output[argMax] < 0.85) return null;
            const labels = ["你好", "谢谢", "学习", "再见", "我", "你"];
            return labels[argMax] || null;
        } catch (e) { return null; }
    },

    clear() { this.frameBuffer = []; }
};