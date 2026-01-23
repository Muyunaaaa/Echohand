<template>
  <view class="container">
    <!-- 顶部状态栏 -->
    <view class="status-bar">
      <view class="header">
        <text class="title">EchoHand Pro</text>
        <text class="version">v1.5.1 录制可见版</text>
      </view>
      <text class="result-text">{{ displayText }}</text>
    </view>

    <!-- 视觉区域 -->
    <view class="vision-area">
      <view id="video_mount_container" class="video-hidden"></view>
      <view id="canvas_mount_container" class="canvas-full"></view>

      <!-- 修复：半透明录制遮罩层，可以看到画面 -->
      <view v-if="isRecordingCustom" class="recording-overlay">
        <!-- 半透明背景，可以看到摄像头画面 -->
        <view class="overlay-background"></view>
        
        <!-- 录制信息卡片（改为浮动在画面上方） -->
        <view class="recording-card">
          <text class="recording-title">录制手势: {{ customGestureName }}</text>
          
          <!-- 状态指示器 -->
          <view class="status-indicator" :class="recordingState">
            <text class="status-text">{{ getStatusText() }}</text>
            <text class="status-subtext" v-if="recordingState === 'preparing'">
              请准备好手势，{{ countdown }}秒后开始
            </text>
            <text class="status-subtext" v-if="recordingState === 'recording'">
              保持手势稳定
            </text>
          </view>
          
          <!-- 进度条 -->
          <view class="progress-container">
            <view class="progress-bar">
              <view class="progress-fill" :style="{width: recordingProgress + '%'}"></view>
            </view>
            <text class="progress-text">
              {{ recordingProgress }}% ({{ recordingFrames }}/{{ idealFrames }}帧)
            </text>
          </view>
          
          <!-- 质量指示（简化显示） -->
          <view class="quality-indicator">
            <text class="quality-label">稳定性: </text>
            <text class="quality-value" :class="getQualityClass(recordingQuality)">
              {{ recordingQuality }}%
            </text>
          </view>
          
          <!-- 时间显示 -->
          <view class="timer-display">
            <text class="timer-value">{{ displayTime }}</text>
          </view>
          
          <!-- 操作按钮 -->
          <view class="recording-buttons">
            <button class="btn-cancel" @click="cancelRecording">取消</button>
            <button class="btn-stop" @click="stopRecording" 
                    :disabled="recordingState === 'preparing'">
              {{ recordingState === 'recording' ? '完成录制' : '准备中...' }}
            </button>
          </view>
          
          <!-- 重要提示 -->
          <view class="recording-hints">
            <text class="hint-title">录制说明：</text>
            <text class="hint-item">• 这是静态手势录制</text>
            <text class="hint-item">• 请保持手势稳定不动</text>
            <text class="hint-item">• 系统会记录您的手势特征</text>
            <text class="hint-item">• 完成后会优先匹配您的个性化手势</text>
          </view>
        </view>
      </view>

      <!-- 启动遮罩层 -->
      <view v-if="!isCameraRunning" class="loading-overlay">
        <view class="start-card">
          <text class="card-title">系统就绪</text>
          <text class="card-desc">已适配全屏高质量识别</text>
          <button class="btn-start" @click="mediapipe.manualStart">激活摄像头</button>
          <text class="debug-status">{{ loadingStatus }}</text>
        </view>
      </view>
    </view>

    <!-- 自定义手势面板（非录制时显示） -->
    <view v-if="showCustomPanel && !isRecordingCustom" class="custom-panel">
      <view class="custom-header">
        <text class="custom-title">自定义手势管理</text>
        <text class="custom-close" @click="toggleCustomPanel">×</text>
      </view>
      
      <!-- 录制区域 -->
      <view class="recording-section">
        <text class="section-title">录制新手势</text>
        <text class="recording-description">
          录制静态手势：保持手势稳定2-3秒，系统会记录您的手势特征
        </text>
        
        <view class="input-row">
          <input 
            v-model="customGestureName" 
            placeholder="输入手势名称，如：谢谢、爱、好" 
            class="gesture-input"
          />
          <button 
            @click="startCustomRecording()" 
            class="record-btn start-btn"
            :disabled="!customGestureName.trim()"
          >
            开始录制
          </button>
        </view>
        
        <!-- 手势列表 -->
        <view class="gestures-section" v-if="customGesturesList.length > 0">
          <text class="section-title">已录制的手势 ({{ customGesturesList.length }}个)</text>
          <view class="gesture-list">
            <view v-for="gesture in customGesturesList" :key="gesture.name" class="gesture-item">
              <view class="gesture-info">
                <text class="gesture-name">{{ gesture.name }}</text>
                <text class="gesture-details">
                  {{ gesture.sampleCount }}样本 · {{ gesture.quality }}质量
                </text>
              </view>
              <button @click="deleteCustomGesture(gesture.name)" class="btn-delete">删除</button>
            </view>
          </view>
          <button @click="clearAllCustomGestures" class="clear-all-btn">清空所有手势</button>
        </view>
        <view v-else class="empty-gestures">
          <text class="empty-text">暂无自定义手势</text>
          <text class="empty-tip">录制您的个性化手势以提高识别准确率</text>
        </view>
      </view>
    </view>

    <!-- 自定义手势触发按钮 -->
    <view v-if="!isRecordingCustom" class="custom-trigger" @click="toggleCustomPanel">
      <text class="trigger-text">✋ 自定义手势</text>
    </view>

    <!-- 底部操作栏 -->
    <view class="action-bar">
      <view class="debug-panel">
        <text class="debug-line">设备状态：{{ cameraModeName }}</text>
        <text class="debug-line">历史序列：{{ historyList.map(i => i.word).join('') }}</text>
        <text v-if="isRecordingCustom" class="debug-line recording-debug">
          录制：{{ customGestureName }} | {{ recordingFrames }}帧 | {{ recordingState }}
        </text>
      </view>
      <view class="btn-group">
        <button class="btn-switch" @click="mediapipe.switchCamera">切换摄像头</button>
        <button class="btn-clear" @click="clearText">清空历史</button>
      </view>
    </view>
  </view>
