import type { Bell } from '../types';

let UID = 0;

function bronzeDefs(id: string): string {
  return `
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#5d4423"/>
      <stop offset="0.18" stop-color="#a9772f"/>
      <stop offset="0.5" stop-color="#e3c074"/>
      <stop offset="0.82" stop-color="#9a6a28"/>
      <stop offset="1" stop-color="#4a3417"/>
    </linearGradient>
    <radialGradient id="${id}-mei" cx="0.35" cy="0.3" r="0.9">
      <stop offset="0" stop-color="#f0d488"/>
      <stop offset="0.6" stop-color="#a9772f"/>
      <stop offset="1" stop-color="#543b19"/>
    </radialGradient>
  </defs>`;
}

function topHandle(b: Bell): string {
  if (b.kind === 'niu') {
    // 钮：倒置 U 形环
    return `<path d="M49 50 V34 a11 11 0 0 1 22 0 V50" fill="none" stroke="url(#bg${UID})" stroke-width="7" stroke-linecap="round"/>`;
  }
  if (b.kind === 'bo') {
    return `<path d="M50 48 V32 a10 10 0 0 1 20 0 V48" fill="none" stroke="url(#bg${UID})" stroke-width="8" stroke-linecap="round"/>`;
  }
  // 甬：长柄 + 旋
  const long = b.kind === 'large' ? 52 : 40;
  return `
    <rect x="54" y="${52 - long}" width="12" height="${long + 6}" rx="5" fill="url(#bg${UID})" stroke="#3a2a12" stroke-width="1"/>
    <rect x="50" y="34" width="20" height="6" rx="3" fill="#c99b47" stroke="#3a2a12" stroke-width="0.8"/>
    <circle cx="60" cy="${54 - long}" r="5" fill="#caa14e" stroke="#3a2a12" stroke-width="0.8"/>`;
}

function meiDots(b: Bell, large = false): string {
  if (b.meiHeightMm <= 0) return '';
  const rows = large ? [86, 112, 138] : [78, 98, 118];
  const cols = large ? 7 : 5;
  const r = large ? 5.2 : 2.6;
  const dots: string[] = [];
  for (const y of rows) {
    const t = (y - 56) / (186 - 56);
    const half = 17 + 33 * Math.max(0, Math.min(1, t));
    for (let c = 0; c < cols; c++) {
      const x = 60 - half * 0.72 + (c * (half * 1.44)) / (cols - 1);
      dots.push(
        `<circle cx="${x.toFixed(1)}" cy="${y}" r="${r}" fill="url(#bg${UID}-mei)" stroke="#3a2a12" stroke-width="0.5"/>`,
      );
    }
  }
  // 枚区以浅框衬出
  return `<g opacity="0.96">${dots.join('')}</g>`;
}

/** 编钟架上的小钟 SVG（viewBox 0 0 120 210） */
export function rackBellSVG(b: Bell): string {
  UID += 1;
  const gid = `bg${UID}`;
  const body = `
    <path d="M45 54
             C41 92 23 150 13 186
             Q60 173 107 186
             C97 150 79 92 75 54
             Q60 47 45 54 Z"
          fill="${`url(#${gid})`}" stroke="#2e210d" stroke-width="1.4"/>`;
  const centerLine = `<path d="M60 52 C59 100 59 150 60 180" stroke="#3a2a12" stroke-width="1" opacity="0.35" fill="none"/>`;
  return `<svg class="bell-svg" viewBox="0 0 120 210" aria-hidden="true" focusable="false">
    ${bronzeDefs(gid).replace(/id="bg\d+"/, `id="${gid}"`).replace(/url\(#bg\d+\)/g, `url(#${gid})`)}
    ${topHandle(b).replace(/url\(#bg\d+\)/g, `url(#${gid})`)}
    ${body}
    ${centerLine}
    ${meiDots(b)}
    <path d="M13 186 Q60 173 107 186" fill="none" stroke="#f0d488" stroke-width="1.2" opacity="0.5"/>
  </svg>`;
}

/** 单钟敲击面板的大钟 SVG（viewBox 0 0 240 380），坐标换算见 strikePanel */
export function strikeBellSVG(b: Bell): string {
  UID += 1;
  const gid = `bg${UID}`;
  const scale = 2;
  return `
  <svg id="strike-svg" viewBox="0 0 240 400" class="strike-bell-svg" aria-label="${b.rackLabel} 钟面，点击任意位置敲击">
    ${bronzeDefs(gid).replace(/id="bg\d+"/, `id="${gid}"`).replace(/url\(#bg\d+\)/g, `url(#${gid})`)}
    <g transform="scale(${scale})">
      ${topHandle(b).replace(/url\(#bg\d+\)/g, `url(#${gid})`)}
    </g>
    <path d="M90 108
             C82 184 46 300 26 372
             Q120 346 214 372
             C194 300 158 184 150 108
             Q120 94 90 108 Z"
          fill="url(#${gid})" stroke="#2e210d" stroke-width="2.4"/>
    <path d="M120 104 C118 200 118 300 120 360" stroke="#3a2a12" stroke-width="2" opacity="0.3" fill="none"/>
    <g transform="scale(2)">${meiDots(b, true)}</g>
    <path d="M26 372 Q120 346 214 372" fill="none" stroke="#f4dd9b" stroke-width="2.4" opacity="0.55"/>
    <!-- 正鼓 / 侧鼓参考点 -->
    <g id="strike-markers" pointer-events="none">
      <circle cx="120" cy="318" r="15" fill="none" stroke="#7ff0c8" stroke-width="2" stroke-dasharray="4 4" opacity="0.9"/>
      <text x="120" y="323" text-anchor="middle" font-size="13" fill="#c9ffe9">正</text>
      <circle cx="64" cy="312" r="13" fill="none" stroke="#8fc7ff" stroke-width="2" stroke-dasharray="4 4" opacity="0.9"/>
      <text x="64" y="317" text-anchor="middle" font-size="12" fill="#d6ebff">侧</text>
      <circle cx="176" cy="312" r="13" fill="none" stroke="#8fc7ff" stroke-width="2" stroke-dasharray="4 4" opacity="0.9"/>
      <text x="176" y="317" text-anchor="middle" font-size="12" fill="#d6ebff">侧</text>
    </g>
    <circle id="strike-cursor" cx="120" cy="318" r="20" fill="rgba(255,235,170,0.25)" stroke="#ffe9a8" stroke-width="2" opacity="0" pointer-events="none"/>
    <rect id="strike-hit" x="0" y="0" width="240" height="400" fill="transparent"/>
  </svg>`;
}
