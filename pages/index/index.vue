<template>
  <view class="container">
    <view class="status-bar">
      <view class="header">
        <text class="title">EchoHand 赛题演示</text>
        <text class="version">v1.1.1 纯净视图版</text>
      </view>
      <text class="result-text">{{ translatedText }}</text>
    </view>

    <view class="vision-area">
      <view id="video_mount_container" class="debug-video"></view>

      <view id="canvas_mount_container" class="vision-canvas-container"></view>

      <view v-show="!isCameraRunning" class="loading-overlay">
        <view class="start-card">
          <text class="card-title">相机准备就绪</text>
          <text class="card-desc">点击激活进行全屏手势识别</text>
          <button class="btn-start" @click="mediapipe.manualStart">激活摄像头</button>
          <text class="debug-status">{{ loadingStatus }}</text>
        </view>
      </view>
    </view>

    <view class="action-bar">
      <view class="debug-panel">
        <text class="debug-line">日志追踪：{{ loadingStatus }}</text>
        <text class="debug-line">AI 状态：{{ isAIReady ? '运行中 (全屏模式)' : '离线' }}</text>
      </view>
      <button class="btn-clear" @click="clearText">重置识别</button>
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
      loadingStatus: "等待用户指令",
      debugPath: ""
    }
  },
  methods: {
    receiveMessage(data) {
      switch (data.type) {
        case 'ready':
          this.isCameraRunning = true;
          this.translatedText = "硬件唤醒中...";
          break;
        case 'ai_online':
          this.isAIReady = true;
          this.translatedText = "请做出手势";
          break;
        case 'log':
          this.loadingStatus = data.content;
          break;
        case 'result':
          this.translatedText = data.content;
          break;
        case 'error':
          uni.showModal({ title: '系统异常', content: data.content, showCancel: false });
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