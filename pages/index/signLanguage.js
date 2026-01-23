/**
 * 中国手语识别算法 - 个性化阈值版
 * 每个手势有自己的匹配阈值和特征范围
 */

export const SignLanguageProcessor = {
    // 配置参数
    CONFIG: {
        RECORDING: {
            MIN_FRAMES: 10,
            IDEAL_FRAMES: 20,
            AUTO_STOP_DELAY: 3000
        },
        // 移除全局阈值，改为每个手势独立计算
        BASE_THRESHOLD: 0.6  // 基础阈值，实际会动态调整
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
            const saved = localStorage.getItem('echoHand_customTemplates_v2');
            if (saved) {
                this._customTemplates = JSON.parse(saved);
                console.log(`[手势系统] 加载了 ${Object.keys(this._customTemplates).length} 个手势`);
            }
        } catch (e) {
            console.warn('[手势系统] 加载手势失败:', e);
            // 尝试兼容旧版本
            try {
                const savedOld = localStorage.getItem('echoHand_customTemplates');
                if (savedOld) {
                    this._customTemplates = JSON.parse(savedOld);
                    // 升级数据结构
                    this._upgradeTemplates();
                }
            } catch (e2) {
                console.warn('[手势系统] 旧版本迁移失败');
            }
        }
        return this;
    },
    
    // 升级旧模板数据结构
    _upgradeTemplates() {
        for (const [name, template] of Object.entries(this._customTemplates)) {
            if (!template.threshold) {
                // 为旧模板添加动态阈值
                template.threshold = this._calculateDynamicThreshold(template);
                template.featureRanges = this._calculateFeatureRanges(template.features);
            }
        }
        this._saveTemplates();
    },
    
    _saveTemplates() {
        try {
            localStorage.setItem('echoHand_customTemplates_v2', JSON.stringify(this._customTemplates));
        } catch (e) {
            console.warn('[手势系统] 保存手势失败:', e);
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
        if (!name || name.trim() === '') {
            return { success: false, message: '手势名称不能为空' };
        }
        
        if (this._isRecordingCustom) {
            return { success: false, message: '已经在录制中' };
        }
        
        this._isRecordingCustom = true;
        this._recordingName = name.trim();
        this._recordingFrames = [];
        this._recordingStartTime = Date.now();
        
        console.log(`[手势系统] 开始录制: "${this._recordingName}"`);
        
        this._autoStopTimer = setTimeout(() => {
            this._autoStopRecording();
        }, this.CONFIG.RECORDING.AUTO_STOP_DELAY);
        
        return { 
            success: true, 
            message: '开始录制',
            name: this._recordingName 
        };
    },
    
    /**
     * 完成录制（增强版）
     */
    _finishRecording(isManual) {
        if (!this._isRecordingCustom) {
            return { success: false, message: '未在录制状态' };
        }
        
        if (this._autoStopTimer) {
            clearTimeout(this._autoStopTimer);
            this._autoStopTimer = null;
        }
        
        if (this._recordingFrames.length < this.CONFIG.RECORDING.MIN_FRAMES) {
            console.warn(`[手势系统] 帧数不足: ${this._recordingFrames.length}帧`);
            this._cancelRecording();
            return { 
                success: false, 
                message: `录制时间太短 (${this._recordingFrames.length}帧)`,
                frameCount: this._recordingFrames.length
            };
        }
        
        // 创建增强模板（包含阈值和特征范围）
        const template = this._createEnhancedTemplate(this._recordingFrames);
        
        // 保存模板
        this._customTemplates[this._recordingName] = template;
        this._saveTemplates();
        
        const duration = ((Date.now() - this._recordingStartTime) / 1000).toFixed(1);
        console.log(`[手势系统] 录制完成: "${this._recordingName}"，${this._recordingFrames.length}帧，阈值:${template.threshold.toFixed(2)}`);
        
        const result = {
            success: true,
            name: this._recordingName,
            frameCount: this._recordingFrames.length,
            duration: duration,
            threshold: template.threshold.toFixed(2)
        };
        
        this._resetRecording();
        return result;
    },
    
    /**
     * 创建增强模板（包含个性化阈值）
     */
    _createEnhancedTemplate(frames) {
        if (frames.length === 0) return null;
        
        // 1. 计算基本特征平均值
        const features = {
            stretches: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 },
            thumbIndexDist: 0,
            palmWidth: 0,
            thumbTipY: 0,
            indexTipY: 0,
            middleTipY: 0,
            wrist: { x: 0, y: 0, z: 0 }
        };
        
        frames.forEach(frame => {
            features.stretches.thumb += frame.thumbStretch;
            features.stretches.index += frame.indexStretch;
            features.stretches.middle += frame.middleStretch;
            features.stretches.ring += frame.ringStretch;
            features.stretches.pinky += frame.pinkyStretch;
            features.thumbIndexDist += frame.thumbIndexDist;
            features.palmWidth += frame.palmWidth;
            features.thumbTipY += frame.thumbTipY;
            features.indexTipY += frame.indexTipY;
            features.middleTipY += frame.middleTipY || frame.indexTipY; // 兼容旧数据
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
        
        // 2. 计算特征范围（用于精确匹配）
        const featureRanges = this._calculateFeatureRanges(features);
        
        // 3. 计算动态阈值
        const threshold = this._calculateDynamicThreshold({
            features,
            sampleCount: frameCount,
            featureRanges
        });
        
        return {
            features: features,
            sampleCount: frameCount,
            threshold: threshold,
            featureRanges: featureRanges,
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
        
        // 根据样本数量调整阈值
        if (template.sampleCount < 15) {
            baseThreshold *= 0.9; // 样本少时降低要求
        } else if (template.sampleCount > 30) {
            baseThreshold *= 1.1; // 样本多时提高要求
        }
        
        // 根据手势复杂度调整
        const complexity = this._estimateGestureComplexity(template.features);
        if (complexity === 'simple') {
            baseThreshold *= 1.1; // 简单手势要求更高
        } else if (complexity === 'complex') {
            baseThreshold *= 0.9; // 复杂手势放宽要求
        }
        
        return Math.max(0.5, Math.min(0.9, baseThreshold)); // 限制在0.5-0.9之间
    },
    
    /**
     * 估计手势复杂度
     */
    _estimateGestureComplexity(features) {
        // 计算手指伸展的方差
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
            return 'simple'; // 所有手指状态相近（如握拳或全开）
        } else if (variance > 0.2) {
            return 'complex'; // 手指状态差异大
        }
        return 'medium';
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
        
        // 检查每个手势模板
        for (const [name, template] of Object.entries(this._customTemplates)) {
            const similarity = this._calculateEnhancedSimilarity(currentFeatures, template);
            
            // 只记录超过该手势个性化阈值的匹配
            if (similarity >= template.threshold) {
                matches.push({
                    name,
                    similarity,
                    threshold: template.threshold,
                    margin: similarity - template.threshold // 超过阈值的余量
                });
            }
        }
        
        // 如果没有手势超过阈值，返回null
        if (matches.length === 0) {
            return null;
        }
        
        // 按相似度排序
        matches.sort((a, b) => b.similarity - a.similarity);
        
        // 检查是否明显优于其他匹配
        if (matches.length >= 2) {
            const best = matches[0];
            const second = matches[1];
            
            // 如果第一名没有明显优势，返回null（避免模糊匹配）
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
        
        // 1. 手指伸展度匹配（权重50%）
        const fingerWeights = [0.25, 0.25, 0.2, 0.15, 0.15]; // 拇指、食指、中指、无名指、小指权重
        const fingers = ['thumb', 'index', 'middle', 'ring', 'pinky'];
        
        let fingerScore = 0;
        fingers.forEach((finger, idx) => {
            const currentVal = current[finger + 'Stretch'];
            const templateVal = t.stretches[finger];
            const range = ranges[finger + 'Stretch'];
            
            if (range) {
                // 如果在允许范围内，得满分
                if (currentVal >= range.min && currentVal <= range.max) {
                    fingerScore += 1 * fingerWeights[idx];
                } else {
                    // 计算距离范围内的比例
                    const distToMin = Math.abs(currentVal - range.min);
                    const distToMax = Math.abs(currentVal - range.max);
                    const rangeWidth = range.max - range.min;
                    const penalty = Math.min(distToMin, distToMax) / rangeWidth;
                    fingerScore += (1 - Math.min(penalty, 1)) * fingerWeights[idx];
                }
            } else {
                // 没有范围数据时使用旧方法
                const diff = Math.abs(currentVal - templateVal) / Math.max(templateVal, 0.1);
                fingerScore += (1 - Math.min(diff, 1)) * fingerWeights[idx];
            }
        });
        
        totalScore += fingerScore * 0.5;
        totalWeight += 0.5;
        
        // 2. 关键距离匹配（权重30%）
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
        
        // 3. 位置匹配（权重20%）
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
        
        // 中指位置（新增）
        const middleDiff = Math.abs(current.middleTipY - t.middleTipY);
        positionScore += (1 - Math.min(middleDiff / 0.2, 1)) * 0.5;
        
        totalScore += positionScore * 0.2;
        totalWeight += 0.2;
        
        // 最终得分归一化
        return totalWeight > 0 ? totalScore / totalWeight : 0;
    },
    
    // ========== 其他功能保持不变 ==========
    
    addRecordingFrame(lm) {
        if (!this._isRecordingCustom || !lm || lm.length < 21) {
            return { recorded: false, message: '无法录制' };
        }
        
        const features = this._extractFrameFeatures(lm);
        this._recordingFrames.push(features);
        
        if (this._recordingFrames.length >= this.CONFIG.RECORDING.IDEAL_FRAMES) {
            setTimeout(() => this._finishRecording(false), 300);
        }
        
        const duration = this._recordingStartTime 
            ? ((Date.now() - this._recordingStartTime) / 1000).toFixed(1) 
            : 0;
        
        return {
            recorded: true,
            frameCount: this._recordingFrames.length,
            duration: duration,
            progress: Math.min(100, Math.floor(this._recordingFrames.length / this.CONFIG.RECORDING.IDEAL_FRAMES * 100))
        };
    },
    
    getRecordingStatus() {
        if (!this._isRecordingCustom) return null;
        
        const duration = this._recordingStartTime 
            ? ((Date.now() - this._recordingStartTime) / 1000).toFixed(1) 
            : 0;
        
        const progress = Math.min(100, Math.floor(this._recordingFrames.length / this.CONFIG.RECORDING.IDEAL_FRAMES * 100));
        
        return {
            name: this._recordingName,
            frameCount: this._recordingFrames.length,
            duration: duration,
            progress: progress
        };
    },
    
    getCustomGestures() {
        return Object.keys(this._customTemplates).map(name => {
            const template = this._customTemplates[name];
            return {
                name,
                sampleCount: template.sampleCount,
                threshold: template.threshold ? template.threshold.toFixed(2) : '0.60',
                createdAt: new Date(template.createdAt).toLocaleString()
            };
        });
    },
    
    deleteCustomGesture(name) {
        if (this._customTemplates[name]) {
            delete this._customTemplates[name];
            this._saveTemplates();
            console.log(`[手势系统] 已删除手势: "${name}"`);
            return true;
        }
        return false;
    },
    
    clearCustomGestures() {
        const count = Object.keys(this._customTemplates).length;
        this._customTemplates = {};
        this._saveTemplates();
        console.log(`[手势系统] 已清空 ${count} 个手势`);
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
            message: '录制已取消',
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
        console.log('[手势系统] 自动停止录制');
        this._finishRecording(false);
    },
    
    // ========== 主分析函数 ==========
    
    analyze(multiHandLandmarks) {
        if (!multiHandLandmarks || multiHandLandmarks.length === 0) {
            return null;
        }

        const lm = multiHandLandmarks[0];
        
        // 录制状态处理
        if (this._isRecordingCustom) {
            const recordingResult = this.addRecordingFrame(lm);
            return recordingResult.recorded ? 'RECORDING' : null;
        }
        
        // 手势匹配（新逻辑）
        const customMatch = this._matchCustomTemplates(lm);
        if (customMatch) {
            return `[${customMatch}]`;
        }
        
        // 不在任何模板内 → 返回null
        return null;
    }
};

// 自动初始化
SignLanguageProcessor.init();