</template>

<script>
import { SignLanguageProcessor } from './signLanguage.js';

export default {
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
      recordingState: 'idle',
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
    }
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
      if (data.type === 'ready') {
        this.isCameraRunning = true;
        this.cameraModeName = data.content === 'user' ? '前置' : '后置';
      }
      if (data.type === 'ai_online') {
        this.translatedText = "请做出手势";
        this.displayText = "请做出手势";
      }
      if (data.type === 'log') this.loadingStatus = data.content;
      if (data.type === 'error') uni.showModal({ title: '硬件提示', content: data.content });

      if (data.type === 'hand_data') {
        this.handleSignLogic(data.content);
      }
    },

    handleSignLogic(landmarks) {
      // 如果正在录制，处理录制逻辑
      if (this.isRecordingCustom) {
        this.processRecordingFrame(landmarks);
        return;
      }
      
      // 正常识别逻辑
      const word = SignLanguageProcessor.analyze(landmarks);
      const now = Date.now();
      
      if (word && word !== this.lastWord && (now - this.lastTime > 800)) {
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
      
      if (result === 'RECORDING') {
        const status = SignLanguageProcessor.getRecordingStatus();
        if (status) {
          this.recordingState = status.state;
          this.recordingFrames = status.frameCount;
          this.recordingProgress = status.progress;
          this.recordingQuality = Math.floor((parseFloat(status.quality) || 50));
          this.idealFrames = status.idealFrames || 20;
          
          // 更新显示
          this.updateRecordingDisplay();
        }
      }
    },
    
    updateRecordingDisplay() {
      const statusMap = {
        'preparing': '准备中',
        'recording': '录制中',
        'processing': '处理中',
        'complete': '完成'
      };
      
      const statusText = statusMap[this.recordingState] || '录制中';
      this.displayText = `${statusText}: ${this.customGestureName}\n${this.recordingFrames}帧 ${this.recordingQuality}%`;
    },
    
    getStatusText() {
      const texts = {
        'idle': '准备中',
        'preparing': '准备录制',
        'recording': '录制中',
        'processing': '处理中',
        'complete': '完成'
      };
      return texts[this.recordingState] || '录制中';
    },
    
    getQualityClass(quality) {
      if (quality >= 70) return 'quality-good';
      if (quality >= 50) return 'quality-medium';
      return 'quality-poor';
    },
    
    startCustomRecording() {
      if (!this.customGestureName.trim()) {
        uni.showToast({ title: '请输入手势名称', icon: 'none' });
        return;
      }
      
      const result = SignLanguageProcessor.startRecordingCustom(this.customGestureName);
      if (!result.success) {
        uni.showToast({ title: result.message, icon: 'none' });
        return;
      }
      
      this.isRecordingCustom = true;
      this.recordingState = 'preparing';
      this.recordingProgress = 0;
      this.recordingFrames = 0;
      this.recordingQuality = 50;
      this.recordingTime = 0;
      this.isCountingDown = true;
      this.countdown = 3;
      
      // 开始倒计时
      this.startCountdown();
      
      // 启动录制计时器
      this.startRecordingTimer();
    },
    
    startCountdown() {
      this._countdownTimer = setInterval(() => {
        this.countdown--;
        if (this.countdown <= 0) {
          clearInterval(this._countdownTimer);
          this.isCountingDown = false;
          this.recordingState = 'recording';
        }
      }, 1000);
    },
    
    startRecordingTimer() {
      this._recordingTimer = setInterval(() => {
        if (!this.isCountingDown) {
          this.recordingTime++;
        }
      }, 1000);
    },
    
    stopRecording() {
      const result = SignLanguageProcessor.stopRecordingCustom();
      
      this.cleanupTimers();
      
      if (result.success) {
        this.recordingState = 'complete';
        this.displayText = `录制完成: ${result.name}`;
        
        setTimeout(() => {
          this.isRecordingCustom = false;
          this.translatedText = "请做出手势";
          this.displayText = "请做出手势";
          this.refreshCustomGesturesList();
          this.showCustomPanel = false;
          
          uni.showToast({ 
            title: `"${result.name}"录制成功 (${result.frameCount}帧)`, 
            icon: 'success',
            duration: 2000
          });
        }, 1000);
      } else {
        uni.showToast({ 
          title: result.message || '录制失败', 
          icon: 'none',
          duration: 2000
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
          icon: 'none',
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
        title: '确认删除',
        content: `确定要删除手势"${name}"吗？`,
        success: (res) => {
          if (res.confirm) {
            SignLanguageProcessor.deleteCustomGesture(name);
            this.refreshCustomGesturesList();
            uni.showToast({ title: '已删除', icon: 'success' });
          }
        }
      });
    },
    
    clearAllCustomGestures() {
      uni.showModal({
        title: '确认清空',
        content: '确定要清空所有自定义手势吗？',
        success: (res) => {
          if (res.confirm) {
            const count = SignLanguageProcessor.clearCustomGestures();
            this.refreshCustomGesturesList();
            uni.showToast({ title: `已清空 ${count} 个手势`, icon: 'success' });
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
      console.log("已存入历史:", record);
    },
    
    clearText() {
      this.translatedText = "等待识别";
      this.displayText = "等待识别";
      this.historyList = [];
      this.lastWord = "";
    }
  }
}
</script>

<style>
/* 基础样式保持不变 */
.container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background: #000;
    overflow: hidden;
}

.status-bar {
    background: #ffffff;
    padding: 100rpx 40rpx 40rpx;
    border-radius: 0 0 40rpx 40rpx;
    box-shadow: 0 4rpx 20rpx rgba(0,0,0,0.2);
    z-index: 10;
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10rpx;
}

.title {
    font-size: 36rpx;
    font-weight: bold;
    color: #333;
}

.version {
    font-size: 20rpx;
    color: #007AFF;
    background: rgba(0,122,255,0.1);
    padding: 4rpx 12rpx;
    border-radius: 8rpx;
}

.result-text {
    font-size: 56rpx;
    font-weight: 800;
    color: #007AFF;
    text-align: center;
    display: block;
    min-height: 80rpx;
    line-height: 80rpx;
    white-space: pre-line;
}

.vision-area {
    flex: 1;
    position: relative;
    background: #000;
    overflow: hidden;
}

.vision-canvas-container {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    display: flex;
    justify-content: center;
    align-items: center;
}

canvas {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover;
    image-rendering: -webkit-optimize-contrast;
    image-rendering: crisp-edges;
    transform: translateZ(0);
    backface-visibility: hidden;
}

.video-hidden {
    position: fixed;
    top: -5000px;
    left: -5000px;
    visibility: hidden;
}

/* 修复：半透明录制遮罩层 */
.recording-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 100;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding-top: 100rpx;
}

.overlay-background {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.4); /* 改为半透明，可以看到画面 */
    backdrop-filter: blur(4px);
}

.recording-card {
    position: relative;
    width: 90%;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 30rpx;
    padding: 40rpx;
    box-shadow: 0 10rpx 40rpx rgba(0, 0, 0, 0.3);
    z-index: 101;
    margin-top: 100rpx;
}

.recording-title {
    font-size: 34rpx;
    font-weight: bold;
    color: #007AFF;
    text-align: center;
    display: block;
    margin-bottom: 30rpx;
}

/* 状态指示器 */
.status-indicator {
    text-align: center;
    margin: 0 0 30rpx;
    padding: 25rpx;
    border-radius: 20rpx;
    background: #f8f8f8;
    border: 2rpx solid #e0e0e0;
}

.status-indicator.preparing {
    background: rgba(255, 204, 0, 0.1);
    border-color: #ffcc00;
}

.status-indicator.recording {
    background: rgba(52, 199, 89, 0.1);
    border-color: #34c759;
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0% { opacity: 0.9; }
    50% { opacity: 1; }
    100% { opacity: 0.9; }
}

.status-text {
    font-size: 32rpx;
    font-weight: bold;
    color: #333;
    display: block;
    margin-bottom: 10rpx;
}

.status-subtext {
    font-size: 26rpx;
    color: #666;
    display: block;
}

/* 进度条 */
.progress-container {
    margin: 25rpx 0;
}

.progress-bar {
    height: 16rpx;
    background: #e0e0e0;
    border-radius: 8rpx;
    overflow: hidden;
    margin-bottom: 10rpx;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #34c759, #00c2ff);
    border-radius: 8rpx;
    transition: width 0.5s ease;
}

.progress-text {
    font-size: 24rpx;
    color: #666;
    text-align: center;
    display: block;
}

/* 质量指示 */
.quality-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 20rpx 0;
    padding: 15rpx;
    background: #f8f8f8;
    border-radius: 15rpx;
}

