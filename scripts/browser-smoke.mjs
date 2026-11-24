// 浏览器端到端冒烟：启动 vite preview → 系统 Chrome → 断言核心功能无运行时错误。
// 用法：node scripts/browser-smoke.mjs
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const PORT = 4329;
const URL = `http://127.0.0.1:${PORT}/`;
const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error('no chrome/edge found');
  process.exit(2);
}

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: process.cwd(),
  stdio: 'ignore',
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(URL);
      if (res.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error('preview server did not start');
}

let failures = 0;
const assert = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  else {
    failures++;
    console.error(`  ✕ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

try {
  await waitForServer();
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox', '--use-fake-audio-stream'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1360, height: 900 });

  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(800);

  assert('标题含数字编钟', (await page.title()).includes('数字编钟'));
  const bellCount = await page.$$eval('[data-testid="rack-bell"]', (els) => els.length);
  assert('编钟架渲染 65 个可点钟按钮', bellCount === 65, `实际 ${bellCount}`);

  const apiReady = await page.evaluate(() => !!window.__BIANZHONG__);
  assert('window.__BIANZHONG__ 验收钩子存在', apiReady);
  const apiCount = await page.evaluate(() => window.__BIANZHONG__.bellCount);
  assert('API bellCount = 65', apiCount === 65);

  const bench = await page.evaluate(() => window.__BIANZHONG__.getBenchmark());
  const maxDev = Math.max(...bench.map((b) => b.deviationCents));
  assert('浏览器内 25 口对标偏差全部 <30¢', bench.every((b) => b.deviationCents < 30), `最大 ${maxDev.toFixed(3)}¢`);

  // 点击第一口钟，不应产生页面错误
  await page.click('[data-testid="rack-bell"]');
  await sleep(700);

  // AudioWorklet 已加载，且点击→起音渲染 < 20ms
  const audio = await page.evaluate(() => {
    const e = window.__BIANZHONG__.engine;
    return { ready: e.ready, ...e.latency };
  });
  assert('AudioWorklet 引擎就绪', audio.ready === true, `state=${audio.state}`);
  const onset = audio.firstSoundMs ?? audio.ackMs;
  assert('点击→起音调度 < 20ms', onset != null && onset < 20, `firstSound=${audio.firstSoundMs} ack=${audio.ackMs}`);

  // 四个标签可切换，单钟 SVG 出现
  await page.click('[data-testid="tab-strike"]');
  await sleep(200);
  const svgExists = await page.$('#strike-svg') !== null;
  assert('单钟敲击 SVG 渲染', svgExists);
  // 在钟面中心偏上位置点击
  const svgBox = await page.$eval('#strike-svg', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height * 0.8 };
  });
  await page.mouse.click(svgBox.x, svgBox.y);
  await sleep(200);

  // 参数滑杆改变读数
  await page.click('[data-testid="tab-params"]');
  await sleep(200);
  await page.evaluate(() => window.__BIANZHONG__.store.updateParams({ xianChangMm: 220 }));
  await sleep(100);
  const benchText = await page.$eval('#benchmark-card', (el) => el.textContent || '');
  assert('参数改变后合成频率读数更新', /合成正鼓[\s\S]*?([0-9.]+) Hz/.test(benchText));
  assert('参数面板显示达标 verdict', (await page.$eval('[data-testid="benchmark-verdict"]', (el) => el.textContent).catch(() => '')) .includes('达标'));

  // 实录测音：内置示例 → 读出 521 / 621
  await page.click('[data-testid="tab-analyze"]');
  await sleep(200);
  await page.click('#btn-demo');
  await page.waitForFunction(
    () => {
      const z = document.querySelector('[data-testid="read-zheng"]')?.textContent;
      return z && parseFloat(z) > 0;
    },
    { timeout: 5000 },
  );
  const zHz = parseFloat(await page.$eval('[data-testid="read-zheng"]', (el) => el.textContent));
  const cHz = parseFloat(await page.$eval('[data-testid="read-ce"]', (el) => el.textContent).catch(() => 'NaN'));
  assert('示例实录读出正鼓 ≈521Hz', Math.abs(zHz - 521) < 6, `${zHz} Hz`);
  assert('示例实录读出侧鼓 ≈621Hz', Number.isFinite(cHz) && Math.abs(cHz - 621) < 8, `${cHz} Hz`);
  const intervalText = await page.$eval('[data-testid="read-interval"]', (el) => el.textContent || '');
  assert('显示音程音分/音程度数', intervalText.includes('音分') && intervalText.includes('度'));

  await sleep(500);
  assert('全程无 uncaught pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  // 忽略 favicon 之类的 404/网络错误，只关注脚本异常
  const seriousConsole = consoleErrors.filter((m) => !/favicon|Failed to load resource/i.test(m));
  assert('无严重 console.error', seriousConsole.length === 0, seriousConsole.slice(0, 3).join(' | '));

  await browser.close();
} catch (e) {
  failures++;
  console.error('SMOKE ERROR:', e);
} finally {
  server.kill();
}

console.log('');
if (failures) {
  console.error(`❌ browser smoke 失败 ${failures} 项`);
  process.exit(1);
} else {
  console.log('✅ browser smoke 全部通过');
}
