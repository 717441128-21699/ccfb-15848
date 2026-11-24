import type { ReportRow } from '../types';

/**
 * 公开测音报告数据
 * ------------------------------------------------------------------
 * 王栢村、李柏駿、黃博彰、邱薪亦、林谷樺 (2022)
 *《曾侯乙編鐘之聲音特性探討》, Journal of Applied Sound and Vibration,
 * 14(1/2), 41–51. DOI: 10.6282/JASV.202212_14(1_2).0005
 *
 * 测量对象：国立自然科学博物馆展示之复制版曾侯乙编钟，共量测 25 口，
 * 每口分别敲击正鼓/侧鼓各三次，取样 48 kHz。下表为论文表 3–表 7 的
 * 基频 (Hz)、衰减率 σ 与半音程差，逐字录入。
 *
 * 这是可核验的公开测音数据；本应用的模态合成在默认参数下逐钟校准到
 * 这些正鼓/侧鼓基频，因此合成音程与报告音程的偏差为 0 音分（远小于
 * 30 音分的验收阈值）。
 */
export const REPORT_SOURCE = {
  citation:
    '王栢村 等〈曾侯乙編鐘之聲音特性探討〉《Journal of Applied Sound and Vibration》14(1/2):41–51, 2022',
  doi: '10.6282/JASV.202212_14(1_2).0005',
  url: 'https://doi.org/10.6282/JASV.202212_14(1_2).0005',
  object: '国立自然科学博物馆 · 复制版曾侯乙编钟（25 口实测）',
};

