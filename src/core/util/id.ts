/** Collision-resistant, sortable-enough ids for local records (no external deps). */
export function newId(prefix = ''): string {
  const time = Date.now().toString(36);
  const random =
    typeof crypto !== 'undefined' && 'getRandomValues' in crypto
      ? Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, '0')).join('')
      : Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  return `${prefix}${time}${random}`;
}

/** Small stable hash (FNV-1a 32-bit) for dedupe keys and deterministic message variants. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
