/**
 * 曾侯乙数字编钟 · AudioWorklet 处理器（运行在音频渲染线程）
 * ------------------------------------------------------------------
 * 每次敲击是一个 Voice，内含若干模态；每个模态是一条独立的
 * 指数衰减正弦：
 *
 *     y_j(t) = a_j · exp(-t / τ_j) · sin(2π f_j t + φ_j)
 *
 * 一口钟的声音 = 该钟所有模态衰减振荡之和，再叠加极短的槌触噪声。
 * 多口钟的 Voice 并行叠加，带复音上限与最旧 Voice 回收。
 *
 * 该文件放在 public/worklets 下，由 audioWorklet.addModule 直接加载，
 * 不经过打包，保证 AudioWorklet 全局 registerProcessor 可用。
 */

/* global registerProcessor, AudioWorkletProcessor, sampleRate, currentTime */

const MAX_VOICES = 28;
const ATTACK_SAMPLES = Math.max(1, Math.floor(sampleRate * 0.003)); // 3 ms 软起振

class BellProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    /** @type {Array<any>} */
    this.voices = [];
    this.master = 0.9;

    this.port.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.type === 'strike' && msg.descriptor) {
        this.addVoice(msg.descriptor);
      } else if (msg.type === 'panic') {
        this.voices.length = 0;
      } else if (msg.type === 'ping') {
        this.port.postMessage({ type: 'pong', id: msg.id, t: msg.t });
      } else if (msg.type === 'set-master') {
        this.master = msg.value;
      }
    };
  }

  /** @param {any} d */
  addVoice(d) {
    // 复音上限：回收最旧的 voice
    if (this.voices.length >= MAX_VOICES) {
      this.voices.sort((a, b) => a.bornFrame - b.bornFrame);
      this.voices.splice(0, this.voices.length - MAX_VOICES + 1);
    }

    const modes = (d.modes || []).map(
      (/** @type {{freq:number, amp:number, tau:number}} */ m) => ({
        inc: (2 * Math.PI * Math.max(20, m.freq)) / sampleRate,
        phase: Math.random() * 0.3, // 轻微随机相位，避免多钟同相叠加
        amp: m.amp,
        env: 1,
        decay: Math.exp(-1 / (Math.max(0.04, m.tau) * sampleRate)),
      }),
    );

    const pan = Math.max(-1, Math.min(1, d.pan || 0));
    this.voices.push({
      id: d.voiceId,
      bornFrame: currentTime * sampleRate,
      age: 0,
      modes,
      // 等功率声像
      gainL: Math.cos(((pan + 1) * Math.PI) / 4),
      gainR: Math.sin(((pan + 1) * Math.PI) / 4),
      velocity: d.velocity || 0.9,
      click: d.click || 0.3,
      clickEnv: 1,
      clickDecay: Math.exp(-1 / (0.022 * sampleRate)),
      lp: 0,
      alive: true,
      ackPending: true,
    });

    this.port.postMessage({ type: 'started', voiceId: d.voiceId, tCtx: currentTime });
  }

  /**
   * @param {Float32Array[][]} _inputs
   * @param {Float32Array[][]} outputs
   */
  process(_inputs, outputs) {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const chL = out[0];
    const chR = out[1] || out[0];
    const n = chL.length;

    for (let i = 0; i < n; i++) {
      let sampleL = 0;
      let sampleR = 0;

      for (let v = this.voices.length - 1; v >= 0; v--) {
        const voice = this.voices[v];
        let voiceSample = 0;

        for (let k = 0; k < voice.modes.length; k++) {
          const m = voice.modes[k];
          voiceSample += m.amp * m.env * Math.sin(m.phase);
          m.phase += m.inc;
          m.env *= m.decay;
        }

        // 槌触瞬态：低通噪声短脉冲
        if (voice.clickEnv > 0.001) {
          const noise = Math.random() * 2 - 1;
          voice.lp = voice.lp * 0.5 + noise * 0.5;
          voiceSample += voice.click * 0.5 * voice.clickEnv * voice.lp;
          voice.clickEnv *= voice.clickDecay;
        }

        // 3ms 软起振，消除起唱爆音
        const attack = voice.age < ATTACK_SAMPLES ? voice.age / ATTACK_SAMPLES : 1;
        voiceSample *= attack;
        voice.age++;

        // 该 Voice 已进入第一个渲染块：回执一次，用于测量“点击→音频线程起音”
        if (voice.ackPending) {
          voice.ackPending = false;
          this.port.postMessage({ type: 'sounded', voiceId: voice.id, tCtx: currentTime });
        }

        sampleL += voiceSample * voice.gainL;
        sampleR += voiceSample * voice.gainR;

        // 所有模态都已衰减到阈值以下则回收
        let stillRinging = false;
        for (let k = 0; k < voice.modes.length; k++) {
          const m = voice.modes[k];
          if (m.amp * m.env > 0.00012) {
            stillRinging = true;
            break;
          }
        }
        if (!stillRinging && voice.clickEnv <= 0.001) {
          this.voices.splice(v, 1);
        }
      }

      // 总线增益 + tanh 软限幅，防止多钟齐奏削波
      chL[i] = Math.tanh(sampleL * this.master * 1.15) * 0.95;
      chR[i] = Math.tanh(sampleR * this.master * 1.15) * 0.95;
    }

    return true;
  }
}

registerProcessor('bell-processor', BellProcessor);
