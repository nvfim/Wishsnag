import type { Collection, RetailerOffer, WishlistItem } from '../types';
import { draftFromInput, type ProductDraft } from '../draft';
import { parseAmount } from '../pricing/parsePrice';
import { csvToObjects, toCsv } from './csv';

export const CSV_COLUMNS = [
  'title', 'url', 'price', 'currency', 'retailer', 'retailer_country', 'brand', 'model', 'gtin', 'mpn', 'category',
  'colour', 'size', 'storage', 'condition', 'availability', 'priority', 'target_price', 'tags', 'notes', 'collections',
  'status', 'image_url', 'saved_at',
] as const;

export function csvTemplate(): string {
  return toCsv(CSV_COLUMNS, [
    ['Sony WH-1000XM5 Wireless Headphones', 'https://www.example.com.au/products/sony-wh1000xm5', '449', 'AUD', 'Example Store', 'AU', 'Sony', 'WH-1000XM5', '', 'WH1000XM5B', 'Headphones', 'Black', '', '', 'new', 'in_stock', 'high', '379', 'audio;gift', 'Wait for a sale', 'Tech I Want', 'wanted', '', ''],
  ]);
}

export function itemsToCsv(items: readonly WishlistItem[], offers: ReadonlyMap<string, RetailerOffer>, collections: readonly Collection[]): string {
  const names = new Map(collections.map((c) => [c.id, c.name]));
  return toCsv(
    CSV_COLUMNS,
    items.map((it) => {
      const o = it.primaryOfferId ? offers.get(it.primaryOfferId) : undefined;
      return [
        it.title, o?.url ?? '', o?.price ?? '', o?.currency ?? '', o?.retailerName ?? '', o?.retailerCountry ?? '', it.brand ?? '', it.model ?? '',
        it.identifiers.gtin ?? '', it.identifiers.mpn ?? '', it.category ?? '', it.variant.colour ?? '', it.variant.size ?? '', it.variant.storage ?? '',
        it.condition, o?.availability ?? 'unknown', it.priority, it.targetPrice ?? '', it.tags.join(';'), it.notes,
        it.collectionIds.map((id) => names.get(id)).filter(Boolean).join(';'), it.status, it.imageUrl ?? '', new Date(it.createdAt).toISOString(),
      ];
    }),
  );
}

export interface CsvImportRow {
  row: number;
  draft?: ProductDraft;
  collectionNames: string[];
  error?: string;
}

const lower = (s: string | undefined) => (s ?? '').trim().toLowerCase();

export function csvToDrafts(text: string): CsvImportRow[] {
  const { header, rows } = csvToObjects(text);
  if (!header.includes('title')) return [{ row: 1, collectionNames: [], error: 'Missing "title" column' }];
  return rows.slice(0, 5000).map((r, i) => {
    const rowNo = i + 2;
    const price = r.price ? parseAmount(r.price) : null;
    const target = r.target_price ? parseAmount(r.target_price) : null;
    if (r.price && price === null) return { row: rowNo, collectionNames: [], error: 'Invalid price' };
    const condition = ['new', 'used', 'refurbished', 'damaged', 'unknown'].includes(lower(r.condition)) ? lower(r.condition) : 'new';
    const availability = ['in_stock', 'out_of_stock', 'preorder', 'backorder', 'limited', 'discontinued', 'unknown'].includes(lower(r.availability)) ? lower(r.availability) : 'unknown';
    const priority = ['low', 'medium', 'high'].includes(lower(r.priority)) ? lower(r.priority) : 'medium';
    const savedAt = r.saved_at ? Date.parse(r.saved_at) : NaN;
    const res = draftFromInput({
      title: r.title ?? '',
      url: r.url ?? '',
      price,
      currency: price !== null ? (r.currency || null) : null,
      brand: r.brand,
      model: r.model,
      gtin: r.gtin || undefined,
      mpn: r.mpn,
      category: r.category,
      colour: r.colour,
      size: r.size,
      storage: r.storage,
      condition: condition as 'new',
      availability: availability as 'unknown',
      priority: priority as 'medium',
      targetPrice: target,
      tags: (r.tags ?? '').split(/[;,]/),
      notes: r.notes ?? '',
      status: lower(r.status) === 'purchased' ? 'purchased' : 'wanted',
      imageUrl: r.image_url || undefined,
      retailerName: r.retailer || undefined,
      retailerCountry: r.retailer_country ? r.retailer_country.toUpperCase() : undefined,
      savedAt: Number.isFinite(savedAt) ? savedAt : undefined,
    });
    if (!res.ok) return { row: rowNo, collectionNames: [], error: Object.entries(res.errors).map(([k, v]) => `${k}: ${v}`).join(', ') };
    res.draft.methods = ['manual'];
    return { row: rowNo, draft: res.draft, collectionNames: (r.collections ?? '').split(';').map((s) => s.trim()).filter(Boolean) };
  });
}
