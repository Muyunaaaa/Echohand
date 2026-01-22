<template>
  <view class="container">
    <view class="status-bar">
      <view class="header">
        <text class="title">EchoHand Pro</text>
        <text class="version">v1.3.8 高清拉伸版</text>
      </view>
      <text class="result-text">{{ translatedText }}</text>
    </view>

    <view class="vision-area">
      <view id="video_mount_container" class="video-hidden"></view>
      <view id="canvas_mount_container" class="canvas-full"></view>

      <view v-if="!isCameraRunning" class="loading-overlay">
        <view class="start-card">
          <text class="card-title">系统就绪</text>
          <text class="card-desc">已适配全屏高质量识别</text>
          <button class="btn-start" @click="mediapipe.manualStart">激活摄像头</button>
          <text class="debug-status">{{ loadingStatus }}</text>
        </view>
      </view>
    </view>

    <view class="action-bar">
      <view class="debug-panel">
        <text class="debug-line">设备状态：{{ cameraModeName }}</text>
        <text class="debug-line">渲染内核：720P GPU加速</text>
      </view>
      <view class="btn-group">
        <button class="btn-switch" @click="mediapipe.switchCamera">切换摄像头</button>
        <button class="btn-clear" @click="clearText">清空</button>
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
      loadingStatus: "等待用户激活",
      cameraModeName: "未开启"
    }
  },
  methods: {
    receiveMessage(data) {
      if (data.type === 'ready') {
        this.isCameraRunning = true;
        this.cameraModeName = data.content === 'user' ? '前置' : '后置';
      }
      if (data.type === 'ai_online') this.translatedText = "请做出手势";
      if (data.type === 'log') this.loadingStatus = data.content;
      if (data.type === 'error') uni.showModal({ title: '硬件提示', content: data.content });
    },
    clearText() { this.translatedText = "等待识别"; }
  }
}
</script>

<script module="mediapipe" lang="renderjs" src="./mediapipe.renderjs.js"></script>

<style>
@import "./index.css";
</style>