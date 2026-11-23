// Fetcher del service worker: las peticiones las ejecuta el content script de una pestaña de
// Instagram (necesita las cookies y los tokens de la página). Si no hay pestaña, abre una en
// segundo plano (architecture.md §5.1).
import type { IgFailure, IgResult } from '../ig/types';
import type { FetchRequest } from './messages';
import type { Fetcher } from './step';

const IG_URLS = ['*://*.instagram.com/*'];
const READY_TIMEOUT_MS = 30_000;

const noTab = (detail: string): IgFailure => ({
  ok: false,
  status: 'error',
  httpStatus: 0,
  message: `No hay una pestaña de Instagram lista para escanear (${detail}).`,
});

export function createTabFetcher(): Fetcher {
  let tabId: number | null = null;

  const send = <T>(id: number, msg: FetchRequest) => browser.tabs.sendMessage(id, msg) as Promise<T>;
  const ping = async (id: number) => {
    try {
      return (await send<string>(id, { type: 'radar/ping' })) === 'pong';
    } catch {
      return false;
    }
  };

  async function findTab(): Promise<number | null> {
    if (tabId !== null && (await ping(tabId))) return tabId;
    for (const tab of await browser.tabs.query({ url: IG_URLS })) {
      // Las pestañas abiertas antes de instalar o recargar la extensión no tienen el content script.
      if (tab.id !== undefined && (await ping(tab.id))) return (tabId = tab.id);
    }
    // Sin windowId, Chrome usa la "ventana actual", que no existe si el navegador quedó en segundo
    // plano sin ventanas ("No current window"). No se abre una ventana por cuenta propia.
    const [win] = await browser.windows.getAll({ windowTypes: ['normal'] });
    if (win?.id === undefined) return null;
    const created = await browser.tabs.create({ windowId: win.id, url: 'https://www.instagram.com/', active: false });
    if (created.id === undefined) return null;
    const until = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < until) {
      if (await ping(created.id)) return (tabId = created.id);
      await new Promise((r) => setTimeout(r, 1000));
    }
    return null;
  }

  async function call<T>(msg: FetchRequest): Promise<IgResult<T>> {
    for (let attempt = 0; attempt < 2; attempt++) {
      let id: number | null;
      try {
        id = await findTab();
      } catch (e) {
        return noTab((e as Error).message);
      }
      if (id === null) return noTab('no hay una ventana de Chrome abierta o no cargó a tiempo');
      try {
        return await send<IgResult<T>>(id, msg);
      } catch (e) {
        tabId = null; // la pestaña se cerró o navegó: se busca otra
        if (attempt === 1) return noTab((e as Error).message);
      }
    }
    return noTab('sin respuesta');
  }

  return {
    profile: (username) => call({ type: 'scan/fetch', kind: 'profile', username }),
    timeline: (profile, cursor) => call({ type: 'scan/fetch', kind: 'timeline', profile, cursor }),
    reels: (profile, cursor) => call({ type: 'scan/fetch', kind: 'reels', profile, cursor }),
  };
}
