import type { PitchResult } from '../types';
import { centsBetween, intervalNameCn } from './music';

/**
 * 测音核心：FFT + FFT 自相关基频 + 频谱峰值 + 起音分割/双音聚类。
 * 实时 AnalyserNode 与导入文件的离线分析共用 detectPitch() 这一个核，
 * 因此“分析节点测音”和“整段实录直读”结果一致。
 */

// ───────────────────────── 基 2 FFT ─────────────────────────
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((2 * Math.PI) / len) * (inverse ? -1 : 1);
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1;
      let cwi = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + half] * cwr - im[i + k + half] * cwi;
        const vi = re[i + k + half] * cwi + im[i + k + half] * cwr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + half] = ur - vr;
        im[i + k + half] = ui - vi;
        const nwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr;
        cwr = nwr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

function nextPow2(v: number): number {
  let n = 1;
  while (n < v) n <<= 1;
  return n;
}

export interface PitchHit {
  freq: number;
  clarity: number;
  rms: number;
}

/** FFT 自相关基频检测（输入可为 AnalyserNode 时域数据或任意采样窗） */
export function detectPitch(input: Float32Array | Float64Array, sampleRate: number, fmin = 52, fmax = 2400): PitchHit | null {
  const L = input.length;
  let sumSq = 0;
  const win = new Float64Array(L);
  for (let i = 0; i < L; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (L - 1)); // Hann
    const v = input[i] * w;
    win[i] = v;
    sumSq += input[i] * input[i];
  }
  const rms = Math.sqrt(sumSq / L);
  if (rms < 0.006) return { freq: -1, clarity: 0, rms };

  const N = nextPow2(2 * L);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  re.set(win);
  fft(re, im);
  for (let i = 0; i < N; i++) {
    const p = re[i] * re[i] + im[i] * im[i];
    re[i] = p;
    im[i] = 0;
  }
  fft(re, im, true);

  const minLag = Math.max(2, Math.floor(sampleRate / fmax));
  const maxLag = Math.min(N / 2 - 2, Math.ceil(sampleRate / fmin));
  let bestLag = -1;
  let bestVal = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const v = re[lag];
    if (v > bestVal) {
      bestVal = v;
      bestLag = lag;
    }
  }
  if (bestLag <= 0 || re[0] <= 0) return null;

  // 抛物线插值，提高 Hz 读数精度
  const y0 = re[bestLag - 1];
  const y1 = re[bestLag];
  const y2 = re[bestLag + 1];
  const shift = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1e-9);
  const lagFloat = bestLag + (Number.isFinite(shift) ? shift : 0);
  const clarity = Math.max(0, Math.min(1.2, bestVal / re[0]));
  const freq = sampleRate / lagFloat;
  if (!Number.isFinite(freq) || freq <= 0) return null;
  return { freq, clarity, rms };
}

export interface SpectralPeak {
  freq: number;
  amp: number;
}

/** 频谱峰值（抛物线插值），用于找出同一次敲击里并存的正/侧鼓模态 */
export function spectralPeaks(input: Float32Array | Float64Array, sampleRate: number, maxPeaks = 14): SpectralPeak[] {
  const L = input.length;
  const N = Math.min(8192, nextPow2(2 * L));
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < L && i < N; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (L - 1));
    re[i] = input[i] * w;
  }
  fft(re, im);
  const mag = new Float64Array(N / 2);
  let maxMag = 0;
  for (let i = 1; i < N / 2; i++) {
    mag[i] = Math.hypot(re[i], im[i]);
    if (mag[i] > maxMag) maxMag = mag[i];
  }
  const peaks: SpectralPeak[] = [];
  const binHz = sampleRate / N;
  for (let i = 3; i < N / 2 - 1; i++) {
    if (mag[i] > mag[i - 1] && mag[i] >= mag[i + 1] && mag[i] > maxMag * 0.06) {
      const y0 = mag[i - 1];
      const y1 = mag[i];
      const y2 = mag[i + 1];
      const shift = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1e-9);
      peaks.push({ freq: (i + (Number.isFinite(shift) ? shift : 0)) * binHz, amp: mag[i] });
    }
  }
  peaks.sort((a, b) => b.amp - a.amp);
  const top = peaks.slice(0, maxPeaks);
  top.sort((a, b) => a.freq - b.freq);
  return top;
}

export interface StrikeSegment {
  onsetSample: number;
  timeSec: number;
  rms: number;
  pitch: number | null;
  clarity: number;
  peaks: SpectralPeak[];
}

