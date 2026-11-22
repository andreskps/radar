import { describe, expect, it } from 'vitest';
import { fetchProfile, fetchReelsPage, fetchTimelinePage, readProfileContent, randomDelay, resolveUserId } from '../../src/ig';
import { client, fakeFetch, fixtures, PAGE_HTML, reply, withPage } from './fake';

const noDelay = () => Promise.resolve();

/** Instagram simulado: 2 páginas de timeline y 2 de Reels. */
function instagram(overrides: { timeline2?: () => ReturnType<typeof reply>; profile?: unknown } = {}) {
  return fakeFetch((path, friendly, vars) => {
    if (!friendly) return reply(PAGE_HTML, 200, `https://www.instagram.com${path}`);
    if (friendly === 'PolarisProfilePageContentQuery') return reply(overrides.profile ?? fixtures.profile);
    if (friendly.startsWith('PolarisProfilePostsTab')) {
      if (!vars?.after) return reply(withPage(fixtures.timeline, 'timeline', 'TL2'));
      return overrides.timeline2?.() ?? reply(withPage(emptyTimeline(), 'timeline', null));
    }
    if (!vars?.after) return reply(withPage(fixtures.reels, 'reels', 'R2'));
    return reply(withPage(emptyReels(), 'reels', null));
  });
}
const emptyTimeline = () => ({ data: { xdt_api__v1__feed__user_timeline_graphql_connection: { edges: [], page_info: {} } } });
const emptyReels = () => ({ data: { fetch__XDTUserDict: { clips_connection: { edges: [], page_info: {} } } } });

describe('perfil', () => {
  it('ID desde la página y datos por GraphQL', async () => {
    const f = instagram();
    const res = await fetchProfile(client(f.fetch), '@AttoPerfumes');
    expect(res).toMatchObject({ ok: true, data: { id: '4333002697', followers: 501074 } });
    expect(f.calls[0]!.path).toBe('/attoperfumes/');
    expect(f.calls[1]!.vars).toMatchObject({ id: '4333002697' });
  });

  it('perfil inexistente o página sin ID', async () => {
    const nadie = fakeFetch(() => reply('no', 404));
    await expect(resolveUserId(client(nadie.fetch), 'nadie')).resolves.toMatchObject({ status: 'error', message: 'No existe el perfil @nadie' });
    const sinId = fakeFetch(() => reply('<html></html>'));
    await expect(resolveUserId(client(sinId.fetch), 'x')).resolves.toMatchObject({ status: 'error', message: 'No se pudo leer el ID de @x' });
    const lento = fakeFetch(() => reply('', 429));
    await expect(fetchProfile(client(lento.fetch), 'x')).resolves.toMatchObject({ status: 'paused' });
  });

  it('si la consulta cambió de formato, lo dice claro', async () => {
    const f = instagram({ profile: { data: { otra_cosa: {} } } });
    const res = await fetchProfile(client(f.fetch), 'attoperfumes');
    expect(res).toMatchObject({ ok: false, status: 'error' });
    expect(!res.ok && res.message).toContain('Instagram cambió la consulta de perfil');
  });
});

describe('páginas', () => {
  const profile = { id: '4333002697', username: 'attoperfumes' } as never;

  it('timeline y Reels con cursor', async () => {
    const f = instagram();
    const c = client(f.fetch);
    const tl = await fetchTimelinePage(c, profile, null);
    expect(tl).toMatchObject({ ok: true, data: { nextCursor: 'TL2' } });
    expect(tl.ok && tl.data.items).toHaveLength(4);
    const r = await fetchReelsPage(c, profile, 'R2');
    expect(r).toMatchObject({ ok: true, data: { items: [], nextCursor: null } });
    expect(f.calls.at(-1)!.vars).toMatchObject({ after: 'R2', id: '4333002697' });
  });

  it('formato inesperado → error claro; pausa → se propaga', async () => {
    const raro = fakeFetch(() => reply({ data: {} }));
    await expect(fetchTimelinePage(client(raro.fetch), profile, null)).resolves.toMatchObject({ status: 'error' });
    await expect(fetchReelsPage(client(raro.fetch), profile, null)).resolves.toMatchObject({ status: 'error' });
    const lento = fakeFetch(() => reply({}, 429));
    await expect(fetchTimelinePage(client(lento.fetch), profile, null)).resolves.toMatchObject({ status: 'paused' });
    await expect(fetchReelsPage(client(lento.fetch), profile, null)).resolves.toMatchObject({ status: 'paused' });
  });
});

