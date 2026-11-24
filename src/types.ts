// 数字编钟核心类型定义（纯类型，无 DOM 依赖，可被 Node 校验脚本引用）

/** 钟的形制类别 */
export type BellKind =
  | 'niu' // 钮钟（上层三组）
  | 'wumei' // 无枚甬钟
  | 'duanmei' // 短枚甬钟
  | 'changmei' // 长枚甬钟
  | 'large' // 大型长枚甬钟（下层）
  | 'bo'; // 镈钟（楚惠王镈）

export type LayerName = '上层' | '中层' | '下层';

/** 一组钟（三层八组中的一组） */
export interface BellGroup {
  id: string;
  layer: LayerName;
  layerRow: 0 | 1 | 2; // 0=最上层（小钟）
  orderInLayer: number; // 层内从左到右序号
  name: string; // 例：上层一组
  kind: BellKind;
  typeName: string; // 例：钮钟 / 短枚甬钟
  count: number;
  meiHeight: number; // 默认枚高 mm，0 表示无枚
  /** 该组实测/公开尺寸锚定区间（通高 mm，大→小） */
  heightRangeMm: readonly [number, number];
  /** 铣长（钟体主体长度）区间 mm */
  xianRangeMm: readonly [number, number];
  /** 壁厚区间 mm */
  wallRangeMm: readonly [number, number];
  /** 该组默认锡含量 % */
  tinPct: number;
}

/** 公开测音报告中的一口钟（正鼓/侧鼓基频与衰减率） */
export interface ReportRow {
  code: string; // 报告编号 a-1 ... e-3
  kind: BellKind;
  zhengHz: number; // 正鼓音基频
  ceHz: number; // 侧鼓音基频
  sigmaZheng: number; // 报告衰减率 σ（正鼓）
  sigmaCe: number; // 报告衰减率 σ（侧鼓）
  semitones: number; // 报告给出的半音差
  noteZheng: string;
  noteCe: string;
  source: string;
}

/** 一口具体的钟（全套 65 口之一） */
export interface Bell {
  id: string; // 程序 id
  serial: number; // 1..65 全局序号
  groupId: string;
  indexInGroup: number; // 组内 0 起
  rackLabel: string; // 架上标签，如 上一-01
  kind: BellKind;
  /** 通高 mm（含甬/钮） */
  totalHeightMm: number;
  /** 铣长 mm —— 声学特征长度 */
  xianChangMm: number;
  /** 铣间 mm（合瓦长轴口径） */
  xianJianMm: number;
  /** 鼓间 mm（合瓦短轴口径） */
  guJianMm: number;
  /** 默认壁厚 mm */
  wallMm: number;
  /** 枚高 mm */
  meiHeightMm: number;
  /** 默认锡含量 % */
  tinPct: number;
  /** 默认正鼓基频 Hz（有报告数据者等于实测值） */
  fZheng0: number;
  /** 默认侧鼓基频 Hz */
  fCe0: number;
  /** 对应的公开测音报告编号（若有） */
  reportCode?: string;
  /** 重量估计 kg（由体积/密度估算，仅展示） */
  weightKg: number;
}

/** 用户可调的钟体参数（相对该钟默认值） */
export interface BellParams {
  /** 铣长 mm（尺寸） */
  xianChangMm: number;
  wallMm: number;
  tinPct: number;
  /** 枚高 mm，控制高频额外衰减 */
  meiHeightMm: number;
}

/** 单个合成模态 */
export interface ModalComponent {
  /** 相对正鼓基频的频率比（在应用参数缩放前） */
  ratio: number;
  freq: number;
  /** 线性振幅 0..1（位置激发权重已乘入） */
  amp: number;
  /** 衰减时间常数 s */
  tau: number;
  /** 模态角色，用于界面权重条 */
  role: 'zheng' | 'ce' | 'partial-a' | 'partial-b' | 'high';
  label: string;
}

/** 一次敲击的完整合成描述（传给 AudioWorklet） */
export interface StrikeDescriptor {
  voiceId: number;
  modes: Array<{ freq: number; amp: number; tau: number }>;
  velocity: number;
  /** 敲击噪声/槌触瞬态强度 0..1 */
  click: number;
  /** 声像 -1..1 */
  pan: number;
}

/** 测音结果 */
export interface PitchResult {
  zhengHz: number | null;
  ceHz: number | null;
  intervalCents: number | null;
  semitones: number | null;
  degreeName: string | null;
  clarity: number;
  peaks: number[];
}
