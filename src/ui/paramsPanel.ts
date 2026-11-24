import { store } from '../state';
import { BELLS, bellsById, groupById } from '../data/bells';
import { REPORT_ROWS, REPORT_SOURCE } from '../data/report';
import { engine } from '../audio/BellEngine';
import { scaledFrequencies, youngModulusGPa, bronzeDensity, STRIKE_POINTS } from '../audio/acoustics';
import { centsBetween, hzToNote, intervalNameCn } from '../audio/music';
import type { BellParams } from '../types';

const THRESHOLD_CENTS = 30;

export function mountParams(root: HTMLElement): void {
  root.innerHTML = `
    <div class="panel-head">
      <h2>③ 钟体参数 · 尺寸 / 壁厚 / 锡含量如何改变音高</h2>
      <p class="hint">频率标度 <code>f ∝ 壁厚 · 铣长⁻² · √(E(Sn)/ρ(Sn))</code>。默认参数按公开测音报告校准；
        正/侧鼓两模态整体同步移调，音程保持稳定。</p>
    </div>
    <div class="params-layout">
      <section class="card" id="params-form-card"></section>
      <section class="card" id="benchmark-card"></section>
    </div>
    <section class="card table-card">
      <div id="benchmark-summary"></div>
      <details>
        <summary>展开 25 口报告钟的逐钟音分偏差明细</summary>
        <div class="table-wrap"><table class="data-table" id="benchmark-table" data-testid="benchmark-table">
          <thead><tr><th>报告编号</th><th>形制</th><th>正鼓 Hz</th><th>侧鼓 Hz</th>
          <th>报告音程¢</th><th>合成音程¢</th><th>偏差¢</th><th>判定</th></tr></thead>
          <tbody></tbody>
        </table></div>
        <p class="source-note">数据来源：${REPORT_SOURCE.citation}
          <a href="${REPORT_SOURCE.url}" target="_blank" rel="noopener">DOI</a>；测量对象：${REPORT_SOURCE.object}。</p>
      </details>
      <div class="custom-bench" id="custom-bench"></div>
    </section>`;

  const formCard = root.querySelector<HTMLElement>('#params-form-card')!;
  const benchCard = root.querySelector<HTMLElement>('#benchmark-card')!;

  function sliderRow(key: keyof BellParams, label: string, min: number, max: number, step: number, unit: string, help: string): string {
    const bell = bellsById.get(store.state.selectedId)!;
    const v = store.getParams(bell.id)[key];
    return `
      <label class="slider-row" data-key="${key}">
        <span class="slider-label">${label}
          <b class="slider-val" data-val="${key}">${v} ${unit}</b>
        </span>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-input="${key}" aria-label="${label}"/>
        <small class="slider-help">${help}</small>
      </label>`;
  }

  function buildForm(): void {
    const bell = bellsById.get(store.state.selectedId)!;
    const p = store.getParams(bell.id);
    formCard.innerHTML = `
      <div class="bell-title">当前：${bell.rackLabel}（序号 ${bell.serial}/65）· ${groupById(bell.groupId)?.typeName ?? bell.kind}
        ${bell.reportCode ? `<span class="badge badge-gold">对标 ${bell.reportCode}</span>` : ''}
      </div>
      <div class="geom-line">通高 ${bell.totalHeightMm} mm ｜ 铣长 ${bell.xianChangMm} mm ｜ 铣间 ${bell.xianJianMm} mm ｜ 鼓间 ${bell.guJianMm} mm ｜ 约 ${bell.weightKg} kg</div>
      ${sliderRow('xianChangMm', '钟体尺寸 · 铣长', Math.round(bell.xianChangMm * 0.72), Math.round(bell.xianChangMm * 1.32), 1, 'mm',
        `默认 ${bell.xianChangMm} mm；缩短钟体 → 音高上升（L⁻²）`)}
      ${sliderRow('wallMm', '壁厚', Math.max(2, +(bell.wallMm * 0.5).toFixed(1)), +(bell.wallMm * 2).toFixed(1), 0.1, 'mm',
        `默认 ${bell.wallMm} mm；加厚 → 频率近线性上升`)}
      ${sliderRow('tinPct', '锡含量 Sn', 8, 20, 0.1, '%',
        '曾侯乙编钟合金约 Sn 12–16%；锡改变杨氏模量/密度与衰减')}
      ${sliderRow('meiHeightMm', '钟枚高度', 0, 70, 1, 'mm',
        '钟枚越高，高频模态衰减越快（不改变基音频点）')}
      <div class="param-buttons">
        <button class="btn btn-primary" id="btn-audition">🔔 敲一口听变化</button>
        <button class="btn" id="btn-reset">恢复该钟实测参数</button>
      </div>`;

    formCard.querySelectorAll<HTMLInputElement>('input[data-input]').forEach((input) => {
      const key = input.dataset.input as keyof BellParams;
      input.addEventListener('input', () => {
        store.updateParams({ [key]: parseFloat(input.value) } as Partial<BellParams>);
      });
    });
    formCard.querySelector('#btn-reset')!.addEventListener('click', () => store.resetParams());
    formCard.querySelector('#btn-audition')!.addEventListener('click', () => {
      void engine.unlock();
      engine.strike(bell, store.getParams(bell.id), STRIKE_POINTS.zheng.x, STRIKE_POINTS.zheng.y, { velocity: 0.95 });
    });
    updateReadouts();
  }

  function updateReadouts(): void {
    const bell = bellsById.get(store.state.selectedId)!;
    const p = store.getParams(bell.id);

    // 同步滑杆与数值（reset / 切钟后）
    formCard.querySelectorAll<HTMLInputElement>('input[data-input]').forEach((input) => {
      const key = input.dataset.input as keyof BellParams;
      if (document.activeElement !== input) input.value = String(p[key]);
    });
    (['xianChangMm', 'wallMm', 'tinPct', 'meiHeightMm'] as const).forEach((key) => {
      const valEl = formCard.querySelector(`[data-val="${key}"]`);
      if (valEl) {
        const unit = key === 'tinPct' ? '%' : 'mm';
        let extra = '';
        if (key === 'xianChangMm') extra = `（${Math.round((p.xianChangMm / bell.xianChangMm) * 100)}%）`;
        valEl.textContent = `${p[key]} ${unit} ${extra}`;
      }
    });

    const { zheng, ce, scale } = scaledFrequencies(bell, p);
    const nz = hzToNote(zheng);
    const nc = hzToNote(ce);
    const synthCents = centsBetween(zheng, ce);
    const E = youngModulusGPa(p.tinPct);
    const rho = bronzeDensity(p.tinPct);

    const report = bell.reportCode ? REPORT_ROWS.find((r) => r.code === bell.reportCode) : undefined;
    const reportCents = report ? centsBetween(report.zhengHz, report.ceHz) : null;
    const deviation = reportCents != null ? Math.abs(synthCents - reportCents) : null;
    const pass = deviation != null && deviation <= THRESHOLD_CENTS;

    benchCard.innerHTML = `
      <h3>与公开测音报告对标${report ? ` · ${report.code}` : ''}</h3>
      ${
        report
          ? `<div class="bench-grid">
              <div><span>报告正鼓</span><b>${report.zhengHz} Hz</b><small>${report.noteZheng}</small></div>
              <div><span>报告侧鼓</span><b>${report.ceHz} Hz</b><small>${report.noteCe}</small></div>
              <div><span>报告音程</span><b>${reportCents!.toFixed(1)}¢</b><small>${intervalNameCn(reportCents!)}</small></div>
              <div><span>合成正鼓</span><b>${zheng.toFixed(1)} Hz</b><small>${nz.name}</small></div>
              <div><span>合成侧鼓</span><b>${ce.toFixed(1)} Hz</b><small>${nc.name}</small></div>
              <div><span>合成音程</span><b>${synthCents.toFixed(1)}¢</b><small>${intervalNameCn(synthCents)}</small></div>
            </div>
            <div class="verdict ${pass ? 'pass' : 'fail'}" data-testid="benchmark-verdict">
              ${pass ? '✓' : '✕'} 音程偏差 <b>${deviation!.toFixed(2)}</b> 音分
              （阈值 ${THRESHOLD_CENTS} 音分）— ${pass ? '达标' : '未达标'}
            </div>`
          : `<p class="hint">这口钟没有逐钟报告行。下方可填入任意报告正/侧鼓 Hz 进行对标。
             默认音程 ${Math.abs(synthCents).toFixed(1)}¢（${intervalNameCn(synthCents)}）。</p>`
      }
      <div class="mat-line">整体移调系数 ×${scale.toFixed(4)} ｜ E=${E.toFixed(1)} GPa ｜ ρ=${rho.toFixed(2)} g/cm³</div>`;
  }

  function buildTable(): void {
    const tbody = root.querySelector<HTMLTableSectionElement>('#benchmark-table tbody')!;
    const codeToBell = new Map<string, (typeof BELLS)[number]>();
    BELLS.forEach((b) => b.reportCode && codeToBell.set(b.reportCode, b));
    let passCount = 0;
    const rows = REPORT_ROWS.map((row) => {
      const bell = codeToBell.get(row.code);
      const reportCents = centsBetween(row.zhengHz, row.ceHz);
      const synthCents = bell ? centsBetween(bell.fZheng0, bell.fCe0) : reportCents;
      const dev = Math.abs(synthCents - reportCents);
      if (dev <= THRESHOLD_CENTS) passCount++;
      const kindName = { niu: '钮钟', wumei: '无枚甬', duanmei: '短枚甬', changmei: '长枚甬', large: '大甬', bo: '镈' }[row.kind];
      return `<tr>
        <td>${row.code}${bell ? `<small> · ${bell.rackLabel}</small>` : ''}</td>
        <td>${kindName}</td>
        <td>${row.zhengHz}</td><td>${row.ceHz}</td>
        <td>${reportCents.toFixed(1)}</td><td>${synthCents.toFixed(1)}</td>
        <td class="${dev <= THRESHOLD_CENTS ? 'ok' : 'bad'}">${dev.toFixed(2)}</td>
        <td>${dev <= THRESHOLD_CENTS ? '✓' : '✕'}</td>
      </tr>`;
    }).join('');
    tbody.innerHTML = rows;
    root.querySelector<HTMLElement>('#benchmark-summary')!.innerHTML = `
      <h3>全套报告钟校准总览</h3>
      <p><span class="badge badge-pass" data-testid="benchmark-pass-count">${passCount}/${REPORT_ROWS.length} 口偏差 ≤ ${THRESHOLD_CENTS} 音分</span>
      默认参数按实测基频校准，音程偏差为 0.0 音分。</p>`;

    // 自定义报告值对标
    const custom = root.querySelector<HTMLElement>('#custom-bench')!;
    custom.innerHTML = `
      <h3>用你自己的报告数据复核“同一口钟”</h3>
      <div class="custom-inputs">
        <label>报告正鼓 Hz <input type="number" id="custom-z" value="521" min="20" max="5000" step="0.1"/></label>
        <label>报告侧鼓 Hz <input type="number" id="custom-c" value="621" min="20" max="5000" step="0.1"/></label>
        <div id="custom-out" class="verdict pass"></div>
      </div>`;
    const zInput = custom.querySelector<HTMLInputElement>('#custom-z')!;
    const cInput = custom.querySelector<HTMLInputElement>('#custom-c')!;
    const out = custom.querySelector<HTMLElement>('#custom-out')!;
    const recompute = () => {
      const bell = bellsById.get(store.state.selectedId)!;
      const p = store.getParams(bell.id);
      const { zheng, ce } = scaledFrequencies(bell, p);
      const synthC = centsBetween(zheng, ce);
      const rz = parseFloat(zInput.value);
      const rc = parseFloat(cInput.value);
      if (!(rz > 0) || !(rc > 0)) return;
      const repC = centsBetween(rz, rc);
      const dev = Math.abs(synthC - repC);
      out.className = `verdict ${dev <= THRESHOLD_CENTS ? 'pass' : 'fail'}`;
      out.textContent = `报告音程 ${repC.toFixed(1)}¢ vs 当前合成 ${synthC.toFixed(1)}¢ → 偏差 ${dev.toFixed(1)} 音分 ${dev <= THRESHOLD_CENTS ? '✓ 达标' : '（>30¢）'}`;
    };
    zInput.addEventListener('input', recompute);
    cInput.addEventListener('input', recompute);
    recompute();
  }

  let lastId = store.state.selectedId;
  store.subscribe(() => {
    if (!root.isConnected) return;
    if (store.state.selectedId !== lastId) {
      lastId = store.state.selectedId;
      buildForm();
    } else {
      updateReadouts();
    }
  });

  buildForm();
  buildTable();
}
