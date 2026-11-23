// Mensajes entre service worker, content script y Centro (architecture.md §4.2).
import type { IgProfile } from '../ig/types';
import type { ProfileRow, ScanJobRow, ScanMode, ScanRange } from '../db/schema';

/** Service worker → content script: una petición a Instagram. */
export type FetchRequest =
  | { type: 'scan/fetch'; kind: 'profile'; username: string }
  | { type: 'scan/fetch'; kind: 'timeline' | 'reels'; profile: IgProfile; cursor: string | null }
  | { type: 'radar/ping' };

/** Content script, panel o Centro → service worker. */
export type WorkerRequest =
  | { type: 'scan/enqueue'; username: string; mode?: ScanMode; range?: ScanRange | null }
  | { type: 'scan/jobs' }
  | { type: 'scan/pause' | 'scan/resume' | 'scan/cancel'; id?: number }
  | { type: 'db/profile'; username: string }
  /** Datos para pintar un perfil (etiquetas y chip). */
  | { type: 'view/profile'; username: string }
  /** Todos los posts de un perfil con su métrica, para el panel lateral. */
  | { type: 'view/panel'; username: string }
  /** La pestaña que envía el mensaje muestra este perfil (o ninguno): contador del icono por pestaña. */
  | { type: 'tab/profile'; username: string | null }
  /** Posts y métricas de un perfil (verificación M9 y, más adelante, exportación). */
  | { type: 'db/export'; username: string };

export interface StoredProfile {
  profile: ProfileRow | null;
  posts: number;
  reelsWithViews: number;
  metrics: number;
  snapshots: number;
}

/** Service worker → pestañas de Instagram: avance del escaneo. */
export interface ProgressMessage {
  type: 'scan/progress';
  job: ScanJobRow;
}

export const isFetchRequest = (m: unknown): m is FetchRequest =>
  typeof m === 'object' && m !== null && ((m as { type?: string }).type === 'scan/fetch' || (m as { type?: string }).type === 'radar/ping');
