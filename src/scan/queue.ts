// Cola de escaneo con ritmo seguro (architecture.md §5.1). Una sola petición a Instagram a la vez.
// Todo el estado vive en la tabla scanJobs: si el service worker muere, otra instancia de la cola
// retoma desde el último paso guardado.
import type { RadarDB, ScanJobRow, ScanMode } from '../db/schema';
import { needsRequest, newJob, runStep, type Fetcher } from './step';

export interface Pacing {
  pageMinMs: number;
  pageMaxMs: number;
  profileMinMs: number;
  profileMaxMs: number;
}

export const DEFAULT_PACING: Pacing = { pageMinMs: 2000, pageMaxMs: 4000, profileMinMs: 20_000, profileMaxMs: 40_000 };

export interface QueueDeps {
  db: RadarDB;
  fetcher: Fetcher;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  pacing?: Pacing;
  /** Despertar la cola a esa hora (chrome.alarms). `null` = no hay nada que esperar. */
  scheduleWake?: (at: number | null) => void;
  /** La cola está trabajando: mantener un vigía que la reanude si el service worker muere. */
  setBusy?: (busy: boolean) => void;
  onUpdate?: (job: ScanJobRow) => void;
}

const ACTIVE = ['queued', 'running', 'paused'] as const;

export class ScanQueue {
  private active: Promise<void> | null = null;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly pacing: Pacing;

  constructor(private readonly deps: QueueDeps) {
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = deps.random ?? Math.random;
    this.pacing = deps.pacing ?? DEFAULT_PACING;
  }

  get db() {
    return this.deps.db;
  }

  /** Agrega un perfil a la cola. Si ya está en la cola, devuelve ese trabajo. */
  async enqueue(username: string, mode: ScanMode = 'auto'): Promise<ScanJobRow> {
    const job = newJob(username, mode, this.now());
    const existing = await this.activeJobs();
    const same = existing.find((j) => j.username === job.username);
    if (same) return same;
    job.id = await this.db.scanJobs.add(job);
    return job;
  }

  /** Arranca la cola si no está corriendo. Devuelve la promesa de la corrida actual. */
  ensureRunning(): Promise<void> {
    this.active ??= this.run().finally(() => {
      this.active = null;
      this.deps.setBusy?.(false);
    });
    return this.active;
  }

  get running(): boolean {
    return this.active !== null;
  }

  /** Pausa del usuario: el paso en curso termina y se guarda, pero no sigue. */
  async pause(id?: number): Promise<void> {
    await this.updateActive(id, { status: 'paused', pauseReason: 'user', resumeAt: null, message: 'Pausado por el usuario' }, ['queued', 'running']);
  }

  /** Reanuda trabajos pausados (también los detenidos por sesión cerrada o verificación). */
  async resume(id?: number): Promise<void> {
    await this.updateActive(id, { status: 'queued', pauseReason: null, resumeAt: null, message: null, rateLimitHits: 0, errorRetries: 0 }, ['paused']);
  }

  async cancel(id?: number): Promise<void> {
    await this.updateActive(id, { status: 'cancelled', resumeAt: null, finishedAt: this.now() }, ACTIVE);
  }

  activeJobs(): Promise<ScanJobRow[]> {
    return this.db.scanJobs.where('status').anyOf([...ACTIVE]).sortBy('id');
  }

  private async updateActive(id: number | undefined, patch: Partial<ScanJobRow>, from: readonly ScanJobRow['status'][]) {
    const jobs = (await this.activeJobs()).filter((j) => from.includes(j.status) && (id === undefined || j.id === id));
    for (const j of jobs) {
      const updated = { ...j, ...patch, updatedAt: this.now() };
      await this.db.scanJobs.put(updated);
      this.deps.onUpdate?.(updated);
    }
  }

  /**
   * Guarda el resultado de un paso sin pisar una pausa o cancelación que el usuario
   * haya pedido mientras la petición estaba en curso.
   */
  private async commit(job: ScanJobRow): Promise<ScanJobRow> {
    return this.db.transaction('rw', this.db.scanJobs, async () => {
      const current = await this.db.scanJobs.get(job.id!);
      const stopped = current && (current.status === 'cancelled' || (current.status === 'paused' && current.pauseReason === 'user'));
      const final = stopped && job.status !== 'done' ? { ...job, status: current.status, pauseReason: current.pauseReason, resumeAt: null, message: current.message } : job;
      await this.db.scanJobs.put(final);
      return final;
    });
  }

  private pick(jobs: ScanJobRow[], now: number): { job?: ScanJobRow; wakeAt: number | null; blocked: boolean } {
    // Una pausa de Instagram (o de red) afecta a la cuenta, no a un perfil: frena toda la cola.
    const held = jobs.filter((j) => j.status === 'paused' && j.pauseReason !== 'user');
    if (held.some((j) => j.resumeAt === null)) return { wakeAt: null, blocked: true };
    const waiting = held.filter((j) => j.resumeAt! > now);
    if (waiting.length) return { wakeAt: Math.max(...waiting.map((j) => j.resumeAt!)), blocked: true };
    const ready = held[0] ?? jobs.find((j) => j.status === 'running') ?? jobs.find((j) => j.status === 'queued');
    return { job: ready, wakeAt: null, blocked: false };
  }

  private delay(min: number, max: number) {
    return this.sleep(min + this.random() * (max - min));
  }

  private async run(): Promise<void> {
    let requestsMade = 0;
    let lastJobId: number | undefined;
    for (;;) {
      const now = this.now();
      const { job, wakeAt } = this.pick(await this.activeJobs(), now);
      if (!job) {
        this.deps.scheduleWake?.(wakeAt);
        return;
      }
      this.deps.setBusy?.(true);
      this.deps.scheduleWake?.(null);

      // Ritmo: espera entre perfiles (al cambiar de trabajo) o entre páginas.
      if (needsRequest(job) && requestsMade > 0) {
        if (job.id !== lastJobId) await this.delay(this.pacing.profileMinMs, this.pacing.profileMaxMs);
        else await this.delay(this.pacing.pageMinMs, this.pacing.pageMaxMs);
        // El usuario pudo pausar o cancelar durante la espera.
        const fresh = await this.db.scanJobs.get(job.id!);
        if (!fresh || !['queued', 'running', 'paused'].includes(fresh.status) || (fresh.status === 'paused' && fresh.pauseReason === 'user')) continue;
      }
      lastJobId = job.id;

      const start: ScanJobRow = { ...job, status: 'running', pauseReason: null, resumeAt: null };
      const next = await runStep(this.db, start, this.deps.fetcher, this.now());
      if (needsRequest(job)) requestsMade++;
      const saved = await this.commit(next);
      this.deps.onUpdate?.(saved);
    }
  }
}
