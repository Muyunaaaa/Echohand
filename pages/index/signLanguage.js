export const SignLanguageProcessor = {
    session: null,
    frameBuffer: [],
    MAX_FRAMES: 30,
    isInitializing: false,
    _logger: null,
    // 关键：请务必检查 labels 顺序是否与你 Python 训练生成的 labels.json 完全一致
    // 模型输出的是索引，索引对不上，单词就全错
    labels: ["about", "accident", "africa", "afternoon", "again", "age", "all", "alone", "always", "animal", "apple", "appointment", "approve", "argue", "arrive", "australia", "avoid", "baby", "back", "backpack", "bad", "bake", "balance", "ball", "balloon", "banana", "bar", "basement", "basketball", "bath", "bathroom", "bear", "beard", "because", "bed", "before", "behind", "believe", "better", "bird", "birthday", "black", "blanket", "blind", "blue", "book", "bored", "bowl", "bowling", "box", "boy", "bracelet", "bread", "bring", "brother", "brown", "business", "but", "buy", "cafeteria", "call", "can", "candy", "car", "careful", "cat", "catch", "center", "cereal", "chair", "champion", "change", "chat", "cheat", "check", "cheese", "chicken", "child", "children", "choose", "christmas", "church", "city", "class", "clock", "close", "clothes", "coffee", "cold", "college", "color", "computer", "convince", "cook", "cookie", "cool", "copy", "corn", "cough", "country", "cousin", "cow", "crash", "crazy", "cry", "cup", "cut", "cute", "dance", "dark", "daughter", "day", "deaf", "decide", "decorate", "deep", "deer", "delay", "delicious", "dentist", "different", "dirty", "disappear", "discuss", "dive", "divorce", "doctor", "dog", "door", "down", "draw", "dress", "drink", "drive", "drop", "dry", "ear", "earn", "earring", "east", "easy", "eat", "egg", "elephant", "english", "enjoy", "environment", "escape", "example", "expensive", "explain", "family", "far", "fast", "fat", "father", "fault", "feel", "fight", "find", "fine", "finish", "first", "fish", "fishing", "floor", "flower", "fly", "follow", "football", "forget", "friend", "friendly", "from", "full", "future", "game", "get", "girl", "give", "glasses", "go", "good", "government", "graduate", "green", "hair", "halloween", "happen", "happy", "hard", "hat", "have", "headache", "hear", "hearing", "heart", "hello", "help", "here", "hit", "home", "hope", "hospital", "hot", "hour", "house", "how", "humble", "hurry", "husband", "idea", "important", "improve", "inform", "interest", "internet", "investigate", "jacket", "japan", "jealous", "join", "jump", "kill", "king", "kiss", "kitchen", "knife", "know", "language", "large", "last", "last year", "late", "later", "laugh", "law", "learn", "leave", "lemon", "letter", "lettuce", "light", "like", "list", "live", "lose", "make", "man", "many", "marry", "match", "mean", "meat", "medicine", "meet", "meeting", "milk", "minute", "mirror", "miss", "money", "monkey", "month", "moon", "more", "morning", "most", "mother", "motorcycle", "move", "movie", "music", "name", "near", "necklace", "need", "nephew", "never", "new", "newspaper", "nice", "niece", "night", "no", "none", "noon", "north", "not", "now", "nurse", "off", "office", "ok", "old", "onion", "orange", "order", "paint", "pants", "paper", "party", "past", "patient", "pay", "pencil", "people", "pepper", "person", "perspective", "phone", "picture", "pink", "pizza", "plan", "play", "please", "plus", "point", "police", "poor", "possible", "potato", "practice", "president", "problem", "pull", "purple", "quiet", "rabbit", "rain", "read", "ready", "red", "remember", "research", "restaurant", "ride", "right", "room", "run", "russia", "sad", "salt", "same", "sandwich", "saturday", "save", "scared", "school", "science", "scissors", "score", "secret", "secretary", "sentence", "shape", "share", "shirt", "shoes", "shop", "short", "show", "sick", "sign", "silly", "since", "sister", "sit", "sleep", "slow", "small", "snake", "snow", "soap", "soda", "some", "son", "soon", "sorry", "south", "speech", "star", "stay", "stink", "straight", "struggle", "stubborn", "student", "study", "sunday", "sunset", "surgery", "sweet", "table", "take", "talk", "tall", "tea", "teach", "teacher", "tell", "temperature", "tent", "test", "thank you", "thanksgiving", "theory", "there", "thin", "think", "throw", "thursday", "tiger", "time", "tired", "toast", "today", "tomato", "trade", "traffic", "train", "travel", "ugly", "understand", "use", "visit", "voice", "vomit", "vote", "wait", "walk", "want", "war", "water", "wednesday", "week", "west", "wet", "what", "when", "where", "which", "white", "who", "why", "wife", "win", "window", "with", "woman", "word", "work", "write", "wrong", "year", "yellow", "yes", "yesterday", "you", "your"],

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