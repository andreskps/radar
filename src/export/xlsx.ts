// Escritor de .xlsx (SpreadsheetML) propio y mínimo: hojas con encabezado fijo, filtros,
// anchos de columna, formatos de número/fecha/porcentaje y enlaces (fórmula HYPERLINK).
// Textos en línea (inlineStr), sin tabla de cadenas compartidas: más simple y suficiente
// para decenas de miles de filas. Ver D9 en docs/architecture.md.
import { createZip } from './zip';

export type CellFormat = 'text' | 'int' | 'decimal' | 'multiplier' | 'percent' | 'datetime' | 'date' | 'heading';

export type Cell =
  | string
  | number
  | null
  | undefined
  /** Número con un formato distinto al de la columna. */
  | { n: number; format: CellFormat }
  /** Texto con formato propio (p. ej. un título en negrita). */
  | { s: string; format: CellFormat }
  | { link: string; text: string };

export interface Column {
  header: string;
  /** Ancho en caracteres. */
  width?: number;
  format?: CellFormat;
}

export interface Sheet {
  name: string;
  columns: Column[];
  rows: Cell[][];
  /** Por defecto true: primera fila fija, en negrita y con filtros. */
  header?: boolean;
}

// Índices de cellXfs en styles.xml.
const STYLE: Record<CellFormat | 'link', number> = {
  text: 0,
  heading: 1,
  int: 2,
  decimal: 3,
  multiplier: 4,
  percent: 5,
  datetime: 6,
  date: 7,
  link: 8,
};

/** Excel admite hasta 32.767 caracteres por celda. */
const MAX_CELL_TEXT = 32767;

// Caracteres que XML 1.0 no admite (controles y sustitutos sueltos de UTF-16).
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function xmlEscape(s: string): string {
  return s.replace(INVALID_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function columnName(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Nombre de hoja válido: máx. 31 caracteres, sin []:*?/\ y único. */
export function sheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Hoja';
  let out = base;
  for (let i = 2; used.has(out.toLowerCase()); i++) out = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  used.add(out.toLowerCase());
  return out;
}

const dateParts = new Map<string, Intl.DateTimeFormat>();

/**
 * Fecha para Excel: número de serie con la hora "de pared" de la zona indicada
 * (Excel no guarda zona horaria). 25569 = 1970-01-01 en el sistema de 1900.
 */
export function toExcelDate(ms: number, timeZone: string): number {
  let fmt = dateParts.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    dateParts.set(timeZone, fmt);
  }
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return wall / 86_400_000 + 25569;
}

function cellXml(ref: string, cell: Cell, colFormat: CellFormat): string {
  if (cell === null || cell === undefined || cell === '') return '';
  if (typeof cell === 'number') {
    if (!Number.isFinite(cell)) return '';
    const s = STYLE[colFormat === 'heading' ? 'text' : colFormat];
    return `<c r="${ref}"${s ? ` s="${s}"` : ''}><v>${cell}</v></c>`;
  }
  if (typeof cell === 'string') {
    return `<c r="${ref}" t="inlineStr"${colFormat === 'heading' ? ` s="${STYLE.heading}"` : ''}><is><t xml:space="preserve">${xmlEscape(cell.slice(0, MAX_CELL_TEXT))}</t></is></c>`;
  }
  if ('link' in cell) {
    // Fórmula HYPERLINK: funciona igual en Excel y Google Sheets sin relaciones extra.
    const url = cell.link.replace(/"/g, '""').slice(0, 255);
    const text = cell.text.replace(/"/g, '""').slice(0, 255);
    return `<c r="${ref}" s="${STYLE.link}" t="str"><f>${xmlEscape(`HYPERLINK("${url}","${text}")`)}</f><v>${xmlEscape(cell.text)}</v></c>`;
  }
  if ('n' in cell) {
    if (!Number.isFinite(cell.n)) return '';
    return `<c r="${ref}" s="${STYLE[cell.format]}"><v>${cell.n}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr" s="${STYLE[cell.format]}"><is><t xml:space="preserve">${xmlEscape(cell.s.slice(0, MAX_CELL_TEXT))}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const header = sheet.header !== false;
  const cols = sheet.columns;
  const lastCol = columnName(Math.max(cols.length - 1, 0));
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  out.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">');
  if (header) out.push('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
  else out.push('<sheetViews><sheetView workbookViewId="0"/></sheetViews>');
  out.push('<sheetFormatPr defaultRowHeight="15"/>');
  if (cols.length) {
    out.push('<cols>');
    cols.forEach((c, i) => out.push(`<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 12}" customWidth="1"/>`));
    out.push('</cols>');
  }
  out.push('<sheetData>');
  let r = 1;
  if (header) {
    out.push(`<row r="1">${cols.map((c, i) => cellXml(`${columnName(i)}1`, c.header, 'heading')).join('')}</row>`);
    r = 2;
  }
  for (const row of sheet.rows) {
    let cells = '';
    for (let i = 0; i < row.length; i++) cells += cellXml(`${columnName(i)}${r}`, row[i], cols[i]?.format ?? 'text');
    out.push(`<row r="${r}">${cells}</row>`);
    r++;
  }
  out.push('</sheetData>');
  if (header && cols.length) out.push(`<autoFilter ref="A1:${lastCol}${Math.max(r - 1, 1)}"/>`);
  out.push('</worksheet>');
  return out.join('');
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="4">' +
  '<numFmt numFmtId="164" formatCode="0.0&quot;×&quot;"/>' +
  '<numFmt numFmtId="165" formatCode="0.0%"/>' +
  '<numFmt numFmtId="166" formatCode="yyyy\\-mm\\-dd hh:mm"/>' +
  '<numFmt numFmtId="167" formatCode="yyyy\\-mm\\-dd"/>' +
  '</numFmts>' +
  '<fonts count="3">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FF12141A"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFC6F432"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="9">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function writeXlsx(input: Sheet[], when = new Date()): Promise<Uint8Array> {
  const used = new Set<string>();
  const sheets = input.map((s) => ({ ...s, name: sheetName(s.name, used) }));
  const enc = new TextEncoder();
  const n = sheets.length;

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>';

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  // Los filtros necesitan su nombre definido para que Excel no "repare" el archivo.
  const filters = sheets
    .map((s, i) => {
      if (s.header === false || !s.columns.length) return '';
      const ref = `'${s.name.replace(/'/g, "''")}'!$A$1:$${columnName(s.columns.length - 1)}$${Math.max(s.rows.length + 1, 1)}`;
      return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xmlEscape(ref)}</definedName>`;
    })
    .join('');

  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' +
    sheets.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
    '</sheets>' +
    (filters ? `<definedNames>${filters}</definedNames>` : '') +
    '</workbook>';

  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>';

  return createZip(
    [
      { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
      { name: '_rels/.rels', data: enc.encode(rootRels) },
      { name: 'xl/workbook.xml', data: enc.encode(workbook) },
      { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(workbookRels) },
      { name: 'xl/styles.xml', data: enc.encode(STYLES_XML) },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(s)) })),
    ],
    when,
  );
}
