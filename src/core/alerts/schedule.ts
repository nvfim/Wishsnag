/** Quiet hours, daily digests and per-item cooldowns for desktop notifications. */

export function parseClock(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** True when `date` (local time) falls inside [start, end), supporting overnight ranges like 22:00–08:00. */
export function isQuietTime(date: Date, start: string, end: string): boolean {
  const s = parseClock(start);
  const e = parseClock(end);
  if (s === null || e === null || s === e) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  return s < e ? now >= s && now < e : now >= s || now < e;
}

/** Next local time at which quiet hours end (used to schedule held notifications). */
export function nextQuietEnd(date: Date, end: string): Date {
  const e = parseClock(end) ?? 0;
  const next = new Date(date);
  next.setSeconds(0, 0);
  next.setHours(Math.floor(e / 60), e % 60);
  if (next.getTime() <= date.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

export function nextDigestTime(date: Date, hour: number): Date {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  next.setHours(Math.max(0, Math.min(23, Math.round(hour))));
  if (next.getTime() <= date.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

export type DesktopDecision = 'send' | 'hold' | 'suppress' | 'disabled';

export interface DesktopDecisionInput {
  now: Date;
  desktopEnabled: boolean;
  frequency: 'instant' | 'daily';
  quietHours: { enabled: boolean; start: string; end: string };
  cooldownHours: number;
  /** Last time a desktop notification was shown for this item. */
  lastSentForItem: number | null;
}

export function decideDesktopDelivery(input: DesktopDecisionInput): DesktopDecision {
  if (!input.desktopEnabled) return 'disabled';
  if (input.lastSentForItem !== null && input.now.getTime() - input.lastSentForItem < input.cooldownHours * 3600_000) return 'suppress';
  if (input.frequency === 'daily') return 'hold';
  if (input.quietHours.enabled && isQuietTime(input.now, input.quietHours.start, input.quietHours.end)) return 'hold';
  return 'send';
}
