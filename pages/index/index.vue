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
        <text class="debug-line">历史序列：{{ historyList.map(i => i.word).join('') }}</text>
      </view>
      <view class="btn-group">
        <button class="btn-switch" @click="mediapipe.switchCamera">切换摄像头</button>
        <button class="btn-clear" @click="clearText">清空</button>
      </view>
    </view>
  </view>
</template>

<script>
// 引入拆分出来的算法逻辑
import { SignLanguageProcessor } from './signLanguage.js';

export default {
  data() {
    return {
      translatedText: "等待激活",
      isCameraRunning: false,
      loadingStatus: "等待用户激活",
      cameraModeName: "未开启",

      // 识别存储相关
      historyList: [],      // 存储识别到的字，后续可发给大模型
      lastWord: "",         // 防抖：上一次识别到的字
      lastTime: 0           // 防抖：控制识别频率
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

      // --- 处理手势关键点数据 ---
      if (data.type === 'hand_data') {
        this.handleSignLogic(data.content);
      }
    },

    handleSignLogic(landmarks) {
      const word = SignLanguageProcessor.analyze(landmarks);
      const now = Date.now();

      // 逻辑：识别到了词 && 不是重复词 && 距离上次识别过了 800ms
      if (word && word !== this.lastWord && (now - this.lastTime > 800)) {
        this.translatedText = word;
        this.lastWord = word;
        this.lastTime = now;

        // 存储到历史队列
        const record = { word, timestamp: now };
        this.historyList.push(record);

        // 预留接口：保存到后台或触发大模型串联
        this.syncToBackend(record);

        // 轻微震动反馈
        uni.vibrateShort();
      }
    },

    syncToBackend(record) {
      // 此处预留：后续可以将 record 存入数据库
      console.log("已存入历史:", record);
    },

    clearText() {
      this.translatedText = "等待识别";
      this.historyList = [];
      this.lastWord = "";
    }
  }
}
</script>

<script module="mediapipe" lang="renderjs" src="./mediapipe.renderjs.js"></script>

<style>
@import "./index.css";
</style>