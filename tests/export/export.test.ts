import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { applyReelStats, finalizeProfile, savePosts, saveProfile } from '../../src/db/repo';
import { loadPanelData } from '../../src/db/views';
import { csvField, toCsv } from '../../src/export/csv';
import { BACKUP_TABLES, exportBackup, importBackup, parseBackup } from '../../src/export/backup';
import { exportFileName, POST_COLUMNS, profileCsv, profileXlsx, summarySheet } from '../../src/export/profile';
import { columnName, sheetName, toExcelDate, writeXlsx, xmlEscape } from '../../src/export/xlsx';
import { crc32 } from '../../src/export/zip';
import { DAY, NOW, freshDb, makePosts, makeProfile } from '../scan/fakeIg';

// Lector de ZIP para las pruebas (solo lo que genera createZip).
async function readZip(bytes: Uint8Array): Promise<Map<string, string>> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Map<string, string>();
  let p = 0;
  while (v.getUint32(p, true) === 0x04034b50) {
    const method = v.getUint16(p + 8, true);
    const crc = v.getUint32(p + 14, true);
    const size = v.getUint32(p + 18, true);
    const nameLen = v.getUint16(p + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 30, p + 30 + nameLen));
    const body = bytes.subarray(p + 30 + nameLen, p + 30 + nameLen + size);
    const raw = method === 8 ? new Uint8Array(await new Response(new Blob([body as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) : body;
    expect(crc32(raw)).toBe(crc);
    out.set(name, new TextDecoder().decode(raw));
    p += 30 + nameLen + size;
  }
  expect(v.getUint32(p, true)).toBe(0x02014b50); // sigue el directorio central
  return out;
}

async function scannedProfile(count: number, username = 'marca') {
  const db = freshDb();
  const profile = makeProfile(username);
  await saveProfile(db, profile);
  const posts = makePosts(profile, count, NOW - 4 * DAY);
  await savePosts(db, posts, NOW);
  await applyReelStats(db, posts.filter((x) => x.type === 'reel').map((x, i) => ({ code: x.code, views: 1000 + ((i * 7919) % 5000), likes: null, comments: null, durationSec: 30 })), NOW);
  await finalizeProfile(db, profile.id, { now: NOW, scanStartedAt: NOW, fullScan: true, unmatchedReels: 0 });
  return { db, profile };
}

describe('CSV', () => {
  it('comillas, saltos, BOM y fórmulas neutralizadas', () => {
    expect(csvField('hola')).toBe('hola');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('dijo "sí"\nfin')).toBe('"dijo ""sí""\nfin"');
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField(-3)).toBe('-3');
    expect(csvField(null)).toBe('');
    expect(csvField(Number.NaN)).toBe('');
    // Variante regional (Excel en español): punto y coma y coma decimal.
    expect(toCsv(['A', 'B'], [[0.25, 'a;b']], { separator: ';', decimal: ',' })).toBe('\uFEFFA;B\r\n0,25;"a;b"\r\n');
    expect(() => toCsv([], [], { separator: ',', decimal: ',' })).toThrow();
    const csv = toCsv(['A', 'B'], [[1, 'x'], [null, 'y']]);
    expect(csv.startsWith('\uFEFFA,B\r\n1,x\r\n,y\r\n')).toBe(true);
  });
});

