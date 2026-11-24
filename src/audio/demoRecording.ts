/**
 * 生成一段“编钟实录”示例 AudioBuffer：
 * 模拟报告 a-1（正鼓 521 Hz / 侧鼓 621 Hz）先后两次敲击，
 * 先敲正鼓点、后敲侧鼓点，含模态衰减与槌触噪声。
 * 纯数学离线渲染，再走与导入文件完全相同的 AnalyserNode/分析管线。
 */
export function createDemoRecording(ctx?: BaseAudioContext): AudioBuffer {
  // 仅用上下文的 createBuffer；OfflineAudioContext 无需用户手势/输出设备
  const owner = ctx ?? new OfflineAudioContext(1, 1, 44100);
  const sr = 44100;
  const duration = 2.4;
  const len = Math.floor(sr * duration);
  const buffer = owner.createBuffer(1, len, sr);
  const data = buffer.getChannelData(0);

  const F_Z = 521;
  const F_C = 621;

  interface Partial {
    f: number;
    amp: number;
    tau: number;
  }

  function strike(startSec: number, primary: 'zheng' | 'ce'): void {
    const start = Math.floor(startSec * sr);
    // 两个主模态 + 几个钟体非谐分音
    const partials: Partial[] =
      primary === 'zheng'
        ? [
            { f: F_Z, amp: 0.9, tau: 2.6 },
            { f: F_C, amp: 0.4, tau: 1.5 }, // 正击鼓时交叉激发的 B 模态
            { f: 1355, amp: 0.28, tau: 0.7 },
            { f: 1405, amp: 0.18, tau: 0.55 },
            { f: 1499, amp: 0.14, tau: 0.45 },
            { f: 2146, amp: 0.1, tau: 0.3 },
            { f: 2449, amp: 0.07, tau: 0.22 },
          ]
        : [
            { f: F_C, amp: 0.95, tau: 1.7 },
            { f: F_Z, amp: 0.12, tau: 2.2 }, // 侧击鼓时少量 A 模态
            { f: 1292, amp: 0.26, tau: 0.6 }, // 621*2.08
            { f: 1677, amp: 0.2, tau: 0.5 }, // 621*2.7
            { f: 2560, amp: 0.12, tau: 0.3 },
            { f: 2820, amp: 0.08, tau: 0.22 },
          ];

    for (let i = 0; i < len - start; i++) {
      const t = i / sr;
      let s = 0;
      for (const p of partials) {
        // 3ms 起振 + 指数衰减
        const attack = Math.min(1, t / 0.003);
        s += p.amp * attack * Math.exp(-t / p.tau) * Math.sin(2 * Math.PI * p.f * t + p.f);
      }
      // 短槌噪声
      if (t < 0.05) {
        s += 0.25 * Math.exp(-t / 0.012) * (Math.random() * 2 - 1);
      }
      const idx = start + i;
      if (idx < len) data[idx] += s * 0.8;
    }
  }

  strike(0.12, 'zheng');
  strike(1.25, 'ce');

  // 轻微环境底噪 + 归一化
  let peak = 0;
  for (let i = 0; i < len; i++) {
    data[i] += (Math.random() * 2 - 1) * 0.0012;
    peak = Math.max(peak, Math.abs(data[i]));
  }
  const g = 0.85 / (peak || 1);
  for (let i = 0; i < len; i++) data[i] *= g;
  return buffer;
}
