// Estado del content script: perfil abierto, sus datos y si se muestran las etiquetas.
import type { ProfileView } from '../db/views';

export interface UiState {
  /** Perfil de la URL actual, o `null` si no es una página de perfil. */
  username: string | null;
  view: ProfileView | null;
  loading: boolean;
  badgesVisible: boolean;
  /** ms que tardó en llegar la vista (para la meta M3). */
  loadMs: number | null;
  panelOpen: boolean;
  theme: 'dark' | 'light';
}

export type Store = ReturnType<typeof createStore>;

export function createStore(initial: Partial<UiState> = {}) {
  let state: UiState = { username: null, view: null, loading: false, badgesVisible: true, loadMs: null, panelOpen: false, theme: 'dark', ...initial };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<UiState>) {
      state = { ...state, ...patch };
      for (const l of listeners) l();
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
