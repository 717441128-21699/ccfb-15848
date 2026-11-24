import type { Bell, BellParams } from '../types';
import { buildStrike } from './acoustics';

export interface LatencyStats {
  /** 主线程 postMessage 派发耗时 ms */
  dispatchMs: number;
  /** 点击 → 收到 Worklet 已启动回执 的往返 ms（含消息排队/渲染块） */
  ackMs: number | null;
  /** 点击 → 该声音进入第一个音频渲染块（真正开始出声）ms */
  firstSoundMs: number | null;
  /** 端口 ping/pong 往返 ms */
  portRttMs: number | null;
  /** AudioContext 报告的基础输出延迟 s */
  baseLatencyMs: number;
  outputLatencyMs: number;
  sampleRate: number;
  state: AudioContextState | 'uninitialized';
}

/**
 * 单例音频引擎。
 * 页面加载即创建 AudioContext 并预加载 AudioWorklet；首次用户手势时
 * resume()。手势内 pointerdown → postMessage → 下一个渲染块即出声，
 * 调度路径上没有任何网络/解码/分配重活，保证 < 20ms。
 */
class BellEngine {
  ctx: AudioContext | null = null;
  node: AudioWorkletNode | null = null;
  ready = false;
  initError: string | null = null;

  latency: LatencyStats = {
    dispatchMs: 0,
    ackMs: null,
    firstSoundMs: null,
    portRttMs: null,
    baseLatencyMs: 0,
    outputLatencyMs: 0,
    sampleRate: 48000,
    state: 'uninitialized',
  };

  private initPromise: Promise<void> | null = null;
  private pending = new Map<number, number>();
  private pingId = 0;
  private pingTimes = new Map<number, number>();
  onLatency: ((s: LatencyStats) => void) | null = null;

  /** 幂等初始化，可在脚本启动时直接调用 */
  init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.boot();
    return this.initPromise;
  }

  private async boot(): Promise<void> {
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.latency.sampleRate = this.ctx.sampleRate;
      this.latency.state = this.ctx.state;
      this.refreshLatencyBase();

      const workletUrl = `${import.meta.env.BASE_URL}worklets/bell-processor.js`;
      await this.ctx.audioWorklet.addModule(workletUrl);

      this.node = new AudioWorkletNode(this.ctx, 'bell-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      this.node.connect(this.ctx.destination);

      this.node.port.onmessage = (ev: MessageEvent) => {
        const msg = ev.data as
          | { type: 'started'; voiceId: number; tCtx: number }
          | { type: 'sounded'; voiceId: number; tCtx: number }
          | { type: 'pong'; id: number; t: number };
        if (msg.type === 'started') {
          const t0 = this.pending.get(msg.voiceId);
          if (t0 != null) {
            this.latency.ackMs = Math.round((performance.now() - t0) * 10) / 10;
            this.emitLatency();
          }
        } else if (msg.type === 'sounded') {
          const t0 = this.pending.get(msg.voiceId);
          if (t0 != null) {
            this.latency.firstSoundMs = Math.round((performance.now() - t0) * 10) / 10;
            this.pending.delete(msg.voiceId);
            this.emitLatency();
          }
        } else if (msg.type === 'pong') {
          const t0 = this.pingTimes.get(msg.id);
          if (t0 != null) {
            this.latency.portRttMs = Math.round((performance.now() - t0) * 100) / 100;
            this.pingTimes.delete(msg.id);
            this.emitLatency();
          }
        }
      };

      this.ready = true;
      this.startPingLoop();
    } catch (err) {
      this.initError = err instanceof Error ? err.message : String(err);
      // 允许再次尝试
      this.initPromise = null;
      throw err;
    }
  }

  /** 必须在用户手势中调用；初始化失败时静默（UI 仍可浏览/测音） */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      try {
        await this.init();
      } catch {
        return;
      }
    }
    if (this.ctx && this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* 手势策略拒绝时静默，下一次手势再试 */
      }
    }
    this.latency.state = this.ctx?.state ?? 'uninitialized';
    this.emitLatency();
  }

  private refreshLatencyBase(): void {
    if (!this.ctx) return;
    const c = this.ctx as AudioContext & { outputLatency?: number };
    this.latency.baseLatencyMs = Math.round((c.baseLatency ?? 0) * 10000) / 10;
    this.latency.outputLatencyMs = Math.round((c.outputLatency ?? 0) * 10000) / 10;
  }

  private startPingLoop(): void {
    const ping = () => {
      if (this.node && this.ctx?.state === 'running') {
        const id = ++this.pingId;
        this.pingTimes.set(id, performance.now());
        this.node.port.postMessage({ type: 'ping', id, t: performance.now() });
        this.refreshLatencyBase();
        this.emitLatency();
      }
      window.setTimeout(ping, 1500);
    };
    window.setTimeout(ping, 400);
  }

  private emitLatency(): void {
    this.onLatency?.({ ...this.latency });
  }

  /** 敲击一口钟的指定位置。返回 voiceId。 */
  strike(
    bell: Bell,
    params: BellParams,
    x: number,
    y: number,
    opts?: { velocity?: number; pan?: number },
  ): number | null {
    if (!this.ctx || !this.node || !this.ready) return null;
    if (this.ctx.state === 'suspended') {
      // 不 await，避免增加点击延迟；resume 与 post 同时发出
      void this.ctx.resume();
    }
    const descriptor = buildStrike(bell, params, x, y, opts);
    const t0 = performance.now();
    this.pending.set(descriptor.voiceId, t0);
    this.node.port.postMessage({ type: 'strike', descriptor });
    this.latency.dispatchMs = Math.round((performance.now() - t0) * 1000) / 1000;
    this.latency.state = this.ctx.state;
    this.emitLatency();

    // 防止 ack 丢失导致 Map 增长
    window.setTimeout(() => this.pending.delete(descriptor.voiceId), 4000);
    return descriptor.voiceId;
  }

  panic(): void {
    this.node?.port.postMessage({ type: 'panic' });
  }
}

export const engine = new BellEngine();
