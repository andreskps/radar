// Chip del perfil (design.md §6.1): estado del escaneo, botón "Escanear con Radar" / "Actualizar"
// e interruptor de etiquetas. Fuera de un perfil queda como un punto discreto.
// Se usan px (no rem) para que el tamaño no dependa del font-size de Instagram.
import { useState, useSyncExternalStore } from 'react';
import type { Controller } from '@/ui/controller';
import type { Store } from '@/ui/store';
import { agoText, compact, jobText } from '@/ui/format';

const nf = new Intl.NumberFormat('es-CO');

function Button({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-full px-[10px] py-[4px] text-[11px] font-semibold ${primary ? 'bg-radar-accent text-radar-bg' : 'bg-white/10 text-radar-text hover:bg-white/20'}`}
    >
      {children}
    </button>
  );
}

export function ProfileChip({ store, controller }: { store: Store; controller: Controller }) {
  const state = useSyncExternalStore(store.subscribe, store.get);
  const [busy, setBusy] = useState(false);
  const act = (fn: () => Promise<void>) => () => {
    setBusy(true);
    fn().finally(() => setBusy(false));
  };

  const shell = 'fixed right-[16px] bottom-[16px] z-[2147483647] font-sans text-radar-text shadow-lg';

  if (!state.username) {
    return (
      <div data-testid="radar-status" className={`${shell} flex items-center gap-[8px] rounded-full bg-radar-surface px-[12px] py-[6px] text-[12px] font-semibold`}>
        <span className="size-[8px] rounded-full bg-radar-accent" />
        Radar activo
      </div>
    );
  }

  const { view } = state;
  const job = view?.job ?? null;
  const summary = view?.summary ?? null;
  const active = job && ['queued', 'running', 'paused'].includes(job.status);

  let line: string;
  if (!view) line = 'Cargando…';
  else if (active) line = jobText(job);
  else if (summary)
    line = `${nf.format(summary.posts)} posts · mediana ${compact(summary.medianReelViews)} (últimos ${summary.medianSample} reels) · ${summary.virals} virales`;
  else if (job?.status === 'error') line = jobText(job);
  else line = 'Sin escanear';

  return (
    <div data-testid="radar-chip" className={`${shell} flex max-w-[360px] flex-col gap-[6px] rounded-[14px] bg-radar-surface px-[12px] py-[10px] text-[12px]`}>
      <div className="flex items-center gap-[8px] font-semibold">
        <span className={`size-[8px] shrink-0 rounded-full ${active ? 'animate-pulse bg-radar-accent' : 'bg-radar-accent'}`} />
        <span>Radar · @{state.username}</span>
      </div>
      <div className="text-[12px] text-radar-text/85" data-testid="radar-chip-line">
        {line}
      </div>
      {summary && !active && <div className="text-[11px] text-radar-text/60">Actualizado {agoText(summary.lastScanAt)}</div>}
      <div className="flex flex-wrap items-center gap-[6px]">
        {!active && !summary && (
          <Button primary onClick={act(() => controller.scan())}>
            {busy ? 'Agregando…' : 'Escanear con Radar'}
          </Button>
        )}
        {!active && summary && <Button onClick={act(() => controller.scan())}>{busy ? 'Agregando…' : 'Actualizar'}</Button>}
        {job?.status === 'running' || job?.status === 'queued' ? <Button onClick={act(() => controller.pause())}>Pausar</Button> : null}
        {job?.status === 'paused' && (job.pauseReason === 'user' || job.resumeAt === null) ? (
          <Button primary onClick={act(() => controller.resume())}>
            Reanudar
          </Button>
        ) : null}
        {summary && (
          <label className="ml-auto flex cursor-pointer items-center gap-[6px] text-[11px] text-radar-text/80">
            <input
              type="checkbox"
              className="accent-[#c6f432]"
              checked={state.badgesVisible}
              onChange={(e) => void controller.setBadgesVisible(e.target.checked)}
            />
            Etiquetas
          </label>
        )}
      </div>
    </div>
  );
}
