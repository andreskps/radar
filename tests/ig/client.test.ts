import { describe, expect, it } from 'vitest';
import { classify, createClient, extractPageTokens, extractUserId, readCsrfFromCookie } from '../../src/ig';
import { client, fakeFetch, fixtures, PAGE_HTML, reply } from './fake';

describe('tokens e ID', () => {
  it('extrae lsd y fb_dtsg', () => {
    expect(extractPageTokens(PAGE_HTML)).toEqual({ lsd: 'lsd-tok', dtsg: 'dtsg-tok' });
    expect(extractPageTokens('{"lsd":"x"}')).toEqual({ lsd: 'x', dtsg: null });
    expect(extractPageTokens('<html></html>')).toBeNull();
  });

  it('extrae el ID del perfil', () => {
    expect(extractUserId(PAGE_HTML, 'attoperfumes')).toBe('4333002697');
    expect(extractUserId('"id":"123456","username":"a.b"', 'a.b')).toBe('123456');
    expect(extractUserId('"pk":"98765","username":"zz"', 'zz')).toBe('98765');
    expect(extractUserId('"id":"123456","username":"axb"', 'a.b')).toBeNull();
  });

  it('lee la cookie csrftoken', () => {
    expect(readCsrfFromCookie('a=1; csrftoken=abc%3D; b=2')).toBe('abc=');
    expect(readCsrfFromCookie('a=1')).toBeNull();
    expect(readCsrfFromCookie()).toBeNull();
  });
});

describe('classify', () => {
  it.each([
    [429, '', {}, 'rate_limit'],
    [200, '', { message: 'Please wait a few minutes before you try again.' }, 'rate_limit'],
    [200, 'https://www.instagram.com/accounts/login/?next=/', null, 'login_required'],
    [200, '', { message: 'login_required' }, 'login_required'],
    [400, '', { require_login: true }, 'login_required'],
    [401, '', {}, 'login_required'],
    [400, '', { message: 'checkpoint_required' }, 'checkpoint'],
    [200, 'https://www.instagram.com/challenge/x/', null, 'checkpoint'],
    [400, '', { message: 'feedback_required' }, 'action_blocked'],
    [200, '', { spam: true }, 'action_blocked'],
  ])('%i %s %j → pausa %s', (status, url, body, reason) => {
    expect(classify(status, url, body)).toMatchObject({ ok: false, status: 'paused', reason });
  });

  it('errores sin pausa', () => {
    expect(classify(500, '', {})).toMatchObject({ status: 'error', message: 'Instagram respondió 500' });
    expect(classify(200, '', { status: 'fail', message: 'algo' })).toMatchObject({ status: 'error', message: 'algo' });
    expect(classify(200, '', { errors: [{ message: 'doc_id inválido' }] })).toMatchObject({ status: 'error', message: 'doc_id inválido' });
  });

  it('respuesta válida → null', () => {
    expect(classify(200, '', { data: {} })).toBeNull();
    expect(classify(200, '', { data: {}, errors: [{ message: 'parcial' }] })).toBeNull();
  });
});

describe('client.graphql', () => {
  it('envía la consulta como la web de Instagram', async () => {
    const f = fakeFetch(() => reply(fixtures.profile));
    const res = await client(f.fetch).graphql('profile', { id: '1' });
    expect(res.ok).toBe(true);
    const call = f.calls[0]!;
    expect(call.path).toBe('/graphql/query');
    expect(call.friendly).toBe('PolarisProfilePageContentQuery');
    expect(call.headers).toMatchObject({ 'x-ig-app-id': '936619743392459', 'x-fb-lsd': 'lsd-tok', 'x-csrftoken': 'csrf-tok' });
  });

  it('un 429 devuelve pausa, no un error ni una excepción', async () => {
    const f = fakeFetch(() => reply({ message: 'Please wait a few minutes before you try again.', status: 'fail' }, 429));
    await expect(client(f.fetch).graphql('timeline', {})).resolves.toMatchObject({ ok: false, status: 'paused', reason: 'rate_limit', httpStatus: 429 });
  });

  it('HTML en lugar de JSON → sesión cerrada', async () => {
    const f = fakeFetch(() => reply('<html>login</html>'));
    await expect(client(f.fetch).graphql('timeline', {})).resolves.toMatchObject({ status: 'paused', reason: 'login_required' });
  });

  it('texto que no es JSON ni HTML → error', async () => {
    const f = fakeFetch(() => reply('for (;;);'));
    await expect(client(f.fetch).graphql('timeline', {})).resolves.toMatchObject({ status: 'error' });
  });

  it('sin conexión → error, no excepción', async () => {
    const f = fakeFetch(() => new Error('offline'));
    await expect(client(f.fetch).graphql('timeline', {})).resolves.toMatchObject({ status: 'error', httpStatus: 0 });
  });

  it('si la página no tiene tokens, los busca en el inicio; si tampoco, error claro', async () => {
    const f = fakeFetch((path) => (path === '/' ? reply(PAGE_HTML, 200, 'https://www.instagram.com/') : reply(fixtures.profile)));
    const c = client(f.fetch, '<html></html>');
    expect((await c.graphql('profile', {})).ok).toBe(true);
    expect((await c.graphql('profile', {})).ok).toBe(true);
    expect(f.calls.filter((x) => x.path === '/')).toHaveLength(1); // tokens en caché

    const g = fakeFetch(() => reply('<html></html>', 200, 'https://www.instagram.com/'));
    await expect(client(g.fetch, '').getTokens()).resolves.toMatchObject({ status: 'error' });
    const h = fakeFetch(() => reply('', 200, 'https://www.instagram.com/accounts/login/'));
    await expect(client(h.fetch, '').getTokens()).resolves.toMatchObject({ status: 'paused', reason: 'login_required' });
  });

  it('acepta doc_id alternativos y funciona sin csrf ni fb_dtsg', async () => {
    const f = fakeFetch(() => reply(fixtures.profile));
    const c = createClient({ fetch: f.fetch, getCsrfToken: () => null, getDocumentHtml: () => '{"lsd":"x"}', docIds: { profile: '999' } });
    await c.graphql('profile', {});
    expect(f.calls[0]!.headers['x-csrftoken']).toBeUndefined();
  });
});

describe('client.html', () => {
  it('404 → error; 429 → pausa; ok → texto', async () => {
    const f = fakeFetch((path) => (path === '/nadie/' ? reply('no', 404) : path === '/lento/' ? reply('x', 429) : reply('<html>ok</html>')));
    const c = client(f.fetch);
    await expect(c.html('/nadie/')).resolves.toMatchObject({ status: 'error', httpStatus: 404 });
    await expect(c.html('/lento/')).resolves.toMatchObject({ status: 'paused', reason: 'rate_limit' });
    await expect(c.html('/ok/')).resolves.toEqual({ ok: true, data: '<html>ok</html>' });
    const g = fakeFetch(() => new Error('offline'));
    await expect(client(g.fetch).html('/x/')).resolves.toMatchObject({ status: 'error', httpStatus: 0 });
  });
});
