<template>
  <view class="container">
    <view class="glass-header">
      <view class="header-main">
        <view class="brand">
          <text class="brand-logo">●</text>
          <text class="brand-name">ECHOHAND</text>
        </view>
        <view class="header-actions" v-if="isCameraRunning">
          <view class="history-trigger" @click="showHistory = true">
            <text class="history-icon">≡</text>
          </view>
        </view>
      </view>
    </view>

    <view class="vision-area">
      <view id="video_mount_container" class="video-hidden"></view>
      <view id="canvas_mount_container" class="canvas-full"></view>

      <view class="ar-display" v-if="isCameraRunning">
        <view class="word-tags-row">
          <text v-for="(w, i) in wordQueue" :key="i" class="word-tag-item">{{w}}</text>
          <text v-if="wordQueue.length === 0 && !sentencePreview" class="waiting-hint">CAPTURING GESTURES...</text>
        </view>

        <view class="sentence-fixed-area" v-if="sentencePreview">
          <view class="ai-status-hint">
            <text class="sparkle">✦</text>
            <text>AI 智能翻译生成</text>
          </view>
          <view class="sentence-black-card">
            <text class="sentence-text">{{ sentencePreview }}</text>
          </view>
        </view>
      </view>

      <view v-if="!isCameraRunning" class="welcome-overlay">
        <view class="bg-glow-sphere"></view>
        <view class="hero-section">
          <view class="visual-engine">
            <view class="core-node"></view>
            <view class="orbit orbit-1"></view>
            <view class="orbit orbit-2"></view>
          </view>
          <view class="text-group">
            <text class="app-title">EchoHand</text>
            <view class="slogan-container">
              <text class="app-slogan">AI 视觉手语翻译系统</text>
            </view>
          </view>
        </view>
        <button class="btn-start-engine" @click="mediapipe.manualStart">激活 AI 视觉</button>
      </view>

      <view class="history-drawer" :class="{ 'drawer-open': showHistory }" @click="showHistory = false">
        <view class="drawer-content" @click.stop="">
          <view class="drawer-header">
            <view class="drawer-title-group">
              <text class="drawer-title-main">HISTORY</text>
              <text class="drawer-title-sub">识别记录</text>
            </view>
            <view class="drawer-close-btn" @click="showHistory = false">
              <text class="close-txt">CLOSE</text>
            </view>
          </view>

          <scroll-view scroll-y="true" class="drawer-list">
            <view v-for="(item, index) in finalHistory" :key="index" class="history-card-item">
              <view class="h-card-top">
                <text class="h-item-time">{{ item.time }}</text>
                <view class="h-item-dot"></view>
              </view>
              <text class="h-item-content">{{ item.content }}</text>
            </view>
            <view v-if="finalHistory.length === 0" class="empty-state">
              <text>暂无记录</text>
              <view class="empty-line"></view>
            </view>
          </scroll-view>
        </view>
      </view>
    </view>

    <view class="control-panel" v-if="isCameraRunning">
      <view class="classic-footer">
        <text class="footer-btn" @click="clearText">RESET</text>
        <view class="footer-divider"></view>
        <text class="footer-btn" @click="mediapipe.switchCamera">切换镜头</text>
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
      sentencePreview: "",
      isCameraRunning: false,
      showHistory: false,
      wordQueue: [],
      finalHistory: [],
      lastWord: "",
      lastTime: 0
    }
  },
  methods: {
    receiveMessage(data) {
      if (data.type === 'ready') this.isCameraRunning = true;
      if (data.type === 'hand_data') this.handleSignLogic(data.content);
    },
    handleSignLogic(landmarks) {
      const word = SignLanguageProcessor.analyze(landmarks);
      const now = Date.now();
      if (word && word !== this.lastWord && (now - this.lastTime > 1200)) {
        this.lastWord = word;
        this.lastTime = now;
        this.wordQueue.push(word);
        uni.vibrateShort();

        NLPProcessor.addWord(word, (res) => {
          this.sentencePreview = res;
          // 核心优化1：句子生成后，清空蓝色词条
          this.wordQueue = [];
          const time = new Date();
          this.finalHistory.unshift({
            content: res,
            time: `${time.getHours().toString().padStart(2,'0')}:${time.getMinutes().toString().padStart(2,'0')}`
          });
        });
      }
    },
    clearText() {
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