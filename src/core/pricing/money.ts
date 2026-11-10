import type { CurrencyCode } from '../types';
import { currencyDigits } from './currency';

/** Converts a major-unit amount to integer minor units, avoiding binary float drift. */
export function toMinor(amount: number, currency: CurrencyCode): number {
  const digits = currencyDigits(currency);
  return Math.round(Number(`${amount.toFixed(Math.min(digits + 4, 20))}e${digits}`));
}

export function fromMinor(minor: number, currency: CurrencyCode): number {
  const digits = currencyDigits(currency);
  return Number(`${minor}e-${digits}`);
}

/** Rounds a major-unit amount to the currency's precision. */
export function roundMoney(amount: number, currency: CurrencyCode): number {
  return fromMinor(toMinor(amount, currency), currency);
}

export function sumMoney(amounts: readonly number[], currency: CurrencyCode): number {
  return fromMinor(
    amounts.reduce((acc, a) => acc + toMinor(a, currency), 0),
    currency,
  );
}

export function subtractMoney(a: number, b: number, currency: CurrencyCode): number {
  return fromMinor(toMinor(a, currency) - toMinor(b, currency), currency);
}

/** Percentage change from `from` to `to` (negative = cheaper). */
export function percentChange(from: number, to: number): number {
  if (!Number.isFinite(from) || from === 0) return 0;
  return ((to - from) / from) * 100;
}

export function isValidPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1e12;
}
