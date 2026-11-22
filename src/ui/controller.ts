// Coordina lo que se ve sobre Instagram: detecta el perfil de la URL (Instagram cambia de página
// sin recargar), pide sus datos al service worker, sigue el avance del escaneo y guarda el
// interruptor de etiquetas.
import type { ScanMode } from '../db/schema';
import type { ProfileView } from '../db/views';
import type { ProgressMessage, WorkerRequest } from '../scan/messages';
import { profileFromPath } from './route';
import type { Store } from './store';

const VISIBLE_KEY = 'radar:badgesVisible';
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
}

export function createController(store: Store) {
  let routeStart = 0;
  let requestSeq = 0;
  const timing: Timing = { username: null, loadMs: null, paintMs: null, painted: 0 };

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
    store.set({ username, view: null, loadMs: null });
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
      void browser.storage.local.get(VISIBLE_KEY).then((r) => {
        if (typeof r[VISIBLE_KEY] === 'boolean') store.set({ badgesVisible: r[VISIBLE_KEY] as boolean });
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
    async scan(mode: ScanMode = 'auto') {
      const username = store.get().username;
      if (!username) return;
      await toWorker({ type: 'scan/enqueue', username, mode });
    },
    async pause() {
      const job = store.get().view?.job;
      if (job?.id) await toWorker({ type: 'scan/pause', id: job.id });
    },
    async resume() {
      const job = store.get().view?.job;
      await toWorker({ type: 'scan/resume', id: job?.id });
    },
    async setBadgesVisible(visible: boolean) {
      store.set({ badgesVisible: visible });
      await browser.storage.local.set({ [VISIBLE_KEY]: visible });
    },
  };
}

export type Controller = ReturnType<typeof createController>;
