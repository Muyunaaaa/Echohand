/**
 * 中国手语（CSL）专项识别算法
 * 针对：你好、谢谢、我、时间等手势逻辑
 */

export const SignLanguageProcessor = {
    // 基础工具：计算欧氏距离
    getDist(p1, p2) {
        return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
    },

    // 核心工具：获取手指伸展度 (0-1)
    // 逻辑：计算指尖到掌根距离 与 关节到掌根距离的比值，增加不同手型的兼容性
    getStretch(lm, tipIdx, mcpIdx) {
        const d1 = this.getDist(lm[tipIdx], lm[0]);
        const d2 = this.getDist(lm[mcpIdx], lm[0]);
        return d1 / d2;
    },

    analyze(multiHandLandmarks) {
        if (!multiHandLandmarks || multiHandLandmarks.length === 0) return null;

        const lm = multiHandLandmarks[0];

        // 1. 预计算手指状态
        const isThumbUp = this.getStretch(lm, 4, 2) > 1.2;
        const isIndexUp = this.getStretch(lm, 8, 5) > 1.2;
        const isMiddleUp = this.getStretch(lm, 12, 9) > 1.2;
        const isRingUp = this.getStretch(lm, 16, 13) > 1.2;
        const isPinkyUp = this.getStretch(lm, 20, 17) > 1.2;

        // 2. 预计算关键间距
        const thumbTipToIndexRoot = this.getDist(lm[4], lm[5]); // 拇指尖到食指根部
        const palmOrientation = lm[0].z - lm[9].z; // 正负判断手心朝向

        // --- 根据图片内容实现的专项算法 ---

        // 【你好】/【好】
        // 图片说明：竖起大拇指。
        // 算法：仅大拇指伸直，且向上（y值小于掌心）
        if (isThumbUp && !isIndexUp && !isMiddleUp && !isRingUp && !isPinkyUp) {
            if (lm[4].y < lm[2].y) return "你好/好";
        }

        // 【我】
        // 图片说明：指一下自己。
        // 算法：食指伸出，且食指尖的 Z 轴深度明显靠近相机或指向特定方向
        // 在 2D 视角下，通常表现为食指单指伸出，指向屏幕中心
        if (isIndexUp && !isMiddleUp && !isRingUp && !isPinkyUp && !isThumbUp) {
            return "我";
        }

        // 【谢谢】
        // 图片说明：拇指弯曲几下。
        // 算法：识别大拇指处于“半弯曲”状态，即指尖距离食指根部很近，但并不是握拳
        const thumbIsNodding = thumbTipToIndexRoot < 0.08;
        if (thumbIsNodding && !isIndexUp && !isMiddleUp && !isRingUp && !isPinkyUp) {
            return "谢谢";
        }

        // 【早上好 / 太阳升起】
        // 图片说明：手指缓慢张开。
        // 算法：识别到从“拳头”变“五指张开”的过程（此处静态识别五指全开）
        if (isThumbUp && isIndexUp && isMiddleUp && isRingUp && isPinkyUp) {
            return "早/五/大家";
        }

        // 【晚上好】
        // 图片说明：手指缓慢合拢。
        // 算法：识别五指处于半合拢状态（伸展度在 0.8 - 1.1 之间）
        const isClosing = [8, 12, 16, 20].every(idx => {
            const ratio = this.getStretch(lm, idx, idx - 2);
            return ratio > 0.8 && ratio < 1.1;
        });
        if (isClosing && !isThumbUp) {
            return "晚";
        }

        // 【我很很好】（正确顺序是 我/好/很）
        // 图片说明：拇指按在食指根部，向下一顿。
        // 算法：拇指尖 (4) 极其接近食指根部 (5)
        if (thumbTipToIndexRoot < 0.04 && !isIndexUp && !isMiddleUp) {
            return "很/非常";
        }

        // 【上午/下午】
        // 图片说明：手指水平划动。这需要配合 index.vue 的位移判断。
        // 静态识别：手掌平放（食指根部 5 和 小指根部 17 的 Y 轴接近）
        const isHandHorizontal = Math.abs(lm[5].y - lm[17].y) < 0.05;
        if (isHandHorizontal && isIndexUp && isMiddleUp && isRingUp && isPinkyUp) {
            return "平/时间";
        }

        return null;
    }
};