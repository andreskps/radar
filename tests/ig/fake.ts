import profile from '../fixtures/ig/profile.json';
import reels from '../fixtures/ig/reels.json';
import timeline from '../fixtures/ig/timeline.json';
import { createClient, type FetchLike } from '../../src/ig';

export const fixtures = { profile, reels, timeline };

export const PAGE_HTML = '<html><script>{"LSD",[],{"token":"lsd-tok"}}{"DTSGInitialData",[],{"token":"dtsg-tok"}}"profilePage_4333002697"</script></html>';

export interface FakeReply {
  status?: number;
  url?: string;
  body: unknown;
}

export function reply(body: unknown, status = 200, url = 'https://www.instagram.com/graphql/query'): FakeReply {
  return { body, status, url };
}

/** fetch falso: `route` recibe la ruta y el friendly name (para GraphQL) y devuelve la respuesta. */
export function fakeFetch(route: (path: string, friendly: string | null, vars: Record<string, any> | null) => FakeReply | Error) {
  const calls: { path: string; friendly: string | null; vars: Record<string, any> | null; headers: Record<string, string> }[] = [];
  const fetch: FetchLike = async (input, init) => {
    const path = input.replace('https://www.instagram.com', '');
    const form = typeof init?.body === 'string' ? new URLSearchParams(init.body) : null;
    const friendly = form?.get('fb_api_req_friendly_name') ?? null;
    const vars = form?.get('variables') ? JSON.parse(form.get('variables')!) : null;
    calls.push({ path, friendly, vars, headers: (init?.headers ?? {}) as Record<string, string> });
    const r = route(path, friendly, vars);
    if (r instanceof Error) throw r;
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return { status: r.status ?? 200, url: r.url ?? `https://www.instagram.com${path}`, text: async () => text } as unknown as Response;
  };
  return { fetch, calls };
}

export function client(fetch: FetchLike, html = PAGE_HTML) {
  return createClient({ fetch, getCsrfToken: () => 'csrf-tok', getDocumentHtml: () => html });
}

/** Copia de un fixture con otra página (cursor y si hay más). */
export function withPage<T>(fx: T, conn: 'timeline' | 'reels', nextCursor: string | null): T {
  const copy = structuredClone(fx) as any;
  const c = conn === 'timeline' ? copy.data.xdt_api__v1__feed__user_timeline_graphql_connection : copy.data.fetch__XDTUserDict.clips_connection;
  c.page_info = { ...c.page_info, end_cursor: nextCursor, has_next_page: nextCursor !== null };
  return copy;
}
