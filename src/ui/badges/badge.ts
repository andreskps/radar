// Etiqueta sobre una miniatura. Vive en su propio Shadow Root para que ni Instagram cambie
// su estilo ni ella cambie el de Instagram (RNF-04). Se posiciona en absoluto: no mueve nada.
// (En el contexto aislado del content script no hay customElements: se usa un elemento con
// nombre propio y attachShadow, que no necesita registro.)
import type { BadgePost } from '../../db/views';
import { badgeModel, type BadgeModel } from '../format';

export const BADGE_TAG = 'radar-badge';

const CSS = `
:host { all: initial; }
.b { font: 600 11px/1.2 Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; color: #E8EAF0; display: flex; flex-direction: column; align-items: flex-start; gap: 3px; }
.main { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
.main.solid { color: #fff; }
.main.soft { background: rgba(18,20,26,.82); border: 1px solid var(--c); color: var(--c); }
.main.kind-en_curso { background-image: repeating-linear-gradient(135deg, rgba(156,163,175,.18) 0 6px, transparent 6px 12px), linear-gradient(rgba(18,20,26,.82), rgba(18,20,26,.82)); }
.chips { display: flex; flex-wrap: wrap; gap: 3px; max-width: 180px; }
.chip { padding: 2px 6px; border-radius: 999px; background: rgba(18,20,26,.72); font-size: 10px; font-weight: 600; white-space: nowrap; }
.chip.gem { color: #22D3EE; border: 1px solid #22D3EE; }
.tip { display: none; margin-top: 2px; padding: 8px 10px; border-radius: 8px; background: rgba(18,20,26,.95); font-size: 11px; font-weight: 500; line-height: 1.45; width: max-content; max-width: 190px; box-shadow: 0 4px 14px rgba(0,0,0,.45); }
.tip div:first-child { font-weight: 700; }
:host(:hover) .tip { display: block; }
`;

export interface BadgeHost extends HTMLElement {
  radarKey?: string;
}

const keyOf = (p: BadgePost) => JSON.stringify([p.multiplier, p.tier, p.maturity, p.confidence, p.er, p.hiddenGem, p.views, p.likes, p.comments]);

function render(root: ShadowRoot, m: BadgeModel) {
  const doc = root.ownerDocument;
  const wrap = doc.createElement('div');
  wrap.className = 'b';
  const main = doc.createElement('span');
  main.className = `main ${m.solid ? 'solid' : 'soft'} kind-${m.kind}`;
  main.style.setProperty('--c', m.color);
  if (m.solid) main.style.background = m.color;
  main.textContent = m.main;
  wrap.append(main);
  if (m.chips.length) {
    const chips = doc.createElement('div');
    chips.className = 'chips';
    for (const c of m.chips) {
      const s = doc.createElement('span');
      s.className = c.startsWith('💎') ? 'chip gem' : 'chip';
      s.textContent = c;
      chips.append(s);
    }
    wrap.append(chips);
  }
  const tip = doc.createElement('div');
  tip.className = 'tip';
  for (const line of m.details) {
    const d = doc.createElement('div');
    d.textContent = line;
    tip.append(d);
  }
  wrap.append(tip);
  const style = doc.createElement('style');
  style.textContent = CSS;
  root.replaceChildren(style, wrap);
}

export function createBadgeHost(doc: Document = document): BadgeHost {
  const host = doc.createElement(BADGE_TAG) as BadgeHost;
  host.setAttribute('data-radar', '');
  // Solo estilos del propio elemento: absoluto en la esquina, sin afectar el layout de Instagram.
  host.style.cssText = 'position:absolute;top:8px;left:8px;z-index:3;display:block;pointer-events:auto;';
  host.attachShadow({ mode: 'open' });
  return host;
}

/** Pinta (o repinta si cambió) la etiqueta de un post. */
export function updateBadge(host: BadgeHost, post: BadgePost) {
  const key = keyOf(post);
  if (host.radarKey === key) return;
  host.radarKey = key;
  render(host.shadowRoot!, badgeModel(post));
}
