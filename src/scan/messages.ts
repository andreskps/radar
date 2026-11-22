// Mensajes entre service worker, content script y Centro (architecture.md §4.2).
import type { IgProfile } from '../ig/types';
import type { ProfileRow, ScanJobRow, ScanMode } from '../db/schema';

/** Service worker → content script: una petición a Instagram. */
export type FetchRequest =
  | { type: 'scan/fetch'; kind: 'profile'; username: string }
  | { type: 'scan/fetch'; kind: 'timeline' | 'reels'; profile: IgProfile; cursor: string | null }
  | { type: 'radar/ping' };

/** Content script, panel o Centro → service worker. */
export type WorkerRequest =
  | { type: 'scan/enqueue'; username: string; mode?: ScanMode }
  | { type: 'scan/jobs' }
  | { type: 'scan/pause' | 'scan/resume' | 'scan/cancel'; id?: number }
  | { type: 'db/profile'; username: string };

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