/** 基于 RMS 包络的敲击起音分割 */
export function segmentStrikes(mono: Float32Array, sampleRate: number): StrikeSegment[] {
  const hop = 512;
  const win = 1024;
  const nHops = Math.floor((mono.length - win) / hop);
  const rmsEnv = new Float32Array(Math.max(1, nHops));
  for (let h = 0; h < nHops; h++) {
    let s = 0;
    const base = h * hop;
    for (let i = 0; i < win; i++) {
      const v = mono[base + i] || 0;
      s += v * v;
    }
    rmsEnv[h] = Math.sqrt(s / win);
  }
  // 噪声底取第 5 分位：编钟余音很长，高分位会把余音误当成噪声底
  const sorted = Array.from(rmsEnv).sort((a, b) => a - b);
  const noise = sorted[Math.floor(sorted.length * 0.05)] ?? 0;
  const maxRms = sorted[sorted.length - 1] ?? 0;
  // 绝对门限 + 噪声倍数，但不得高于最强敲击的 30%，避免长余音导致检不出
  const threshold = Math.min(Math.max(noise * 3, 0.012), Math.max(0.03, maxRms * 0.3));

  const segments: StrikeSegment[] = [];
  const minGapHops = Math.floor(0.14 * sampleRate / hop);
  let lastOnsetHop = -minGapHops;
  let armed = true;
  for (let h = 0; h < nHops; h++) {
    // 包络越过阈值且处于“待触发”状态即记为一次敲击；
    // 重叠的分析窗会把起音能量铺开，因此不再附加环比上升率门槛。
    if (armed && rmsEnv[h] > threshold && h - lastOnsetHop > minGapHops) {
      lastOnsetHop = h;
      armed = false;
      segments.push(buildSegment(mono, sampleRate, h * hop, rmsEnv[h]));
    }
    // 包络回落到阈值的 0.8 以下才重新武装，避免长衰减被重复计数
    if (rmsEnv[h] < threshold * 0.8) armed = true;
  }
  return segments;
}

function buildSegment(mono: Float32Array, sr: number, onset: number, rms: number): StrikeSegment {
  // 起音后 25ms 取窗，窗长 0.32s，避开槌噪、保留稳定模态
  const start = Math.min(mono.length - 1024, onset + Math.floor(0.025 * sr));
  const len = Math.min(Math.floor(0.32 * sr), mono.length - start);
  const slice = mono.subarray(start, start + len);
  const acf = detectPitch(slice as Float32Array, sr);
  const peaks = spectralPeaks(slice as Float32Array, sr, 18);
  // 编钟是非谐乐器且正/侧鼓音近似 5:6，纯自相关会误锁到“缺失基音”，
  // 因此以 55–2600Hz 内最强频谱峰作为该次敲击的主导基频（与论文读 FFT 第一/第二峰一致）。
  const musical = peaks.filter((p) => p.freq >= 55 && p.freq <= 2600);
  let pitch: number | null = null;
  if (musical.length) {
    pitch = musical.reduce((a, b) => (b.amp > a.amp ? b : a)).freq;
  } else if (acf && acf.freq > 45) {
    pitch = acf.freq;
  }
  return {
    onsetSample: onset,
    timeSec: onset / sr,
    rms,
    pitch,
    clarity: acf?.clarity ?? 0,
    peaks,
  };
}

