// Server-side request forgery (SSRF) guard: product URLs come from users, so the monitor only
// fetches public http(s) hosts — never localhost, private/link-local IP ranges or internal names.

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.corp', '.intranet', '.svc', '.cluster.local'];

function ipv4Private(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

export function isSafePublicUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password) return false;
  if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || !host.includes('.')) return false;
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return false;
  if (host.startsWith('[') || host.includes(':')) return false; // IPv6 literals
  if (/^[\d.]+$/.test(host)) return !ipv4Private(host) && host.split('.').length === 4;
  if (/^0x|^\d+$/.test(host)) return false; // hex / decimal-encoded IPs
  return true;
}
