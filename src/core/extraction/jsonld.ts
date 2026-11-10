/**
 * Tolerant schema.org JSON-LD reader. Handles arrays, @graph, nested itemOffered,
 * URL-style @type values ("http://schema.org/Product") and a few common syntax slips
 * (HTML comments, CDATA wrappers, trailing commas, raw newlines in strings).
 */

export type JsonNode = Record<string, unknown>;

export function parseJsonLdBlock(text: string): unknown[] {
  const cleaned = text
    .replace(/^\s*<!--/, '')
    .replace(/-->\s*$/, '')
    .replace(/^\s*\/\/\s*<!\[CDATA\[/, '')
    .replace(/\/\/\s*\]\]>\s*$/, '')
    .trim();
  if (!cleaned) return [];
  for (const candidate of [cleaned, repair(cleaned)]) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      /* try next */
    }
  }
  return [];
}

function repair(text: string): string {
  // Remove trailing commas and escape raw control characters inside strings.
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      else if (ch === '\n' || ch === '\r' || ch === '\t') {
        out += ch === '\t' ? '\\t' : '\\n';
        continue;
      }
    } else if (ch === '"') inString = true;
    out += ch;
  }
  return out.replace(/,\s*([}\]])/g, '$1');
}

export function typesOf(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const t = (node as JsonNode)['@type'];
  const list = Array.isArray(t) ? t : t ? [t] : [];
  return list.filter((x): x is string => typeof x === 'string').map((x) => x.replace(/^https?:\/\/schema\.org\//i, '').replace(/^schema:/i, ''));
}

export function hasType(node: unknown, ...types: string[]): boolean {
  const own = typesOf(node).map((t) => t.toLowerCase());
  return types.some((t) => own.includes(t.toLowerCase()));
}

/** Depth-first walk over every object node (bounded). */
export function walk(roots: unknown[], visit: (node: JsonNode) => void, maxNodes = 5000): void {
  const stack: unknown[] = [...roots];
  const seen = new Set<unknown>();
  let count = 0;
  while (stack.length && count < maxNodes) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    count++;
    if (Array.isArray(node)) {
      for (const child of node) stack.push(child);
      continue;
    }
    visit(node as JsonNode);
    for (const value of Object.values(node as JsonNode)) if (value && typeof value === 'object') stack.push(value);
  }
}

export interface JsonLdIndex {
  products: JsonNode[];
  productGroups: JsonNode[];
  breadcrumbs: JsonNode[];
  itemLists: JsonNode[];
  /** Offers that reference a product via itemOffered. */
  standaloneOffers: JsonNode[];
}

const PRODUCT_TYPES = ['Product', 'IndividualProduct', 'ProductModel', 'SomeProducts', 'Vehicle', 'Book', 'Car'];

export function indexJsonLd(blocks: readonly string[]): JsonLdIndex {
  const roots = blocks.flatMap(parseJsonLdBlock);
  const index: JsonLdIndex = { products: [], productGroups: [], breadcrumbs: [], itemLists: [], standaloneOffers: [] };
  const groupVariants = new Set<unknown>();
  const listMembers = new Set<unknown>();
  walk(roots, (node) => {
    if (hasType(node, 'ProductGroup')) {
      index.productGroups.push(node);
      const variants = node.hasVariant;
      for (const v of Array.isArray(variants) ? variants : variants ? [variants] : []) groupVariants.add(v);
    } else if (hasType(node, ...PRODUCT_TYPES)) {
      index.products.push(node);
    } else if (hasType(node, 'BreadcrumbList')) {
      index.breadcrumbs.push(node);
    } else if (hasType(node, 'ItemList', 'OfferCatalog')) {
      index.itemLists.push(node);
      for (const el of asArray(node.itemListElement)) {
        listMembers.add(el);
        if (el && typeof el === 'object') listMembers.add((el as JsonNode).item);
      }
    } else if (hasType(node, 'Offer', 'AggregateOffer') && node.itemOffered && typeof node.itemOffered === 'object') {
      index.standaloneOffers.push(node);
    }
  });
  // Variants are reachable both via the group and as standalone Product nodes; keep the
  // top-level product list free of group variants so the group logic handles them.
  // Products listed inside an ItemList (wishlists, category pages) are list entries,
  // not the page's own product.
  index.products = index.products.filter((p) => !groupVariants.has(p) && !listMembers.has(p));
  return index;
}

export function str(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return str(value[0]);
  if (value && typeof value === 'object') {
    const v = value as JsonNode;
    return str(v.name ?? v['@value'] ?? v.value);
  }
  return undefined;
}

export function asArray(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function imageUrls(value: unknown): string[] {
  const out: string[] = [];
  for (const v of asArray(value)) {
    if (typeof v === 'string') out.push(v);
    else if (v && typeof v === 'object') {
      const n = v as JsonNode;
      const u = str(n.contentUrl) ?? str(n.url) ?? str(n.thumbnailUrl);
      if (u) out.push(u);
    }
  }
  return out;
}
