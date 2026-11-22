import '@/assets/theme.css';
import ReactDOM from 'react-dom/client';
import { StatusIndicator } from './StatusIndicator';
import { createClient, fetchProfile, fetchReelsPage, fetchTimelinePage, readProfileContent, type IgClient, type ReadAllOptions } from '@/ig';
import { isFetchRequest, type FetchRequest, type ProgressMessage, type WorkerRequest } from '@/scan/messages';
import type { ScanMode } from '@/db/schema';

async function toWorker<T>(msg: WorkerRequest): Promise<T> {
  const res = (await browser.runtime.sendMessage(msg)) as { ok: boolean; data?: T; message?: string };
  if (!res?.ok) throw new Error(res?.message ?? 'Sin respuesta del service worker');
  return res.data as T;
}

// Acceso desde la consola de DevTools (contexto "Radar").
function exposeConsoleApi(client: IgClient) {
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
  };
}

/** Ejecuta las peticiones que pide la cola del service worker. */
function serveFetches(client: IgClient) {
  browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
    if ((msg as ProgressMessage)?.type === 'scan/progress') {
      const { job } = msg as ProgressMessage;
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
    exposeConsoleApi(client);
    serveFetches(client);
    const ui = await createShadowRootUi(ctx, {
      name: 'radar-ui',
      position: 'overlay',
      anchor: 'body',
      onMount(container) {
        const app = document.createElement('div');
        container.append(app);
        const root = ReactDOM.createRoot(app);
        root.render(<StatusIndicator />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
  },
});
