import type { Bell, BellGroup, BellKind, LayerName } from '../types';
import { REPORT_ROWS } from './report';
import { midiHz, seededRandom } from '../audio/music';

/**
 * 三层八组 + 楚惠王镈钟 1 件 = 65 口。
 * 件数据湖北省博物馆 / 随州市博物馆公开资料：
 *   上层 3 组钮钟 19（6+6+7）；
 *   中层 3 组甬钟 33 = 无枚 12 + 短枚 11 + 长枚 10；
 *   下层 2 组大型长枚甬钟 12（6+6）；
 *   另镈钟 1。
 *
 * 尺寸锚点（公开资料）：最大钟通高 152.3 cm、重 203.6 kg；
 * 最小钟通高约 20.4 cm、重约 2.4 kg；钟架长 748 cm、高 265 cm。
 * 各组的铣长/壁厚区间参考《曾侯乙墓》及复制研究中公布的形制范围，
 * 组内按几何渐变生成并加入确定性微小扰动。
 */

interface GroupSeed {
  id: string;
  layer: LayerName;
  layerRow: 0 | 1 | 2;
  orderInLayer: number;
  name: string;
  short: string;
  kind: BellKind;
  typeName: string;
  count: number;
  meiHeight: number;
  heightRangeMm: readonly [number, number];
  xianRangeMm: readonly [number, number];
  wallRangeMm: readonly [number, number];
  tinPct: number;
  xianToTotal: number; // 铣长 / 通高
  zhengHz: number[];
  ceSemiPattern: number[]; // 无报告数据时的侧鼓半音差循环
  reportMap?: Record<number, string>;
}

const r = (midi: number) => Math.round(midiHz(midi) * 10) / 10;

