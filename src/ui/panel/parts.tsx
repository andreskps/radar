// Piezas comunes del panel. Colores por variables CSS (.radar-panel en theme.css) para modo claro/oscuro.
import type { ReactNode } from 'react';
import { TIER_STYLES } from '../format';
import { MIN_SAMPLE, type Stat, type TierBucket } from './analytics';

export const BUCKET_STYLE: Record<TierBucket, { label: string; color: string; icon: string }> = {
  ...(Object.fromEntries(Object.entries(TIER_STYLES).map(([k, s]) => [k, { label: s.label, color: s.color, icon: s.icon }])) as Record<
    Exclude<TierBucket, 'en_curso' | 'sin_datos'>,
    { label: string; color: string; icon: string }
  >),
  en_curso: { label: 'En curso', color: '#6B7280', icon: '⏳' },
  sin_datos: { label: 'Sin datos', color: '#4B5563', icon: '·' },
};

export function Card({ title, children, note }: { title?: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="rounded-[12px] border border-[var(--p-border)] bg-[var(--p-surface)] p-[12px]">
      {title && <h3 className="mb-[8px] text-[12px] font-semibold text-[var(--p-muted)]">{title}</h3>}
      {children}
      {note && <div className="mt-[8px] text-[11px] text-[var(--p-muted)]">{note}</div>}
    </section>
  );
}

/** Tamaño de muestra y aviso de confianza, en cada estadística (design.md §4). */
export function SampleNote({ n, unit = 'posts', min = MIN_SAMPLE }: { n: number; unit?: string; min?: number }) {
  return (
    <span className={n < min ? 'text-[#F59E0B]' : ''}>
      n = {n.toLocaleString('es-CO')} {unit}
      {n < min ? ' · pocos datos, tómalo con cuidado' : ''}
    </span>
  );
}

export function StatCard({ label, stat, format, unit }: { label: string; stat: Stat; format: (v: number) => string; unit?: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--p-border)] bg-[var(--p-surface)] p-[10px]">
      <div className="text-[11px] text-[var(--p-muted)]">{label}</div>
      <div className="mt-[2px] text-[20px] font-bold tabular-nums">{stat.value === null ? '—' : format(stat.value)}</div>
      <div className="mt-[2px] text-[10px] text-[var(--p-muted)]">
        <SampleNote n={stat.n} unit={unit} />
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-full border border-[var(--p-border)] p-[2px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`cursor-pointer rounded-full px-[8px] py-[3px] text-[11px] font-semibold ${value === o.value ? 'bg-radar-accent text-radar-bg' : 'text-[var(--p-muted)] hover:text-[var(--p-text)]'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pill({ bucket, text }: { bucket: TierBucket; text?: string }) {
  const s = BUCKET_STYLE[bucket];
  const solid = bucket === 'mega_viral' || bucket === 'viral' || bucket === 'despego';
  return (
    <span
      className="inline-flex items-center gap-[3px] rounded-full px-[7px] py-[2px] text-[11px] font-bold whitespace-nowrap tabular-nums"
      style={solid ? { background: s.color, color: '#fff' } : { border: `1px solid ${s.color}`, color: s.color }}
    >
      {s.icon} {text ?? s.label}
    </span>
  );
}

export const igUrl = (code: string, type: string) => `https://www.instagram.com/${type === 'reel' ? 'reel' : 'p'}/${code}/`;
