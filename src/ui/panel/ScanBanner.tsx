// Franja de "escaneo sin terminar" en el panel: fase actual, avance y por qué los números aún cambian.
import type { ScanJobRow } from '../../db/schema';
import { compact, jobText } from '../format';

const STEPS = [
  { label: 'Posts', count: (j: ScanJobRow) => j.read },
  { label: 'Vistas de reels', count: (j: ScanJobRow) => j.reelsRead },
  { label: 'Cálculo', count: () => null },
] as const;

/** Paso actual (0–2). El perfil se lee antes del timeline y cuenta como el paso "Posts". */
export function stepIndex(job: ScanJobRow): number {
  if (job.phase === 'reels') return 1;
  if (job.phase === 'finalize') return 2;
  return 0;
}

export function isScanActive(job: ScanJobRow | null): job is ScanJobRow {
  return job !== null && ['queued', 'running', 'paused'].includes(job.status);
}

const AMBER = '#F59E0B';

export function ScanBanner({ job }: { job: ScanJobRow }) {
  const current = job.status === 'queued' ? -1 : stepIndex(job);
  const paused = job.status === 'paused';
  const color = paused ? AMBER : 'var(--color-radar-accent)';
  const title = job.status === 'queued' ? 'Escaneo en cola' : paused ? jobText(job) : 'Escaneo sin terminar';
  const note =
    current <= 0
      ? 'Los reels salen como “Sin datos” hasta leer sus vistas en el paso 2. Los niveles y el Top van a cambiar.'
      : current === 1
        ? 'Leyendo vistas: los reels pasan de “Sin datos” a su nivel cuando termine.'
        : 'Calculando niveles. El panel se actualiza solo al terminar.';

  return (
    <section
      data-testid="radar-scan-banner"
      data-status={job.status}
      className="mb-[10px] rounded-[12px] border p-[10px]"
      style={{ borderColor: color, background: `color-mix(in srgb, ${color} 8%, var(--p-surface))` }}
    >
      <div className="flex items-center gap-[8px] text-[12px] font-semibold">
        <span className={`size-[8px] shrink-0 rounded-full ${paused ? '' : 'animate-pulse'}`} style={{ background: color }} />
        <span className="truncate">{title}</span>
      </div>

      <div className="mt-[8px] h-[4px] overflow-hidden rounded-full bg-[var(--p-border)]">
        {paused ? (
          <div className="h-full rounded-full" style={{ width: `${((Math.max(current, 0) + 0.5) / STEPS.length) * 100}%`, background: color }} />
        ) : (
          <div className="animate-radar-scan h-full w-1/3 rounded-full" style={{ background: color }} />
        )}
      </div>

      <ol className="mt-[8px] flex gap-[4px] text-[11px]">
        {STEPS.map((s, i) => {
          const done = i < current;
          const now = i === current;
          const n = s.count(job);
          return (
            <li key={s.label} className={`flex flex-1 items-center gap-[4px] ${done || now ? 'text-[var(--p-text)]' : 'text-[var(--p-muted)]'}`}>
              <span
                className="flex size-[16px] shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                style={done ? { background: color, color: '#12141a' } : now ? { border: `1.5px solid ${color}`, color } : { border: '1.5px solid var(--p-border)' }}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className={`truncate ${now ? 'font-semibold' : ''}`}>
                {s.label}
                {n !== null && (done || now) && <span className="tabular-nums text-[var(--p-muted)]"> · {compact(n)}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-[6px] text-[11px] text-[var(--p-muted)]">{note}</div>
    </section>
  );
}
