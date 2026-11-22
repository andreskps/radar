// Peticiones a Instagram con la sesión del navegador.
// Corre en el content script de instagram.com (mismo origen: usa las cookies del sitio).
import { QUERIES, type QueryName } from './queries';
import type { IgFailure, IgResult, PauseReason } from './types';

export const IG_APP_ID = '936619743392459';
export const IG_ORIGIN = 'https://www.instagram.com';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface PageTokens {
  lsd: string;
  dtsg: string | null;
}

export interface ClientOptions {
  fetch?: FetchLike;
  getCsrfToken?: () => string | null;
  /** HTML de donde leer los tokens de la página (por defecto, el documento abierto). */
  getDocumentHtml?: () => string;
  /** doc_id alternativos (Ajustes) por si Instagram cambia alguno. */
  docIds?: Partial<Record<QueryName, string>>;
}

export function readCsrfFromCookie(cookie: string = globalThis.document?.cookie ?? ''): string | null {
  const m = /(?:^|;\s*)csrftoken=([^;]+)/.exec(cookie);
  return m ? decodeURIComponent(m[1]!) : null;
}

/** Tokens que la web de Instagram envía en cada consulta GraphQL. */
export function extractPageTokens(html: string): PageTokens | null {
  const lsd = /"LSD",\[\],\{"token":"([^"]+)"/.exec(html)?.[1] ?? /"lsd":"([^"]+)"/.exec(html)?.[1];
  if (!lsd) return null;
  const dtsg = /"DTSGInitialData",\[\],\{"token":"([^"]+)"/.exec(html)?.[1] ?? null;
  return { lsd, dtsg };
}

/** ID numérico del usuario a partir del HTML de su perfil. */
export function extractUserId(html: string, username: string): string | null {
  const u = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [/"profilePage_(\d+)"/, new RegExp(`"id":"(\\d{3,25})","username":"${u}"`), new RegExp(`"pk":"(\\d{3,25})","username":"${u}"`)];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) return m[1]!;
  }
  return null;
}

const PAUSE_MESSAGES: Record<PauseReason, string> = {
  rate_limit: 'Instagram pidió ir más despacio. Se pausa y se reanuda solo.',
  login_required: 'La sesión de Instagram se cerró. Inicia sesión y vuelve a intentar.',
  checkpoint: 'Instagram pide verificar la cuenta. Ábrelo y completa la verificación.',
  action_blocked: 'Instagram bloqueó temporalmente la acción. Se pausa por un tiempo.',
};

const pause = (reason: PauseReason, httpStatus: number): IgFailure => ({ ok: false, status: 'paused', reason, httpStatus, message: PAUSE_MESSAGES[reason] });

/** Clasifica una respuesta de Instagram: `null` si es válida; si no, pausa o error. */
export function classify(httpStatus: number, finalUrl: string, body: unknown): IgFailure | null {
  const json = (body && typeof body === 'object' ? body : {}) as Record<string, any>;
  const gqlError = Array.isArray(json.errors) ? json.errors[0] : undefined;
  const message = [json.message, gqlError?.message, gqlError?.summary, gqlError?.description].filter((m) => typeof m === 'string').join(' · ');

  if (httpStatus === 429 || /please wait a few minutes|rate limit|demasiad/i.test(message)) return pause('rate_limit', httpStatus);
  if (/\/accounts\/login/.test(finalUrl) || /login_required/.test(message) || json.require_login === true) return pause('login_required', httpStatus);
  if (/checkpoint_required|challenge_required/.test(message) || /\/challenge\//.test(finalUrl)) return pause('checkpoint', httpStatus);
  if (/feedback_required/.test(message) || json.spam === true) return pause('action_blocked', httpStatus);
  if (httpStatus === 401) return pause('login_required', httpStatus);
  if (httpStatus >= 400 || json.status === 'fail' || (gqlError && !json.data)) {
    return { ok: false, status: 'error', httpStatus, message: message || `Instagram respondió ${httpStatus}` };
  }
  return null;
}

export function createClient(options: ClientOptions = {}) {
  const doFetch: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const getCsrf = options.getCsrfToken ?? (() => readCsrfFromCookie());
  const getDocHtml = options.getDocumentHtml ?? (() => globalThis.document?.documentElement?.innerHTML ?? '');
  let tokens: PageTokens | null = null;

  async function send(path: string, init: RequestInit): Promise<{ res: Response; text: string } | IgFailure> {
    try {
      const res = await doFetch(`${IG_ORIGIN}${path}`, { credentials: 'include', ...init });
      return { res, text: await res.text() };
    } catch (e) {
      return { ok: false, status: 'error', httpStatus: 0, message: `Sin conexión con Instagram: ${(e as Error).message}` };
    }
  }

  /** Descarga una página HTML de Instagram (perfil, inicio). */
  async function html(path: string): Promise<IgResult<string>> {
    const r = await send(path, { headers: { accept: 'text/html' } });
    if ('ok' in r) return r;
    if (/\/accounts\/login/.test(r.res.url)) return pause('login_required', r.res.status);
    if (r.res.status === 404) return { ok: false, status: 'error', httpStatus: 404, message: 'No existe esa página en Instagram' };
    const problem = classify(r.res.status, r.res.url, null);
    return problem ?? { ok: true, data: r.text };
  }

  async function getTokens(): Promise<IgResult<PageTokens>> {
    if (tokens) return { ok: true, data: tokens };
    tokens = extractPageTokens(getDocHtml());
    if (!tokens) {
      const home = await html('/');
      if (!home.ok) return home;
      tokens = extractPageTokens(home.data);
    }
    return tokens
      ? { ok: true, data: tokens }
      : { ok: false, status: 'error', httpStatus: 200, message: 'No se encontraron los tokens de Instagram. Recarga la página.' };
  }

  /** Consulta GraphQL como la hace la web de Instagram. */
  async function graphql<T>(query: QueryName, variables: object): Promise<IgResult<T>> {
    const t = await getTokens();
    if (!t.ok) return t;
    const { friendlyName } = QUERIES[query];
    const docId = options.docIds?.[query] ?? QUERIES[query].docId;
    const form = new URLSearchParams({
      av: '0',
      __user: '0',
      __a: '1',
      __d: 'www',
      dpr: '1',
      lsd: t.data.lsd,
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: friendlyName,
      variables: JSON.stringify(variables),
      server_timestamps: 'true',
      doc_id: docId,
    });
    if (t.data.dtsg) form.set('fb_dtsg', t.data.dtsg);
    const headers: Record<string, string> = {
      'content-type': 'application/x-www-form-urlencoded',
      'x-ig-app-id': IG_APP_ID,
      'x-fb-lsd': t.data.lsd,
      'x-fb-friendly-name': friendlyName,
    };
    const csrf = getCsrf();
    if (csrf) headers['x-csrftoken'] = csrf;

    const r = await send('/graphql/query', { method: 'POST', headers, body: form.toString() });
    if ('ok' in r) return r;
    let json: unknown = null;
    try {
      json = JSON.parse(r.text);
    } catch {
      // HTML: sesión cerrada o error de Instagram.
    }
    const problem = classify(r.res.status, r.res.url, json);
    if (problem) return problem;
    if (json === null) return /<html/i.test(r.text) ? pause('login_required', r.res.status) : { ok: false, status: 'error', httpStatus: r.res.status, message: 'Instagram devolvió una respuesta que no es JSON' };
    return { ok: true, data: json as T };
  }

  return { html, graphql, getTokens };
}

export type IgClient = ReturnType<typeof createClient>;