function median(nums: number[]): number {
  if (!nums.length) return NaN;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** 将若干事件基频贪心聚类为 ≤2 个音高族 */
function clusterPitches(freqs: number[], tol = 0.055): number[][] {
  const clusters: number[][] = [];
  for (const f of freqs) {
    let placed = false;
    for (const c of clusters) {
      const center = median(c);
      if (Math.abs(f - center) / center < tol) {
        c.push(f);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([f]);
  }
  clusters.sort((a, b) => median(a) - median(b));
  return clusters;
}

export interface RecordingAnalysis extends PitchResult {
  events: StrikeSegment[];
  mode: 'two-strikes' | 'single-dual-mode' | 'unknown';
  durationSec: number;
}

/** 分析解码后的 AudioBuffer（混音为单声道），读出正鼓/侧鼓两音 */
export function analyzeAudioBuffer(buffer: AudioBuffer): RecordingAnalysis {
  const sr = buffer.sampleRate;
  const ch0 = buffer.getChannelData(0);
  let mono: Float32Array = ch0;
  if (buffer.numberOfChannels > 1) {
    const ch1 = buffer.getChannelData(1);
    mono = new Float32Array(ch0.length);
    for (let i = 0; i < ch0.length; i++) mono[i] = (ch0[i] + ch1[i]) / 2;
  }

  const events = segmentStrikes(mono, sr);
  const voiced = events.filter((e) => e.pitch && e.clarity > 0.2).map((e) => e.pitch as number);
  const clusters = clusterPitches(voiced);

  let zheng: number | null = null;
  let ce: number | null = null;
  let mode: RecordingAnalysis['mode'] = 'unknown';
  let allPeaks: number[] = [];

  if (clusters.length >= 2) {
    // 两个音高族：低=正鼓，高=侧鼓
    zheng = median(clusters[0]);
    ce = median(clusters[1]);
    mode = 'two-strikes';
  } else if (clusters.length === 1) {
    zheng = median(clusters[0]);
  } else if (voiced.length) {
    zheng = median(voiced);
  }

  // 单音/单簇时，从频谱峰值里找并存的侧鼓模态（频率比约 1.12–1.42）
  const peakFreqs = events.flatMap((e) => e.peaks.map((p) => p.freq));
  allPeaks = pickRepresentativePeaks(peakFreqs);
  if (zheng && !ce) {
    const band = events
      .flatMap((e) => e.peaks)
      .filter((p) => p.freq > zheng! * 1.1 && p.freq < zheng! * 1.45)
      .sort((a, b) => b.amp - a.amp);
    if (band.length) {
      ce = band[0].freq;
      mode = 'single-dual-mode';
    }
  }
  if (zheng && ce && mode === 'unknown') mode = 'two-strikes';

  const intervalCents = zheng && ce ? centsBetween(zheng, ce) : null;
  const semitones = intervalCents != null ? intervalCents / 100 : null;
  const degreeName = intervalCents != null ? intervalNameCn(intervalCents) : null;

  return {
    zhengHz: zheng ? Math.round(zheng * 10) / 10 : null,
    ceHz: ce ? Math.round(ce * 10) / 10 : null,
    intervalCents: intervalCents != null ? Math.round(intervalCents * 10) / 10 : null,
    semitones: semitones != null ? Math.round(semitones * 100) / 100 : null,
    degreeName,
    clarity: events.length ? Math.max(...events.map((e) => e.clarity)) : 0,
    peaks: allPeaks.slice(0, 10).map((f) => Math.round(f * 10) / 10),
    events,
    mode,
    durationSec: buffer.duration,
  };
}

function pickRepresentativePeaks(freqs: number[]): number[] {
  const sorted = freqs.filter((f) => f > 40 && f < 6000).sort((a, b) => a - b);
  const out: number[] = [];
  for (const f of sorted) {
    if (!out.length || Math.abs(f - out[out.length - 1]) / out[out.length - 1] > 0.02) out.push(f);
  }
  return out;
}

/** 供 AnalyserNode 实时帧调用的便捷封装（纯自相关，适合单音旋律） */
export function detectFromAnalyser(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>): PitchHit | null {
  analyser.getFloatTimeDomainData(buf);
  return detectPitch(buf, analyser.context.sampleRate);
}

/**
 * 编钟实时测音：同一个 AnalyserNode 同时取时域（能量/清晰度）与频域 dB，
 * 在 55–2600Hz 内找最强谱峰并做抛物线插值。避免双音近似整数比时
 * 自相关误锁到“缺失基音”。
 */
export function detectLivePitch(
  analyser: AnalyserNode,
  timeBuf: Float32Array<ArrayBuffer>,
  freqDb: Float32Array<ArrayBuffer>,
): PitchHit | null {
  analyser.getFloatTimeDomainData(timeBuf);
  const acf = detectPitch(timeBuf, analyser.context.sampleRate);
  let sumSq = 0;
  for (let i = 0; i < timeBuf.length; i++) sumSq += timeBuf[i] * timeBuf[i];
  const rms = Math.sqrt(sumSq / timeBuf.length);
  if (rms < 0.008) return { freq: -1, clarity: 0, rms };

  analyser.getFloatFrequencyData(freqDb);
  const sr = analyser.context.sampleRate;
  const binHz = sr / analyser.fftSize;
  const lo = Math.max(1, Math.floor(55 / binHz));
  const hi = Math.min(freqDb.length - 2, Math.ceil(2600 / binHz));
  let best = -1;
  let bestDb = -Infinity;
  for (let i = lo; i <= hi; i++) {
    if (freqDb[i] > bestDb) {
      bestDb = freqDb[i];
      best = i;
    }
  }
  if (best <= 0 || !Number.isFinite(bestDb) || bestDb < -110) {
    return acf && acf.freq > 0 ? acf : null;
  }
  const y0 = freqDb[best - 1];
  const y1 = freqDb[best];
  const y2 = freqDb[best + 1];
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? (y0 - y2) / (2 * denom) : 0;
  const freq = (best + (Number.isFinite(shift) ? clampNum(shift, -1, 1) : 0)) * binHz;
  return { freq, clarity: acf?.clarity ?? 0.8, rms };
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
