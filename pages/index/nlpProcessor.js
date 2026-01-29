/**
 * NLP 处理与语音播报模块 - 详细日志增强版
 */

const API_CONFIG = {
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    key: 'sk-51619ec6aa894ac99994c77d5ecad549',
    model: 'qwen-plus'
};

let androidTTS = null;
let iosSynthesizer = null;

export const NLPProcessor = {
    wordQueue: [],
    timer: null,
    silenceThreshold: 2200,

    addWord(word, onComplete) {
        this.wordQueue.push(word);
        console.log(`[Queue] 收到词汇: "${word}" | 当前队列: [${this.wordQueue.join(' + ')}]`);

        if (this.timer) {
            clearTimeout(this.timer);
            console.log(`[Timer] 计时重置 - 等待用户继续动作...`);
        }

        this.timer = setTimeout(() => {
            console.log(`[Timer] 触发！静默已达 ${this.silenceThreshold}ms，开始处理句子...`);
            this.processSentence(onComplete);
        }, this.silenceThreshold);
    },

    async processSentence(onComplete) {
        if (this.wordQueue.length === 0) {
            console.log(`[NLP] 队列为空，取消请求`);
            return;
        }

        const rawWords = this.wordQueue.map(w => w.split('/')[0]).join('，');
        console.log(`[API-Request] 准备调用通义千问... 原始输入: "${rawWords}"`);
        this.wordQueue = []; // 清空队列防止重复处理

        uni.request({
            url: API_CONFIG.url,
            method: 'POST',
            header: {
                'Authorization': `Bearer ${API_CONFIG.key}`,
                'Content-Type': 'application/json'
            },
            data: {
                model: API_CONFIG.model,
                messages: [
                    { role: 'system', content: '你是一个手语翻译，请直接把词串成一句话。不要解释，不要输出多余内容，直接返回翻译结果。' },
                    { role: 'user', content: rawWords }
                ]
            },
            success: (res) => {
                console.log(`[API-Response] 网络请求成功，原始响应内容:`, res.data);

                let result = "";
                if (res.data && res.data.choices && res.data.choices[0]) {
                    result = res.data.choices[0].message.content.trim();
                    console.log(`[NLP-Success] AI 优化结果: "${result}"`);
                } else {
                    result = rawWords.replace(/，/g, '');
                    console.warn(`[NLP-Warning] API 返回格式异常，使用原始词串兜底: "${result}"`);
                }

                this.speak(result);
                if (onComplete) onComplete(result);
            },
            fail: (err) => {
                const fallback = rawWords.replace(/，/g, '');
                console.error(`[API-Error] 网络请求失败:`, err);
                console.log(`[NLP-Fallback] 离线兜底播报: "${fallback}"`);
                this.speak(fallback);
                if (onComplete) onComplete(fallback);
            }
        });
    },

    speak(text) {
        if (!text) return;
        console.log(`[TTS-Voice] 准备启动系统语音驱动，内容: "${text}"`);

        // #ifdef APP-PLUS
        const platform = plus.os.name;
        console.log(`[TTS-Platform] 当前运行平台: ${platform}`);

        // --- Android 逻辑 ---
        if (platform === 'Android') {
            try {
                if (!androidTTS) {
                    console.log(`[TTS-Android] 首次运行，正在初始化 Android TextToSpeech 引擎...`);
                    const main = plus.android.runtimeMainActivity();
                    const TextToSpeech = plus.android.importClass('android.speech.tts.TextToSpeech');
                    const Locale = plus.android.importClass('java.util.Locale');
                    androidTTS = new TextToSpeech(main, (status) => {
                        if (status === 0) { // SUCCESS
                            androidTTS.setLanguage(Locale.CHINESE);
                            console.log(`[TTS-Android] 引擎初始化成功，开始播报`);
                            androidTTS.speak(text, 0, null);
                        } else {
                            console.error(`[TTS-Android] 引擎初始化失败，状态码: ${status}`);
                        }
                    });
                } else {
                    console.log(`[TTS-Android] 引擎就绪，直接播报内容`);
                    androidTTS.speak(text, 0, null);
                }
            } catch (e) {
                console.error("[TTS-Android] 原生调用异常", e);
            }
        }

        // --- iOS 逻辑 ---
        else if (platform === 'iOS') {
            try {
                const AVSpeechSynthesizer = plus.ios.importClass("AVSpeechSynthesizer");
                const AVSpeechUtterance = plus.ios.importClass("AVSpeechUtterance");
                const AVSpeechSynthesisVoice = plus.ios.importClass("AVSpeechSynthesisVoice");

                if (!iosSynthesizer) {
                    console.log(`[TTS-iOS] 初始化 AVSpeechSynthesizer 实例...`);
                    iosSynthesizer = new AVSpeechSynthesizer();
                }

                if (iosSynthesizer.isSpeaking()) {
                    console.log(`[TTS-iOS] 正在播报中，执行强制中断刷新`);
                    iosSynthesizer.stopSpeakingAtBoundary(0);
                }

                const utterance = AVSpeechUtterance.speechUtteranceWithString(text);
                const voice = AVSpeechSynthesisVoice.voiceWithLanguage("zh-CN");
                utterance.setVoice(voice);
                utterance.setRate(0.5);

                console.log(`[TTS-iOS] 原生指令发送：AVSpeechUtterance 开始排队播报`);
                iosSynthesizer.speakUtterance(utterance);
            } catch (e) {
                console.error("[TTS-iOS] 原生调用异常", e);
            }
        }
        // #endif

        // #ifdef H5
        if (window.speechSynthesis) {
            console.log(`[TTS-H5] WebSpeech API 播报中...`);
            window.speechSynthesis.cancel();
            const msg = new SpeechSynthesisUtterance(text);
            msg.lang = 'zh-CN';
            window.speechSynthesis.speak(msg);
        }
        // #endif
    }
};