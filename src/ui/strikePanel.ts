import { store } from '../state';
import { bellsById } from '../data/bells';
import { engine } from '../audio/BellEngine';
import { evaluateModes, positionWeights, scaledFrequencies, STRIKE_POINTS } from '../audio/acoustics';
import { centsBetween, clamp, hzToNote } from '../audio/music';
import { strikeBellSVG } from './svg';

const TOP_Y = 108;
const BOTTOM_Y = 372;
const TOP_HALF = 30;
const BOTTOM_HALF = 94;

export function mountStrike(root: HTMLElement): void {
  const render = () => {
    const bell = bellsById.get(store.state.selectedId)!;
    const params = store.getParams(bell.id);
    const { zheng, ce } = scaledFrequencies(bell, params);
    const cents = centsBetween(zheng, ce);
    const nz = hzToNote(zheng);
    const nc = hzToNote(ce);

    root.innerHTML = `
      <div class="panel-head">
        <h2>② 单钟敲击 · 点哪里就按哪里的模态权重合成</h2>
        <p class="hint">在钟面上移动/点击：中心是<span class="tc-zheng">正鼓点</span>，两侧虚线圆是<span class="tc-ce">侧鼓点</span>。
          不同位置激发 A/B 模态与非谐分音的强弱不同。</p>
      </div>
      <div class="strike-layout">
        <div class="strike-stage card">
          <div class="bell-title">${bell.rackLabel} · ${bell.kind}
            ${bell.reportCode ? `<span class="badge badge-gold">报告 ${bell.reportCode}</span>` : ''}
          </div>
          <div class="svg-wrap" id="svg-wrap">${strikeBellSVG(bell)}</div>
          <div class="strike-actions">
            <button class="btn" data-point="zheng">敲正鼓</button>
            <button class="btn" data-point="ceLeft">敲左侧鼓</button>
            <button class="btn" data-point="ceRight">敲右侧鼓</button>
          </div>
        </div>
        <aside class="strike-side">
          <div class="card freq-card">
            <div class="freq-row">
              <span class="dot dot-z"></span><div><div class="freq-label">正鼓音 A 模态</div>
              <div class="freq-val">${zheng.toFixed(1)} Hz <small>${nz.name}${nz.centsOff >= 0 ? '+' : ''}${nz.centsOff.toFixed(0)}¢</small></div></div>
            </div>
            <div class="freq-row">
              <span class="dot dot-c"></span><div><div class="freq-label">侧鼓音 B 模态</div>
              <div class="freq-val">${ce.toFixed(1)} Hz <small>${nc.name}${nc.centsOff >= 0 ? '+' : ''}${nc.centsOff.toFixed(0)}¢</small></div></div>
            </div>
            <div class="interval-line">音程 <b>${Math.abs(cents).toFixed(1)}</b> 音分（${(cents / 100).toFixed(2)} 半音）</div>
          </div>
          <div class="card weights-card">
            <h3>模态激发权重 <span id="pos-readout" class="pos-readout">x=0.00 y=0.82（正鼓点）</span></h3>
            <div id="weight-bars" class="weight-bars"></div>
          </div>
        </aside>
      </div>`;

    const svg = root.querySelector<SVGSVGElement>('#strike-svg')!;
    const cursor = root.querySelector<SVGCircleElement>('#strike-cursor')!;
    const bars = root.querySelector<HTMLElement>('#weight-bars')!;
    const readout = root.querySelector<HTMLElement>('#pos-readout')!;

    const preview = (x: number, y: number, label?: string) => {
      const modes = evaluateModes(bell, params, x, y, 0.9);
      const pw = positionWeights(x, y);
      readout.textContent = label ?? `x=${x.toFixed(2)} y=${y.toFixed(2)}`;
      bars.innerHTML = modes
        .map((m) => {
          const pct = Math.round(clamp(m.amp, 0, 1) * 100);
          const cls = m.role === 'zheng' ? 'w-z' : m.role === 'ce' ? 'w-c' : m.role.startsWith('partial') ? 'w-p' : 'w-h';
          return `<div class="weight-row" title="${m.label} · τ=${m.tau.toFixed(2)}s">
            <span class="w-label">${m.label}</span>
            <span class="w-track"><span class="w-fill ${cls}" style="width:${pct}%"></span></span>
            <span class="w-freq">${m.freq.toFixed(0)}Hz</span>
          </div>`;
        })
        .join('');
      return pw;
    };

    const pointFromEvent = (ev: PointerEvent): { x: number; y: number; vx: number; vy: number } => {
      const ctm = svg.getScreenCTM();
      let vx = 120;
      let vy = 318;
      if (ctm) {
        const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
        vx = p.x;
        vy = p.y;
      }
      const t = clamp((vy - TOP_Y) / (BOTTOM_Y - TOP_Y), 0, 1);
      const half = TOP_HALF + (BOTTOM_HALF - TOP_HALF) * t;
      const x = clamp((vx - 120) / half, -1.05, 1.05);
      return { x, y: t, vx, vy };
    };

    svg.addEventListener('pointermove', (ev) => {
      const { x, y, vx, vy } = pointFromEvent(ev);
      cursor.setAttribute('cx', String(vx));
      cursor.setAttribute('cy', String(vy));
      cursor.style.opacity = '0.9';
      preview(x, y);
    });
    svg.addEventListener('pointerleave', () => {
      cursor.style.opacity = '0';
      preview(STRIKE_POINTS.zheng.x, STRIKE_POINTS.zheng.y, 'x=0.00 y=0.82（正鼓点）');
    });
    svg.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      void engine.unlock();
      const { x, y, vx, vy } = pointFromEvent(ev);
      cursor.setAttribute('cx', String(vx));
      cursor.setAttribute('cy', String(vy));
      cursor.style.opacity = '1';
      cursor.classList.remove('pulse');
      void cursor.getBoundingClientRect();
      cursor.classList.add('pulse');
      engine.strike(bell, params, x, y, { velocity: 0.95 });
      preview(x, y);
    });

    root.querySelectorAll<HTMLButtonElement>('[data-point]').forEach((btn) => {
      btn.addEventListener('click', () => {
        void engine.unlock();
        const key = btn.dataset.point as keyof typeof STRIKE_POINTS;
        const pt = STRIKE_POINTS[key];
        engine.strike(bell, params, pt.x, pt.y, { velocity: 0.95 });
        const cx = 120 + pt.x * (TOP_HALF + (BOTTOM_HALF - TOP_HALF) * pt.y);
        const cy = TOP_Y + (BOTTOM_Y - TOP_Y) * pt.y;
        cursor.setAttribute('cx', String(cx));
        cursor.setAttribute('cy', String(cy));
        cursor.style.opacity = '1';
        preview(pt.x, pt.y, `${btn.textContent} x=${pt.x.toFixed(2)}`);
      });
    });

    preview(STRIKE_POINTS.zheng.x, STRIKE_POINTS.zheng.y, 'x=0.00 y=0.82（正鼓点）');
  };

  store.subscribe(render);
  render();
}
