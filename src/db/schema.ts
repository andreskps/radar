// Esquema de la base local (architecture.md §5). Vive en el origen de la extensión:
// la usan el service worker y el Centro. El content script corre en el origen de Instagram
// y no la ve: pide los datos por mensajes al service worker.
import Dexie, { type EntityTable } from 'dexie';
import type { IgPost, IgProfile, PauseReason } from '../ig/types';
import type { PostMetrics, Tier } from '../metrics/types';

export interface ProfileRow extends IgProfile {
  /** Post más viejo guardado (ms). */
  scannedFrom: number | null;
  /** Post más nuevo guardado (ms). */
  scannedTo: number | null;
  /** Al menos un escaneo completo terminado: los siguientes pueden ser incrementales. */
  complete: boolean;
  lastScanAt: number | null;
  /** Reels de la pestaña Reels sin pareja en el timeline (sin fecha, no se guardan). */
  unmatchedReels: number;
}

export interface PostRow extends IgPost {
  updatedAt: number;
}

export interface MetricRow extends PostMetrics {
  profileId: string;
  tier: Tier | null;
  /** Puntaje Viral dentro del propio perfil y grupo. El Centro lo recalcula para el grupo que se esté viendo. */
  viralScore: number | null;
  computedAt: number;
}

export interface SnapshotRow {
  id?: number;
  postId: string;
  at: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
}

export interface TranscriptRow {
  postId: string;
  language: string;
  text: string;
  segments: { start: number; end: number; text: string }[];
  hook: string | null;
  device: 'webgpu' | 'wasm';
}

export interface ClientRow {
  id?: number;
  name: string;
  color: string;
  note: string;
}

export interface ClientProfileRow {
  clientId: number;
  profileId: string;
  role: 'propia' | 'competidor';
}

export interface CollectionRow {
  id?: number;
  clientId: number;
  name: string;
}

export interface CollectionPostRow {
  collectionId: number;
  postId: string;
  note: string;
  at: number;
}

export type ScanMode = 'auto' | 'full';
/**
 * Qué parte del perfil recorrer, elegida por el usuario. Sin rango se usa `mode`.
 * all: todo · days: los últimos N días · dates: entre dos fechas (ms, `to` incluido).
 */
export type ScanRange = { kind: 'all' } | { kind: 'days'; days: number } | { kind: 'dates'; from: number; to: number };
export type ScanPhase = 'profile' | 'timeline' | 'reels' | 'finalize';
export type ScanStatus = 'queued' | 'running' | 'paused' | 'done' | 'error' | 'cancelled';

export interface ScanJobRow {
  id?: number;
  username: string;
  profileId: string | null;
  /** auto: incremental si el perfil ya tiene un escaneo completo · full: "actualizar todo". */
  mode: ScanMode;
  /** Rango elegido por el usuario. Si falta (trabajos viejos o "lo nuevo"), manda `mode`. */
  range?: ScanRange | null;
  status: ScanStatus;
  phase: ScanPhase;
  cursor: string | null;
  /** Corte del re-escaneo incremental (ms). `null` = escaneo completo. */
  since: number | null;
  /** Posts del timeline guardados en este trabajo. */
  read: number;
  /** Reels con reproducciones actualizadas en este trabajo. */
  reelsRead: number;
  unmatchedReels: number;
  pages: number;
  /** 429 seguidos (15 min la primera vez, 60 min después). */
  rateLimitHits: number;
  /** Errores seguidos sin respuesta válida (red, 5xx). */
  errorRetries: number;
  /** Motivo de la pausa: los de Instagram, el usuario o un fallo de red que se reintenta. */
  pauseReason: PauseReason | 'user' | 'network' | null;
  /** Cuándo se puede reanudar (ms). `null` = necesita al usuario. */
  resumeAt: number | null;
  message: string | null;
  createdAt: number;
  startedAt: number | null;
  updatedAt: number;
  finishedAt: number | null;
}

export type RadarDB = Dexie & {
  profiles: EntityTable<ProfileRow, 'id'>;
  posts: EntityTable<PostRow, 'id'>;
  metrics: EntityTable<MetricRow, 'postId'>;
  snapshots: EntityTable<SnapshotRow, 'id'>;
  transcripts: EntityTable<TranscriptRow, 'postId'>;
  clients: EntityTable<ClientRow, 'id'>;
  clientProfiles: EntityTable<ClientProfileRow>;
  collections: EntityTable<CollectionRow, 'id'>;
  collectionPosts: EntityTable<CollectionPostRow>;
  scanJobs: EntityTable<ScanJobRow, 'id'>;
};

export const DB_NAME = 'radar';

export function openDb(name = DB_NAME): RadarDB {
  const db = new Dexie(name) as RadarDB;
  db.version(1).stores({
    profiles: 'id, &username',
    posts: 'id, &code, profileId, [profileId+takenAt], type',
    metrics: 'postId, profileId, [profileId+tier], viralScore',
    snapshots: '++id, postId, [postId+at]',
    transcripts: 'postId',
    clients: '++id',
    clientProfiles: '[clientId+profileId], profileId',
    collections: '++id, clientId',
    collectionPosts: '[collectionId+postId], postId',
    scanJobs: '++id, status, username',
  });
  return db;
}
