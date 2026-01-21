<template>
  <view class="container">
    <view class="status-bar">
      <view class="header">
        <text class="title">EchoHand 赛题演示</text>
        <text class="version">v1.0.5 DOM修复版</text>
      </view>
      <text class="result-text">{{ translatedText }}</text>
    </view>

    <view class="vision-area">
      <video id="raw_video_el" class="debug-video" autoplay playsinline muted></video>
      <canvas id="output_canvas_el" class="vision-canvas"></canvas>

      <view v-if="!isCameraRunning" class="loading-overlay">
        <view class="start-card">
          <text class="card-title">相机准备就绪</text>
          <text class="card-desc">检测到环境已加载，请点击激活</text>
          <button class="btn-start" @click="mediapipe.manualStart">点击激活相机</button>
          <text class="debug-status">{{ loadingStatus }}</text>
        </view>
      </view>
    </view>

    <view class="action-bar">
      <view class="debug-panel">
        <text class="debug-line">路径：{{ debugPath }}</text>
        <text class="debug-line">状态：{{ isAIReady ? 'AI在线' : '等待激活' }}</text>
      </view>
      <button class="btn-clear" @click="clearText">清除识别内容</button>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      translatedText: "等待激活...",
      isCameraRunning: false,
      isAIReady: false,
      loadingStatus: "初始化中...",
      debugPath: "未检测"
    }
  },
  methods: {
    receiveMessage(data) {
      switch (data.type) {
        case 'ready':
          this.isCameraRunning = true;
          this.isAIReady = true;
          this.translatedText = "请面向摄像头";
          break;
        case 'log':
          this.loadingStatus = data.content;
          break;
        case 'path':
          this.debugPath = data.content;
          break;
        case 'result':
          this.translatedText = data.content;
          break;
        case 'error':
          uni.showModal({ title: '初始化详情', content: data.content, showCancel: false });
          break;
      }
    },
    clearText() {
      this.translatedText = "等待识别...";
    }
  }
}
</script>

<script module="mediapipe" lang="renderjs">
export default {
  data() {
    return {
      hands: null,
      currentPath: '',
      isHandsReady: false
    }
  },
  mounted() {
    this.prepareEnvironment();
  },
  methods: {
    async prepareEnvironment() {
      const testPaths = ['./static/mp-hands/', 'static/mp-hands/', '/static/mp-hands/'];
      for (let p of testPaths) {
        try {
          await this.loadScript(`${p}hands.js`);
          this.currentPath = p;
          this.$ownerInstance.callMethod('receiveMessage', { type: 'path', content: p });
          break;
        } catch (e) {}
      }

      if (!this.currentPath) {
        this.sendToUI('error', "找不到 hands.js");
        return;
      }

      try {
        await this.loadScript(`${this.currentPath}camera_utils.js`);
        await this.loadScript(`${this.currentPath}drawing_utils.js`);
        this.isHandsReady = true;
        this.sendToUI('log', "环境已就绪，请点击按钮");
      } catch (e) {
        this.sendToUI('error', "脚本加载超时");
      }
    },

    loadScript(url) {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    },

    async manualStart() {
      // 核心修复点：使用更稳健的方式获取原生 DOM
      const video = document.querySelector('#raw_video_el');

      if (!video) {
        this.sendToUI('error', "找不到 Video 标签");
        return;
      }

      this.sendToUI('log', "正在申请硬件流...");

      //todo:这里需要修改，uni-app不支持navigator.mediaDevices，导致出现typeerror
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' }
        });

        // 兼容性赋值
        if ('srcObject' in video) {
          video.srcObject = stream;
        } else {
          video.src = window.URL.createObjectURL(stream);
        }

        // 修复 .play() 报错：确保它是一个原生 HTMLVideoElement
        video.onloadedmetadata = () => {
          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              this.sendToUI('log', "摄像头流已运行");
              this.initMediaPipe(video);
            }).catch(error => {
              this.sendToUI('error', "播放失败: " + error.message);
            });
          }
        };
      } catch (err) {
        this.sendToUI('error', "获取流失败: " + err.name);
      }
    },

    initMediaPipe(video) {
      const canvas = document.querySelector('#output_canvas_el');
      const ctx = canvas.getContext('2d');

      this.hands = new Hands({
        locateFile: (file) => {
          const target = file === 'hands.tflite' ? 'hand_landmark_full.tflite' : file;
          return `${this.currentPath}${target}`;
        }
      });

      this.hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      this.hands.onResults((results) => {
        if (!results.image) return;
        if (canvas.width !== results.image.width) {
          canvas.width = results.image.width;
          canvas.height = results.image.height;
        }
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        if (results.multiHandLandmarks) {
          for (const landmarks of results.multiHandLandmarks) {
            drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 4});
            drawLandmarks(ctx, landmarks, {color: '#FF0000', lineWidth: 1});

            // 简单检测
            if (landmarks[8].y < landmarks[5].y) {
              this.$ownerInstance.callMethod('receiveMessage', { type: 'result', content: '👌 检测到手势' });
            }
          }
        }
        ctx.restore();
      });

      const camera = new Camera(video, {
        onFrame: async () => {
          if (video.readyState >= 2) {
            await this.hands.send({ image: video });
          }
        },
        width: 640,
        height: 480
      });
      camera.start().then(() => {
        this.$ownerInstance.callMethod('receiveMessage', { type: 'ready' });
      });
    },

    sendToUI(type, content) {
      this.$ownerInstance.callMethod('receiveMessage', { type, content });
    }
  }
}
</script>

<style>
.container { display: flex; flex-direction: column; height: 100vh; background: #f8f8f8; overflow: hidden; }
.status-bar { background: #fff; padding: 100rpx 40rpx 40rpx; border-radius: 0 0 60rpx 60rpx; box-shadow: 0 4rpx 20rpx rgba(0,0,0,0.05); }
.header { flex-direction: row; justify-content: space-between; }
.title { font-size: 24rpx; color: #007AFF; font-weight: bold; }
.version { font-size: 18rpx; color: #ccc; }
.result-text { font-size: 50rpx; font-weight: bold; color: #333; margin-top: 20rpx; display: block; text-align: center; }

.vision-area { flex: 1; position: relative; margin: 30rpx; border-radius: 40rpx; overflow: hidden; background: #000; }
.vision-canvas { width: 100%; height: 100%; z-index: 5; }
.debug-video { position: absolute; top: 20rpx; right: 20rpx; width: 120rpx; height: 160rpx; border: 2rpx solid #fff; border-radius: 10rpx; z-index: 2; opacity: 0.9; }

.loading-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); display: flex; justify-content: center; align-items: center; z-index: 100; }
.start-card { width: 80%; background: #fff; border-radius: 40rpx; padding: 60rpx; align-items: center; display: flex; flex-direction: column; }
.card-title { font-size: 36rpx; font-weight: bold; }
.card-desc { font-size: 24rpx; color: #666; margin: 20rpx 0 50rpx; text-align: center; }
.btn-start { width: 100%; background: #007AFF; color: #fff; border-radius: 100rpx; height: 100rpx; line-height: 100rpx; font-weight: bold; }
.debug-status { font-size: 20rpx; color: #999; margin-top: 30rpx; }

.action-bar { padding: 40rpx; background: #fff; border-radius: 60rpx 60rpx 0 0; }
.debug-panel { margin-bottom: 30rpx; }
.debug-line { font-size: 18rpx; color: #999; display: block; }
.btn-clear { width: 100%; background: #f0f0f0; color: #333; border-radius: 100rpx; height: 90rpx; line-height: 90rpx; font-size: 28rpx; }
</style>