describe('readProfileContent', () => {
  it('lee todo, une reproducciones y ordena del más nuevo al más viejo', async () => {
    const f = instagram();
    const progress: string[] = [];
    const res = await readProfileContent(client(f.fetch), 'attoperfumes', { delay: noDelay, onProgress: (p) => progress.push(`${p.kind}:${p.page}:${p.read}`) });
    expect(res.outcome).toEqual({ status: 'complete' });
    expect(res.posts.map((p) => [p.code, p.type, p.views])).toEqual([
      ['DgAt6B_yNx5', 'reel', 38936],
      ['Df5XUAOnTYo', 'carousel', null],
      ['Df3LO5lslIB', 'reel', 8800],
      ['DHUdgjLRgim', 'reel', 119469],
    ]);
    expect(res.unmatchedReels).toEqual([]);
    expect(res.pages).toBe(5); // perfil + 2 timeline + 2 Reels
    expect(progress).toEqual(['timeline:1:4', 'timeline:2:4', 'reels:1:3', 'reels:2:3']);
  });

  it('un 429 a mitad devuelve "pausa" y conserva lo leído', async () => {
    const f = instagram({ timeline2: () => reply({ message: 'Please wait a few minutes before you try again.' }, 429) });
    const res = await readProfileContent(client(f.fetch), 'attoperfumes', { delay: noDelay });
    expect(res.outcome).toMatchObject({ ok: false, status: 'paused', reason: 'rate_limit' });
    expect(res.posts).toHaveLength(4);
    expect(res.posts.every((p) => p.views === null)).toBe(true); // Reels no se alcanzó a leer
  });

  it('con `since` deja de paginar al pasar la fecha (ignora el fijado viejo)', async () => {
    const f = instagram();
    const since = 1795000000 * 1000;
    const res = await readProfileContent(client(f.fetch), 'attoperfumes', { delay: noDelay, since });
    expect(res.posts.map((p) => p.code)).toEqual(['DgAt6B_yNx5', 'Df5XUAOnTYo']);
    expect(res.posts[0]!.views).toBe(38936);
    expect(res.pages).toBe(3); // perfil + 1 de timeline (su último post ya es anterior) + 1 de Reels
    expect(res.unmatchedReels).toEqual([]); // los reels fuera del rango sí están en el timeline
  });

  it('con `since` muy reciente para en la primera página', async () => {
    const f = instagram();
    const res = await readProfileContent(client(f.fetch), 'attoperfumes', { delay: noDelay, since: Date.UTC(2030, 0, 1) });
    expect(res.posts).toEqual([]);
    expect(res.outcome).toEqual({ status: 'complete' });
  });

  it('perfil privado, perfil con error y cancelación', async () => {
    const privado = instagram({ profile: { data: { user: { ...fixtures.profile.data.user, is_private: true } } } });
    await expect(readProfileContent(client(privado.fetch), 'x', { delay: noDelay })).resolves.toMatchObject({ posts: [], outcome: { status: 'error', message: '@attoperfumes es privado' } });

    const nadie = fakeFetch(() => reply('no', 404));
    await expect(readProfileContent(client(nadie.fetch), 'nadie')).resolves.toMatchObject({ profile: null, outcome: { status: 'error' } });

    const ctrl = new AbortController();
    ctrl.abort();
    await expect(readProfileContent(client(instagram().fetch), 'x', { delay: noDelay, signal: ctrl.signal })).resolves.toMatchObject({ outcome: { status: 'aborted' } });
  });

  it('randomDelay espera dentro del rango', async () => {
    const t0 = Date.now();
    await randomDelay(5, 10)();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(4);
  });
});
