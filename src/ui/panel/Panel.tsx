// Panel lateral de un perfil (design.md §6.2): cabecera con estado y filtros, y 4 pestañas.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { PanelData } from '../../db/views';
import type { Controller } from '../controller';
import { toWorker } from '../controller';
import type { Store } from '../store';
import { agoText, compact, jobText } from '../format';
import { applyFilters, summarize, type RangeKey, type TypeKey } from './analytics';
import { Segmented } from './parts';
import { SummaryTab } from './SummaryTab';
import { ContentTab } from './ContentTab';
import { TimeTab } from './TimeTab';
import { WordsTab } from './WordsTab';

type Tab = 'summary' | 'content' | 'time' | 'words';
const TABS: { value: Tab; label: string }[] = [
  { value: 'summary', label: 'Resumen' },
  { value: 'content', label: 'Contenido' },
  { value: 'time', label: 'Tiempo' },
  { value: 'words', label: 'Palabras' },
];
const RANGES: { value: RangeKey; label: string }[] = [
  { value: '30d', label: '30 d' },
  { value: '90d', label: '90 d' },
  { value: '1y', label: '1 año' },
  { value: 'all', label: 'Todo' },
];
const TYPES: { value: TypeKey; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'reel', label: 'Reels' },
  { value: 'post', label: 'Posts' },
];

const nf = new Intl.NumberFormat('es-CO');

export function Panel({ store, controller }: { store: Store; controller: Controller }) {
  const state = useSyncExternalStore(store.subscribe, store.get);
  const { username, view, theme } = state;
  const [data, setData] = useState<PanelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('summary');
  const [range, setRange] = useState<RangeKey>('all');
  const [type, setType] = useState<TypeKey>('all');
  const lastScanAt = view?.summary?.lastScanAt ?? null;

  // Carga (y recarga al terminar un escaneo nuevo).
  useEffect(() => {
    if (!username) return;
    let alive = true;
    setError(null);
    toWorker<PanelData>({ type: 'view/panel', username }).then(
      (d) => alive && setData(d),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [username, lastScanAt]);

  const now = useMemo(() => Date.now(), [data]);
  const filtered = useMemo(() => (data ? applyFilters(data.posts, { range, type, now }) : []), [data, range, type, now]);
  const summary = useMemo(() => summarize(filtered, { range, now }), [filtered, range, now]);

  // Meta del panel: abre en < 1 s. Se mide hasta el primer frame con datos.
  useEffect(() => {
    if (data) requestAnimationFrame(() => controller.onPanelRendered(data.posts.length));
  }, [data, controller]);

  const job = view?.job ?? null;
  const active = job && ['queued', 'running', 'paused'].includes(job.status);
  const profile = data?.profile ?? null;

  return (
    <aside
      data-testid="radar-panel"
      data-theme={theme}
      className="radar-panel fixed top-0 right-0 z-[2147483647] flex h-screen w-[440px] max-w-[100vw] flex-col border-l border-[var(--p-border)] bg-[var(--p-bg)] font-sans text-[13px] text-[var(--p-text)] shadow-2xl"
    >
      <header className="flex flex-col gap-[8px] border-b border-[var(--p-border)] p-[12px]">
        <div className="flex items-center gap-[10px]">
          <div className="flex size-[36px] shrink-0 items-center justify-center rounded-full bg-radar-accent text-[15px] font-bold text-radar-bg">
            {(username ?? '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">@{username}</div>
            <div className="text-[11px] text-[var(--p-muted)]">
              {profile?.followers != null ? `${compact(profile.followers)} seguidores · ` : ''}
              {active ? jobText(job) : profile ? `${profile.complete ? 'completo' : 'parcial'} · actualizado ${agoText(profile.lastScanAt)}` : 'sin escanear'}
            </div>
          </div>
          <button
            type="button"
            title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            onClick={() => void controller.setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="cursor-pointer rounded-full px-[8px] py-[4px] text-[14px] hover:bg-[var(--p-border)]"
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <button type="button" title="Cerrar" onClick={() => controller.setPanelOpen(false)} className="cursor-pointer rounded-full px-[8px] py-[4px] text-[16px] hover:bg-[var(--p-border)]">
            ✕
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-[6px]">
          <Segmented value={range} options={RANGES} onChange={setRange} />
          <Segmented value={type} options={TYPES} onChange={setType} />
          {!active && (
            <button
              type="button"
              onClick={() => void controller.scan()}
              className="ml-auto cursor-pointer rounded-full bg-radar-accent px-[10px] py-[4px] text-[11px] font-semibold text-radar-bg"
            >
              {profile ? 'Actualizar' : 'Escanear'}
            </button>
          )}
        </div>
        <nav className="flex gap-[4px]">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`flex-1 cursor-pointer rounded-[8px] py-[6px] text-[12px] font-semibold ${tab === t.value ? 'bg-[var(--p-surface)] text-[var(--p-text)] shadow' : 'text-[var(--p-muted)] hover:text-[var(--p-text)]'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto p-[12px]" data-testid="radar-panel-body">
        {error ? (
          <div className="text-[#F87171]">No se pudieron leer los datos: {error}</div>
        ) : !data ? (
          <div className="text-[var(--p-muted)]">Cargando…</div>
        ) : !profile ? (
          <div className="text-[var(--p-muted)]">Este perfil aún no se ha escaneado. Usa “Escanear” para empezar.</div>
        ) : (
          <>
            <div className="mb-[10px] text-[11px] text-[var(--p-muted)]">
              {nf.format(filtered.length)} de {nf.format(data.posts.length)} publicaciones en el rango
            </div>
            {tab === 'summary' && <SummaryTab summary={summary} />}
            {tab === 'content' && <ContentTab posts={filtered} />}
            {tab === 'time' && <TimeTab posts={filtered} theme={theme} />}
            {tab === 'words' && <WordsTab posts={filtered} />}
          </>
        )}
      </div>
    </aside>
  );
}
