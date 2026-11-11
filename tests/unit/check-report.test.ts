import { describe, expect, it } from 'vitest';
import { describeReport, summariseOutcomes } from '@/services/checkReport';
import { createTranslator } from '@/core/i18n';

const en = createTranslator('en');
const bn = createTranslator('bn');

describe('price-check result messages', () => {
  it('explains a listing skipped for lack of store access (instead of "0 · 0 · 0")', () => {
    const r = summariseOutcomes([{ offerId: 'o1', status: 'needs_permission' }]);
    expect(r).toMatchObject({ checked: 0, needsAccess: 1, total: 1 });
    const { message, tone } = describeReport(r, en);
    expect(message).toBe('1 listing was skipped because WishSnag needs your permission for that store. Open the item and click “Allow WishSnag to check …”.');
    expect(message).not.toContain('0 checked');
    expect(tone).toBe('info');
    expect(describeReport(r, bn).message).toContain('অনুমতি');
  });

  it('says when nothing has checks turned on', () => {
    expect(describeReport(summariseOutcomes([]), en).message).toBe('Nothing to check yet — open an item and switch on “Automatic price checks” first.');
  });

  it('counts real changes, failures and back-offs separately', () => {
    const r = summariseOutcomes([
      { offerId: 'a', status: 'ok', changed: true },
      { offerId: 'b', status: 'ok', changed: false },
      { offerId: 'c', status: 'blocked' },
      { offerId: 'd', status: 'rate_limited' },
      { offerId: 'e', status: 'needs_permission' },
      { offerId: 'f', status: 'needs_permission' },
    ]);
    expect(r).toEqual({ checked: 3, changed: 1, failed: 1, needsAccess: 2, backedOff: 1, total: 6 });
    const { message, tone } = describeReport(r, en);
    expect(message).toContain('Price check done: 3 checked, 1 changed, 1 failed.');
    expect(message).toContain('2 listings were skipped');
    expect(message).toContain('1 skipped — checked very recently');
    expect(tone).toBe('success');
  });

  it('flags a run where every check failed', () => {
    expect(describeReport(summariseOutcomes([{ offerId: 'a', status: 'http_error' }]), en).tone).toBe('error');
  });
});
