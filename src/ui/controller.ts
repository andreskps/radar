// Coordina lo que se ve sobre Instagram: detecta el perfil de la URL (Instagram cambia de página
// sin recargar), pide sus datos al service worker, sigue el avance del escaneo y guarda el
// interruptor de etiquetas.
import type { ScanMode, ScanRange } from '../db/schema';
import type { ProfileView } from '../db/views';
import type { ProgressMessage, WorkerRequest } from '../scan/messages';
import { profileFromPath } from './route';
import type { Store } from './store';

const VISIBLE_KEY = 'radar:badgesVisible';
const THEME_KEY = 'radar:theme';
const ROUTE_POLL_MS = 300;

export async function toWorker<T>(msg: WorkerRequest): Promise<T> {
  const res = (await browser.runtime.sendMessage(msg)) as { ok: boolean; data?: T; message?: string };
  if (!res?.ok) throw new Error(res?.message ?? 'Sin respuesta del service worker');
  return res.data as T;
}

export interface Timing {
  username: string | null;
  /** Desde que se detectó el perfil hasta tener los datos. */
  loadMs: number | null;
  /** Desde que se detectó el perfil hasta la primera etiqueta pintada (meta M3: ≤ 2 s). */
  paintMs: number | null;
  painted: number;
  /** Desde el clic en "Abrir panel" hasta el primer frame con datos (meta: < 1 s). */
  panelMs: number | null;
  panelPosts: number | null;
}

/** Tema por defecto: el de Instagram (fondo oscuro → oscuro). */
function instagramTheme(): 'dark' | 'light' {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(document.body).backgroundColor);
  if (!m) return 'dark';
  const [r, g, b] = m.slice(1).map(Number) as [number, number, number];
  return 0.299 * r + 0.587 * g + 0.114 * b < 128 ? 'dark' : 'light';
}

export function createController(store: Store) {
  let routeStart = 0;
  let requestSeq = 0;
  const timing: Timing = { username: null, loadMs: null, paintMs: null, painted: 0, panelMs: null, panelPosts: null };
  let panelClickAt: number | null = null;

  async function loadView(username: string) {
    const seq = ++requestSeq;
    store.set({ loading: true });
    try {
      const view = await toWorker<ProfileView>({ type: 'view/profile', username });
      if (seq !== requestSeq || store.get().username !== username) return;
      const loadMs = Math.round(performance.now() - routeStart);
      timing.loadMs ??= loadMs;
      store.set({ view, loading: false, loadMs });
    } catch (e) {
      if (seq === requestSeq) store.set({ loading: false });
      console.warn('[Radar] no se pudieron leer los datos del perfil', e);
    }
  }

  function onRoute(pathname: string) {
    const username = profileFromPath(pathname);
    if (username === store.get().username) return;
    routeStart = performance.now();
    Object.assign(timing, { username, loadMs: null, paintMs: null, painted: 0 });
    store.set({ username, view: null, loadMs: null, ...(username ? {} : { panelOpen: false }) });
    void toWorker({ type: 'tab/profile', username }).catch(() => {});
    if (username) void loadView(username);
  }

  function onProgress(msg: ProgressMessage) {
    const { username, view } = store.get();
    if (msg.job.username !== username) return;
    store.set({ view: view ? { ...view, job: msg.job } : { username, summary: null, job: msg.job, posts: {} } });
    if (msg.job.status === 'done') void loadView(username);
  }

  return {
    timing,
    start() {
      store.set({ theme: instagramTheme() });
      void browser.storage.local.get([VISIBLE_KEY, THEME_KEY]).then((r) => {
        if (typeof r[VISIBLE_KEY] === 'boolean') store.set({ badgesVisible: r[VISIBLE_KEY] as boolean });
        if (r[THEME_KEY] === 'dark' || r[THEME_KEY] === 'light') store.set({ theme: r[THEME_KEY] });
      });
      onRoute(location.pathname);
      setInterval(() => onRoute(location.pathname), ROUTE_POLL_MS);
      // Al volver a la pestaña, el contador del icono debe mostrar este perfil.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void toWorker({ type: 'tab/profile', username: store.get().username }).catch(() => {});
      });
    },
    onProgress,
    onPainted(count: number) {
      timing.painted = count;
      if (count > 0 && timing.paintMs === null && store.get().username) timing.paintMs = Math.round(performance.now() - routeStart);
    },
    /** Sin rango: el escaneo de siempre (todo la primera vez, lo nuevo después). */
    async scan(mode: ScanMode = 'auto', range: ScanRange | null = null) {
      const username = store.get().username;
      if (!username) return;
      await toWorker({ type: 'scan/enqueue', username, mode, range });
    },
    async pause() {
      const job = store.get().view?.job;
      if (job?.id) await toWorker({ type: 'scan/pause', id: job.id });
    },
    async resume() {
      const job = store.get().view?.job;
      await toWorker({ type: 'scan/resume', id: job?.id });
    },
    setPanelOpen(open: boolean) {
      if (open) {
        panelClickAt = performance.now();
        timing.panelMs = null;
      }
      store.set({ panelOpen: open });
    },
    onPanelRendered(posts: number) {
      if (panelClickAt === null) return;
      timing.panelMs = Math.round(performance.now() - panelClickAt);
      timing.panelPosts = posts;
      panelClickAt = null;
    },
    async setTheme(theme: 'dark' | 'light') {
      store.set({ theme });
      await browser.storage.local.set({ [THEME_KEY]: theme });
    },
    async setBadgesVisible(visible: boolean) {
      store.set({ badgesVisible: visible });
      await browser.storage.local.set({ [VISIBLE_KEY]: visible });
    },
  };
}

export type Controller = ReturnType<typeof createController>;
