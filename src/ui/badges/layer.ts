// Pone y quita las etiquetas de las miniaturas de la cuadrícula. Instagram recicla y agrega
// miniaturas al hacer scroll o al cambiar de perfil sin recargar: un MutationObserver
// (agrupado por frame) vuelve a pasar cada vez.
import type { Store } from '../store';
import { codeFromHref } from '../route';
import { BADGE_TAG, createBadgeHost, updateBadge, type BadgeHost } from './badge';

const LINKS = 'main a[href*="/p/"], main a[href*="/reel/"]';

/** Una pasada: devuelve cuántas etiquetas quedaron pintadas. */
export function syncBadges(store: Store, doc: Document = document): number {
  const { view, badgesVisible, username } = store.get();
  const posts = view && view.username === username ? view.posts : null;
  let painted = 0;
  for (const a of doc.querySelectorAll<HTMLAnchorElement>(LINKS)) {
    const code = codeFromHref(a.getAttribute('href') ?? '');
    let host = a.querySelector<BadgeHost>(`:scope > ${BADGE_TAG}`);
    const post = code && posts ? posts[code] : undefined;
    if (!post || !badgesVisible) {
      host?.remove();
      continue;
    }
    if (!host) {
      host = createBadgeHost(doc);
      a.append(host);
    }
    updateBadge(host, post);
    painted++;
  }
  return painted;
}

export function removeAllBadges(doc: Document = document) {
  for (const el of doc.querySelectorAll(BADGE_TAG)) el.remove();
}

export function startBadgeLayer(store: Store, onPainted?: (count: number) => void) {
  let scheduled = false;
  const run = () => {
    scheduled = false;
    const n = syncBadges(store);
    onPainted?.(n);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  };
  const observer = new MutationObserver((records) => {
    // Ignorar los cambios que hacemos nosotros mismos.
    if (records.every((r) => [...r.addedNodes, ...r.removedNodes].every((n) => (n as Element).tagName?.toLowerCase() === BADGE_TAG))) return;
    schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const unsubscribe = store.subscribe(schedule);
  schedule();
  return () => {
    observer.disconnect();
    unsubscribe();
    removeAllBadges();
  };
}
