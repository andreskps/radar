// Chip del perfil (design.md §6.1): estado del escaneo, botón "Escanear con Radar" / "Actualizar"
// e interruptor de etiquetas. Fuera de un perfil queda como un punto discreto.
// Se usan px (no rem) para que el tamaño no dependa del font-size de Instagram.
import { useState, useSyncExternalStore } from 'react';
import type { Controller } from '@/ui/controller';
import type { Store } from '@/ui/store';
import { agoText, compact, jobText } from '@/ui/format';
import { dayValue, formRange, MAX_DAYS, rangeText, type RangeChoice, type RangeForm } from '@/ui/range';

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

const field = 'rounded-[8px] bg-white/10 px-[6px] py-[3px] text-[11px] text-radar-text outline-none focus:bg-white/20';

/** Rango del escaneo: lo nuevo, todo, últimos N días o entre fechas. */
function RangePicker({ form, onChange, scanned }: { form: RangeForm; onChange: (f: RangeForm) => void; scanned: boolean }) {
  const set = (patch: Partial<RangeForm>) => onChange({ ...form, ...patch });
  return (
    <div className="flex flex-wrap items-center gap-[6px] text-[11px] text-radar-text/80" data-testid="radar-range">
      <select
        aria-label="Qué escanear"
        className={`${field} cursor-pointer`}
        style={{ colorScheme: 'dark' }}
        value={form.choice}
        onChange={(e) => set({ choice: e.target.value as RangeChoice })}
      >
        {scanned && <option value="new">Lo nuevo</option>}
        <option value="all">Todo</option>
        <option value="days">Últimos días</option>
        <option value="dates">Entre fechas</option>
      </select>
      {form.choice === 'days' && (
        <label className="flex items-center gap-[4px]">
          <input
            aria-label="Días"
            type="number"
            min={1}
            max={MAX_DAYS}
            className={`${field} w-[56px]`}
            value={form.days}
            onChange={(e) => set({ days: e.target.value })}
          />
          días
        </label>
      )}
      {form.choice === 'dates' && (
        <>
          <input aria-label="Desde" type="date" className={field} style={{ colorScheme: 'dark' }} value={form.from} onChange={(e) => set({ from: e.target.value })} />
          <span>a</span>
          <input aria-label="Hasta" type="date" className={field} style={{ colorScheme: 'dark' }} value={form.to} onChange={(e) => set({ to: e.target.value })} />
        </>
      )}
    </div>
  );
}

export function ProfileChip({ store, controller }: { store: Store; controller: Controller }) {
  const state = useSyncExternalStore(store.subscribe, store.get);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<RangeForm | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
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

  // Por defecto: todo la primera vez, lo nuevo después.
  const today = Date.now();
  const rangeForm: RangeForm = form ?? { choice: summary ? 'new' : 'all', days: '30', from: dayValue(today - 30 * 86_400_000), to: dayValue(today) };
  const scan = () => {
    const res = formRange(rangeForm);
    if (!res.ok) {
      setRangeError(res.error);
      return;
    }
    setRangeError(null);
    act(() => controller.scan('auto', res.range))();
  };
  const scanLabel = busy ? 'Agregando…' : summary ? 'Actualizar' : 'Escanear con Radar';

  let line: string;
  if (!view) line = 'Cargando…';
  else if (active) line = [jobText(job), rangeText(job.range)].filter(Boolean).join(' · ');
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
      {!active && view && (
        <RangePicker
          form={rangeForm}
          scanned={!!summary}
          onChange={(f) => {
            setForm(f);
            setRangeError(null);
          }}
        />
      )}
      {rangeError && <div className="text-[11px] text-red-300">{rangeError}</div>}
      <div className="flex flex-wrap items-center gap-[6px]">
        {!active && (
          <Button primary={!summary} onClick={scan}>
            {scanLabel}
          </Button>
        )}
        {job?.status === 'running' || job?.status === 'queued' ? <Button onClick={act(() => controller.pause())}>Pausar</Button> : null}
        {job?.status === 'paused' && (job.pauseReason === 'user' || job.resumeAt === null) ? (
          <Button primary onClick={act(() => controller.resume())}>
            Reanudar
          </Button>
        ) : null}
        {summary && (
          <Button primary onClick={() => controller.setPanelOpen(!state.panelOpen)}>
            {state.panelOpen ? 'Cerrar panel' : 'Abrir panel'}
          </Button>
        )}
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