.quality-label {
    font-size: 26rpx;
    color: #333;
    font-weight: 500;
}

.quality-value {
    font-size: 28rpx;
    font-weight: bold;
    margin-left: 10rpx;
}

.quality-value.quality-good {
    color: #34c759;
}

.quality-value.medium {
    color: #ffcc00;
}

.quality-value.quality-poor {
    color: #ff3b30;
}

/* 计时器 */
.timer-display {
    text-align: center;
    margin: 20rpx 0;
    padding: 20rpx;
    background: linear-gradient(135deg, #007AFF15, #00c2ff15);
    border-radius: 20rpx;
}

.timer-value {
    font-size: 32rpx;
    font-weight: bold;
    color: #007AFF;
    font-family: monospace;
}

/* 操作按钮 */
.recording-buttons {
    display: flex;
    gap: 20rpx;
    margin: 30rpx 0;
}

.btn-cancel, .btn-stop {
    flex: 1;
    height: 80rpx;
    border: none;
    border-radius: 20rpx;
    font-size: 28rpx;
    font-weight: bold;
}

.btn-cancel {
    background: #f2f2f7;
    color: #666;
}

.btn-stop {
    background: linear-gradient(135deg, #34c759, #00c2ff);
    color: white;
}

.btn-stop:disabled {
    opacity: 0.5;
    background: #cccccc;
}

/* 录制提示 */
.recording-hints {
    margin-top: 30rpx;
    padding: 25rpx;
    background: rgba(52, 199, 89, 0.05);
    border-radius: 15rpx;
    border: 1rpx solid rgba(52, 199, 89, 0.2);
}

.hint-title {
    font-size: 26rpx;
    font-weight: bold;
    color: #34c759;
    display: block;
    margin-bottom: 15rpx;
}

.hint-item {
    font-size: 24rpx;
    color: #666;
    display: block;
    margin: 8rpx 0;
    padding-left: 40rpx;
    position: relative;
}

.hint-item:before {
    content: '•';
    position: absolute;
    left: 20rpx;
    color: #34c759;
    font-weight: bold;
}

/* 启动遮罩层 */
.loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(10px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 200;
}

.start-card {
    width: 75%;
    background: #ffffff;
    border-radius: 40rpx;
    padding: 50rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: 0 10rpx 40rpx rgba(0,0,0,0.5);
}

.card-title {
    font-size: 40rpx;
    font-weight: bold;
    color: #333;
    margin-bottom: 20rpx;
}

.card-desc {
    font-size: 26rpx;
    color: #666;
    text-align: center;
    line-height: 1.5;
}

.btn-start {
    width: 100%;
    background: linear-gradient(135deg, #007AFF, #0056b3);
    color: #ffffff;
    border-radius: 100rpx;
    margin: 40rpx 0;
    font-size: 32rpx;
    border: none;
}

.debug-status {
    font-size: 20rpx;
    color: #999;
}

/* 自定义手势面板 */
.custom-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(255, 255, 255, 0.98);
    border-radius: 40rpx 40rpx 0 0;
    padding: 40rpx;
    z-index: 1000;
    max-height: 70vh;
    overflow-y: auto;
    box-shadow: 0 -10rpx 40rpx rgba(0,0,0,0.2);
}

.custom-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30rpx;
    padding-bottom: 20rpx;
    border-bottom: 2rpx solid #f0f0f0;
}

.custom-title {
    font-size: 32rpx;
    font-weight: bold;
    color: #333;
}

.custom-close {
    font-size: 50rpx;
    color: #999;
    width: 60rpx;
    height: 60rpx;
    text-align: center;
    line-height: 50rpx;
}

.section-title {
    font-size: 28rpx;
    font-weight: 600;
    color: #007AFF;
    margin-bottom: 20rpx;
    display: block;
}

.recording-description {
    font-size: 24rpx;
    color: #666;
    margin-bottom: 25rpx;
    display: block;
    line-height: 1.4;
}

.input-row {
    display: flex;
    gap: 20rpx;
    margin-bottom: 20rpx;
}

.gesture-input {
    flex: 1;
    border: 2rpx solid #ddd;
    border-radius: 20rpx;
    padding: 20rpx;
    font-size: 28rpx;
    background: #fff;
}

.record-btn {
    background: #34c759;
    color: white;
    border: none;
    border-radius: 20rpx;
    padding: 0 40rpx;
    font-size: 28rpx;
    font-weight: bold;
    white-space: nowrap;
}

.record-btn.start-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.gesture-list {
    margin-bottom: 30rpx;
}

.gesture-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 25rpx 0;
    border-bottom: 1rpx solid #f0f0f0;
}

