import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { AppContextForTests, makeFormatters, type AppState } from '@/ui/app/AppContext';
import { ToastProvider, ConfirmProvider } from '@/ui/components/overlay';
import { ProductForm } from '@/ui/components/ProductForm';
import { ProductCard } from '@/ui/components/product';
import { PriceChart } from '@/ui/components/PriceChart';
import { ComparisonView } from '@/ui/components/ComparisonView';
import { createTranslator } from '@/core/i18n';
import { defaultSettings } from '@/core/settings';
import { emptyDraft, type ProductDraft } from '@/core/draft';
import { summarise } from '@/core/summary';
import type { Settings } from '@/core/types';
import { DAY, NOW, TEST_FX, makeItem, makeOffer, obs } from './helpers';

function wrap(ui: ReactNode, patch: Partial<Settings> = {}) {
  const settings: Settings = { ...defaultSettings({ timeZone: 'Australia/Sydney', languages: ['en-AU'] }), onboarded: true, ...patch };
  const f = makeFormatters(settings, TEST_FX);
  const value: AppState = { settings, fx: TEST_FX, t: createTranslator(settings.language, f.locale), f, updateSettings: vi.fn(async () => settings) };
  return render(
    <AppContextForTests.Provider value={value}>
      <ToastProvider>
        <ConfirmProvider>{ui}</ConfirmProvider>
      </ToastProvider>
    </AppContextForTests.Provider>,
  );
}

describe('ProductForm (review before snagging)', () => {
  const base: ProductDraft = { ...emptyDraft('https://shop.example.com.bd/p/1'), title: 'Samsung Galaxy A55', price: 45999, currency: 'BDT', methods: ['visible_page'] };

  it('flags heuristic fields and offers page price candidates', async () => {
    const onSubmit = vi.fn();
    wrap(<ProductForm initial={base} extraction={{ heuristicFields: ['price'], priceCandidates: [{ amount: 44999, currency: 'BDT', text: '৳ ৪৪,৯৯৯' }], variants: [], warnings: [], methods: ['visible_page'] }} onSubmit={onSubmit} />);
    expect(screen.getByText('Detected from page text — please check')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '৳ ৪৪,৯৯৯' }));
    await userEvent.click(screen.getByRole('button', { name: 'Snag to Wishlist' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ price: 44999, currency: 'BDT', methods: ['visible_page'] }));
  });

  it('validates required fields, bad links and accepts Bengali digits', async () => {
    const onSubmit = vi.fn();
    wrap(<ProductForm initial={{ ...base, title: '', price: null }} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Snag to Wishlist' }));
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Product name'), 'Panjabi');
    await userEvent.type(screen.getByLabelText(/^Price/), '২৫০০');
    await userEvent.type(screen.getByLabelText(/^Target price/), '2000');
    await userEvent.click(screen.getByRole('button', { name: 'Snag to Wishlist' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Panjabi', price: 2500, targetPrice: 2000 }));
  });
});

describe('ProductCard', () => {
  it('shows real observed drop, target reached and approximate conversion', () => {
    const offer = makeOffer({ price: 399, history: { currency: 'AUD', firstPrice: 449, firstAt: NOW - 10 * DAY, minPrice: 399, maxPrice: 449, previousPrice: 449, lastChangeAt: NOW, count: 2 } });
    const summary = summarise(makeItem({ targetPrice: 400, targetCurrency: 'AUD' }), [offer], { settings: { ...defaultSettings(), displayCurrency: 'BDT', shoppingCountry: 'AU', deliveryCountry: 'AU' }, fx: TEST_FX, now: Date.now() });
    wrap(<ProductCard summary={summary} onOpen={() => undefined} />, { displayCurrency: 'BDT' });
    const card = screen.getByRole('button', { name: /Sony WH-1000XM5/ });
    expect(within(card).getByText('Target reached')).toBeInTheDocument();
    expect(within(card).getByText('11% drop')).toBeInTheDocument();
    // In an Australian locale AUD is written "$"; the BDT display currency shows as an approximation.
    expect(within(card).getByText('$399')).toBeInTheDocument();
    // CLDR's narrow BDT symbol is "Tk" in en-AU and "৳" in en-BD / bn-BD.
    expect(within(card).getByText(/≈ (৳|Tk)\s?31,920/)).toBeInTheDocument();
  });
});

describe('PriceChart', () => {
  it('shows an honest empty state instead of inventing history', () => {
    wrap(<PriceChart observations={[obs(449, 0)]} />);
    expect(screen.getByText('Not enough price history yet.')).toBeInTheDocument();
  });
});

describe('ComparisonView', () => {
  it('renders the verified headline, savings and incomplete totals', () => {
    const now = Date.now();
    const offers = [
      makeOffer({ id: 'o1', price: 449, lastVerifiedAt: now, shippingQuotes: [{ destinationCountry: 'AU', amount: 0, currency: 'AUD', source: 'page', recordedAt: now }] }),
      makeOffer({ id: 'o2', retailerName: 'Cheaper AU', price: 399, matchConfidence: 'verified_exact', lastVerifiedAt: now, shippingQuotes: [{ destinationCountry: 'AU', amount: 0, currency: 'AUD', source: 'page', recordedAt: now }] }),
      makeOffer({ id: 'o3', retailerName: 'Mystery Shipping', price: 350, matchConfidence: 'high', lastVerifiedAt: now }),
    ];
    wrap(<ComparisonView item={makeItem()} offers={offers} />, { shoppingCountry: 'AU', deliveryCountry: 'AU', displayCurrency: 'AUD' });
    expect(screen.getByText('Lowest verified total among 2 compared offers')).toBeInTheDocument();
    expect(screen.getByText('You could save $50')).toBeInTheDocument();
    expect(screen.getByText('Offers with incomplete totals')).toBeInTheDocument();
    expect(screen.getByText('Total incomplete')).toBeInTheDocument();
    expect(screen.getByText(/These open the store’s own search page/)).toBeInTheDocument();
  });
});
