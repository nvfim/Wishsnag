/** RFC 4180 CSV reading/writing with formula-injection protection on export. */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Prevents spreadsheet formula injection (=, +, -, @ prefixes) in exported cells. */
export function escapeCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [header.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join('\r\n') + '\r\n';
}

export function csvToObjects(text: string): { header: string[]; rows: Record<string, string>[] } {
  const [headerRow, ...rest] = parseCsv(text);
  const header = (headerRow ?? []).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const rows = rest.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim().replace(/^'(?=[=+\-@])/, '')])));
  return { header, rows };
}
