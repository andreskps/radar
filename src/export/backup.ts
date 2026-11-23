// Copia de la base completa en JSON para pasarla a otro Chrome (RF-17, D2).
// No incluye la cola de escaneo: un trabajo a medias no tiene sentido en otro equipo.
// Importar = fusionar: lo que trae el archivo reemplaza lo que haya con la misma clave.
import type Dexie from 'dexie';
import type {
  ClientProfileRow,
  ClientRow,
  CollectionPostRow,
  CollectionRow,
  MetricRow,
  PostRow,
  ProfileRow,
  RadarDB,
  SnapshotRow,
  TranscriptRow,
} from '../db/schema';

export const BACKUP_FORMAT = 'radar-backup';
export const BACKUP_VERSION = 1;

export const BACKUP_TABLES = ['profiles', 'posts', 'metrics', 'snapshots', 'transcripts', 'clients', 'clientProfiles', 'collections', 'collectionPosts'] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

interface BackupRows {
  profiles: ProfileRow[];
  posts: PostRow[];
  metrics: MetricRow[];
  snapshots: SnapshotRow[];
  transcripts: TranscriptRow[];
  clients: ClientRow[];
  clientProfiles: ClientProfileRow[];
  collections: CollectionRow[];
  collectionPosts: CollectionPostRow[];
}

const tablesOf = (db: RadarDB) => BACKUP_TABLES.map((t) => db[t]) as unknown as Dexie.Table[];

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  tables: BackupRows;
}

export type BackupCounts = Record<BackupTable, number>;

export async function exportBackup(db: RadarDB, now: number): Promise<Backup> {
  const entries = await db.transaction('r', tablesOf(db), () => Promise.all(BACKUP_TABLES.map(async (t) => [t, await (db[t] as unknown as Dexie.Table).toArray()] as const)));
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, tables: Object.fromEntries(entries) as unknown as BackupRows };
}

export function countBackup(b: Backup): BackupCounts {
  return Object.fromEntries(BACKUP_TABLES.map((t) => [t, b.tables[t].length])) as BackupCounts;
}

/** Lee y valida el archivo. Los errores están en español para mostrarlos tal cual. */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  const b = data as Partial<Backup> | null;
  if (!b || typeof b !== 'object' || b.format !== BACKUP_FORMAT) throw new Error('El archivo no es una copia de Radar.');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) throw new Error(`La copia es de una versión más nueva de Radar (${String(b.version)}). Actualiza la extensión.`);
  if (!b.tables || typeof b.tables !== 'object') throw new Error('La copia no trae tablas.');
  const tables = {} as Record<BackupTable, unknown[]>;
  for (const t of BACKUP_TABLES) {
    const rows = (b.tables as unknown as Record<string, unknown>)[t] ?? [];
    if (!Array.isArray(rows)) throw new Error(`La tabla "${t}" de la copia está dañada.`);
    tables[t] = rows;
  }
  for (const p of tables.profiles as { id?: unknown; username?: unknown }[]) {
    if (typeof p?.id !== 'string' || typeof p.username !== 'string') throw new Error('Hay un perfil sin id o sin usuario en la copia.');
  }
  for (const p of tables.posts as { id?: unknown; code?: unknown; profileId?: unknown }[]) {
    if (typeof p?.id !== 'string' || typeof p.code !== 'string' || typeof p.profileId !== 'string') throw new Error('Hay una publicación incompleta en la copia.');
  }
  return { format: BACKUP_FORMAT, version: b.version, exportedAt: Number(b.exportedAt) || 0, tables: tables as Backup['tables'] };
}

export async function importBackup(db: RadarDB, backup: Backup): Promise<BackupCounts> {
  const t = backup.tables;
  await db.transaction('rw', tablesOf(db), async () => {
    // El usuario es único: si otra cuenta tiene ese nombre (lo cambió en Instagram),
    // se renombra la vieja igual que al escanear (repo.saveProfile).
    for (const p of t.profiles) {
      const clash = await db.profiles.where('username').equals(p.username).first();
      if (clash && clash.id !== p.id) await db.profiles.update(clash.id, { username: `${clash.username}~${clash.id}` });
    }
    await db.profiles.bulkPut(t.profiles);
    // Lo mismo con el código del post (único): una fila vieja con otro id y el mismo código se reemplaza.
    const idByCode = new Map(t.posts.map((p) => [p.code, p.id]));
    const stale = (await db.posts.where('code').anyOf([...idByCode.keys()]).toArray()).filter((old) => idByCode.get(old.code) !== old.id);
    if (stale.length) await db.posts.bulkDelete(stale.map((p) => p.id));
    await db.posts.bulkPut(t.posts);
    await db.metrics.bulkPut(t.metrics);
    await db.transcripts.bulkPut(t.transcripts);

    // Snapshots: el id es local; se agregan los que no estén (mismo post y mismo momento).
    const pairs = t.snapshots.map((s) => [s.postId, s.at] as [string, number]);
    const existing = new Set((await db.snapshots.where('[postId+at]').anyOf(pairs).toArray()).map((s) => `${s.postId}|${s.at}`));
    const fresh = t.snapshots.filter((s) => !existing.has(`${s.postId}|${s.at}`)).map(({ id: _id, ...s }) => s);
    await db.snapshots.bulkAdd(fresh);

    await db.clients.bulkPut(t.clients);
    await db.clientProfiles.bulkPut(t.clientProfiles);
    await db.collections.bulkPut(t.collections);
    await db.collectionPosts.bulkPut(t.collectionPosts);
  });
  return countBackup(backup);
}

export function backupFileName(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `radar-base-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}
