// Botones Excel / CSV del panel. Exportan todo el historial guardado del perfil (no solo el
// rango visible). El archivo se arma aquí mismo, con los datos que ya cargó el panel.
import { useState } from 'react';
import type { PanelData } from '../../db/views';
import { durationText } from '../format';
import { CSV_MIME, downloadFile, exportFileName, profileCsv, profileXlsx, XLSX_MIME } from '../../export';

const nf = new Intl.NumberFormat('es-CO');

export function ExportButtons({ data }: { data: PanelData }) {
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const profile = data.profile;
  if (!profile || data.posts.length === 0) return null;

  async function run(kind: 'xlsx' | 'csv') {
    if (!profile) return;
    setBusy(true);
    setStatus({ text: kind === 'xlsx' ? 'Armando el Excel…' : 'Armando el CSV…' });
    const t0 = performance.now();
    try {
      const now = Date.now();
      if (kind === 'xlsx') downloadFile((await profileXlsx(profile, data.posts, { now })) as BlobPart, exportFileName(profile.username, 'xlsx', now), XLSX_MIME);
      else downloadFile(profileCsv(data.posts), exportFileName(profile.username, 'csv', now), CSV_MIME);
      const ms = Math.round(performance.now() - t0);
      setStatus({ text: `${kind === 'xlsx' ? 'Excel' : 'CSV'} listo: ${nf.format(data.posts.length)} filas en ${durationText(ms)}` });
      document.documentElement.dataset.radarExportMs = String(ms);
    } catch (e) {
      setStatus({ text: `No se pudo exportar: ${(e as Error).message}`, error: true });
    } finally {
      setBusy(false);
    }
  }

  const btn = 'cursor-pointer rounded-full border border-[var(--p-border)] px-[10px] py-[3px] text-[11px] font-semibold hover:bg-[var(--p-border)] disabled:cursor-wait disabled:opacity-60';
  return (
    <div className="flex flex-wrap items-center gap-[6px] text-[11px]" data-testid="radar-export">
      <span className="text-[var(--p-muted)]">Exportar todo:</span>
      <button type="button" className={btn} disabled={busy} onClick={() => void run('xlsx')} data-testid="radar-export-xlsx">
        Excel
      </button>
      <button type="button" className={btn} disabled={busy} onClick={() => void run('csv')} data-testid="radar-export-csv">
        CSV
      </button>
      {status && <span className={status.error ? 'text-[#F87171]' : 'text-[var(--p-muted)]'}>{status.text}</span>}
    </div>
  );
}
