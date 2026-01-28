<template>
  <view class="container">
    <view class="status-bar">
      <view class="header">
        <text class="title">EchoHand Pro</text>
        <view class="tag-group">
          <text class="btn-history" @click="showHistory = true">历史记录</text>
          <text class="version">v1.5.3</text>
        </view>
      </view>
      <text class="result-text">{{ translatedText }}</text>
      <text class="sentence-preview">{{ sentencePreview }}</text>
    </view>

    <view class="vision-area">
      <view id="video_mount_container" class="video-hidden"></view>
      <view id="canvas_mount_container" class="canvas-full"></view>

      <view v-if="!isCameraRunning" class="loading-overlay">
        <view class="start-card">
          <text class="card-title">系统就绪</text>
          <text class="card-desc">识别结果将自动由通义千问优化并播报</text>
          <button class="btn-start" @click="mediapipe.manualStart">开启相机 & 语音</button>
          <text class="debug-status">{{ loadingStatus }}</text>
        </view>
      </view>

      <view class="history-overlay" :class="{ 'history-active': showHistory }" @click="showHistory = false">
        <view class="history-card" @click.stop="">
          <view class="history-header">
            <text class="h-title">对话历史</text>
            <text class="h-close" @click="showHistory = false">关闭</text>
          </view>
          <scroll-view scroll-y="true" class="history-scroll">
            <view v-for="(item, index) in finalHistory" :key="index" class="history-item">
              <text class="h-time">{{ item.time }}</text>
              <text class="h-msg">{{ item.content }}</text>
            </view>
            <view v-if="finalHistory.length === 0" class="h-empty">暂无对话记录</view>
          </scroll-view>
        </view>
      </view>
    </view>

    <view class="action-bar">
      <view class="debug-panel">
        <text class="debug-line">词链: {{ wordQueue.join(' + ') || '待输入' }}</text>
      </view>
      <view class="btn-group">
        <button class="btn-switch" @click="mediapipe.switchCamera">切换方向</button>
        <button class="btn-clear" @click="clearText">清空</button>
      </view>
    </view>
  </view>
</template>

<script>
import { SignLanguageProcessor } from './signLanguage.js';
import { NLPProcessor } from './nlpProcessor.js';

export default {
  data() {
    return {
      translatedText: "等待激活",
      sentencePreview: "",
      isCameraRunning: false,
      loadingStatus: "准备就绪",
      showHistory: false,
      wordQueue: [],
      finalHistory: [],
      lastWord: "",
      lastTime: 0
    }
  },
  methods: {
    receiveMessage(data) {
      if (data.type === 'ready') {
        this.isCameraRunning = true;
        NLPProcessor.speak("系统启动");
      }
      if (data.type === 'ai_online') this.translatedText = "请做出手势";
      if (data.type === 'log') this.loadingStatus = data.content;
      if (data.type === 'hand_data') this.handleSignLogic(data.content);
    },

    handleSignLogic(landmarks) {
      const word = SignLanguageProcessor.analyze(landmarks);
      const now = Date.now();
      if (word && word !== this.lastWord && (now - this.lastTime > 1000)) {
        this.translatedText = word;
        this.lastWord = word;
        this.lastTime = now;
        this.wordQueue.push(word);
        uni.vibrateShort();

        NLPProcessor.addWord(word, (res) => {
          this.onSentenceComplete(res);
        });
      }
    },

    onSentenceComplete(sentence) {
      this.sentencePreview = sentence;
      this.wordQueue = [];
      const now = new Date();
      this.finalHistory.unshift({
        content: sentence,
        time: `${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`
      });
    },

    clearText() {
      this.translatedText = "等待识别";
      this.sentencePreview = "";
      this.wordQueue = [];
      this.lastWord = "";
    }
  }
}
</script>

<script module="mediapipe" lang="renderjs" src="./mediapipe.renderjs.js"></script>

<style>
@import "./index.css";
</style>