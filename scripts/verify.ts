/**
 * 验收校验：npx tsx scripts/verify.ts
 * 1) 全套 65 口、三层八组 + 镈钟；
 * 2) 25 口报告钟的合成音程 vs 公开测音报告音程，偏差全部 < 30 音分；
 * 3) 尺寸/壁厚/锡含量移调方向正确；
 * 4) 正/侧鼓位置激发权重正确翻转；
 * 5) 测音自相关核能从合成信号读回 Hz。
 */
import { BELLS, BELL_GROUPS } from '../src/data/bells';
import { REPORT_ROWS } from '../src/data/report';
import { centsBetween } from '../src/audio/music';
import {
  defaultParams,
  evaluateModes,
  positionWeights,
  scaledFrequencies,
} from '../src/audio/acoustics';
import { detectPitch } from '../src/audio/tuner';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures++;
    console.error(`  ✕ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n[1] 全套编钟数据');
check('钟的总数 = 65', BELLS.length === 65, `实际 ${BELLS.length}`);
check('组数 = 8（三层八组，镈钟单列）', BELL_GROUPS.filter((g) => g.kind !== 'bo').length === 8, `实际 ${BELL_GROUPS.length - 1} 个正式组 + 镈钟`);
const sumGroupCounts = BELL_GROUPS.reduce((s, g) => s + g.count, 0);
check('八组 64 件 + 镈钟 1 = 65', sumGroupCounts === 65, `组 count 之和 ${sumGroupCounts}`);
const ids = new Set(BELLS.map((b) => b.id));
check('id 唯一', ids.size === BELLS.length);
check('最大钟通高锚定 1523mm', BELLS.some((b) => b.totalHeightMm === 1523));
check('所有尺寸/频率为正', BELLS.every((b) => b.xianChangMm > 0 && b.wallMm > 0 && b.fZheng0 > 0 && b.fCe0 > b.fZheng0 * 0.9));

console.log('\n[2] 30 音分对标（默认参数）');
const codeToBell = new Map(BELLS.filter((b) => b.reportCode).map((b) => [b.reportCode, b]));
let maxDev = 0;
for (const row of REPORT_ROWS) {
  const bell = codeToBell.get(row.code);
  if (!bell) {
    failures++;
    console.error(`  ✕ 报告 ${row.code} 未映射到任何钟`);
    continue;
  }
  const reportCents = centsBetween(row.zhengHz, row.ceHz);
  const synth = scaledFrequencies(bell, defaultParams(bell));
  const synthCents = centsBetween(synth.zheng, synth.ce);
  const dev = Math.abs(synthCents - reportCents);
  maxDev = Math.max(maxDev, dev);
  if (dev >= 30) {
    failures++;
    console.error(`  ✕ ${row.code} 偏差 ${dev.toFixed(2)}¢`);
  }
}
check(`${REPORT_ROWS.length} 口报告钟全部 < 30¢`, failures === 0 || maxDev < 30, `最大偏差 ${maxDev.toFixed(3)}¢`);

const a1 = codeToBell.get('a-1')!;
const repA1 = REPORT_ROWS.find((r) => r.code === 'a-1')!;
const cA1 = centsBetween(repA1.zhengHz, repA1.ceHz);
const sA1 = scaledFrequencies(a1, defaultParams(a1));
const dA1 = Math.abs(centsBetween(sA1.zheng, sA1.ce) - cA1);
console.log(`  · 基准钟 a-1：报告 ${repA1.zhengHz}/${repA1.ceHz} Hz = ${cA1.toFixed(1)}¢；合成 ${sA1.zheng.toFixed(1)}/${sA1.ce.toFixed(1)} Hz；偏差 ${dA1.toFixed(2)}¢`);
check('a-1 偏差 < 30¢', dA1 < 30);

console.log('\n[3] 参数移调方向');
const p0 = defaultParams(a1);
const higher = scaledFrequencies(a1, { ...p0, xianChangMm: p0.xianChangMm * 0.8 });
check('缩短铣长 → 音高上升', higher.zheng > sA1.zheng * 1.4, `${sA1.zheng.toFixed(0)} → ${higher.zheng.toFixed(0)} Hz`);
const thicker = scaledFrequencies(a1, { ...p0, wallMm: p0.wallMm * 1.5 });
check('加厚壁厚 → 音高上升', thicker.zheng > sA1.zheng * 1.45, `×${(thicker.zheng / sA1.zheng).toFixed(3)}`);
const tinMore = scaledFrequencies(a1, { ...p0, tinPct: 18 });
const tinLess = scaledFrequencies(a1, { ...p0, tinPct: 9 });
check('锡含量改变音高（可闻）', Math.abs(tinMore.zheng - tinLess.zheng) > sA1.zheng * 0.03, `${tinLess.zheng.toFixed(1)} → ${tinMore.zheng.toFixed(1)} Hz`);
const intervalInvariant = Math.abs(centsBetween(higher.zheng, higher.ce) - cA1) < 0.01;
check('整体移调时音程保持不变', intervalInvariant);

console.log('\n[4] 位置 → 模态激发权重');
const center = positionWeights(0, 0.82);
const side = positionWeights(0.72, 0.8);
check('正鼓点 A 模态强于 B', center.wZheng > center.wCe * 1.6, `A=${center.wZheng.toFixed(2)} B=${center.wCe.toFixed(2)}`);
check('侧鼓点 B 模态强于 A', side.wCe > side.wZheng * 3, `A=${side.wZheng.toFixed(2)} B=${side.wCe.toFixed(2)}`);
const modesCenter = evaluateModes(a1, p0, 0, 0.82);
const a0 = modesCenter.find((m) => m.role === 'zheng');
const b0 = modesCenter.find((m) => m.role === 'ce');
check('正鼓敲击存在 A0/B0 且 A0 占优', !!a0 && !!b0 && a0.amp > b0.amp);

console.log('\n[5] 测音自相关核（合成正弦）');
function tone(freq: number, sr = 48000, n = 8192): Float32Array {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = 0.8 * Math.sin(2 * Math.PI * freq * (i / sr));
  return buf;
}
for (const f of [521, 621, 286, 1376]) {
  const hit = detectPitch(tone(f), 48000);
  const err = hit ? Math.abs(hit.freq - f) : 999;
  check(`读回 ${f} Hz`, !!hit && err < 2.5, hit ? `${hit.freq.toFixed(2)} Hz (err ${err.toFixed(2)})` : 'null');
}

console.log('');
if (failures > 0) {
  console.error(`❌ verify 失败：${failures} 项`);
  throw new Error(`${failures} verification checks failed`);
} else {
  console.log('✅ 全部校验通过：65 口钟、25 口对标偏差 < 30 音分、参数/位置/测音核正常。');
}
