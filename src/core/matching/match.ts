import type { Condition, MatchConfidence, ProductIdentifiers, VariantAttributes } from '../types';
import { extractLineNumbers, extractLineQualifiers, inferVariant, normaliseAttribute, extractCondition } from './attributes';
import { extractModelNumbers, normaliseGtin, normaliseMpn } from './identifiers';
import { normaliseText, tokenSimilarity, transliterateBengali, containsBengali } from './normalize';

export interface Matchable {
  title: string;
  brand?: string;
  model?: string;
  identifiers: ProductIdentifiers;
  variant: VariantAttributes;
  condition: Condition;
}

export type MatchReason = 'gtin_match' | 'mpn_match' | 'model_in_title' | 'brand_match' | 'title_similar' | 'attributes_match';
export type MatchConflict =
  | 'brand'
  | 'condition'
  | 'storage'
  | 'memory'
  | 'colour'
  | 'size'
  | 'generation'
  | 'line_qualifier'
  | 'line_number'
  | 'regional_model'
  | 'different_gtin'
  | 'different_model';

export interface MatchResult {
  confidence: MatchConfidence | null;
  /** 0..1, for ordering results within the same confidence level. */
  score: number;
  reasons: MatchReason[];
  conflicts: MatchConflict[];
  titleSimilarity: number;
}

const BRAND_NOISE = /\b(inc|ltd|llc|limited|co|corp|corporation|official|store|shop|electronics|bd|australia|au|global|brand|company)\b\.?/g;

export function normaliseBrand(brand: string | undefined): string | undefined {
  if (!brand) return undefined;
  let b = brand.normalize('NFKC');
  if (containsBengali(b)) b = b.split(/\s+/).map(transliterateBengali).join(' ');
  b = normaliseText(b).replace(BRAND_NOISE, ' ').replace(/[^a-z0-9]+/g, '');
  return b || undefined;
}

function brandsCompatible(a: Matchable, b: Matchable): 'same' | 'unknown' | 'different' {
  const ba = normaliseBrand(a.brand);
  const bb = normaliseBrand(b.brand);
  if (ba && bb) {
    if (ba === bb || ba.startsWith(bb) || bb.startsWith(ba)) return 'same';
    return 'different';
  }
  // One side has a brand: accept if it appears in the other title.
  const known = ba ?? bb;
  const otherTitle = ba ? b.title : a.title;
  if (known) {
    const titleNorm = normaliseText(otherTitle).replace(/[^a-z0-9ঀ-৿]+/g, '');
    const translit = normaliseText(otherTitle).split(' ').map((w) => (containsBengali(w) ? transliterateBengali(w) : w)).join('');
    return titleNorm.includes(known) || translit.includes(known) ? 'same' : 'unknown';
  }
  return 'unknown';
}

function mpnsOf(p: Matchable): Set<string> {
  const out = new Set<string>();
  const m = normaliseMpn(p.identifiers.mpn);
  if (m) out.add(m);
  const model = normaliseMpn(p.model);
  if (model && /\d/.test(model)) out.add(model);
  for (const t of extractModelNumbers(p.title)) out.add(t);
  return out;
}

function commonPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function conditionOf(p: Matchable): Condition {
  if (p.condition && p.condition !== 'unknown') return p.condition;
  return extractCondition(p.title) ?? 'unknown';
}

const VARIANT_KEYS: (keyof VariantAttributes)[] = ['storage', 'memory', 'colour', 'size', 'generation'];