describe('XLSX', () => {
  it('nombres de columna y de hoja, fechas en hora de Bogotá, XML seguro', () => {
    expect([0, 25, 26, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'ZZ', 'AAA']);
    const used = new Set<string>();
    expect(sheetName('Posts', used)).toBe('Posts');
    expect(sheetName('posts', used)).toBe('posts 2');
    expect(sheetName('a/b:c*'.padEnd(40, 'x'), used)).toHaveLength(31);
    // 2026-01-01 05:00 UTC = 2026-01-01 00:00 en Bogotá = serie 46023.
    expect(toExcelDate(Date.UTC(2026, 0, 1, 5), 'America/Bogota')).toBe(46023);
    expect(toExcelDate(Date.UTC(2026, 0, 1, 17), 'America/Bogota')).toBe(46023.5);
    expect(xmlEscape('a<b>&"c"\u0001')).toBe('a&lt;b&gt;&amp;&quot;c&quot;');
    expect(xmlEscape('🔥 ok')).toBe('🔥 ok');
    expect(xmlEscape('roto\uD800x')).toBe('rotox');
  });

  it('el paquete trae todas las partes y las celdas con su tipo', async () => {
    const bytes = await writeXlsx([
      {
        name: 'Datos',
        columns: [{ header: 'Texto' }, { header: 'Número', format: 'int' }, { header: 'Enlace' }, { header: 'Fecha', format: 'datetime' }],
        rows: [
          ['<hola> & "tú"', 1234, { link: 'https://x.com/a"b', text: 'Abrir' }, 46023.5],
          [null, Number.POSITIVE_INFINITY, '', { n: 0.25, format: 'percent' }],
        ],
      },
      { name: 'Notas', header: false, columns: [{ header: 'A' }], rows: [[{ s: 'Título', format: 'heading' }]] },
    ]);
    const parts = await readZip(bytes);
    expect([...parts.keys()]).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
    const s1 = parts.get('xl/worksheets/sheet1.xml')!;
    expect(s1).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">&lt;hola&gt; &amp; &quot;tú&quot;</t></is></c>');
    expect(s1).toContain('<c r="B2" s="2"><v>1234</v></c>');
    expect(s1).toContain('<f>HYPERLINK(&quot;https://x.com/a&quot;&quot;b&quot;,&quot;Abrir&quot;)</f>');
    expect(s1).toContain('<c r="D2" s="6"><v>46023.5</v></c>');
    expect(s1).toContain('<row r="3"><c r="D3" s="5"><v>0.25</v></c></row>'); // vacíos e infinito se omiten
    expect(s1).toContain('<autoFilter ref="A1:D3"/>');
    expect(s1).toContain('state="frozen"');
    expect(parts.get('xl/worksheets/sheet2.xml')).not.toContain('autoFilter');
    expect(parts.get('xl/workbook.xml')).toContain(`<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'Datos'!$A$1:$D$3</definedName>`);
  });
});

describe('exportación de un perfil', () => {
  it('Resumen y Posts con las cifras de la base; CSV con las mismas columnas', async () => {
    const { db } = await scannedProfile(60);
    const data = await loadPanelData(db, 'marca');
    const parts = await readZip(await profileXlsx(data.profile!, data.posts, { now: NOW }));
    const posts = parts.get('xl/worksheets/sheet2.xml')!;
    expect(posts.match(/<row /g)).toHaveLength(61); // encabezado + 60
    expect(parts.get('xl/workbook.xml')).toContain('<sheet name="Resumen" sheetId="1" r:id="rId1"/><sheet name="Posts" sheetId="2" r:id="rId2"/>');

    const csv = profileCsv(data.posts);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines).toHaveLength(61);
    expect(lines[0]).toBe(`${POST_COLUMNS.map((c) => c.header).join(',')}`);
    // Más reciente primero, fecha en hora de Bogotá y enlace completo.
    const newest = [...data.posts].sort((a, b) => b.takenAt - a.takenAt)[0]!;
    expect(lines[1]).toContain(`https://www.instagram.com/${newest.type === 'reel' ? 'reel' : 'p'}/${newest.code}/`);
    expect(lines[1]!.slice(0, 16)).toMatch(/^2026-11-1\d \d\d:\d\d$/);

    const summary = summarySheet(data.profile!, data.posts, { now: NOW });
    const usuario = summary.rows.find((r) => r[0] === 'Usuario');
    expect(usuario?.[1]).toBe('@marca');
    const guardadas = summary.rows.find((r) => r[0] === 'Publicaciones guardadas en Radar');
    expect(guardadas?.[1]).toEqual({ n: 60, format: 'int' });
    expect(exportFileName('mi.marca', 'xlsx', NOW)).toBe('radar-mi.marca-2026-11-22.xlsx');
  });

  it('M5: 10.000 filas a Excel en ≤ 15 s (de la base al archivo)', async () => {
    const { db } = await scannedProfile(10_000);
    const t0 = performance.now();
    const data = await loadPanelData(db, 'marca');
    const bytes = await profileXlsx(data.profile!, data.posts, { now: NOW });
    const ms = performance.now() - t0;
    const csvMs0 = performance.now();
    const csv = profileCsv(data.posts);
    const csvMs = performance.now() - csvMs0;
    console.info(`[export] 10.000 filas: Excel ${Math.round(ms)} ms (${(bytes.length / 1e6).toFixed(2)} MB), CSV ${Math.round(csvMs)} ms (${(csv.length / 1e6).toFixed(2)} MB)`);
    expect(data.posts).toHaveLength(10_000);
    expect(ms).toBeLessThan(15_000);
    // Para abrirlo en Excel de verdad: RADAR_EXPORT_OUT=carpeta npm test
    const dir = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.RADAR_EXPORT_OUT;
    if (dir) {
      const fsModule = 'node:fs';
      const { mkdirSync, writeFileSync } = (await import(/* @vite-ignore */ fsModule)) as { mkdirSync(p: string, o: object): void; writeFileSync(p: string, d: Uint8Array | string): void };
      const join = (...parts: string[]) => parts.join('/');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'radar-10000.xlsx'), bytes);
      writeFileSync(join(dir, 'radar-10000.csv'), csv);
      const small = await loadPanelData((await scannedProfile(60, 'chica')).db, 'chica');
      writeFileSync(join(dir, 'radar-60.xlsx'), await profileXlsx(small.profile!, small.posts, { now: NOW }));
    }
  }, 60_000);
});