.gesture-info {
    flex: 1;
}

.gesture-name {
    font-size: 30rpx;
    font-weight: 600;
    color: #333;
    display: block;
}

.gesture-details {
    font-size: 24rpx;
    color: #999;
    display: block;
    margin-top: 5rpx;
}

.btn-delete {
    background: #ff3b30;
    color: white;
    border: none;
    border-radius: 12rpx;
    padding: 10rpx 20rpx;
    font-size: 24rpx;
}

.clear-all-btn {
    width: 100%;
    background: #f2f2f7;
    color: #666;
    border: none;
    border-radius: 20rpx;
    padding: 25rpx;
    font-size: 28rpx;
    margin-top: 20rpx;
}

.empty-gestures {
    text-align: center;
    padding: 50rpx 0;
}

.empty-text {
    font-size: 32rpx;
    color: #999;
    display: block;
    margin-bottom: 15rpx;
}

.empty-tip {
    font-size: 26rpx;
    color: #ccc;
    display: block;
}

/* 自定义手势触发按钮 */
.custom-trigger {
    position: fixed;
    bottom: 200rpx;
    right: 40rpx;
    background: linear-gradient(135deg, #007AFF, #00c2ff);
    color: white;
    border-radius: 50rpx;
    padding: 20rpx 30rpx;
    box-shadow: 0 10rpx 30rpx rgba(0,122,255,0.3);
    z-index: 999;
}

.trigger-text {
    font-size: 26rpx;
    font-weight: bold;
}

/* 底部操作栏 */
.action-bar {
    padding: 30rpx 40rpx 60rpx;
    background: #ffffff;
    border-radius: 40rpx 40rpx 0 0;
}

.debug-panel {
    background: #f8f8f8;
    padding: 15rpx 20rpx;
    border-radius: 15rpx;
    margin-bottom: 20rpx;
}

.debug-line {
    font-size: 22rpx;
    color: #888;
    display: block;
    font-family: monospace;
    line-height: 1.4;
}

.recording-debug {
    color: #34c759;
    font-weight: bold;
}

.btn-group {
    display: flex;
    gap: 20rpx;
}

.btn-switch {
    flex: 1.5;
    background: #34c759;
    color: #fff;
    border-radius: 24rpx;
    font-weight: bold;
    height: 90rpx;
    line-height: 90rpx;
    font-size: 28rpx;
}

.btn-clear {
    flex: 1;
    background: #f2f2f7;
    color: #333;
    border-radius: 24rpx;
    height: 90rpx;
    line-height: 90rpx;
    font-size: 28rpx;
}

/* 点击反馈效果 */
button:active {
    opacity: 0.8;
    transform: scale(0.98);
}
</style>

<script module="mediapipe" lang="renderjs" src="./mediapipe.renderjs.js"></script>