export const SignLanguageProcessor = {
    session: null,
    frameBuffer: [],
    MAX_FRAMES: 30,
    isInitializing: false,
    _logger: null,
    hasReportedStatus: false,
    lastDetectedLogTime: 0,

    log(tag, msg) {
        if (this._logger) this._logger(tag, msg);
        // 使用 %c 让关键日志在控制台更醒目（蓝色背景）
        console.log(`%c[Algo][${tag}]`, 'background: #007AFF; color: #fff; border-radius: 3px; padding: 2px 5px;', msg);
    },

    async init(ort, logger) {
        this._logger = logger;
        if (this.session || this.isInitializing) return;
        this.isInitializing = true;

        this.log("INIT-CHECK", "开始算法引擎初始化流程...");

        if (!ort) {
            this.log("FATAL", "ONNX Runtime 库加载失败，无法使用模型，直接降级。");
            this.session = null;
            this.isInitializing = false;
            this.hasReportedStatus = true;
            return;
        }

        try {
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

            // 💡 关键：这行日志会告诉你程序尝试去哪里找模型
            this.log("MODEL-TRY", "尝试从路径加载模型: /static/model/slr_model.onnx");

            this.session = await ort.InferenceSession.create('/static/model/slr_model.onnx', {
                executionProviders: ['wasm']
            });

            this.log("MODEL-SUCCESS", "✅ 模型加载成功！当前处于：【深度学习 AI 模式】");
        } catch (e) {
            // 💡 关键：这行会打印具体的报错信息，如 404 或格式错误
            this.log("MODEL-ERROR", "❌ 模型加载失败。原因: " + e.message);
            this.log("MODE-INFO", "⚠️ 降级成功：当前处于：【简易几何算法模式】");
            this.session = null;
        } finally {
            this.isInitializing = false;
            this.hasReportedStatus = true;
        }
    },

    async analyze(landmarks) {
        // 只有在 init 流程彻底走完（无论成败）后，才允许 analyze 运行
        if (this.isInitializing) return null;

        if (!this.hasReportedStatus) {
            this.log("STATUS", this.session ? "AI模式运行中" : "简易模式运行中");
            this.hasReportedStatus = true;
        }

        let result = null;
        if (this.session) {
            const currentFrame = landmarks.flatMap(pt => [pt.x, pt.y]);
            this.frameBuffer.push(currentFrame);
            if (this.frameBuffer.length > this.MAX_FRAMES) this.frameBuffer.shift();
            if (this.frameBuffer.length === this.MAX_FRAMES) {
                result = await this.runInference();
            }
        } else {
            result = this.runFallback(landmarks);
        }

        // 识别防抖日志
        if (result && (Date.now() - this.lastDetectedLogTime > 1500)) {
            this.log("RECOGNIZE", `识别到: [${result}]`);
            this.lastDetectedLogTime = Date.now();
        }

        return result;
    },

    runFallback(landmarks) {
        // 保持你要求的代码完整性：简易几何算法逻辑
        const tips = [8, 12, 16, 20];
        const bases = [6, 10, 14, 18];
        const s = tips.map((tip, i) => landmarks[tip].y < landmarks[bases[i]].y);
        if (s[0] && s[1] && !s[2] && !s[3]) return "学习";
        if (s[0] && !s[1] && !s[2] && !s[3]) return "你";
        if (s.every(state => state === true)) return "你好";
        if (s.every(state => state === false)) return "谢谢";
        return null;
    },

    async runInference() {
        try {
            const inputData = Float32Array.from(this.frameBuffer.flat());
            const tensor = new window.ort.Tensor('float32', inputData, [1, 30, 42]);
            const results = await this.session.run({ [this.session.inputNames[0]]: tensor });
            const output = results[this.session.outputNames[0]].data;
            const argMax = output.indexOf(Math.max(...output));
            if (output[argMax] < 0.8) return null;
            const labels = ["你好", "谢谢", "学习", "再见", "我", "你"];
            return labels[argMax] || null;
        } catch (e) { return null; }
    },

    clear() {
        this.frameBuffer = [];
        this.log("SYS", "缓冲区重置");
    }
};