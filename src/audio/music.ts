// 音律与音程工具（纯函数，可被 Node 校验脚本与浏览器共同引用）

export const A4_HZ = 440;

/** MIDI 音符号 → 频率 Hz */
export function midiHz(midi: number): number {
  return A4_HZ * Math.pow(2, (midi - 69) / 12);
}

/** 两频率间的音分差（带符号：f2 相对 f1） */
export function centsBetween(f1: number, f2: number): number {
  if (!(f1 > 0) || !(f2 > 0)) return NaN;
  return 1200 * Math.log2(f2 / f1);
}

/** 频率比 → 半音数（浮点） */
export function semitonesBetween(f1: number, f2: number): number {
  return centsBetween(f1, f2) / 100;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** 频率 → 最接近的十二平均律音名（如 A4） */
export function hzToNote(freq: number): { name: string; midi: number; centsOff: number } {
  const midi = Math.round(69 + 12 * Math.log2(freq / A4_HZ));
  const name = `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
  const centsOff = centsBetween(midiHz(midi), freq);
  return { name, midi, centsOff };
}

/**
 * 按音分数给出中文音程名。
 * 曾侯乙编钟双音多为小三度（~300）/ 大三度（~400），少数纯四度（~500）。
 */
export function intervalNameCn(cents: number): string {
  const c = Math.abs(cents);
  // 以半音数为索引的常见音程
  const bySemitone: Array<[number, string]> = [
    [0, '纯一度'],
    [1, '小二度'],
    [2, '大二度'],
    [3, '小三度'],
    [4, '大三度'],
    [5, '纯四度'],
    [6, '增四度/三全音'],
    [7, '纯五度'],
    [8, '小六度'],
    [9, '大六度'],
    [10, '小七度'],
    [11, '大七度'],
    [12, '纯八度'],
  ];
  const semi = Math.round(c / 100);
  let base = bySemitone.find(([s]) => s === ((semi % 12) + 12) % 12)?.[1] ?? `${semi} 半音`;
  const octaves = Math.floor(semi / 12);
  if (octaves > 0) base = `${base}（隔 ${octaves} 个八度）`;
  return base;
}

/** “隔了几度”的度数（二度=2、三度=3…），用于口语化展示 */
export function intervalDegree(cents: number): number {
  const semi = Math.round(Math.abs(cents) / 100);
  const within = semi % 12;
  const octaves = Math.floor(semi / 12);
  const degreeBySemi: Record<number, number> = {
    0: 1, 1: 2, 2: 2, 3: 3, 4: 3, 5: 4, 6: 4, 7: 5, 8: 6, 9: 6, 10: 7, 11: 7,
  };
  return (degreeBySemi[within] ?? within + 1) + octaves * 7;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 确定性伪随机（mulberry32），保证 65 口钟数据每次构建一致 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
