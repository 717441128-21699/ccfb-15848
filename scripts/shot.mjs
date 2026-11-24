import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const PORT = 4337;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { cwd: process.cwd(), stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(400); }

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox', '--use-fake-audio-stream'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle0' });
await sleep(1000);

// 音频引擎/worklet/时延
const audio = await page.evaluate(async () => {
  const api = window.__BIANZHONG__;
  await api.engine.init().catch((e) => ({ initErr: String(e) }));
  await api.engine.unlock();
  await new Promise((r) => setTimeout(r, 600));
  const id = api.strikeSelected('zheng');
  await new Promise((r) => setTimeout(r, 500));
  const l = api.engine.latency;
  return { ready: api.engine.ready, state: api.engine.ctx?.state, strikeId: id, ...l };
});
console.log('AUDIO', JSON.stringify(audio, null, 1));

// 截图四个 tab
const shots = [
  ['rack', 'shot-rack.png'],
  ['strike', 'shot-strike.png'],
  ['params', 'shot-params.png'],
  ['analyze', 'shot-analyze.png'],
];
for (const [tab, file] of shots) {
  await page.click(`[data-testid="tab-${tab}"]`);
  await sleep(350);
  if (tab === 'analyze') { await page.click('#btn-demo'); await sleep(300); }
  await page.screenshot({ path: `research/${file}`, fullPage: true });
  console.log('saved', file);
}
// 移动端
await page.setViewport({ width: 410, height: 900 });
await page.click('[data-testid="tab-rack"]');
await sleep(300);
await page.screenshot({ path: 'research/shot-mobile.png', fullPage: true });
console.log('saved mobile');

await browser.close();
server.kill();
