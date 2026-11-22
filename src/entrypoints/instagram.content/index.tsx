import '@/assets/theme.css';
import ReactDOM from 'react-dom/client';
import { ProfileChip } from './ProfileChip';
import { createClient, fetchProfile, fetchReelsPage, fetchTimelinePage, readProfileContent, type IgClient, type ReadAllOptions } from '@/ig';
import { isFetchRequest, type FetchRequest, type ProgressMessage, type WorkerRequest } from '@/scan/messages';
import type { ScanMode } from '@/db/schema';
import { createStore } from '@/ui/store';
import { createController, type Controller } from '@/ui/controller';
import { startBadgeLayer } from '@/ui/badges/layer';

async function toWorker<T>(msg: WorkerRequest): Promise<T> {
  const res = (await browser.runtime.sendMessage(msg)) as { ok: boolean; data?: T; message?: string };
  if (!res?.ok) throw new Error(res?.message ?? 'Sin respuesta del service worker');
  return res.data as T;
}

// Acceso desde la consola de DevTools (contexto "Radar").
function exposeConsoleApi(client: IgClient, controller: Controller) {
  (globalThis as Record<string, unknown>).radar = {
    profile: (username: string) => fetchProfile(client, username),
    read: async (username: string, opts: ReadAllOptions = {}) => {
      const t0 = performance.now();
      const result = await readProfileContent(client, username, {
        onProgress: (p) => console.info(`[Radar] ${p.kind} página ${p.page}: ${p.read} leídos`),
        ...opts,
      });
      console.info(`[Radar] @${username}: ${result.posts.length} posts en ${result.pages} páginas, ${Math.round((performance.now() - t0) / 1000)} s`, result.outcome);
      return result;
    },
    /** Escanear y guardar en la base (Fase 3). `full: true` = "actualizar todo". */
    scan: (username: string, opts: { full?: boolean } = {}) =>
      toWorker({ type: 'scan/enqueue', username, mode: (opts.full ? 'full' : 'auto') as ScanMode }),
    jobs: () => toWorker({ type: 'scan/jobs' }),
    pause: (id?: number) => toWorker({ type: 'scan/pause', id }),
    resume: (id?: number) => toWorker({ type: 'scan/resume', id }),
    cancel: (id?: number) => toWorker({ type: 'scan/cancel', id }),
    stored: (username: string) => toWorker({ type: 'db/profile', username }),
    export: (username: string) => toWorker({ type: 'db/export', username }),
    /** Tiempos de la vista actual (meta M3) y etiquetas pintadas. */
    ui: () => ({ ...controller.timing, badgesInDom: document.querySelectorAll('radar-badge').length }),
    setBadges: (visible: boolean) => controller.setBadgesVisible(visible),
  };
}

/**
 * Puente de pruebas: permite llamar a `radar.*` desde el contexto de la página (herramientas de
 * prueba automatizada que no ven el contexto aislado). Solo existe en builds con
 * VITE_RADAR_DEV_BRIDGE=1; el build normal no lo incluye.
 */
function exposeDevBridge() {
  const allowed = new Set(['scan', 'jobs', 'stored', 'pause', 'resume', 'cancel', 'export', 'ui', 'setBadges']);
  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.source !== 'radar-dev' || !allowed.has(e.data.cmd)) return;
    const { id, cmd, args = [] } = e.data as { id: string; cmd: string; args?: unknown[] };
    const api = (globalThis as Record<string, any>).radar;
    try {
      const data = await api[cmd](...args);
      window.postMessage({ source: 'radar-dev-reply', id, ok: true, data }, location.origin);
    } catch (err) {
      window.postMessage({ source: 'radar-dev-reply', id, ok: false, message: (err as Error).message }, location.origin);
    }
  });
}

/** Ejecuta las peticiones que pide la cola del service worker. */
function serveFetches(client: IgClient, controller: Controller) {
  browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
    if ((msg as ProgressMessage)?.type === 'scan/progress') {
      const { job } = msg as ProgressMessage;
      controller.onProgress(msg as ProgressMessage);
      console.info(`[Radar] @${job.username}: ${job.status} · ${job.phase} · ${job.read} posts · ${job.reelsRead} reels`, job.message ?? '');
      return;
    }
    if (!isFetchRequest(msg)) return;
    const req = msg as FetchRequest;
    if (req.type === 'radar/ping') {
      sendResponse('pong');
      return;
    }
    const work =
      req.kind === 'profile'
        ? fetchProfile(client, req.username)
        : req.kind === 'timeline'
          ? fetchTimelinePage(client, req.profile, req.cursor)
          : fetchReelsPage(client, req.profile, req.cursor);
    work.then(sendResponse, (e: Error) => sendResponse({ ok: false, status: 'error', httpStatus: 0, message: e.message }));
    return true;
  });
}

// Content script en Instagram. La UI vive en un Shadow Root para no alterar los estilos del sitio (RNF-04).
export default defineContentScript({
  matches: ['*://*.instagram.com/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const client = createClient();
    const store = createStore();
    const controller = createController(store);
    exposeConsoleApi(client, controller);
    serveFetches(client, controller);
    if ((import.meta.env as Record<string, string | undefined>).VITE_RADAR_DEV_BRIDGE === '1') exposeDevBridge();
    const ui = await createShadowRootUi(ctx, {
      name: 'radar-ui',
      position: 'overlay',
      anchor: 'body',
      onMount(container) {
        const app = document.createElement('div');
        container.append(app);
        const root = ReactDOM.createRoot(app);
        root.render(<ProfileChip store={store} controller={controller} />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
    controller.start();
    startBadgeLayer(store, (n) => controller.onPainted(n));
  },
});
