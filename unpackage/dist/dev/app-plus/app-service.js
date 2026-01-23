if (typeof Promise !== "undefined" && !Promise.prototype.finally) {
  Promise.prototype.finally = function(callback) {
    const promise = this.constructor;
    return this.then(
      (value) => promise.resolve(callback()).then(() => value),
      (reason) => promise.resolve(callback()).then(() => {
        throw reason;
      })
    );
  };
}
;
if (typeof uni !== "undefined" && uni && uni.requireGlobal) {
  const global = uni.requireGlobal();
  ArrayBuffer = global.ArrayBuffer;
  Int8Array = global.Int8Array;
  Uint8Array = global.Uint8Array;
  Uint8ClampedArray = global.Uint8ClampedArray;
  Int16Array = global.Int16Array;
  Uint16Array = global.Uint16Array;
  Int32Array = global.Int32Array;
  Uint32Array = global.Uint32Array;
  Float32Array = global.Float32Array;
  Float64Array = global.Float64Array;
  BigInt64Array = global.BigInt64Array;
  BigUint64Array = global.BigUint64Array;
}
;
if (uni.restoreGlobal) {
  uni.restoreGlobal(Vue, weex, plus, setTimeout, clearTimeout, setInterval, clearInterval);
}
(function(vue) {
  "use strict";
  function formatAppLog(type, filename, ...args) {
    if (uni.__log__) {
      uni.__log__(type, filename, ...args);
    } else {
      console[type].apply(console, [...args, filename]);
    }
  }
  const SignLanguageProcessor = {
    // 配置参数
    CONFIG: {
      RECORDING: {
        MIN_FRAMES: 10,
        IDEAL_FRAMES: 20,
        AUTO_STOP_DELAY: 3e3
      },
      // 移除全局阈值，改为每个手势独立计算
      BASE_THRESHOLD: 0.6
      // 基础阈值，实际会动态调整
    },
    // 存储自定义手势模板（增强版）
    _customTemplates: {},
    _isRecordingCustom: false,
    _recordingName: null,
    _recordingFrames: [],
    _recordingStartTime: null,
    _autoStopTimer: null,
    // ========== 初始化 ==========
    init() {
      try {
        const saved = localStorage.getItem("echoHand_customTemplates_v2");
        if (saved) {
          this._customTemplates = JSON.parse(saved);
          formatAppLog("log", "at pages/index/signLanguage.js:32", `[手势系统] 加载了 ${Object.keys(this._customTemplates).length} 个手势`);
        }
      } catch (e) {
        formatAppLog("warn", "at pages/index/signLanguage.js:35", "[手势系统] 加载手势失败:", e);
        try {
          const savedOld = localStorage.getItem("echoHand_customTemplates");
          if (savedOld) {
            this._customTemplates = JSON.parse(savedOld);
            this._upgradeTemplates();
          }
        } catch (e2) {
          formatAppLog("warn", "at pages/index/signLanguage.js:45", "[手势系统] 旧版本迁移失败");
        }
      }
      return this;
    },
    // 升级旧模板数据结构
    _upgradeTemplates() {
      for (const [name, template] of Object.entries(this._customTemplates)) {
        if (!template.threshold) {
          template.threshold = this._calculateDynamicThreshold(template);
          template.featureRanges = this._calculateFeatureRanges(template.features);
        }
      }
      this._saveTemplates();
    },
    _saveTemplates() {
      try {
        localStorage.setItem("echoHand_customTemplates_v2", JSON.stringify(this._customTemplates));
      } catch (e) {
        formatAppLog("warn", "at pages/index/signLanguage.js:67", "[手势系统] 保存手势失败:", e);
      }
    },
    // ========== 基础工具函数 ==========
    getDist(p1, p2) {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const dz = p1.z - p2.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    },
    getStretch(lm, tipIdx, mcpIdx) {
      const d1 = this.getDist(lm[tipIdx], lm[0]);
      const d2 = this.getDist(lm[mcpIdx], lm[0]);
      return d1 / d2;
    },
    // ========== 增强的录制功能 ==========
    /**
     * 开始录制自定义手势
     */
    startRecordingCustom(name) {
      if (!name || name.trim() === "") {
        return { success: false, message: "手势名称不能为空" };
      }
      if (this._isRecordingCustom) {
        return { success: false, message: "已经在录制中" };
      }
      this._isRecordingCustom = true;
      this._recordingName = name.trim();
      this._recordingFrames = [];
      this._recordingStartTime = Date.now();
      formatAppLog("log", "at pages/index/signLanguage.js:104", `[手势系统] 开始录制: "${this._recordingName}"`);
      this._autoStopTimer = setTimeout(() => {
        this._autoStopRecording();
      }, this.CONFIG.RECORDING.AUTO_STOP_DELAY);
      return {
        success: true,
        message: "开始录制",
        name: this._recordingName
      };
    },
    /**
     * 完成录制（增强版）
     */
    _finishRecording(isManual) {
      if (!this._isRecordingCustom) {
        return { success: false, message: "未在录制状态" };
      }
      if (this._autoStopTimer) {
        clearTimeout(this._autoStopTimer);
        this._autoStopTimer = null;
      }
      if (this._recordingFrames.length < this.CONFIG.RECORDING.MIN_FRAMES) {
        formatAppLog("warn", "at pages/index/signLanguage.js:131", `[手势系统] 帧数不足: ${this._recordingFrames.length}帧`);
        this._cancelRecording();
        return {
          success: false,
          message: `录制时间太短 (${this._recordingFrames.length}帧)`,
          frameCount: this._recordingFrames.length
        };
      }
      const template = this._createEnhancedTemplate(this._recordingFrames);
      this._customTemplates[this._recordingName] = template;
      this._saveTemplates();
      const duration = ((Date.now() - this._recordingStartTime) / 1e3).toFixed(1);
      formatAppLog("log", "at pages/index/signLanguage.js:148", `[手势系统] 录制完成: "${this._recordingName}"，${this._recordingFrames.length}帧，阈值:${template.threshold.toFixed(2)}`);
      const result = {
        success: true,
        name: this._recordingName,
        frameCount: this._recordingFrames.length,
        duration,
        threshold: template.threshold.toFixed(2)
      };
      this._resetRecording();
      return result;
    },
    /**
     * 创建增强模板（包含个性化阈值）
     */
    _createEnhancedTemplate(frames) {
      if (frames.length === 0)
        return null;
      const features = {
        stretches: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 },
        thumbIndexDist: 0,
        palmWidth: 0,
        thumbTipY: 0,
        indexTipY: 0,
        middleTipY: 0,
        wrist: { x: 0, y: 0, z: 0 }
      };
      frames.forEach((frame) => {
        features.stretches.thumb += frame.thumbStretch;
        features.stretches.index += frame.indexStretch;
        features.stretches.middle += frame.middleStretch;
        features.stretches.ring += frame.ringStretch;
        features.stretches.pinky += frame.pinkyStretch;
        features.thumbIndexDist += frame.thumbIndexDist;
        features.palmWidth += frame.palmWidth;
        features.thumbTipY += frame.thumbTipY;
        features.indexTipY += frame.indexTipY;
        features.middleTipY += frame.middleTipY || frame.indexTipY;
        features.wrist.x += frame.wrist.x;
        features.wrist.y += frame.wrist.y;
        features.wrist.z += frame.wrist.z;
      });
      const frameCount = frames.length;
      features.stretches.thumb /= frameCount;
      features.stretches.index /= frameCount;
      features.stretches.middle /= frameCount;
      features.stretches.ring /= frameCount;
      features.stretches.pinky /= frameCount;
      features.thumbIndexDist /= frameCount;
      features.palmWidth /= frameCount;
      features.thumbTipY /= frameCount;
      features.indexTipY /= frameCount;
      features.middleTipY /= frameCount;
      features.wrist.x /= frameCount;
      features.wrist.y /= frameCount;
      features.wrist.z /= frameCount;
      const featureRanges = this._calculateFeatureRanges(features);
      const threshold = this._calculateDynamicThreshold({
        features,
        sampleCount: frameCount,
        featureRanges
      });
      return {
        features,
        sampleCount: frameCount,
        threshold,
        featureRanges,
        createdAt: Date.now()
      };
    },
    /**
     * 计算特征范围
     */
    _calculateFeatureRanges(features) {
      return {
        // 手指伸展度允许范围（±20%）
        thumbStretch: {
          min: features.stretches.thumb * 0.8,
          max: features.stretches.thumb * 1.2
        },
        indexStretch: {
          min: features.stretches.index * 0.8,
          max: features.stretches.index * 1.2
        },
        middleStretch: {
          min: features.stretches.middle * 0.8,
          max: features.stretches.middle * 1.2
        },
        // 距离允许范围
        thumbIndexDist: {
          min: features.thumbIndexDist * 0.7,
          max: features.thumbIndexDist * 1.3
        },
        // 位置允许范围（相对值）
        thumbTipY: {
          min: features.thumbTipY - 0.1,
          max: features.thumbTipY + 0.1
        }
      };
    },
    /**
     * 计算动态阈值
     */
    _calculateDynamicThreshold(template) {
      let baseThreshold = this.CONFIG.BASE_THRESHOLD;
      if (template.sampleCount < 15) {
        baseThreshold *= 0.9;
      } else if (template.sampleCount > 30) {
        baseThreshold *= 1.1;
      }
      const complexity = this._estimateGestureComplexity(template.features);
      if (complexity === "simple") {
        baseThreshold *= 1.1;
      } else if (complexity === "complex") {
        baseThreshold *= 0.9;
      }
      return Math.max(0.5, Math.min(0.9, baseThreshold));
    },
    /**
     * 估计手势复杂度
     */
    _estimateGestureComplexity(features) {
      const stretches = [
        features.stretches.thumb,
        features.stretches.index,
        features.stretches.middle,
        features.stretches.ring,
        features.stretches.pinky
      ];
      const avg = stretches.reduce((a, b) => a + b, 0) / stretches.length;
      const variance = stretches.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / stretches.length;
      if (variance < 0.05) {
        return "simple";
      } else if (variance > 0.2) {
        return "complex";
      }
      return "medium";
    },
    /**
     * 提取单帧特征（增强版）
     */
    _extractFrameFeatures(lm) {
      return {
        // 手指伸展度
        thumbStretch: this.getStretch(lm, 4, 2),
        indexStretch: this.getStretch(lm, 8, 5),
        middleStretch: this.getStretch(lm, 12, 9),
        ringStretch: this.getStretch(lm, 16, 13),
        pinkyStretch: this.getStretch(lm, 20, 17),
        // 关键距离
        thumbIndexDist: this.getDist(lm[4], lm[5]),
        indexMiddleDist: this.getDist(lm[8], lm[12]),
        palmWidth: this.getDist(lm[5], lm[17]),
        // 指尖位置
        thumbTipY: lm[4].y,
        indexTipY: lm[8].y,
        middleTipY: lm[12].y,
        // 手腕位置
        wrist: { x: lm[0].x, y: lm[0].y, z: lm[0].z }
      };
    },
    // ========== 增强的匹配功能 ==========
    /**
     * 匹配自定义手势（新逻辑）
     */
    _matchCustomTemplates(lm) {
      if (Object.keys(this._customTemplates).length === 0) {
        return null;
      }
      const currentFeatures = this._extractFrameFeatures(lm);
      const matches = [];
      for (const [name, template] of Object.entries(this._customTemplates)) {
        const similarity = this._calculateEnhancedSimilarity(currentFeatures, template);
        if (similarity >= template.threshold) {
          matches.push({
            name,
            similarity,
            threshold: template.threshold,
            margin: similarity - template.threshold
            // 超过阈值的余量
          });
        }
      }
      if (matches.length === 0) {
        return null;
      }
      matches.sort((a, b) => b.similarity - a.similarity);
      if (matches.length >= 2) {
        const best = matches[0];
        const second = matches[1];
        if (best.similarity - second.similarity < 0.1) {
          return null;
        }
      }
      return matches[0].name;
    },
    /**
     * 计算增强相似度
     */
    _calculateEnhancedSimilarity(current, template) {
      let totalScore = 0;
      let totalWeight = 0;
      const ranges = template.featureRanges;
      const t = template.features;
      const fingerWeights = [0.25, 0.25, 0.2, 0.15, 0.15];
      const fingers = ["thumb", "index", "middle", "ring", "pinky"];
      let fingerScore = 0;
      fingers.forEach((finger, idx) => {
        const currentVal = current[finger + "Stretch"];
        const templateVal = t.stretches[finger];
        const range = ranges[finger + "Stretch"];
        if (range) {
          if (currentVal >= range.min && currentVal <= range.max) {
            fingerScore += 1 * fingerWeights[idx];
          } else {
            const distToMin = Math.abs(currentVal - range.min);
            const distToMax = Math.abs(currentVal - range.max);
            const rangeWidth = range.max - range.min;
            const penalty = Math.min(distToMin, distToMax) / rangeWidth;
            fingerScore += (1 - Math.min(penalty, 1)) * fingerWeights[idx];
          }
        } else {
          const diff = Math.abs(currentVal - templateVal) / Math.max(templateVal, 0.1);
          fingerScore += (1 - Math.min(diff, 1)) * fingerWeights[idx];
        }
      });
      totalScore += fingerScore * 0.5;
      totalWeight += 0.5;
      if (t.palmWidth > 0.01) {
        const currentDistNorm = current.thumbIndexDist / current.palmWidth;
        const templateDistNorm = t.thumbIndexDist / t.palmWidth;
        const range = ranges.thumbIndexDist;
        let distanceScore = 0;
        if (range) {
          const normMin = range.min / t.palmWidth;
          const normMax = range.max / t.palmWidth;
          if (currentDistNorm >= normMin && currentDistNorm <= normMax) {
            distanceScore = 1;
          } else {
            const distToMin = Math.abs(currentDistNorm - normMin);
            const distToMax = Math.abs(currentDistNorm - normMax);
            const rangeWidth = normMax - normMin;
            const penalty = Math.min(distToMin, distToMax) / rangeWidth;
            distanceScore = 1 - Math.min(penalty, 1);
          }
        } else {
          const diff = Math.abs(currentDistNorm - templateDistNorm) / Math.max(templateDistNorm, 0.1);
          distanceScore = 1 - Math.min(diff, 0.5);
        }
        totalScore += distanceScore * 0.3;
        totalWeight += 0.3;
      }
      let positionScore = 0;
      const rangeY = ranges.thumbTipY;
      if (rangeY) {
        if (current.thumbTipY >= rangeY.min && current.thumbTipY <= rangeY.max) {
          positionScore += 0.5;
        } else {
          const distToMin = Math.abs(current.thumbTipY - rangeY.min);
          const distToMax = Math.abs(current.thumbTipY - rangeY.max);
          const rangeWidth = rangeY.max - rangeY.min;
          const penalty = Math.min(distToMin, distToMax) / rangeWidth;
          positionScore += (1 - Math.min(penalty, 1)) * 0.5;
        }
      }
      const middleDiff = Math.abs(current.middleTipY - t.middleTipY);
      positionScore += (1 - Math.min(middleDiff / 0.2, 1)) * 0.5;
      totalScore += positionScore * 0.2;
      totalWeight += 0.2;
      return totalWeight > 0 ? totalScore / totalWeight : 0;
    },
    // ========== 其他功能保持不变 ==========
    addRecordingFrame(lm) {
      if (!this._isRecordingCustom || !lm || lm.length < 21) {
        return { recorded: false, message: "无法录制" };
      }
      const features = this._extractFrameFeatures(lm);
      this._recordingFrames.push(features);
      if (this._recordingFrames.length >= this.CONFIG.RECORDING.IDEAL_FRAMES) {
        setTimeout(() => this._finishRecording(false), 300);
      }
      const duration = this._recordingStartTime ? ((Date.now() - this._recordingStartTime) / 1e3).toFixed(1) : 0;
      return {
        recorded: true,
        frameCount: this._recordingFrames.length,
        duration,
        progress: Math.min(100, Math.floor(this._recordingFrames.length / this.CONFIG.RECORDING.IDEAL_FRAMES * 100))
      };
    },
    getRecordingStatus() {
      if (!this._isRecordingCustom)
        return null;
      const duration = this._recordingStartTime ? ((Date.now() - this._recordingStartTime) / 1e3).toFixed(1) : 0;
      const progress = Math.min(100, Math.floor(this._recordingFrames.length / this.CONFIG.RECORDING.IDEAL_FRAMES * 100));
      return {
        name: this._recordingName,
        frameCount: this._recordingFrames.length,
        duration,
        progress
      };
    },
    getCustomGestures() {
      return Object.keys(this._customTemplates).map((name) => {
        const template = this._customTemplates[name];
        return {
          name,
          sampleCount: template.sampleCount,
          threshold: template.threshold ? template.threshold.toFixed(2) : "0.60",
          createdAt: new Date(template.createdAt).toLocaleString()
        };
      });
    },
    deleteCustomGesture(name) {
      if (this._customTemplates[name]) {
        delete this._customTemplates[name];
        this._saveTemplates();
        formatAppLog("log", "at pages/index/signLanguage.js:541", `[手势系统] 已删除手势: "${name}"`);
        return true;
      }
      return false;
    },
    clearCustomGestures() {
      const count = Object.keys(this._customTemplates).length;
      this._customTemplates = {};
      this._saveTemplates();
      formatAppLog("log", "at pages/index/signLanguage.js:551", `[手势系统] 已清空 ${count} 个手势`);
      return count;
    },
    stopRecordingCustom() {
      return this._finishRecording(true);
    },
    cancelRecordingCustom() {
      const result = this._cancelRecording();
      this._resetRecording();
      return result;
    },
    _cancelRecording() {
      if (this._autoStopTimer) {
        clearTimeout(this._autoStopTimer);
        this._autoStopTimer = null;
      }
      return {
        success: false,
        message: "录制已取消",
        frameCount: this._recordingFrames.length
      };
    },
    _resetRecording() {
      this._isRecordingCustom = false;
      this._recordingName = null;
      this._recordingFrames = [];
      this._recordingStartTime = null;
    },
    _autoStopRecording() {
      formatAppLog("log", "at pages/index/signLanguage.js:586", "[手势系统] 自动停止录制");
      this._finishRecording(false);
    },
    // ========== 主分析函数 ==========
    analyze(multiHandLandmarks) {
      if (!multiHandLandmarks || multiHandLandmarks.length === 0) {
        return null;
      }
      const lm = multiHandLandmarks[0];
      if (this._isRecordingCustom) {
        const recordingResult = this.addRecordingFrame(lm);
        return recordingResult.recorded ? "RECORDING" : null;
      }
      const customMatch = this._matchCustomTemplates(lm);
      if (customMatch) {
        return `[${customMatch}]`;
      }
      return null;
    }
  };
  SignLanguageProcessor.init();
  const block0 = (Comp) => {
    (Comp.$renderjs || (Comp.$renderjs = [])).push("mediapipe");
    (Comp.$renderjsModules || (Comp.$renderjsModules = {}))["mediapipe"] = "04fd029c";
  };
  const _export_sfc = (sfc, props) => {
    const target = sfc.__vccOpts || sfc;
    for (const [key, val] of props) {
      target[key] = val;
    }
    return target;
  };
  const _sfc_main$1 = {
    data() {
      return {
        translatedText: "等待激活",
        displayText: "等待激活",
        isCameraRunning: false,
        loadingStatus: "等待用户激活",
        cameraModeName: "未开启",
        // 识别存储相关
        historyList: [],
        lastWord: "",
        lastTime: 0,
        // 自定义手势相关
        showCustomPanel: false,
        customGestureName: "",
        isRecordingCustom: false,
        // 录制状态
        recordingState: "idle",
        recordingProgress: 0,
        recordingFrames: 0,
        recordingQuality: 0,
        recordingTime: 0,
        idealFrames: 20,
        isCountingDown: true,
        countdown: 3,
        // 计时器
        _recordingTimer: null,
        _countdownTimer: null
      };
    },
    computed: {
      displayTime() {
        if (this.isCountingDown) {
          return `准备: ${this.countdown}秒`;
        } else {
          const secs = this.recordingTime;
          return `录制: ${secs}秒`;
        }
      }
    },
    onShow() {
      this.refreshCustomGesturesList();
    },
    onHide() {
      this.cleanupTimers();
      if (this.isRecordingCustom) {
        this.cancelRecording();
      }
    },
    methods: {
      receiveMessage(data) {
        if (data.type === "ready") {
          this.isCameraRunning = true;
          this.cameraModeName = data.content === "user" ? "前置" : "后置";
        }
        if (data.type === "ai_online") {
          this.translatedText = "请做出手势";
          this.displayText = "请做出手势";
        }
        if (data.type === "log")
          this.loadingStatus = data.content;
        if (data.type === "error")
          uni.showModal({ title: "硬件提示", content: data.content });
        if (data.type === "hand_data") {
          this.handleSignLogic(data.content);
        }
      },
      handleSignLogic(landmarks) {
        if (this.isRecordingCustom) {
          this.processRecordingFrame(landmarks);
          return;
        }
        const word = SignLanguageProcessor.analyze(landmarks);
        const now = Date.now();
        if (word && word !== this.lastWord && now - this.lastTime > 800) {
          this.translatedText = word;
          this.displayText = word;
          this.lastWord = word;
          this.lastTime = now;
          const record = { word, timestamp: now };
          this.historyList.push(record);
          this.syncToBackend(record);
          uni.vibrateShort();
        }
      },
      // ========== 录制相关方法 ==========
      processRecordingFrame(landmarks) {
        const result = SignLanguageProcessor.analyze(landmarks);
        if (result === "RECORDING") {
          const status = SignLanguageProcessor.getRecordingStatus();
          if (status) {
            this.recordingState = status.state;
            this.recordingFrames = status.frameCount;
            this.recordingProgress = status.progress;
            this.recordingQuality = Math.floor(parseFloat(status.quality) || 50);
            this.idealFrames = status.idealFrames || 20;
            this.updateRecordingDisplay();
          }
        }
      },
      updateRecordingDisplay() {
        const statusMap = {
          "preparing": "准备中",
          "recording": "录制中",
          "processing": "处理中",
          "complete": "完成"
        };
        const statusText = statusMap[this.recordingState] || "录制中";
        this.displayText = `${statusText}: ${this.customGestureName}
${this.recordingFrames}帧 ${this.recordingQuality}%`;
      },
      getStatusText() {
        const texts = {
          "idle": "准备中",
          "preparing": "准备录制",
          "recording": "录制中",
          "processing": "处理中",
          "complete": "完成"
        };
        return texts[this.recordingState] || "录制中";
      },
      getQualityClass(quality) {
        if (quality >= 70)
          return "quality-good";
        if (quality >= 50)
          return "quality-medium";
        return "quality-poor";
      },
      startCustomRecording() {
        if (!this.customGestureName.trim()) {
          uni.showToast({ title: "请输入手势名称", icon: "none" });
          return;
        }
        const result = SignLanguageProcessor.startRecordingCustom(this.customGestureName);
        if (!result.success) {
          uni.showToast({ title: result.message, icon: "none" });
          return;
        }
        this.isRecordingCustom = true;
        this.recordingState = "preparing";
        this.recordingProgress = 0;
        this.recordingFrames = 0;
        this.recordingQuality = 50;
        this.recordingTime = 0;
        this.isCountingDown = true;
        this.countdown = 3;
        this.startCountdown();
        this.startRecordingTimer();
      },
      startCountdown() {
        this._countdownTimer = setInterval(() => {
          this.countdown--;
          if (this.countdown <= 0) {
            clearInterval(this._countdownTimer);
            this.isCountingDown = false;
            this.recordingState = "recording";
          }
        }, 1e3);
      },
      startRecordingTimer() {
        this._recordingTimer = setInterval(() => {
          if (!this.isCountingDown) {
            this.recordingTime++;
          }
        }, 1e3);
      },
      stopRecording() {
        const result = SignLanguageProcessor.stopRecordingCustom();
        this.cleanupTimers();
        if (result.success) {
          this.recordingState = "complete";
          this.displayText = `录制完成: ${result.name}`;
          setTimeout(() => {
            this.isRecordingCustom = false;
            this.translatedText = "请做出手势";
            this.displayText = "请做出手势";
            this.refreshCustomGesturesList();
            this.showCustomPanel = false;
            uni.showToast({
              title: `"${result.name}"录制成功 (${result.frameCount}帧)`,
              icon: "success",
              duration: 2e3
            });
          }, 1e3);
        } else {
          uni.showToast({
            title: result.message || "录制失败",
            icon: "none",
            duration: 2e3
          });
          this.cancelRecording();
        }
      },
      cancelRecording() {
        const result = SignLanguageProcessor.cancelRecordingCustom();
        this.cleanupTimers();
        this.isRecordingCustom = false;
        this.translatedText = "请做出手势";
        this.displayText = "请做出手势";
        if (result.frameCount > 0) {
          uni.showToast({
            title: `已取消 (${result.frameCount}帧)`,
            icon: "none",
            duration: 1500
          });
        }
      },
      cleanupTimers() {
        if (this._recordingTimer) {
          clearInterval(this._recordingTimer);
          this._recordingTimer = null;
        }
        if (this._countdownTimer) {
          clearInterval(this._countdownTimer);
          this._countdownTimer = null;
        }
      },
      // ========== 手势管理方法 ==========
      refreshCustomGesturesList() {
        this.customGesturesList = SignLanguageProcessor.getCustomGestures();
      },
      deleteCustomGesture(name) {
        uni.showModal({
          title: "确认删除",
          content: `确定要删除手势"${name}"吗？`,
          success: (res) => {
            if (res.confirm) {
              SignLanguageProcessor.deleteCustomGesture(name);
              this.refreshCustomGesturesList();
              uni.showToast({ title: "已删除", icon: "success" });
            }
          }
        });
      },
      clearAllCustomGestures() {
        uni.showModal({
          title: "确认清空",
          content: "确定要清空所有自定义手势吗？",
          success: (res) => {
            if (res.confirm) {
              const count = SignLanguageProcessor.clearCustomGestures();
              this.refreshCustomGesturesList();
              uni.showToast({ title: `已清空 ${count} 个手势`, icon: "success" });
            }
          }
        });
      },
      toggleCustomPanel() {
        this.showCustomPanel = !this.showCustomPanel;
        if (this.showCustomPanel) {
          this.refreshCustomGesturesList();
        }
      },
      syncToBackend(record) {
        formatAppLog("log", "at pages/index/index.vue:466", "已存入历史:", record);
      },
      clearText() {
        this.translatedText = "等待识别";
        this.displayText = "等待识别";
        this.historyList = [];
        this.lastWord = "";
      }
    }
  };
  function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "container" }, [
      vue.createElementVNode("view", { class: "status-bar" }, [
        vue.createElementVNode("view", { class: "header" }, [
          vue.createElementVNode("text", { class: "title" }, "EchoHand Pro"),
          vue.createElementVNode("text", { class: "version" }, "v1.5.1 录制可见版")
        ]),
        vue.createElementVNode(
          "text",
          { class: "result-text" },
          vue.toDisplayString($data.displayText),
          1
          /* TEXT */
        )
      ]),
      vue.createElementVNode("view", { class: "vision-area" }, [
        vue.createElementVNode("view", {
          id: "video_mount_container",
          class: "video-hidden"
        }),
        vue.createElementVNode("view", {
          id: "canvas_mount_container",
          class: "canvas-full"
        }),
        $data.isRecordingCustom ? (vue.openBlock(), vue.createElementBlock("view", {
          key: 0,
          class: "recording-overlay"
        }, [
          vue.createElementVNode("view", { class: "overlay-background" }),
          vue.createElementVNode("view", { class: "recording-card" }, [
            vue.createElementVNode(
              "text",
              { class: "recording-title" },
              "录制手势: " + vue.toDisplayString($data.customGestureName),
              1
              /* TEXT */
            ),
            vue.createElementVNode(
              "view",
              {
                class: vue.normalizeClass(["status-indicator", $data.recordingState])
              },
              [
                vue.createElementVNode(
                  "text",
                  { class: "status-text" },
                  vue.toDisplayString($options.getStatusText()),
                  1
                  /* TEXT */
                ),
                $data.recordingState === "preparing" ? (vue.openBlock(), vue.createElementBlock(
                  "text",
                  {
                    key: 0,
                    class: "status-subtext"
                  },
                  " 请准备好手势，" + vue.toDisplayString($data.countdown) + "秒后开始 ",
                  1
                  /* TEXT */
                )) : vue.createCommentVNode("v-if", true),
                $data.recordingState === "recording" ? (vue.openBlock(), vue.createElementBlock("text", {
                  key: 1,
                  class: "status-subtext"
                }, " 保持手势稳定 ")) : vue.createCommentVNode("v-if", true)
              ],
              2
              /* CLASS */
            ),
            vue.createElementVNode("view", { class: "progress-container" }, [
              vue.createElementVNode("view", { class: "progress-bar" }, [
                vue.createElementVNode(
                  "view",
                  {
                    class: "progress-fill",
                    style: vue.normalizeStyle({ width: $data.recordingProgress + "%" })
                  },
                  null,
                  4
                  /* STYLE */
                )
              ]),
              vue.createElementVNode(
                "text",
                { class: "progress-text" },
                vue.toDisplayString($data.recordingProgress) + "% (" + vue.toDisplayString($data.recordingFrames) + "/" + vue.toDisplayString($data.idealFrames) + "帧) ",
                1
                /* TEXT */
              )
            ]),
            vue.createElementVNode("view", { class: "quality-indicator" }, [
              vue.createElementVNode("text", { class: "quality-label" }, "稳定性: "),
              vue.createElementVNode(
                "text",
                {
                  class: vue.normalizeClass(["quality-value", $options.getQualityClass($data.recordingQuality)])
                },
                vue.toDisplayString($data.recordingQuality) + "% ",
                3
                /* TEXT, CLASS */
              )
            ]),
            vue.createElementVNode("view", { class: "timer-display" }, [
              vue.createElementVNode(
                "text",
                { class: "timer-value" },
                vue.toDisplayString($options.displayTime),
                1
                /* TEXT */
              )
            ]),
            vue.createElementVNode("view", { class: "recording-buttons" }, [
              vue.createElementVNode("button", {
                class: "btn-cancel",
                onClick: _cache[0] || (_cache[0] = (...args) => $options.cancelRecording && $options.cancelRecording(...args))
              }, "取消"),
              vue.createElementVNode("button", {
                class: "btn-stop",
                onClick: _cache[1] || (_cache[1] = (...args) => $options.stopRecording && $options.stopRecording(...args)),
                disabled: $data.recordingState === "preparing"
              }, vue.toDisplayString($data.recordingState === "recording" ? "完成录制" : "准备中..."), 9, ["disabled"])
            ]),
            vue.createElementVNode("view", { class: "recording-hints" }, [
              vue.createElementVNode("text", { class: "hint-title" }, "录制说明："),
              vue.createElementVNode("text", { class: "hint-item" }, "• 这是静态手势录制"),
              vue.createElementVNode("text", { class: "hint-item" }, "• 请保持手势稳定不动"),
              vue.createElementVNode("text", { class: "hint-item" }, "• 系统会记录您的手势特征"),
              vue.createElementVNode("text", { class: "hint-item" }, "• 完成后会优先匹配您的个性化手势")
            ])
          ])
        ])) : vue.createCommentVNode("v-if", true),
        !$data.isCameraRunning ? (vue.openBlock(), vue.createElementBlock("view", {
          key: 1,
          class: "loading-overlay"
        }, [
          vue.createElementVNode("view", { class: "start-card" }, [
            vue.createElementVNode("text", { class: "card-title" }, "系统就绪"),
            vue.createElementVNode("text", { class: "card-desc" }, "已适配全屏高质量识别"),
            vue.createElementVNode("button", {
              class: "btn-start",
              onClick: _cache[2] || (_cache[2] = (...args) => _ctx.mediapipe.manualStart && _ctx.mediapipe.manualStart(...args))
            }, "激活摄像头"),
            vue.createElementVNode(
              "text",
              { class: "debug-status" },
              vue.toDisplayString($data.loadingStatus),
              1
              /* TEXT */
            )
          ])
        ])) : vue.createCommentVNode("v-if", true)
      ]),
      $data.showCustomPanel && !$data.isRecordingCustom ? (vue.openBlock(), vue.createElementBlock("view", {
        key: 0,
        class: "custom-panel"
      }, [
        vue.createElementVNode("view", { class: "custom-header" }, [
          vue.createElementVNode("text", { class: "custom-title" }, "自定义手势管理"),
          vue.createElementVNode("text", {
            class: "custom-close",
            onClick: _cache[3] || (_cache[3] = (...args) => $options.toggleCustomPanel && $options.toggleCustomPanel(...args))
          }, "×")
        ]),
        vue.createElementVNode("view", { class: "recording-section" }, [
          vue.createElementVNode("text", { class: "section-title" }, "录制新手势"),
          vue.createElementVNode("text", { class: "recording-description" }, " 录制静态手势：保持手势稳定2-3秒，系统会记录您的手势特征 "),
          vue.createElementVNode("view", { class: "input-row" }, [
            vue.withDirectives(vue.createElementVNode(
              "input",
              {
                "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => $data.customGestureName = $event),
                placeholder: "输入手势名称，如：谢谢、爱、好",
                class: "gesture-input"
              },
              null,
              512
              /* NEED_PATCH */
            ), [
              [vue.vModelText, $data.customGestureName]
            ]),
            vue.createElementVNode("button", {
              onClick: _cache[5] || (_cache[5] = ($event) => $options.startCustomRecording()),
              class: "record-btn start-btn",
              disabled: !$data.customGestureName.trim()
            }, " 开始录制 ", 8, ["disabled"])
          ]),
          _ctx.customGesturesList.length > 0 ? (vue.openBlock(), vue.createElementBlock("view", {
            key: 0,
            class: "gestures-section"
          }, [
            vue.createElementVNode(
              "text",
              { class: "section-title" },
              "已录制的手势 (" + vue.toDisplayString(_ctx.customGesturesList.length) + "个)",
              1
              /* TEXT */
            ),
            vue.createElementVNode("view", { class: "gesture-list" }, [
              (vue.openBlock(true), vue.createElementBlock(
                vue.Fragment,
                null,
                vue.renderList(_ctx.customGesturesList, (gesture) => {
                  return vue.openBlock(), vue.createElementBlock("view", {
                    key: gesture.name,
                    class: "gesture-item"
                  }, [
                    vue.createElementVNode("view", { class: "gesture-info" }, [
                      vue.createElementVNode(
                        "text",
                        { class: "gesture-name" },
                        vue.toDisplayString(gesture.name),
                        1
                        /* TEXT */
                      ),
                      vue.createElementVNode(
                        "text",
                        { class: "gesture-details" },
                        vue.toDisplayString(gesture.sampleCount) + "样本 · " + vue.toDisplayString(gesture.quality) + "质量 ",
                        1
                        /* TEXT */
                      )
                    ]),
                    vue.createElementVNode("button", {
                      onClick: ($event) => $options.deleteCustomGesture(gesture.name),
                      class: "btn-delete"
                    }, "删除", 8, ["onClick"])
                  ]);
                }),
                128
                /* KEYED_FRAGMENT */
              ))
            ]),
            vue.createElementVNode("button", {
              onClick: _cache[6] || (_cache[6] = (...args) => $options.clearAllCustomGestures && $options.clearAllCustomGestures(...args)),
              class: "clear-all-btn"
            }, "清空所有手势")
          ])) : (vue.openBlock(), vue.createElementBlock("view", {
            key: 1,
            class: "empty-gestures"
          }, [
            vue.createElementVNode("text", { class: "empty-text" }, "暂无自定义手势"),
            vue.createElementVNode("text", { class: "empty-tip" }, "录制您的个性化手势以提高识别准确率")
          ]))
        ])
      ])) : vue.createCommentVNode("v-if", true),
      !$data.isRecordingCustom ? (vue.openBlock(), vue.createElementBlock("view", {
        key: 1,
        class: "custom-trigger",
        onClick: _cache[7] || (_cache[7] = (...args) => $options.toggleCustomPanel && $options.toggleCustomPanel(...args))
      }, [
        vue.createElementVNode("text", { class: "trigger-text" }, "✋ 自定义手势")
      ])) : vue.createCommentVNode("v-if", true),
      vue.createElementVNode("view", { class: "action-bar" }, [
        vue.createElementVNode("view", { class: "debug-panel" }, [
          vue.createElementVNode(
            "text",
            { class: "debug-line" },
            "设备状态：" + vue.toDisplayString($data.cameraModeName),
            1
            /* TEXT */
          ),
          vue.createElementVNode(
            "text",
            { class: "debug-line" },
            "历史序列：" + vue.toDisplayString($data.historyList.map((i) => i.word).join("")),
            1
            /* TEXT */
          ),
          $data.isRecordingCustom ? (vue.openBlock(), vue.createElementBlock(
            "text",
            {
              key: 0,
              class: "debug-line recording-debug"
            },
            " 录制：" + vue.toDisplayString($data.customGestureName) + " | " + vue.toDisplayString($data.recordingFrames) + "帧 | " + vue.toDisplayString($data.recordingState),
            1
            /* TEXT */
          )) : vue.createCommentVNode("v-if", true)
        ]),
        vue.createElementVNode("view", { class: "btn-group" }, [
          vue.createElementVNode("button", {
            class: "btn-switch",
            onClick: _cache[8] || (_cache[8] = (...args) => _ctx.mediapipe.switchCamera && _ctx.mediapipe.switchCamera(...args))
          }, "切换摄像头"),
          vue.createElementVNode("button", {
            class: "btn-clear",
            onClick: _cache[9] || (_cache[9] = (...args) => $options.clearText && $options.clearText(...args))
          }, "清空历史")
        ])
      ])
    ]);
  }
  if (typeof block0 === "function")
    block0(_sfc_main$1);
  const PagesIndexIndex = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["render", _sfc_render], ["__file", "D:/Echohand/pages/index/index.vue"]]);
  __definePage("pages/index/index", PagesIndexIndex);
  const _sfc_main = {
    onLaunch: function() {
      formatAppLog("log", "at App.vue:4", "App Launch");
    },
    onShow: function() {
      formatAppLog("log", "at App.vue:7", "App Show");
    },
    onHide: function() {
      formatAppLog("log", "at App.vue:10", "App Hide");
    }
  };
  const App = /* @__PURE__ */ _export_sfc(_sfc_main, [["__file", "D:/Echohand/App.vue"]]);
  function createApp() {
    const app = vue.createVueApp(App);
    return {
      app
    };
  }
  const { app: __app__, Vuex: __Vuex__, Pinia: __Pinia__ } = createApp();
  uni.Vuex = __Vuex__;
  uni.Pinia = __Pinia__;
  __app__.provide("__globalStyles", __uniConfig.styles);
  __app__._component.mpType = "app";
  __app__._component.render = () => {
  };
  __app__.mount("#app");
})(Vue);
