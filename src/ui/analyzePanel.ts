import { engine } from '../audio/BellEngine';
import { analyzeAudioBuffer, detectLivePitch, type RecordingAnalysis } from '../audio/tuner';
import { createDemoRecording } from '../audio/demoRecording';
import { REPORT_ROWS } from '../data/report';
import { centsBetween, intervalDegree, intervalNameCn } from '../audio/music';

/** 实录测音面板：导入编钟录音 → 读出正鼓/侧鼓 Hz 与音程；播放时走 AnalyserNode 实时分析 */
export function mountAnalyze(root: HTMLElement): void {
  root.innerHTML = `
    <div class="panel-head">
      <h2>④ 实录测音 · Web Audio AnalyserNode</h2>
      <p class="hint">导入一段编钟实录（可含“先正鼓、后侧鼓”两次敲击，也可是单次双模态敲击）。
        解码后先做整段起音分割与 FFT 直读；播放时由 <code>AnalyserNode</code> 时域自相关 + 频域峰值实时校验。</p>
    </div>

    <div class="analyze-grid">
      <section class="card import-card">
        <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="导入音频文件">
          <div class="dz-icon">🎧</div>
          <p><b>点击选择</b> 或把音频拖到这里</p>
          <p class="hint">支持 wav / mp3 / m4a / ogg …</p>
          <input type="file" id="file-input" accept="audio/*" hidden/>
        </div>
        <div class="import-actions">
          <button class="btn btn-primary" id="btn-demo">使用内置示例实录（a-1：521 + 621 Hz）</button>
        </div>
        <div class="play-row">
          <button class="btn" id="btn-play" disabled>▶ 播放并实时测音</button>
          <button class="btn" id="btn-stop" disabled>■ 停止</button>
          <label class="check"><input type="checkbox" id="chk-mute" checked/> 静音外放（仅分析）</label>
        </div>
        <canvas id="wave-canvas" width="640" height="120" class="wave-canvas"></canvas>
      </section>

      <section class="card result-card" data-testid="analyze-result">
        <h3>测音结果</h3>
        <div id="result-body"><p class="hint">尚未导入音频。</p></div>
      </section>
    </div>

    <section class="card live-card">
      <h3>AnalyserNode 实时频谱 / 音高</h3>
      <div class="live-grid">
        <canvas id="spectrum-canvas" width="720" height="220"></canvas>
        <div class="live-readout">
          <div class="live-pitch"><span>实时基频</span><b id="live-freq">— Hz</b></div>
          <div class="live-pitch"><span>音名</span><b id="live-note">—</b></div>
          <div class="live-pitch"><span>清晰度</span><b id="live-clarity">—</b></div>
          <div class="live-pitch"><span>分析节点</span><b class="ok">AnalyserNode ✓</b></div>
        </div>
      </div>
    </section>`;

  const fileInput = root.querySelector<HTMLInputElement>('#file-input')!;
  const dropzone = root.querySelector<HTMLElement>('#dropzone')!;
  const demoBtn = root.querySelector<HTMLButtonElement>('#btn-demo')!;
  const playBtn = root.querySelector<HTMLButtonElement>('#btn-play')!;
  const stopBtn = root.querySelector<HTMLButtonElement>('#btn-stop')!;
  const muteChk = root.querySelector<HTMLInputElement>('#chk-mute')!;
  const resultBody = root.querySelector<HTMLElement>('#result-body')!;
  const waveCanvas = root.querySelector<HTMLCanvasElement>('#wave-canvas')!;
  const specCanvas = root.querySelector<HTMLCanvasElement>('#spectrum-canvas')!;
  const liveFreq = root.querySelector<HTMLElement>('#live-freq')!;
  const liveNote = root.querySelector<HTMLElement>('#live-note')!;
  const liveClarity = root.querySelector<HTMLElement>('#live-clarity')!;

  let buffer: AudioBuffer | null = null;
  let analysis: RecordingAnalysis | null = null;
  let source: AudioBufferSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let raf = 0;

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });
  ['dragover', 'dragenter'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add('drag');
    }),
  );
  ['dragleave', 'drop'].forEach((ev) =>
    dropzone.addEventListener(ev, () => dropzone.classList.remove('drag')),
  );
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = (e as DragEvent).dataTransfer?.files?.[0];
    if (file) void loadFile(file);
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) void loadFile(file);
  });

  demoBtn.addEventListener('click', () => {
    buffer = createDemoRecording();
    analysis = analyzeAudioBuffer(buffer);
    afterLoaded('内置示例实录（合成 a-1 正鼓 + 侧鼓）');
  });

  playBtn.addEventListener('click', () => void play());
  stopBtn.addEventListener('click', stopPlayback);

  async function loadFile(file: File): Promise<void> {
    resultBody.innerHTML = `<p class="hint">正在解码并分析 <b>${file.name}</b> …</p>`;
    try {
      await engine.unlock();
      if (!engine.ctx) await engine.init();
      const arr = await file.arrayBuffer();
      buffer = await engine.ctx!.decodeAudioData(arr);
      analysis = analyzeAudioBuffer(buffer);
      afterLoaded(file.name);
    } catch (err) {
      resultBody.innerHTML = `<p class="bad">音频解码失败：${err instanceof Error ? err.message : String(err)}</p>`;
    }
  }

  function afterLoaded(name: string): void {
    playBtn.disabled = false;
    stopBtn.disabled = false;
    drawWaveform(waveCanvas, buffer!);
    renderResult(name, analysis!);
  }

  function renderResult(name: string, a: RecordingAnalysis): void {
    const nearest = nearestReport(a.zhengHz, a.ceHz);
    resultBody.innerHTML = `
      <div class="rec-name" title="${name}">📄 ${name}</div>
      <div class="read-grid">
        <div class="read-box z">
          <span>正鼓音</span>
          <b data-testid="read-zheng">${a.zhengHz != null ? a.zhengHz.toFixed(1) : '—'}</b><em>Hz</em>
        </div>
        <div class="read-box c">
          <span>侧鼓音</span>
          <b data-testid="read-ce">${a.ceHz != null ? a.ceHz.toFixed(1) : '—'}</b><em>Hz</em>
        </div>
      </div>
      <div class="interval-big" data-testid="read-interval">
        ${a.intervalCents != null
          ? `两音相隔 <b>${Math.abs(a.intervalCents).toFixed(1)}</b> 音分
             ≈ <b>${Math.abs(a.semitones!).toFixed(2)}</b> 半音，
             为第 <b>${intervalDegree(a.intervalCents)}</b> 度
             <span class="badge badge-gold">${intervalNameCn(a.intervalCents)}</span>`
          : '未能可靠分离两个音高，请尝试包含两次清晰敲击的录音。'}
      </div>
      <div class="hint">识别方式：${modeText(a.mode)}；检出 ${a.events.length} 个敲击事件，时长 ${a.durationSec.toFixed(1)}s。</div>
      ${
        nearest
          ? `<div class="nearest">最接近报告钟 <b>${nearest.code}</b>
             （报告 ${nearest.row.zhengHz}/${nearest.row.ceHz} Hz）· 音程偏差
             <b class="${nearest.dev <= 30 ? 'ok' : 'bad'}">${nearest.dev.toFixed(1)}¢</b>
             ${nearest.dev <= 30 ? '✓ ≤30¢' : ''}</div>`
          : ''
      }
      <details class="events-details"><summary>查看 ${a.events.length} 个敲击事件与频谱峰值</summary>
        <ol class="event-list">
          ${a.events
            .map(
              (e, i) => `<li>#${i + 1} t=${e.timeSec.toFixed(2)}s · 基频 ${e.pitch ? e.pitch.toFixed(1) + 'Hz' : '—'}
                · 清晰度 ${e.clarity.toFixed(2)} · 峰值 ${e.peaks
                  .slice(0, 5)
                  .map((p) => p.freq.toFixed(0))
                  .join('/')} Hz</li>`,
            )
            .join('')}
        </ol>
      </details>`;
  }

  async function play(): Promise<void> {
    if (!buffer || !engine.ctx) return;
    stopPlayback();
    await engine.unlock();
    const ctx = engine.ctx;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 8192;
    analyser.smoothingTimeConstant = 0.82;
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);
    if (!muteChk.checked) analyser.connect(ctx.destination);
    source.onended = () => {
      cancelAnimationFrame(raf);
    };
    source.start();
    const timeBuf = new Float32Array(analyser.fftSize);
    const freqDb = new Float32Array(analyser.frequencyBinCount);
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const hit = detectLivePitch(analyser!, timeBuf, freqDb);
      if (hit && hit.freq > 0) {
        liveFreq.textContent = `${hit.freq.toFixed(1)} Hz`;
        liveClarity.textContent = hit.clarity.toFixed(2);
        liveClarity.className = hit.clarity > 0.5 ? 'ok' : '';
        const midi = 69 + 12 * Math.log2(hit.freq / 440);
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const m = Math.round(midi);
        const cents = Math.round((midi - m) * 100);
        liveNote.textContent = `${names[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1} (${cents >= 0 ? '+' : ''}${cents}¢)`;
      }
      drawSpectrum(specCanvas, analyser!, freqData);
    };
    draw();
  }

  function stopPlayback(): void {
    cancelAnimationFrame(raf);
    try {
      source?.stop();
    } catch {
      /* already stopped */
    }
    source?.disconnect();
    analyser?.disconnect();
    source = null;
    analyser = null;
  }

  // 首次进入即预载示例结果，让“读出正/侧鼓 Hz”一目了然；用户仍可导入自己的录音
  buffer = createDemoRecording();
  analysis = analyzeAudioBuffer(buffer);
  afterLoaded('内置示例实录（合成 a-1 正鼓 + 侧鼓，可替换为你的录音）');
}

