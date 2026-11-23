// Centro › Datos (Fase 6): exportar cada perfil a Excel/CSV y exportar/importar la base completa.
// El Centro vive en el origen de la extensión: lee y escribe la base directamente.
import { useEffect, useRef, useState } from 'react';
import { openDb, type ProfileRow } from '@/db/schema';
import { loadPanelData } from '@/db/views';
import {
  backupFileName,
  countBackup,
  CSV_MIME,
  downloadFile,
  exportBackup,
  exportFileName,
  importBackup,
  parseBackup,
  profileCsv,
  profileXlsx,
  XLSX_MIME,
  type BackupCounts,
} from '@/export';
import { agoText, durationText } from '@/ui/format';

const db = openDb();
const nf = new Intl.NumberFormat('es-CO');

interface Row {
  profile: ProfileRow;
  posts: number;
}

async function loadRows(): Promise<Row[]> {
  const profiles = await db.profiles.toArray();
  const rows = await Promise.all(profiles.map(async (profile) => ({ profile, posts: await db.posts.where('profileId').equals(profile.id).count() })));
  return rows.sort((a, b) => (b.profile.lastScanAt ?? 0) - (a.profile.lastScanAt ?? 0));
}

const countsText = (c: BackupCounts) => `${nf.format(c.profiles)} perfiles, ${nf.format(c.posts)} publicaciones, ${nf.format(c.metrics)} métricas, ${nf.format(c.snapshots)} históricos`;

export function DataView() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => loadRows().then(setRows, (e: Error) => setStatus({ text: `No se pudo leer la base: ${e.message}`, error: true }));
  useEffect(() => void refresh(), []);

  async function task(label: string, fn: () => Promise<string>) {
    setBusy(true);
    setStatus({ text: label });
    try {
      setStatus({ text: await fn() });
    } catch (e) {
      setStatus({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }

  const exportProfile = (username: string, kind: 'xlsx' | 'csv') =>
    task(`Armando ${kind === 'xlsx' ? 'el Excel' : 'el CSV'} de @${username}…`, async () => {
      const t0 = performance.now();
      const now = Date.now();
      const data = await loadPanelData(db, username);
      if (!data.profile) throw new Error(`@${username} ya no está en la base.`);
      if (kind === 'xlsx') downloadFile((await profileXlsx(data.profile, data.posts, { now })) as BlobPart, exportFileName(username, 'xlsx', now), XLSX_MIME);
      else downloadFile(profileCsv(data.posts), exportFileName(username, 'csv', now), CSV_MIME);
      const ms = Math.round(performance.now() - t0);
      document.documentElement.dataset.radarExportMs = String(ms);
      return `@${username}: ${nf.format(data.posts.length)} filas exportadas en ${durationText(ms)}.`;
    });

  const exportAll = () =>
    task('Copiando la base…', async () => {
      const now = Date.now();
      const backup = await exportBackup(db, now);
      downloadFile(JSON.stringify(backup), backupFileName(now), 'application/json');
      return `Copia lista: ${countsText(countBackup(backup))}.`;
    });

  const importFile = (file: File) =>
    task(`Leyendo ${file.name}…`, async () => {
      const backup = parseBackup(await file.text());
      const counts = await importBackup(db, backup);
      await refresh();
      return `Importado: ${countsText(counts)}. Lo que ya tenías con la misma clave se reemplazó por lo del archivo.`;
    });

  const btn = 'cursor-pointer rounded-full px-3 py-1 text-xs font-semibold disabled:cursor-wait disabled:opacity-60';
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">Datos</h1>
      <p className="mt-1 text-sm opacity-70">Exporta cada perfil a Excel o CSV, o pasa la base completa a otro Chrome. Nada sale de tu navegador.</p>

      {status && (
        <div data-testid="center-status" className={`mt-4 rounded-lg px-3 py-2 text-sm ${status.error ? 'bg-red-500/15 text-red-300' : 'bg-radar-surface'}`}>
          {status.text}
        </div>
      )}

      <section className="mt-6 rounded-xl bg-radar-surface p-4">
        <h2 className="font-semibold">Perfiles guardados</h2>
        {!rows ? (
          <p className="mt-2 text-sm opacity-70">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="mt-2 text-sm opacity-70">Aún no hay perfiles. Abre uno en Instagram y usa “Escanear con Radar”, o importa una copia.</p>
        ) : (
          <table className="mt-3 w-full text-sm" data-testid="center-profiles">
            <thead className="text-left text-xs opacity-60">
              <tr>
                <th className="py-1 font-medium">Perfil</th>
                <th className="py-1 text-right font-medium">Publicaciones</th>
                <th className="py-1 pl-4 font-medium">Escaneo</th>
                <th className="py-1 text-right font-medium">Exportar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ profile, posts }) => (
                <tr key={profile.id} className="border-t border-white/5">
                  <td className="py-2">
                    <a className="font-semibold hover:underline" href={`https://www.instagram.com/${profile.username}/`} target="_blank" rel="noreferrer">
                      @{profile.username}
                    </a>
                  </td>
                  <td className="py-2 text-right tabular-nums">{nf.format(posts)}</td>
                  <td className="py-2 pl-4 opacity-70">
                    {profile.complete ? 'completo' : 'parcial'} · {agoText(profile.lastScanAt)}
                  </td>
                  <td className="py-2 text-right">
                    <div className="inline-flex gap-2">
                      <button type="button" disabled={busy || posts === 0} className={`${btn} bg-radar-accent text-radar-bg`} onClick={() => void exportProfile(profile.username, 'xlsx')}>
                        Excel
                      </button>
                      <button type="button" disabled={busy || posts === 0} className={`${btn} bg-white/10 hover:bg-white/20`} onClick={() => void exportProfile(profile.username, 'csv')}>
                        CSV
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-6 rounded-xl bg-radar-surface p-4">
        <h2 className="font-semibold">Base completa</h2>
        <p className="mt-1 text-sm opacity-70">
          Un archivo JSON con perfiles, publicaciones, métricas, históricos, transcripciones, clientes y colecciones (no la cola de escaneo). Al importar se fusiona: lo que trae el archivo
          reemplaza lo que tengas con la misma clave.
        </p>
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={busy} className={`${btn} bg-radar-accent text-radar-bg`} onClick={() => void exportAll()} data-testid="center-backup-export">
            Exportar base
          </button>
          <button type="button" disabled={busy} className={`${btn} bg-white/10 hover:bg-white/20`} onClick={() => fileInput.current?.click()}>
            Importar base…
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            data-testid="center-backup-import"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importFile(file);
            }}
          />
        </div>
      </section>
    </div>
  );
}
