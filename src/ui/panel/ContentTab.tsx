import { useMemo, useState } from 'react';
import type { PanelPost } from '../../db/views';
import { compact, multiplierText, percent } from '../format';
import { DEFAULT_QUERY, TIER_ORDER, bucketOf, queryContent, type ContentQuery, type SortKey } from './analytics';
import { BUCKET_STYLE, Pill, SampleNote, igUrl } from './parts';
import { Cover } from './SummaryTab';

const PAGE = 40;
const dateFmt = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: '2-digit' });

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'date', label: 'Fecha' },
  { value: 'multiplier', label: 'Multiplicador' },
  { value: 'views', label: 'Vistas' },
  { value: 'likes', label: 'Likes' },
  { value: 'comments', label: 'Comentarios' },
  { value: 'er', label: 'ER' },
];

const select = 'rounded-[8px] border border-[var(--p-border)] bg-[var(--p-surface)] px-[6px] py-[4px] text-[11px] text-[var(--p-text)]';

export function ContentTab({ posts }: { posts: PanelPost[] }) {
  const [q, setQ] = useState<ContentQuery>(DEFAULT_QUERY);
  const [shown, setShown] = useState(PAGE);
  const list = useMemo(() => queryContent(posts, q), [posts, q]);
  const set = (patch: Partial<ContentQuery>) => {
    setQ({ ...q, ...patch });
    setShown(PAGE);
  };

  return (
    <div className="flex flex-col gap-[8px]">
      <input
        type="search"
        placeholder="Buscar en el texto y los hashtags…"
        value={q.search}
        onChange={(e) => set({ search: e.target.value })}
        className="w-full rounded-[8px] border border-[var(--p-border)] bg-[var(--p-surface)] px-[10px] py-[6px] text-[12px] text-[var(--p-text)] outline-none focus:border-radar-accent"
      />
      <div className="flex flex-wrap items-center gap-[6px]">
        <select className={select} value={q.tier} onChange={(e) => set({ tier: e.target.value as ContentQuery['tier'] })} aria-label="Nivel">
          <option value="all">Todos los niveles</option>
          <option value="virales">Solo virales (≥ 2×)</option>
          {TIER_ORDER.map((t) => (
            <option key={t} value={t}>
              {BUCKET_STYLE[t].icon} {BUCKET_STYLE[t].label}
            </option>
          ))}
        </select>
        <select className={select} value={q.collab} onChange={(e) => set({ collab: e.target.value as ContentQuery['collab'] })} aria-label="Collab">
          <option value="all">Con y sin collab</option>
          <option value="yes">Solo collab</option>
          <option value="no">Sin collab</option>
        </select>
        <select className={select} value={q.sort} onChange={(e) => set({ sort: e.target.value as SortKey })} aria-label="Ordenar">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              Orden: {s.label}
            </option>
          ))}
        </select>
        <button type="button" className={`${select} cursor-pointer`} onClick={() => set({ desc: !q.desc })} title="Cambiar dirección">
          {q.desc ? '↓ Mayor primero' : '↑ Menor primero'}
        </button>
      </div>
      <div className="text-[11px] text-[var(--p-muted)]">
        <SampleNote n={list.length} /> de {posts.length.toLocaleString('es-CO')}
      </div>
      <div className="grid grid-cols-2 gap-[8px]" data-testid="radar-content-grid">
        {list.slice(0, shown).map((p) => (
          <ContentCard key={p.code} post={p} />
        ))}
      </div>
      {shown < list.length && (
        <button type="button" onClick={() => setShown(shown + PAGE)} className="cursor-pointer rounded-full bg-[var(--p-border)] py-[6px] text-[12px] font-semibold">
          Ver más ({(list.length - shown).toLocaleString('es-CO')} restantes)
        </button>
      )}
    </div>
  );
}

function ContentCard({ post: p }: { post: PanelPost }) {
  const b = bucketOf(p);
  return (
    <a href={igUrl(p.code, p.type)} target="_blank" rel="noreferrer" className="flex gap-[8px] rounded-[10px] border border-[var(--p-border)] bg-[var(--p-surface)] p-[6px] text-[var(--p-text)] no-underline">
      <Cover post={p} className="h-[84px] w-[63px] shrink-0" />
      <div className="flex min-w-0 flex-col gap-[3px] text-[11px]">
        <Pill bucket={b} text={b === 'en_curso' || b === 'sin_datos' ? undefined : multiplierText(p.multiplier)} />
        <span className="text-[var(--p-muted)]">
          {dateFmt.format(p.takenAt)} · {p.type === 'reel' ? 'Reel' : p.type === 'carousel' ? 'Carrusel' : 'Foto'}
          {p.collab ? ' · Collab' : ''}
          {p.hiddenGem ? ' · 💎' : ''}
        </span>
        <span className="tabular-nums">
          {p.type === 'reel' && `${compact(p.views)} vistas · `}
          {p.likesHidden ? 'likes ocultos' : `${compact(p.likes)} likes`} · {compact(p.comments)} com.
        </span>
        <span className="tabular-nums text-[var(--p-muted)]">ER {percent(p.er)}</span>
        {p.caption && <span className="line-clamp-2 text-[var(--p-muted)]">{p.caption}</span>}
      </div>
    </a>
  );
}