function modeText(m: RecordingAnalysis['mode']): string {
  return m === 'two-strikes' ? '两次敲击音高聚类（低=正鼓，高=侧鼓）' : m === 'single-dual-mode' ? '单次敲击的双模态频谱峰值' : '音高聚类';
}

function nearestReport(z: number | null, c: number | null): { code: string; row: (typeof REPORT_ROWS)[number]; dev: number } | null {
  if (!z || !c) return null;
  const target = centsBetween(z, c);
  let best: { code: string; row: (typeof REPORT_ROWS)[number]; dev: number } | null = null;
  for (const row of REPORT_ROWS) {
    const rc = centsBetween(row.zhengHz, row.ceHz);
    const dev = Math.abs(rc - target);
    if (!best || dev < best.dev) best = { code: row.code, row, dev };
  }
  return best;
}

function drawWaveform(canvas: HTMLCanvasElement, buffer: AudioBuffer): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 640;
  const h = 120;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const data = buffer.getChannelData(0);
  ctx.strokeStyle = '#c99b47';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = Math.floor(data.length / w);
  for (let x = 0; x < w; x++) {
    let min = 1;
    let max = -1;
    for (let i = 0; i < step; i += 16) {
      const v = data[x * step + i] || 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    ctx.moveTo(x, ((1 + min) / 2) * h);
    ctx.lineTo(x, ((1 + max) / 2) * h);
  }
  ctx.stroke();
}

function drawSpectrum(canvas: HTMLCanvasElement, analyser: AnalyserNode, data: Uint8Array): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 720;
  const h = 220;
  if (canvas.width !== w * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  analyser.getByteFrequencyData(data as Uint8Array<ArrayBuffer>);
  const sr = analyser.context.sampleRate;
  const maxHz = 5200;
  const maxBin = Math.floor((maxHz * analyser.fftSize) / sr);
  const bars = 120;
  const bw = w / bars;
  for (let i = 0; i < bars; i++) {
    const bin = Math.floor((i / bars) * maxBin);
    const v = data[bin] / 255;
    const bh = v * (h - 18);
    const grad = ctx.createLinearGradient(0, h - bh, 0, h);
    grad.addColorStop(0, '#7ff0c8');
    grad.addColorStop(0.6, '#c99b47');
    grad.addColorStop(1, '#5d4423');
    ctx.fillStyle = grad;
    ctx.fillRect(i * bw + 1, h - bh, bw - 2, bh);
  }
  ctx.fillStyle = 'rgba(233,220,190,0.75)';
  ctx.font = '11px system-ui';
  ctx.fillText('0', 4, h - 4);
  ctx.fillText(`${maxHz} Hz`, w - 52, h - 4);
}
