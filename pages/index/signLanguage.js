export const SignLanguageProcessor = {
    session: null,
    frameBuffer: [],
    MAX_FRAMES: 30,
    isInitializing: false,
    _logger: null,
    // 关键：请务必检查 labels 顺序是否与你 Python 训练生成的 labels.json 完全一致
    // 模型输出的是索引，索引对不上，单词就全错
    labels: ["accident", "all", "apple", "bed", "before", "bird", "black", "blue", "book", "bowling", "can", "candy", "chair", "change", "clothes", "color", "computer", "cool", "corn", "cousin", "cow", "dance", "dark", "deaf", "doctor", "dog", "drink", "eat", "enjoy", "family", "fine", "finish", "fish", "go", "graduate", "hat", "hearing", "help", "hot", "kiss", "language", "later", "like", "man", "many", "mother", "no", "now", "orange", "shirt", "study", "table", "tall", "thanksgiving", "thin", "walk", "what", "white", "who", "woman", "wrong", "year", "yes"],

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
            this.session = await ort.InferenceSession.create(cloudPath, {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all'
            });
            this.log("MODEL-SUCCESS", "✅ AI 推理引擎激活成功");
        } catch (e) {
            this.log("MODEL-ERROR", `AI 引擎激活失败: ${e.message}`);
            this.session = null;
        } finally { this.isInitializing = false; }
    },

    /**
     * @param {Array} multiLandmarks - 坐标数据
     * @param {Array} multiHandedness - 左右手信息 (由 MediaPipe 提供)
     * @param {Boolean} isUserFacing - 是否为前置摄像头 (用于处理坐标翻转)
     */
    analyze(multiLandmarks, multiHandedness, isUserFacing = true) {
        if (!multiLandmarks || multiLandmarks.length === 0) {
            // 如果连续多帧没手，建议清空 buffer 避免动作断层
            if (this.frameBuffer.length > 0) this.clear();
            return null;
        }

        if (this.session) {
            // 1. 初始化 84 维向量 (42位左手 + 42位右手)
            let frameData = new Array(84).fill(0);

            // 2. 严格按左右手填充数据
            multiLandmarks.forEach((landmarks, index) => {
                const handedness = multiHandedness[index];
                // MediaPipe 的 label 可能由于镜像反转，这里做鲁棒性处理
                // 目标：前42位给模型训练时的“第一只手”，后42位给“第二只手”
                const isLeft = handedness.label === 'Left';
                const offset = isLeft ? 0 : 42;

                landmarks.forEach((lm, i) => {
                    if (i < 21) {
                        let x = lm.x;
                        // 如果是前置镜像摄像头，且模型训练时用的是非镜像数据，需要翻转 X
                        if (isUserFacing) x = 1.0 - x;

                        frameData[offset + i * 2] = x;
                        frameData[offset + i * 2 + 1] = lm.y;
                    }
                });
            });

            this.frameBuffer.push(frameData);
            if (this.frameBuffer.length > this.MAX_FRAMES) this.frameBuffer.shift();

            // 3. 只有缓冲区满 30 帧才预测
            if (this.frameBuffer.length === this.MAX_FRAMES) {
                return this.runInference();
            }
        } else {
            return this.runFallback(multiLandmarks[0]);
        }
        return null;
    },

    async runInference() {
        try {
            const inputData = Float32Array.from(this.frameBuffer.flat());
            const tensor = new window.ort.Tensor('float32', inputData, [1, 30, 84]);
            const results = await this.session.run({ [this.session.inputNames[0]]: tensor });
            const output = results[this.session.outputNames[0]].data;

            // 找出置信度最高的索引
            const argMax = output.indexOf(Math.max(...output));
            const confidence = output[argMax];

            // 调试日志：输出 Top 3 结果，方便排查是否标签错位
            const sortedResults = Array.from(output)
                .map((prob, idx) => ({ prob, label: this.labels[idx] || `Index-${idx}` }))
                .sort((a, b) => b.prob - a.prob)
                .slice(0, 3);

            console.log(`[AI-PREDICT] Top 1: ${sortedResults[0].label} (${(sortedResults[0].prob * 100).toFixed(2)}%)`);

            // 阈值控制，建议先调低到 0.5 进行测试
            if (confidence < 0.7) {
                return null;
            }

            return this.labels[argMax] || null;
        } catch (e) {
            this.log("INFER-ERR", e.message);
            return null;
        }
    },

    runFallback(landmarks) {
        if (!landmarks || landmarks.length < 21) return null;
        const tips = [8, 12, 16, 20];
        const bases = [6, 10, 14, 18];
        const s = tips.map((t, i) => landmarks[t].y < landmarks[bases[i]].y);

        if (s.every(v => v === true)) return "你好";
        if (s.every(v => v === false)) return "谢谢";
        return null;
    },

    clear() {
        this.frameBuffer = [];
        console.log("[Algo] Buffer Cleared");
    }
};

// 自动初始化
SignLanguageProcessor.init();