import { BELLS, BELL_GROUPS, LAYER_GROUP_IDS, groupById } from '../data/bells';
import { store } from '../state';
import { engine } from '../audio/BellEngine';
import { defaultParams, STRIKE_POINTS } from '../audio/acoustics';
import { rackBellSVG } from './svg';
import type { Bell } from '../types';

/** 编钟架面板：三层八组 + 镈钟，全套 65 口均可点击敲击 */
export function mountRack(root: HTMLElement): void {
  root.innerHTML = `
    <div class="panel-head">
      <h2>① 编钟架 · 三层八组六十五口</h2>
      <p class="hint">点击任意钟即按其默认正鼓位置合成发声；选中的钟会同步到「单钟敲击」与「钟体参数」。
        <span class="badge badge-gold" data-testid="bell-count">共 ${BELLS.length} 口</span>
      </p>
    </div>
    <div class="rack" data-testid="rack"></div>`;

  const rack = root.querySelector<HTMLElement>('.rack')!;

  for (const layerGroupIds of LAYER_GROUP_IDS) {
    const row = document.createElement('div');
    row.className = 'rack-layer';
    const layerName = groupById(layerGroupIds[0])?.layer ?? '';
    row.innerHTML = `<div class="layer-label">${layerName}</div>`;
    const groupsWrap = document.createElement('div');
    groupsWrap.className = 'layer-groups';

    for (const gid of layerGroupIds) {
      if (gid === 'BO') {
        groupsWrap.appendChild(renderBo());
        continue;
      }
      const group = BELL_GROUPS.find((g) => g.id === gid)!;
      const bells = BELLS.filter((b) => b.groupId === gid);
      const card = document.createElement('section');
      card.className = 'group-card';
      card.innerHTML = `
        <header class="group-head">
          <span class="group-name">${group.name}</span>
          <span class="group-type">${group.typeName} · ${group.count} 件</span>
          <span class="group-dim">通高 ${group.heightRangeMm[0]}–${group.heightRangeMm[1]} mm</span>
        </header>
        <div class="bell-row" role="group" aria-label="${group.name}"></div>`;
      const rowEl = card.querySelector<HTMLElement>('.bell-row')!;
      bells.forEach((b) => rowEl.appendChild(renderBellButton(b)));
      groupsWrap.appendChild(card);
    }
    row.appendChild(groupsWrap);
    rack.appendChild(row);
  }

  // 选中态同步
  const syncSelection = () => {
    rack.querySelectorAll<HTMLButtonElement>('[data-bell-id]').forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.bellId === store.state.selectedId);
      btn.setAttribute('aria-pressed', String(btn.dataset.bellId === store.state.selectedId));
    });
  };
  store.subscribe(syncSelection);
  syncSelection();
}

function renderBellButton(b: Bell): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bell bell-btn';
  btn.dataset.bellId = b.id;
  btn.dataset.testid = 'rack-bell';
  btn.setAttribute('aria-label', `${b.rackLabel} ${b.kind} 正鼓 ${b.fZheng0} 赫兹 侧鼓 ${b.fCe0} 赫兹`);
  btn.title = `${b.rackLabel}｜正 ${b.fZheng0} Hz · 侧 ${b.fCe0} Hz｜通高 ${b.totalHeightMm} mm · 壁厚 ${b.wallMm} mm`;
  // 大钟在架上限制最大高度，小钟保持可读
  const h = Math.max(54, Math.min(150, b.totalHeightMm / 7.2));
  btn.style.setProperty('--bell-h', `${h}px`);
  btn.innerHTML = `
    <span class="bell-art" style="height:${h}px">${rackBellSVG(b)}</span>
    <span class="bell-code">${b.rackLabel}</span>
    ${b.reportCode ? '<span class="cal-dot" title="已用公开测音报告校准"></span>' : ''}`;

  const play = () => {
    store.select(b.id);
    void engine.unlock();
    const params = store.getParams(b.id) ?? defaultParams(b);
    engine.strike(b, params, STRIKE_POINTS.zheng.x, STRIKE_POINTS.zheng.y, { velocity: 0.92 });
    flash(btn);
  };

  // pointerdown 保证最低延迟；键盘/程序化 .click() 的 detail===0 走 click 兜底
  btn.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    play();
  });
  btn.addEventListener('click', (ev) => {
    if (ev.detail === 0) play();
  });
  return btn;
}

function renderBo(): HTMLElement {
  const b = BELLS.find((x) => x.groupId === 'BO')!;
  const wrap = document.createElement('section');
  wrap.className = 'group-card bo-card';
  wrap.innerHTML = `
    <header class="group-head">
      <span class="group-name">楚惠王镈钟</span>
      <span class="group-type">镈钟 · 1 件</span>
      <span class="group-dim">通高约 ${b.totalHeightMm} mm</span>
    </header>`;
  const rowEl = document.createElement('div');
  rowEl.className = 'bell-row';
  rowEl.appendChild(renderBellButton(b));
  wrap.appendChild(rowEl);
  return wrap;
}

function flash(btn: HTMLButtonElement): void {
  btn.classList.remove('striking');
  // 强制重排以重启动画
  void btn.offsetWidth;
  btn.classList.add('striking');
  window.setTimeout(() => btn.classList.remove('striking'), 420);
}