describe('copia de la base', () => {
  async function dump(db: ReturnType<typeof freshDb>) {
    const out: Record<string, unknown[]> = {};
    for (const t of BACKUP_TABLES) {
      const rows = (await (db[t] as unknown as { toArray(): Promise<Record<string, unknown>[]> }).toArray()).map((r) => (t === 'snapshots' ? { ...r, id: undefined } : r));
      out[t] = rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    return out;
  }

  it('exportar → importar en otra base deja todo igual (conteos y métricas idénticos)', async () => {
    const { db: a, profile } = await scannedProfile(300);
    // Un re-escaneo con cifras nuevas para tener snapshots.
    const more = makePosts(profile, 300, NOW - 4 * DAY).map((p) => ({ ...p, likes: (p.likes ?? 0) + 5 }));
    await savePosts(a, more, NOW + DAY);
    await finalizeProfile(a, profile.id, { now: NOW + DAY, scanStartedAt: NOW + DAY, fullScan: false, unmatchedReels: 0 });
    await a.clients.add({ name: 'Mi marca', color: '#C6F432', note: '' });
    await a.scanJobs.add({ username: 'marca', profileId: profile.id, mode: 'auto', status: 'running', phase: 'timeline', cursor: 'x', since: null, read: 1, reelsRead: 0, unmatchedReels: 0, pages: 1, rateLimitHits: 0, errorRetries: 0, pauseReason: null, resumeAt: null, message: null, createdAt: NOW, startedAt: NOW, updatedAt: NOW, finishedAt: null });
    expect(await a.snapshots.count()).toBeGreaterThan(0);

    const text = JSON.stringify(await exportBackup(a, NOW));
    const b = freshDb();
    const counts = await importBackup(b, parseBackup(text));
    expect(counts.posts).toBe(300);
    expect(await dump(b)).toEqual(await dump(a));
    expect(await b.scanJobs.count()).toBe(0); // la cola no viaja

    // Importar dos veces no duplica nada.
    await importBackup(b, parseBackup(text));
    expect(await dump(b)).toEqual(await dump(a));
    // Y el panel sale igual en las dos bases.
    expect(await loadPanelData(b, 'marca')).toEqual(await loadPanelData(a, 'marca'));
  });

  it('si otra cuenta usa el mismo usuario en la base destino, se renombra la vieja', async () => {
    const { db: a } = await scannedProfile(5, 'marca');
    const b = freshDb();
    await saveProfile(b, makeProfile('marca', 'otra-cuenta'));
    await importBackup(b, parseBackup(JSON.stringify(await exportBackup(a, NOW))));
    expect((await b.profiles.get('otra-cuenta'))?.username).toBe('marca~otra-cuenta');
    expect((await b.profiles.get('id-marca'))?.username).toBe('marca');
  });

  it('rechaza archivos que no son copias de Radar', () => {
    expect(() => parseBackup('no json')).toThrow('no es un JSON válido');
    expect(() => parseBackup('{"format":"otra"}')).toThrow('no es una copia de Radar');
    expect(() => parseBackup('{"format":"radar-backup","version":99,"tables":{}}')).toThrow('versión más nueva');
    expect(() => parseBackup('{"format":"radar-backup","version":1,"tables":{"posts":{}}}')).toThrow('dañada');
    expect(() => parseBackup('{"format":"radar-backup","version":1,"tables":{"profiles":[{"id":1}]}}')).toThrow('perfil sin id');
    expect(parseBackup('{"format":"radar-backup","version":1,"tables":{}}').tables.posts).toEqual([]);
  });
});
