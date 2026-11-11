import type { Translator } from '@/core/i18n';
import type { CheckOutcome } from './monitorService';

export interface CheckReport {
  /** Listings whose page was actually read (successfully or not). */
  checked: number;
  /** Successful checks where the price or stock changed. */
  changed: number;
  failed: number;
  /** Skipped because WishSnag has no permission for the store yet. */
  needsAccess: number;
  /** Skipped because the listing was just checked or the store asked us to slow down. */
  backedOff: number;
  total: number;
}

export function summariseOutcomes(outcomes: readonly CheckOutcome[]): CheckReport {
  const r: CheckReport = { checked: 0, changed: 0, failed: 0, needsAccess: 0, backedOff: 0, total: outcomes.length };
  for (const o of outcomes) {
    if (o.status === 'needs_permission') r.needsAccess++;
    else if (o.status === 'rate_limited') r.backedOff++;
    else {
      r.checked++;
      if (o.status === 'ok') {
        if (o.changed) r.changed++;
      } else r.failed++;
    }
  }
  return r;
}

/** Human explanation of a price-check run — never a bare "0 · 0 · 0". */
export function describeReport(r: CheckReport, t: Translator): { message: string; tone: 'success' | 'error' | 'info' } {
  if (r.total === 0) return { message: t('monitoring_none_enabled'), tone: 'info' };
  const parts: string[] = [];
  if (r.checked > 0) parts.push(t('monitoring_done', { checked: r.checked, updated: r.changed, failed: r.failed }));
  if (r.needsAccess > 0) parts.push(t.plural('monitoring_needs_access', r.needsAccess));
  if (r.backedOff > 0) parts.push(t('monitoring_backed_off', { count: r.backedOff }));
  const tone = r.checked > 0 && r.failed < r.checked ? 'success' : r.failed > 0 ? 'error' : 'info';
  return { message: parts.join(' '), tone };
}
