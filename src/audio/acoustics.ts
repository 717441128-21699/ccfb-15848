import type { Bell, BellParams, ModalComponent, StrikeDescriptor } from '../types';
import { reportByCode } from '../data/report';
import { clamp } from './music';

/**
 * 合瓦形编钟模态合成模型
 * ------------------------------------------------------------------
 * 频率标度采用薄板/壳弯曲振动近似：
 *     f ∝ (h / L²) · √(E(Sn)/ρ(Sn))
 * h=壁厚，L=铣长（特征长度），E=杨氏模量，ρ=密度（随锡含量变化）。
 *
 * 默认参数下 fZheng0 / fCe0 直接校准到公开测音报告的实测基频，
 * 因此正鼓—侧鼓音程与报告完全一致（0 音分偏差）。尺寸、壁厚、锡含量
 * 对两个主模态施加相同的整体缩放，故改变参数移调时音程保持稳定。
 *
 * 位置激发：正鼓模态 (A) 在鼓中心最强、侧鼓点近节线；侧鼓模态 (B)
 * 在侧鼓点最强、正鼓中心近节线。交叉耦合系数按论文表1的实测声级比
 * 标定（正击鼓时 B≈0.42，侧击鼓时 A≈0.12）。
 */

export function defaultParams(b: Bell): BellParams {
  return {
    xianChangMm: b.xianChangMm,
    wallMm: b.wallMm,
    tinPct: b.tinPct,
    meiHeightMm: b.meiHeightMm,
  };
}

// ── 材料模型（经验近似，锡含量 wt%） ────────────────────────────────
export function youngModulusGPa(snPct: number): number {
  const d = snPct - 13;
  return 112 * (1 + 0.012 * d - 0.0011 * d * d);
}
export function bronzeDensity(snPct: number): number {
  const w = clamp(snPct, 1, 40) / 100;
  return 1 / ((1 - w) / 8.96 + w / 7.31); // 比体积加和
}
export function materialFactor(snPct: number): number {
  return Math.sqrt(youngModulusGPa(snPct) / bronzeDensity(snPct));
}

/** 整体频率缩放系数（相对该钟默认参数） */
export function globalScale(b: Bell, p: BellParams): number {
  const L0 = b.xianChangMm;
  const L = clamp(p.xianChangMm, 40, 2000);
  const h0 = b.wallMm;
  const h = clamp(p.wallMm, 1, 60);
  const size = Math.pow(L0 / L, 2); // f ∝ L^-2
  const wall = h / h0; // f ∝ h
  const material = materialFactor(p.tinPct) / materialFactor(b.tinPct);
  return size * wall * material;
}

export function scaledFrequencies(b: Bell, p: BellParams): { zheng: number; ce: number; scale: number } {
  const g = globalScale(b, p);
  return { zheng: b.fZheng0 * g, ce: b.fCe0 * g, scale: g };
}

// ── 模态配方（频率比参考论文 a-4 的频谱峰值：2.60/2.69/2.82、4.12/4.21/4.71） ──
type ModalRole = ModalComponent['role'];
interface RecipeMode {
  key: string;
  role: ModalRole;
  ratio: number | 'ce';
  amp: number;
  decay: number; // 衰减速率倍数（越大越快）
  nx: number; // 横向节线数（决定位置权重）
  phase: number;
}

const RECIPE: RecipeMode[] = [
  { key: 'A0', role: 'zheng', ratio: 1.0, amp: 1.0, decay: 1.0, nx: 0, phase: 0 },
  { key: 'B0', role: 'ce', ratio: 'ce', amp: 0.82, decay: 1.25, nx: 1, phase: 0 },
  { key: 'A1', role: 'partial-a', ratio: 2.6, amp: 0.5, decay: 2.1, nx: 3, phase: 0.4 },
  { key: 'A2', role: 'partial-a', ratio: 2.72, amp: 0.34, decay: 2.5, nx: 4, phase: 1.1 },
  { key: 'A3', role: 'partial-a', ratio: 2.88, amp: 0.26, decay: 2.9, nx: 5, phase: 2.0 },
  { key: 'B1', role: 'partial-b', ratio: 2.08 * 1.252, amp: 0.3, decay: 2.3, nx: 4, phase: 0.8 },
  { key: 'H1', role: 'high', ratio: 4.12, amp: 0.2, decay: 4.2, nx: 6, phase: 1.7 },
  { key: 'H2', role: 'high', ratio: 4.55, amp: 0.15, decay: 5.0, nx: 8, phase: 0.2 },
  { key: 'H3', role: 'high', ratio: 4.71, amp: 0.12, decay: 5.6, nx: 9, phase: 2.6 },
  { key: 'H4', role: 'high', ratio: 5.35, amp: 0.08, decay: 6.4, nx: 11, phase: 1.3 },
];

const KIND_DEFAULT_SIGMA: Record<BellKindLike, { z: number; c: number }> = {
  niu: { z: 0.34, c: 0.56 },
  wumei: { z: 1.39, c: 1.23 },
  duanmei: { z: 1.29, c: 1.11 },
  changmei: { z: 1.26, c: 1.17 },
  large: { z: 0.41, c: 0.34 },
  bo: { z: 0.5, c: 0.55 },
};
type BellKindLike = Bell['kind'];

