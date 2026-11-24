import type { BellParams } from './types';
import { bellsById } from './data/bells';
import { defaultParams } from './audio/acoustics';

export type TabId = 'rack' | 'strike' | 'params' | 'analyze';

interface AppState {
  tab: TabId;
  selectedId: string;
  /** 每口钟独立的参数覆盖；未设置时用该钟实测默认值 */
  params: Record<string, BellParams>;
  soundOn: boolean;
}

type Listener = (s: AppState) => void;

class Store {
  state: AppState = {
    tab: 'rack',
    selectedId: 'U1-01', // 报告基准钟 a-1：521 / 621 Hz
    params: {},
    soundOn: false,
  };
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(): void {
    for (const fn of this.listeners) fn(this.state);
  }

  setTab(tab: TabId): void {
    this.state = { ...this.state, tab };
    this.emit();
  }

  select(id: string): void {
    if (!bellsById.has(id)) return;
    this.state = { ...this.state, selectedId: id };
    this.emit();
  }

  setSoundOn(on: boolean): void {
    this.state = { ...this.state, soundOn: on };
    this.emit();
  }

  getParams(id: string): BellParams {
    const bell = bellsById.get(id)!;
    return this.state.params[id] ?? defaultParams(bell);
  }

  /** 局部更新当前选中钟的参数 */
  updateParams(patch: Partial<BellParams>): void {
    const id = this.state.selectedId;
    const bell = bellsById.get(id)!;
    const base = this.state.params[id] ?? defaultParams(bell);
    this.state = {
      ...this.state,
      params: { ...this.state.params, [id]: { ...base, ...patch } },
    };
    this.emit();
  }

  resetParams(): void {
    const id = this.state.selectedId;
    const next = { ...this.state.params };
    delete next[id];
    this.state = { ...this.state, params: next };
    this.emit();
  }
}

export const store = new Store();
