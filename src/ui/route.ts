// Qué perfil y qué post hay en una URL de Instagram. Funciones puras.

/** Primeros segmentos de ruta que no son perfiles. */
const RESERVED = new Set([
  'explore', 'reels', 'reel', 'p', 'tv', 'stories', 'direct', 'accounts', 'about', 'legal', 'developer', 'web',
  'challenge', 'emails', 'session', 'privacy', 'terms', 'directory', 'lite', 'ar', 'create', 'graphql', 'api', 'static', 'oauth', 'nametag', 'invites',
]);

const USERNAME = /^[a-z0-9._]{1,30}$/;

/** Usuario del perfil abierto (`/usuario/`, `/usuario/reels/`, `/usuario/reel/CODE/`…), o `null`. */
export function profileFromPath(pathname: string): string | null {
  const first = pathname.split('/').filter(Boolean)[0]?.toLowerCase();
  if (!first || RESERVED.has(first) || !USERNAME.test(first)) return null;
  return first;
}

/** Código del post en un enlace (`/p/CODE/`, `/reel/CODE/`, `/usuario/reel/CODE/`). */
export function codeFromHref(href: string): string | null {
  const m = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})/.exec(href);
  return m ? m[1]! : null;
}