function sigmas(b: Bell): { z: number; c: number } {
  if (b.reportCode) {
    const row = reportByCode.get(b.reportCode);
    if (row) return { z: row.sigmaZheng, c: row.sigmaCe };
  }
  return KIND_DEFAULT_SIGMA[b.kind];
}

// ── 位置激发权重 ────────────────────────────────────────────────────
export interface PositionWeights {
  /** 与 RECIPE 对齐的每个模态的位置权重 0..1+ */
  weights: number[];
  wZheng: number;
  wCe: number;
  brightness: number;
}

const SIDE_X = 0.72; // 侧鼓点距中心的归一化横向位置

export function positionWeights(xIn: number, yIn: number): PositionWeights {
  const x = clamp(xIn, -1, 1);
  const y = clamp(yIn, 0, 1); // 0=舞(顶) 1=口
  const d = Math.abs(x);

  // A（正鼓）模态形：中心为腹，侧鼓点接近节线
  const wZhengShape = Math.pow(Math.cos((Math.PI * clamp(d, 0, 1)) / 2), 2.2);
  // B（侧鼓）模态形：中心为节线，在 SIDE_X 处为腹
  const u = clamp(d / SIDE_X, 0, 1.5);
  const wCeShape = u * Math.exp(1 - u);

  // 实测交叉耦合（论文表1 声级差标定）
  const wZheng = Math.max(wZhengShape, 0.12 * wCeShape);
  const wCe = Math.max(wCeShape, 0.42 * wZhengShape);

  const brightness = 0.62 + 0.72 * y; // 越靠近口沿高频越亮

  const weights = RECIPE.map((m) => {
    if (m.role === 'zheng') return wZheng;
    if (m.role === 'ce') return wCe;
    const spatial = 0.32 + 0.68 * Math.abs(Math.cos((m.nx * Math.PI * x) / 2 + m.phase));
    const edge = 0.72 + 0.55 * d;
    return clamp(spatial * edge * (m.role === 'high' || m.role.startsWith('partial') ? brightness : 1), 0, 1.5);
  });

  return { weights, wZheng, wCe, brightness };
}

/** 计算某位置/力度下将发声的全部模态（含频率、振幅、衰减常数） */
export function evaluateModes(
  b: Bell,
  p: BellParams,
  x: number,
  y: number,
  velocity = 0.9,
): ModalComponent[] {
  const { zheng, ce } = scaledFrequencies(b, p);
  const q = ce / zheng;
  const { weights } = positionWeights(x, y);
  const sigma = sigmas(b);

  const sizeRing = Math.pow(clamp(p.xianChangMm / 260, 0.6, 3.4), 0.5);
  const tinRing = clamp(1 + 0.05 * (p.tinPct - 14), 0.7, 1.4);
  const tauZ = clamp((0.55 / Math.max(0.06, sigma.z)) * sizeRing * tinRing, 0.22, 8);
  const tauC = clamp((0.55 / Math.max(0.06, sigma.c)) * sizeRing * tinRing, 0.18, 7);

  const vel = 0.35 + 0.65 * clamp(velocity, 0, 1);

  return RECIPE.map((m, i) => {
    const ratio = m.ratio === 'ce' ? q : (m.ratio as number);
    const freq = zheng * ratio;
    const baseTau = m.role === 'ce' ? tauC : tauZ;
    // 钟枚：对高频模态施加额外衰减（枚越高、频率越高，衰减越快）
    const mei = clamp(p.meiHeightMm, 0, 80);
    const meiDamp =
      ratio > 1 ? 1 + 0.02 * mei * Math.pow(Math.max(0, ratio - 1), 1.4) : 1;
    const tau = clamp(baseTau / (m.decay * meiDamp), 0.05, 9);
    const amp = clamp(m.amp * weights[i] * vel, 0, 1.2);
    return { ratio, freq, amp, tau, role: m.role, label: m.key };
  }).filter((m) => m.amp > 0.012);
}

let VOICE_ID = 1;

/** 生成发给 AudioWorklet 的敲击描述（纯数据，可结构化克隆） */
export function buildStrike(
  b: Bell,
  p: BellParams,
  x: number,
  y: number,
  opts: { velocity?: number; pan?: number } = {},
): StrikeDescriptor {
  const velocity = opts.velocity ?? 0.9;
  const modes = evaluateModes(b, p, x, y, velocity).map((m) => ({
    freq: m.freq,
    amp: Math.min(1, m.amp * 0.5), // 总线余量，避免 10 模态叠加削波
    tau: m.tau,
  }));
  const pan = opts.pan ?? clamp(x * 0.55, -0.85, 0.85);
  return {
    voiceId: VOICE_ID++,
    modes,
    velocity,
    click: 0.18 + 0.5 * velocity,
    pan,
  };
}

/** 正鼓点 / 侧鼓点的标准坐标 */
export const STRIKE_POINTS = {
  zheng: { x: 0, y: 0.82 },
  ceRight: { x: SIDE_X, y: 0.8 },
  ceLeft: { x: -SIDE_X, y: 0.8 },
} as const;
