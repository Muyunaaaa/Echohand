<template>
  <view class="content">
    <view class="result-box">
      <text class="label">识别结果：</text>
      <text class="text">{{ translatedText }}</text>
    </view>

    <view class="video-container">
      <video id="input_video" class="hidden-video"></video>
      <canvas id="output_canvas" class="main-canvas"></canvas>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      translatedText: "正在等待手势...", // 页面上显示的文字
    }
  },
  methods: {
    // 接收来自 AI 层的翻译结果并更新 UI
    onMessageFromAI(text) {
      this.translatedText = text;
    }
  }
}
</script>

<style>
	.content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}

	.logo {
		height: 200rpx;
		width: 200rpx;
		margin-top: 200rpx;
		margin-left: auto;
		margin-right: auto;
		margin-bottom: 50rpx;
	}

	.text-area {
		display: flex;
		justify-content: center;
	}

	.title {
		font-size: 36rpx;
		color: #8f8f94;
	}
</style>
