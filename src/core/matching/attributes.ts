import type { Condition, VariantAttributes } from '../types';
import { BANGLA_DICTIONARY, normaliseDigits, normaliseText } from './normalize';

/** Colour vocabulary (English canonical names). Multi-word names first. */
const COLOURS = [
  'space grey', 'space gray', 'sky blue', 'rose gold', 'midnight blue', 'natural titanium', 'black titanium', 'white titanium',
  'desert titanium', 'blue titanium', 'jet black', 'phantom black', 'navy blue', 'olive green', 'mint green', 'off white',
  'black', 'white', 'silver', 'gold', 'grey', 'gray', 'graphite', 'blue', 'navy', 'red', 'green', 'yellow', 'pink', 'purple',
  'violet', 'lavender', 'lilac', 'orange', 'brown', 'beige', 'cream', 'ivory', 'teal', 'turquoise', 'coral', 'midnight',
  'starlight', 'titanium', 'charcoal', 'khaki', 'maroon', 'burgundy', 'mint', 'sage', 'tan', 'bronze', 'copper', 'champagne',
];

/** Product-line qualifiers that indicate a different model when present on one side only. */
export const LINE_QUALIFIERS = ['pro', 'max', 'plus', 'ultra', 'mini', 'lite', 'se', 'fe', 'air', 'neo', 'prime', 'note', 'fold', 'flip', 'edge', 'slim', 'xl', 'turbo', 'kids', 'junior'];

function canonicalColour(raw: string): string {
  const c = raw.toLowerCase().replace('gray', 'grey');
  return c;
}

function bengaliToEnglishColours(text: string): string {
  let out = text;
  for (const [bn, en] of Object.entries(BANGLA_DICTIONARY)) {
    if (/[ঀ-৿]/.test(bn) && COLOURS.includes(en) && out.includes(bn)) out = out.split(bn).join(` ${en} `);
  }
  return out;
}

export function extractCapacities(text: string): { storage?: string; memory?: string } {
  const t = normaliseDigits(text.normalize('NFKC')).replace(/জিবি/g, 'GB').replace(/টিবি/g, 'TB').replace(/র‍?্যাম/g, 'RAM');
  const result: { storage?: string; memory?: string } = {};
  // "8GB/256GB", "8+256GB", "12GB RAM 512GB", "8/128GB"
  const pair = t.match(/\b(\d{1,2})\s*(?:GB)?\s*[/+|]\s*(\d{2,4})\s*(GB|TB)\b/i);
  if (pair?.[1] && pair[2] && pair[3]) {
    result.memory = `${Number(pair[1])}GB`;
    result.storage = `${Number(pair[2])}${pair[3].toUpperCase()}`;
    return result;
  }
  const ram = t.match(/\b(\d{1,3})\s*GB\s*(?:of\s*)?(?:LP)?(?:DDR\d\w*\s*)?(?:RAM|memory|unified memory)\b/i) ?? t.match(/\bRAM\s*:?\s*(\d{1,3})\s*GB\b/i);
  if (ram?.[1]) result.memory = `${Number(ram[1])}GB`;
  const caps = [...t.matchAll(/\b(\d{1,4}(?:\.\d)?)\s*(GB|TB)\b(?!\s*(?:RAM|memory|unified))/gi)]
    .map((m) => ({ value: Number(m[1]), unit: (m[2] ?? 'GB').toUpperCase() }))
    .filter((c) => !(result.memory && `${c.value}${c.unit}` === result.memory && c.unit === 'GB'));
  const storage = caps.find((c) => c.unit === 'TB' || c.value >= 16);
  if (storage) result.storage = `${storage.value}${storage.unit}`;
  return result;
}

export function extractColour(text: string): string | undefined {
  const t = ` ${normaliseText(bengaliToEnglishColours(text))} `;
  for (const colour of COLOURS) {
    if (t.includes(` ${colour} `)) return canonicalColour(colour);
  }
  return undefined;
}