const SEEDS: GroupSeed[] = [
  // ───────────────────────── 上层 · 钮钟 19 ─────────────────────────
  {
    id: 'U1', layer: '上层', layerRow: 0, orderInLayer: 0,
    name: '上层一组', short: '上一', kind: 'niu', typeName: '钮钟',
    count: 6, meiHeight: 6,
    heightRangeMm: [375, 205], xianRangeMm: [300, 164], wallRangeMm: [6.2, 3.4],
    tinPct: 13.8, xianToTotal: 0.8,
    zhengHz: [521, 651, 731, 1099, 1390, 1987],
    ceSemiPattern: [3, 4, 4, 4, 4, 3],
    reportMap: { 0: 'a-1', 1: 'a-2', 2: 'a-3', 3: 'a-4', 4: 'a-5', 5: 'a-6' },
  },
  {
    id: 'U2', layer: '上层', layerRow: 0, orderInLayer: 1,
    name: '上层二组', short: '上二', kind: 'niu', typeName: '钮钟',
    count: 6, meiHeight: 5,
    heightRangeMm: [356, 200], xianRangeMm: [285, 160], wallRangeMm: [5.8, 3.2],
    tinPct: 13.8, xianToTotal: 0.8,
    zhengHz: [r(74), r(79), r(81), r(84), r(88), r(93)], // D5 G5 A5 C6 E6 A6
    ceSemiPattern: [3, 4, 3, 4, 3, 4],
  },
  {
    id: 'U3', layer: '上层', layerRow: 0, orderInLayer: 2,
    name: '上层三组', short: '上三', kind: 'niu', typeName: '钮钟',
    count: 7, meiHeight: 5,
    heightRangeMm: [325, 188], xianRangeMm: [260, 150], wallRangeMm: [5.4, 3.0],
    tinPct: 13.8, xianToTotal: 0.8,
    zhengHz: [r(76), r(83), r(86), r(89), r(91), r(96), r(98)], // E5 B5 D6 F6 G6 C7 D7
    ceSemiPattern: [4, 3, 4, 3, 4, 3, 3],
  },

  // ───────────────────────── 中层 · 甬钟 33 ─────────────────────────
  {
    id: 'MW', layer: '中层', layerRow: 1, orderInLayer: 0,
    name: '中层无枚组', short: '中无', kind: 'wumei', typeName: '无枚甬钟',
    count: 12, meiHeight: 0,
    heightRangeMm: [613, 331], xianRangeMm: [380, 205], wallRangeMm: [13, 7],
    tinPct: 13.6, xianToTotal: 0.62,
    zhengHz: [286, 318, 368, 383, 429, 470, 525, 588, 660, 740, 830, 932],
    ceSemiPattern: [3, 5, 4, 3, 4, 4, 3, 4, 3, 4, 4, 3],
    reportMap: { 0: 'b-1', 1: 'b-2', 2: 'b-3', 3: 'b-4', 4: 'b-5' },
  },
  {
    id: 'MD', layer: '中层', layerRow: 1, orderInLayer: 1,
    name: '中层短枚组', short: '中短', kind: 'duanmei', typeName: '短枚甬钟',
    count: 11, meiHeight: 13,
    heightRangeMm: [637, 339], xianRangeMm: [395, 210], wallRangeMm: [14, 7.5],
    tinPct: 13.7, xianToTotal: 0.62,
    zhengHz: [286, 323, 383, 425, 505, 590, 665, 745, 835, 940, 1055],
    ceSemiPattern: [3, 4, 3, 5, 3, 3, 4, 3, 4, 3, 4],
    reportMap: { 0: 'c-1', 1: 'c-2', 2: 'c-3', 3: 'c-4', 4: 'c-5', 5: 'c-6' },
  },
  {
    id: 'MC', layer: '中层', layerRow: 1, orderInLayer: 2,
    name: '中层长枚组', short: '中长', kind: 'changmei', typeName: '长枚甬钟',
    count: 10, meiHeight: 30,
    heightRangeMm: [783, 425], xianRangeMm: [470, 255], wallRangeMm: [15, 8],
    tinPct: 13.7, xianToTotal: 0.6,
    zhengHz: [193, 216, 257, 285, 322, 362, 408, 460, 518, 583],
    ceSemiPattern: [4, 4, 3, 3, 3, 4, 3, 4, 3, 4],
    reportMap: { 0: 'd-1', 1: 'd-2', 2: 'd-3', 3: 'd-4', 4: 'd-5' },
  },

  // ───────────────────────── 下层 · 大型甬钟 12 ─────────────────────────
  {
    id: 'L1', layer: '下层', layerRow: 2, orderInLayer: 0,
    name: '下层一组', short: '下一', kind: 'large', typeName: '大型长枚甬钟',
    count: 6, meiHeight: 48,
    heightRangeMm: [1414, 897], xianRangeMm: [820, 520], wallRangeMm: [22, 13],
    tinPct: 13.5, xianToTotal: 0.58,
    zhengHz: [73, 82, 119, 134, 182, 208],
    ceSemiPattern: [3, 4, 5, 3, 1, 4],
    reportMap: { 0: 'e-2', 2: 'e-1', 4: 'e-3' },
  },
  {
    id: 'L2', layer: '下层', layerRow: 2, orderInLayer: 1,
    name: '下层二组', short: '下二', kind: 'large', typeName: '大型长枚甬钟',
    count: 6, meiHeight: 52,
    heightRangeMm: [1523, 1034], xianRangeMm: [884, 600], wallRangeMm: [24, 14],
    tinPct: 13.5, xianToTotal: 0.58,
    zhengHz: [r(36), r(39), r(41), r(43), r(46), r(48)], // C2 Eb2 F2 G2 Bb2 C3
    ceSemiPattern: [3, 4, 3, 4, 3, 3],
  },

  // ───────────────────────── 镈钟 1 ─────────────────────────
  {
    id: 'BO', layer: '下层', layerRow: 2, orderInLayer: 2,
    name: '楚惠王镈钟', short: '镈', kind: 'bo', typeName: '镈钟',
    count: 1, meiHeight: 40,
    heightRangeMm: [923, 923], xianRangeMm: [720, 720], wallRangeMm: [20, 20],
    tinPct: 13.6, xianToTotal: 0.78,
    zhengHz: [r(50)], // D3 ≈146.8
    ceSemiPattern: [3],
  },
];