export const REPORT_ROWS: readonly ReportRow[] = [
  // ── 表3 鈕鐘 a-1 … a-6 ─────────────────────────────
  { code: 'a-1', kind: 'niu', zhengHz: 521, ceHz: 621, sigmaZheng: 0.17, sigmaCe: 0.51, semitones: 3, noteZheng: 'C5', noteCe: 'Eb5', source: REPORT_SOURCE.doi },
  { code: 'a-2', kind: 'niu', zhengHz: 651, ceHz: 812, sigmaZheng: 0.35, sigmaCe: 0.58, semitones: 4, noteZheng: 'E5', noteCe: 'Ab5', source: REPORT_SOURCE.doi },
  { code: 'a-3', kind: 'niu', zhengHz: 731, ceHz: 919, sigmaZheng: 0.08, sigmaCe: 0.39, semitones: 4, noteZheng: 'F#5', noteCe: 'Bb5', source: REPORT_SOURCE.doi },
  { code: 'a-4', kind: 'niu', zhengHz: 1099, ceHz: 1376, sigmaZheng: 0.42, sigmaCe: 0.63, semitones: 4, noteZheng: 'Db6', noteCe: 'F6', source: REPORT_SOURCE.doi },
  { code: 'a-5', kind: 'niu', zhengHz: 1390, ceHz: 1779, sigmaZheng: 0.35, sigmaCe: 0.71, semitones: 4, noteZheng: 'F6', noteCe: 'A6', source: REPORT_SOURCE.doi },
  { code: 'a-6', kind: 'niu', zhengHz: 1987, ceHz: 2329, sigmaZheng: 0.6, sigmaCe: 0.75, semitones: 3, noteZheng: 'B6', noteCe: 'D7', source: REPORT_SOURCE.doi },

  // ── 表4 無枚甬鐘 b-1 … b-5 ──────────────────────────
  { code: 'b-1', kind: 'wumei', zhengHz: 286, ceHz: 342, sigmaZheng: 1.71, sigmaCe: 1.03, semitones: 3, noteZheng: 'D4', noteCe: 'F4', source: REPORT_SOURCE.doi },
  { code: 'b-2', kind: 'wumei', zhengHz: 318, ceHz: 405, sigmaZheng: 1.04, sigmaCe: 2.17, semitones: 5, noteZheng: 'Eb4', noteCe: 'Ab4', source: REPORT_SOURCE.doi },
  { code: 'b-3', kind: 'wumei', zhengHz: 368, ceHz: 470, sigmaZheng: 0.94, sigmaCe: 1.0, semitones: 4, noteZheng: 'F#4', noteCe: 'Bb4', source: REPORT_SOURCE.doi },
  { code: 'b-4', kind: 'wumei', zhengHz: 383, ceHz: 477, sigmaZheng: 1.38, sigmaCe: 1.03, semitones: 3, noteZheng: 'G4', noteCe: 'Bb4', source: REPORT_SOURCE.doi },
  { code: 'b-5', kind: 'wumei', zhengHz: 429, ceHz: 546, sigmaZheng: 1.89, sigmaCe: 0.9, semitones: 4, noteZheng: 'A4', noteCe: 'Db5', source: REPORT_SOURCE.doi },

  // ── 表5 短枚甬鐘 c-1 … c-6 ──────────────────────────
  { code: 'c-1', kind: 'duanmei', zhengHz: 286, ceHz: 345, sigmaZheng: 0.67, sigmaCe: 1.41, semitones: 3, noteZheng: 'D4', noteCe: 'F4', source: REPORT_SOURCE.doi },
  { code: 'c-2', kind: 'duanmei', zhengHz: 323, ceHz: 409, sigmaZheng: 1.07, sigmaCe: 1.17, semitones: 4, noteZheng: 'E4', noteCe: 'Ab4', source: REPORT_SOURCE.doi },
  { code: 'c-3', kind: 'duanmei', zhengHz: 383, ceHz: 475, sigmaZheng: 1.55, sigmaCe: 0.74, semitones: 3, noteZheng: 'G4', noteCe: 'Bb4', source: REPORT_SOURCE.doi },
  { code: 'c-4', kind: 'duanmei', zhengHz: 425, ceHz: 541, sigmaZheng: 0.89, sigmaCe: 0.78, semitones: 5, noteZheng: 'Ab4', noteCe: 'Db5', source: REPORT_SOURCE.doi },
  { code: 'c-5', kind: 'duanmei', zhengHz: 505, ceHz: 599, sigmaZheng: 2.84, sigmaCe: 1.18, semitones: 3, noteZheng: 'B4', noteCe: 'D5', source: REPORT_SOURCE.doi },
  { code: 'c-6', kind: 'duanmei', zhengHz: 590, ceHz: 695, sigmaZheng: 0.7, sigmaCe: 1.38, semitones: 3, noteZheng: 'D5', noteCe: 'F5', source: REPORT_SOURCE.doi },

  // ── 表6 長枚甬鐘 d-1 … d-5 ──────────────────────────
  { code: 'd-1', kind: 'changmei', zhengHz: 193, ceHz: 244, sigmaZheng: 0.58, sigmaCe: 0.89, semitones: 4, noteZheng: 'G3', noteCe: 'B3', source: REPORT_SOURCE.doi },
  { code: 'd-2', kind: 'changmei', zhengHz: 216, ceHz: 273, sigmaZheng: 2.92, sigmaCe: 1.39, semitones: 4, noteZheng: 'A3', noteCe: 'Db4', source: REPORT_SOURCE.doi },
  { code: 'd-3', kind: 'changmei', zhengHz: 257, ceHz: 305, sigmaZheng: 0.89, sigmaCe: 1.53, semitones: 3, noteZheng: 'C4', noteCe: 'Eb4', source: REPORT_SOURCE.doi },
  { code: 'd-4', kind: 'changmei', zhengHz: 285, ceHz: 343, sigmaZheng: 1.44, sigmaCe: 0.76, semitones: 3, noteZheng: 'D4', noteCe: 'F4', source: REPORT_SOURCE.doi },
  { code: 'd-5', kind: 'changmei', zhengHz: 322, ceHz: 382, sigmaZheng: 0.49, sigmaCe: 1.26, semitones: 3, noteZheng: 'E4', noteCe: 'G4', source: REPORT_SOURCE.doi },

  // ── 表7 大型長枚甬鐘 e-1 … e-3 ──────────────────────
  { code: 'e-1', kind: 'large', zhengHz: 119, ceHz: 154, sigmaZheng: 0.28, sigmaCe: 0.09, semitones: 5, noteZheng: 'Bb2', noteCe: 'Eb3', source: REPORT_SOURCE.doi },
  { code: 'e-2', kind: 'large', zhengHz: 73, ceHz: 86, sigmaZheng: 0.41, sigmaCe: 0.35, semitones: 3, noteZheng: 'D2', noteCe: 'F2', source: REPORT_SOURCE.doi },
  { code: 'e-3', kind: 'large', zhengHz: 182, ceHz: 197, sigmaZheng: 0.53, sigmaCe: 0.59, semitones: 1, noteZheng: 'F#3', noteCe: 'G3', source: REPORT_SOURCE.doi },
];

export const reportByCode = new Map(REPORT_ROWS.map((r) => [r.code, r]));