export function extractGeneration(text: string): string | undefined {
  const t = normaliseDigits(text).toLowerCase();
  const m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)\s*(?:gen|generation)\b/) ?? t.match(/\bgen(?:eration)?\s*(\d{1,2})\b/) ?? t.match(/\((\d{1,2})(?:st|nd|rd|th)?\s*gen/);
  if (m?.[1]) return `gen ${Number(m[1])}`;
  const year = t.match(/\b\(?(20[12]\d)\)?\s*(?:model|edition|release)?\b/);
  if (year?.[1] && /model|edition|release|\(20/.test(t)) return year[1];
  return undefined;
}

/** Clothing / shoe sizes only when explicitly labelled, to avoid false positives. */
export function extractSize(text: string): string | undefined {
  const t = normaliseDigits(text);
  const shoe = t.match(/\b(US|UK|EU|AU)\s*(?:size\s*)?(\d{1,2}(?:\.5)?)\b/i);
  if (shoe?.[1] && shoe[2]) return `${shoe[1].toUpperCase()} ${shoe[2]}`;
  const labelled = t.match(/\bsize\s*[:-]?\s*(XXS|XS|S|M|L|XL|XXL|XXXL|\d{1,2}XL|\d{1,3})\b/i);
  if (labelled?.[1]) return labelled[1].toUpperCase();
  const screen = t.match(/\b(\d{2}(?:\.\d)?)\s*(?:"|inch|in\b|ইঞ্চি)/i);
  if (screen?.[1]) return `${screen[1]}-inch`;
  const mm = t.match(/\b(3[8-9]|4[0-9]|5[0-2])\s*mm\b/i);
  if (mm?.[1]) return `${mm[1]}mm`;
  return undefined;
}

export function extractCondition(text: string): Condition | undefined {
  const t = normaliseText(text);
  if (/\b(refurbished|renewed|reconditioned|রিফার্বিশড)\b/.test(t)) return 'refurbished';
  if (/\b(pre-owned|preowned|used|second hand|secondhand|ব্যবহৃত)\b/.test(t)) return 'used';
  if (/\b(open box|damaged box)\b/.test(t)) return 'damaged';
  return undefined;
}

export function extractLineQualifiers(text: string): Set<string> {
  const t = ` ${normaliseText(text).replace(/[+]/g, ' plus ')} `;
  const out = new Set<string>();
  for (const q of LINE_QUALIFIERS) if (t.includes(` ${q} `)) out.add(q);
  for (const [bn, en] of Object.entries(BANGLA_DICTIONARY)) if (LINE_QUALIFIERS.includes(en) && text.includes(bn)) out.add(en);
  return out;
}

/** Numbers that identify a product line ("iPhone 15", "Galaxy S24", "PS5", "XM5"). */
export function extractLineNumbers(text: string): Set<string> {
  const t = normaliseText(text)
    .replace(/\b\d+(\.\d+)?\s*(gb|tb|mb|mah|w|hz|mm|cm|inch|in|mp|ml|l|kg|g|v|pcs|pc|pack|x)\b/g, ' ')
    .replace(/\b\d{1,2}\s*\/\s*\d{2,4}\b/g, ' ')
    .replace(/\b(us|uk|eu|au|size)\s*\d+(\.5)?\b/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ');
  const out = new Set<string>();
  for (const m of t.matchAll(/\b([a-z]{0,3})(\d{1,4})\b/g)) {
    if (m[2]) out.add(`${m[1] ?? ''}${Number(m[2])}`);
  }
  return out;
}

/** Fills missing variant attributes from free text without overwriting structured values. */
export function inferVariant(text: string, known: VariantAttributes = {}): VariantAttributes {
  const caps = extractCapacities(text);
  return {
    ...known,
    storage: known.storage ?? caps.storage,
    memory: known.memory ?? caps.memory,
    colour: known.colour ? canonicalColour(known.colour) : extractColour(text),
    generation: known.generation ?? extractGeneration(text),
    size: known.size ?? extractSize(text),
  };
}

export function normaliseAttribute(key: keyof VariantAttributes, value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = normaliseDigits(value).trim().toLowerCase().replace(/\s+/g, ' ');
  if (key === 'colour') return canonicalColour(bengaliToEnglishColours(v).trim());
  if (key === 'storage' || key === 'memory') return v.replace(/\s/g, '').toUpperCase();
  return v;
}
