// Selector de rango del escaneo (chip del perfil): qué eligió el usuario → ScanRange.
import type { ScanRange } from '../db/schema';

/** new: lo nuevo (escaneo de siempre) · all: todo · days: últimos N días · dates: entre fechas. */
export type RangeChoice = 'new' | 'all' | 'days' | 'dates';

export interface RangeForm {
  choice: RangeChoice;
  /** Texto del campo de días. */
  days: string;
  /** 'AAAA-MM-DD' de los campos de fecha. */
  from: string;
  to: string;
}

export const MAX_DAYS = 3650;

/** 'AAAA-MM-DD' en hora local; `end` = último milisegundo de ese día. */
export function dayMs(value: string, end: boolean): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getMonth() !== Number(m[2]) - 1) return null;
  if (end) d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** 'AAAA-MM-DD' de una fecha en hora local (para los campos de fecha). */
export function dayValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type RangeResult = { ok: true; range: ScanRange | null } | { ok: false; error: string };

/** Valida el formulario. `range: null` = escaneo de siempre. */
export function formRange(form: RangeForm, now = Date.now()): RangeResult {
  switch (form.choice) {
    case 'new':
      return { ok: true, range: null };
    case 'all':
      return { ok: true, range: { kind: 'all' } };
    case 'days': {
      const days = Number(form.days);
      if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) return { ok: false, error: `Escribe un número de días entre 1 y ${MAX_DAYS}` };
      return { ok: true, range: { kind: 'days', days } };
    }
    case 'dates': {
      const from = dayMs(form.from, false);
      const to = dayMs(form.to, true);
      if (from === null || to === null) return { ok: false, error: 'Elige las dos fechas' };
      if (from > to) return { ok: false, error: '"Desde" debe ser antes de "hasta"' };
      if (from > now) return { ok: false, error: '"Desde" no puede ser una fecha futura' };
      return { ok: true, range: { kind: 'dates', from, to } };
    }
  }
}

const df = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

/** Texto corto del rango para el chip. */
export function rangeText(range: ScanRange | null | undefined): string | null {
  if (!range) return null;
  if (range.kind === 'all') return 'todo';
  if (range.kind === 'days') return `últimos ${range.days} días`;
  return `${df.format(range.from)} – ${df.format(range.to)}`;
}
