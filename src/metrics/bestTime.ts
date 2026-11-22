import { median } from './stats';

export interface TimedEntry {
  takenAt: number;
  multiplier: number | null;
}

export interface TimeSlot {
  /** 0 = lunes … 6 = domingo. */
  day: number;
  /** 0–23 en la zona horaria pedida. */
  hour: number;
  count: number;
  medianMultiplier: number;
}

export interface BestTimeResult {
  sampleSize: number;
  /** false si hay menos de `minPosts`: se muestra el aviso y no se recomiendan franjas. */
  enough: boolean;
  cells: TimeSlot[];
  top: TimeSlot[];
}

export interface BestTimeOptions {
  timeZone?: string;
  minPosts?: number;
  minPerSlot?: number;
  top?: number;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const formatters = new Map<string, Intl.DateTimeFormat>();

/** Día (0 = lunes) y hora local de un instante en la zona horaria dada. */
export function localDayHour(ms: number, timeZone: string): { day: number; hour: number } {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
    formatters.set(timeZone, fmt);
  }
  const parts = fmt.formatToParts(new Date(ms));
  const weekday = parts.find((p) => p.type === 'weekday')!.value;
  const hour = Number(parts.find((p) => p.type === 'hour')!.value);
  return { day: WEEKDAYS.indexOf(weekday), hour };
}

/** Mapa día × hora con el multiplicador mediano por franja. Requiere ≥ 30 posts con multiplicador. */
export function bestTime(entries: readonly TimedEntry[], options: BestTimeOptions = {}): BestTimeResult {
  const { timeZone = 'America/Bogota', minPosts = 30, minPerSlot = 2, top = 3 } = options;
  const buckets = new Map<string, { day: number; hour: number; values: number[] }>();
  let sampleSize = 0;

  for (const e of entries) {
    if (e.multiplier === null) continue;
    sampleSize++;
    const { day, hour } = localDayHour(e.takenAt, timeZone);
    const key = `${day}-${hour}`;
    const bucket = buckets.get(key) ?? { day, hour, values: [] };
    bucket.values.push(e.multiplier);
    buckets.set(key, bucket);
  }

  const cells: TimeSlot[] = [...buckets.values()]
    .map((b) => ({ day: b.day, hour: b.hour, count: b.values.length, medianMultiplier: median(b.values)! }))
    .sort((a, b) => a.day - b.day || a.hour - b.hour);

  const enough = sampleSize >= minPosts;
  const best = enough
    ? cells
        .filter((c) => c.count >= minPerSlot)
        .sort((a, b) => b.medianMultiplier - a.medianMultiplier || b.count - a.count)
        .slice(0, top)
    : [];

  return { sampleSize, enough, cells, top: best };
}
