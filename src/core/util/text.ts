/**
 * Text hygiene for untrusted page data. Everything extracted from a web page is treated
 * as untrusted: tags are stripped, entities decoded, whitespace collapsed and length capped.
 * React escapes on render; this keeps stored data clean and bounded.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', copy: '©', reg: '®', trade: '™', pound: '£', euro: '€', yen: '¥', cent: '¢',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', times: '×', deg: '°', frac12: '½',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (Number.isFinite(code) && code > 0 && code < 0x110000) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

export function stripTags(input: string): string {
  return input.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ');
}

export function cleanText(input: unknown, maxLength = 500): string {
  if (input == null) return '';
  let s = typeof input === 'string' ? input : typeof input === 'number' ? String(input) : '';
  if (!s) return '';
  s = decodeEntities(stripTags(s));
  // Remove control characters (keep normal whitespace) and collapse runs of whitespace.
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length > maxLength) s = `${s.slice(0, maxLength - 1).trimEnd()}…`;
  return s;
}

export function cleanOptional(input: unknown, maxLength = 200): string | undefined {
  const s = cleanText(input, maxLength);
  return s ? s : undefined;
}