const reportMap = new Map(REPORT_ROWS.map((row) => [row.code, row]));

/**
 * 重量估算 kg：以公开实测锚点标定的尺寸幂律（最大钟 1523mm/203.6kg，
 * 最小约 204mm/2.4kg → 指数约 2.2）。仅作架上形制参考。
 */
export function estimateWeightKg(totalHeightMm: number): number {
  return Math.round(203.6 * Math.pow(totalHeightMm / 1523, 2.2) * 10) / 10;
}

function geometric(a: number, b: number, t: number): number {
  return a * Math.pow(b / a, t);
}

function buildGroups(): BellGroup[] {
  return SEEDS.map((s) => ({
    id: s.id,
    layer: s.layer,
    layerRow: s.layerRow,
    orderInLayer: s.orderInLayer,
    name: s.name,
    kind: s.kind,
    typeName: s.typeName,
    count: s.count,
    meiHeight: s.meiHeight,
    heightRangeMm: s.heightRangeMm,
    xianRangeMm: s.xianRangeMm,
    wallRangeMm: s.wallRangeMm,
    tinPct: s.tinPct,
  }));
}

function buildBells(): Bell[] {
  const bells: Bell[] = [];
  let serial = 0;

  for (const seed of SEEDS) {
    const rand = seededRandom(0x9e3779b9 ^ hash(seed.id));
    for (let i = 0; i < seed.count; i++) {
      serial += 1;
      const t = seed.count === 1 ? 0 : i / (seed.count - 1);
      const jitter = 1 + (rand() - 0.5) * 0.03;

      let xian = geometric(seed.xianRangeMm[0], seed.xianRangeMm[1], t) * jitter;
      let totalHeight = xian / seed.xianToTotal;
      // 锚定最大钟通高 1523 mm
      if (seed.id === 'L2' && i === 0) {
        totalHeight = 1523;
        xian = 883;
      }
      const wall = geometric(seed.wallRangeMm[0], seed.wallRangeMm[1], t) * (1 + (rand() - 0.5) * 0.04);
      const xianJian = xian * 0.74;
      const guJian = xian * 0.56;

      const code = seed.reportMap?.[i];
      const report = code ? reportMap.get(code) : undefined;

      const fZheng0 = report ? report.zhengHz : seed.zhengHz[Math.min(i, seed.zhengHz.length - 1)];
      const semi = seed.ceSemiPattern[i % seed.ceSemiPattern.length];
      const fCe0 = report ? report.ceHz : fZheng0 * Math.pow(2, semi / 12);

      const bell: Bell = {
        id: `${seed.id}-${String(i + 1).padStart(2, '0')}`,
        serial,
        groupId: seed.id,
        indexInGroup: i,
        rackLabel: `${seed.short}${String(i + 1).padStart(2, '0')}`,
        kind: seed.kind,
        totalHeightMm: Math.round(totalHeight),
        xianChangMm: Math.round(xian),
        xianJianMm: Math.round(xianJian),
        guJianMm: Math.round(guJian),
        wallMm: Math.round(wall * 10) / 10,
        meiHeightMm: seed.meiHeight,
        tinPct: seed.tinPct,
        fZheng0: Math.round(fZheng0 * 100) / 100,
        fCe0: Math.round(fCe0 * 100) / 100,
        reportCode: code,
        weightKg: 0,
      };
      bell.weightKg = estimateWeightKg(totalHeight);
      bells.push(bell);
    }
  }
  return bells;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

export const BELL_GROUPS: readonly BellGroup[] = buildGroups();
export const BELLS: readonly Bell[] = buildBells();

export const bellsById = new Map<string, Bell>(BELLS.map((b) => [b.id, b]));

/** 三层（自上而下），每层包含的组 id（镈钟挂在下层 L1/L2 之间） */
export const LAYER_GROUP_IDS: readonly (readonly string[])[] = [
  ['U1', 'U2', 'U3'],
  ['MW', 'MD', 'MC'],
  ['L1', 'BO', 'L2'],
];

export function groupById(id: string): BellGroup | undefined {
  return BELL_GROUPS.find((g) => g.id === id);
}