export function matchProducts(a: Matchable, b: Matchable): MatchResult {
  const reasons: MatchReason[] = [];
  const conflicts: MatchConflict[] = [];
  const titleSimilarity = tokenSimilarity(withBrand(a), withBrand(b));

  // --- Variant & condition conflicts -------------------------------------------------
  const va = inferVariant(`${a.title} ${a.model ?? ''}`, a.variant);
  const vb = inferVariant(`${b.title} ${b.model ?? ''}`, b.variant);
  let attributesCompared = 0;
  for (const key of VARIANT_KEYS) {
    const x = normaliseAttribute(key, va[key]);
    const y = normaliseAttribute(key, vb[key]);
    if (x && y) {
      attributesCompared++;
      if (x !== y) conflicts.push(key as MatchConflict);
    }
  }
  const ca = conditionOf(a);
  const cb = conditionOf(b);
  if (ca !== 'unknown' && cb !== 'unknown' && ca !== cb) conflicts.push('condition');
  else if ((ca === 'unknown') !== (cb === 'unknown') && (ca === 'used' || cb === 'used' || ca === 'refurbished' || cb === 'refurbished')) conflicts.push('condition');

  const qa = extractLineQualifiers(a.title);
  const qb = extractLineQualifiers(b.title);
  if ([...qa].some((q) => !qb.has(q)) || [...qb].some((q) => !qa.has(q))) conflicts.push('line_qualifier');

  const na = extractLineNumbers(a.title);
  const nb = extractLineNumbers(b.title);
  if (na.size && nb.size) {
    const shared = [...na].filter((n) => nb.has(n)).length;
    if (shared === 0) conflicts.push('line_number');
  }

  const brand = brandsCompatible(a, b);
  if (brand === 'same') reasons.push('brand_match');

  // --- Identifier evidence ----------------------------------------------------------
  const ga = normaliseGtin(a.identifiers.gtin);
  const gb = normaliseGtin(b.identifiers.gtin);
  if (ga && gb && ga === gb) {
    reasons.push('gtin_match');
    const variantConflict = conflicts.includes('condition');
    return finish(variantConflict ? 'different_variant' : 'verified_exact', variantConflict ? 0.7 : 1);
  }
  if (brand === 'different') {
    conflicts.unshift('brand');
    return finish(null, 0);
  }
  if (ga && gb && ga !== gb) conflicts.push('different_gtin');

  const ma = mpnsOf(a);
  const mb = mpnsOf(b);
  const sharedMpn = [...ma].find((m) => mb.has(m) && m.length >= 4);
  if (sharedMpn) {
    const exactMpn = normaliseMpn(a.identifiers.mpn) === sharedMpn && normaliseMpn(b.identifiers.mpn) === sharedMpn;
    reasons.push(exactMpn ? 'mpn_match' : 'model_in_title');
    // A GTIN mismatch with the same MPN usually means a colour/region/pack variant.
    const hard = conflicts.filter((c) => c !== 'line_number');
    if (hard.length) return finish('different_variant', 0.6);
    if (attributesCompared > 0) reasons.push('attributes_match');
    return finish('high', exactMpn ? 0.95 : 0.9);
  }

  // Regional model codes such as SM-S928B vs SM-S928U / SM-S928E: same family, different variant.
  for (const x of ma) {
    for (const y of mb) {
      if (x !== y && x.length >= 6 && y.length >= 6 && commonPrefixLength(x, y) >= Math.min(x.length, y.length) - 2 && commonPrefixLength(x, y) >= 5) {
        conflicts.push('regional_model');
        return finish('different_variant', 0.55);
      }
    }
  }
  if (ma.size && mb.size && brand === 'same' && titleSimilarity < 0.6) conflicts.push('different_model');

  // --- Title evidence ---------------------------------------------------------------
  if (titleSimilarity >= 0.5) reasons.push('title_similar');
  if (conflicts.length) {
    const onlyMinor = conflicts.every((c) => c === 'line_number') && titleSimilarity >= 0.85;
    if (!onlyMinor) {
      const related = titleSimilarity >= 0.45 || (brand === 'same' && titleSimilarity >= 0.35);
      return finish(related ? 'different_variant' : null, titleSimilarity * 0.6);
    }
  }
  if (titleSimilarity >= 0.85 && brand === 'same' && attributesCompared > 0) {
    reasons.push('attributes_match');
    return finish('high', 0.75 + titleSimilarity * 0.1);
  }
  if (titleSimilarity >= 0.55) return finish('possible', 0.4 + titleSimilarity * 0.3);
  return finish(null, titleSimilarity * 0.3);

  function finish(confidence: MatchConfidence | null, score: number): MatchResult {
    return { confidence, score: Math.max(0, Math.min(1, score)), reasons: [...new Set(reasons)], conflicts: [...new Set(conflicts)], titleSimilarity };
  }
}

function withBrand(p: Matchable): string {
  const brand = p.brand && !normaliseText(p.title).includes(normaliseText(p.brand)) ? `${p.brand} ` : '';
  return `${brand}${p.title}`;
}

export const CONFIDENCE_ORDER: Record<MatchConfidence | 'source', number> = {
  source: 0,
  verified_exact: 1,
  high: 2,
  possible: 3,
  different_variant: 4,
};

/** Only these confidence levels may be ranked as "the same product" in comparisons. */
export function isRankableConfidence(c: MatchConfidence | 'source'): boolean {
  return c === 'source' || c === 'verified_exact' || c === 'high';
}

export interface DuplicateCandidate<T> {
  item: T;
  result: MatchResult;
  sameListing: boolean;
}

/**
 * Finds possible duplicates of `candidate` among existing items. Same normalised URL
 * is always a duplicate; otherwise exact/high-confidence matches are suggested for review.
 * Different variants are never reported as duplicates (they are kept separate).
 */
export function findDuplicates<T extends Matchable>(
  candidate: Matchable & { urlKey?: string },
  existing: readonly (T & { urlKeys?: string[] })[],
): DuplicateCandidate<T>[] {
  const out: DuplicateCandidate<T>[] = [];
  for (const item of existing) {
    const sameListing = !!candidate.urlKey && !!item.urlKeys?.includes(candidate.urlKey);
    const result = matchProducts(candidate, item);
    if (sameListing || result.confidence === 'verified_exact' || result.confidence === 'high') {
      out.push({ item, result, sameListing });
    }
  }
  return out.sort((x, y) => Number(y.sameListing) - Number(x.sameListing) || y.result.score - x.result.score);
}
