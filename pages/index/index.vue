<template>
  <view class="container">
    <view class="status-bar">
      <view class="header">
        <text class="title">EchoHand Pro</text>
        <text class="version">v1.2.7 强制对焦版</text>
      </view>
      <text class="result-text">{{ translatedText }}</text>
    </view>

    <view class="vision-area">
      <view id="video_mount_container" class="debug-video"></view>
      <view id="canvas_mount_container" class="vision-canvas-container"></view>

      <view v-if="!isCameraRunning" class="loading-overlay">
        <view class="start-card">
          <text class="card-title">视觉引擎就绪</text>
          <text class="card-desc">若后置模糊，请尝试移动手机对焦</text>
          <button class="btn-start" @click="mediapipe.manualStart">激活摄像头</button>
          <text class="debug-status">{{ loadingStatus }}</text>
        </view>
      </view>
    </view>

    <view class="action-bar">
      <view class="debug-panel">
        <text class="debug-line">当前设备：{{ cameraModeName }}</text>
        <text class="debug-line">实时日志：{{ loadingStatus }}</text>
      </view>
      <view class="btn-group">
        <button class="btn-switch" @click="mediapipe.switchCamera">切换摄像头</button>
        <button class="btn-clear" @click="clearText">清空识别</button>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      translatedText: "等待激活",
      isCameraRunning: false,
      isAIReady: false,
      loadingStatus: "内核已就绪",
      cameraModeName: "未激活"
    }
  },
  methods: {
    receiveMessage(data) {
      switch (data.type) {
        case 'ready':
          this.isCameraRunning = true;
          this.cameraModeName = (data.content === 'user' ? '前置镜头' : '后置(尝试对焦中)');
          this.translatedText = "正在校准画质...";
          break;
        case 'ai_online':
          this.isAIReady = true;
          this.translatedText = "请展示手势";
          break;
        case 'log':
          this.loadingStatus = data.content;
          break;
        case 'error':
          uni.showModal({ title: '硬件提示', content: data.content, showCancel: false });
          this.isCameraRunning = false;
          break;
      }
    },
    clearText() {
      this.translatedText = "等待识别";
    }
  }
}
</script>

<script module="mediapipe" lang="renderjs" src="./mediapipe.renderjs.js"></script>

<style>
@import "./index.css";
</style>