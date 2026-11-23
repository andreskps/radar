// CSV (RFC 4180): por defecto separador coma, punto decimal, fin de línea CRLF y BOM UTF-8
// para que se lean bien tildes y emojis. Es el formato que esperan Google Sheets y otras
// herramientas. El Excel en español (es-CO) usa ";" y "," decimal al abrir con doble clic:
// para Excel está el .xlsx, y aquí queda la opción regional (D10).
// Las fórmulas se neutralizan (=, +, -, @ al inicio) para que un caption no se ejecute al abrirlo.

export type CsvValue = string | number | null | undefined;

export interface CsvOptions {
  separator?: ',' | ';' | '\t';
  decimal?: '.' | ',';
}

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvField(v: CsvValue, { separator = ',', decimal = '.' }: CsvOptions = {}): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '';
    const s = String(v);
    return decimal === ',' ? s.replace('.', ',') : s;
  }
  let s = v;
  if (FORMULA_START.test(s)) s = `'${s}`;
  const needsQuotes = s.includes('"') || s.includes('\n') || s.includes('\r') || s.includes(separator);
  return needsQuotes ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: CsvValue[][], opts: CsvOptions = {}): string {
  if (opts.separator === ',' && opts.decimal === ',') throw new Error('Con coma decimal el separador no puede ser coma.');
  const sep = opts.separator ?? ',';
  const lines = [headers.map((h) => csvField(h, opts)).join(sep)];
  for (const r of rows) lines.push(r.map((v) => csvField(v, opts)).join(sep));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export const CSV_MIME = 'text/csv;charset=utf-8';
