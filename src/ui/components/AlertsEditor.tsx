import { useState } from 'react';
import { BellOff, Check, Target } from 'lucide-react';
import type { AlertType, PriceAlert, WishlistItem } from '@/core/types';
import { updateItem, upsertAlert } from '@/db/repo';
import { useApp } from '../app/AppContext';
import { Input, Toggle, parseNumberInput } from './forms';
import { Button, cn } from './primitives';
import { useToast } from './overlay';

const ORDER: AlertType[] = ['below_target', 'percent_drop', 'amount_drop', 'lowest_in_period', 'cheaper_offer', 'back_in_stock'];

export function AlertsEditor({ item, alerts, currency, compact }: { item: WishlistItem; alerts: PriceAlert[]; currency: string | null; compact?: boolean }) {
  const { t, f, settings } = useApp();
  const byType = new Map(alerts.map((a) => [a.type, a]));
  const cur = item.targetCurrency ?? currency ?? settings.displayCurrency;
  return (
    <div className="flex flex-col gap-3">
      {!settings.alerts.enabled && (
        <p className="flex items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
          <BellOff className="size-4" /> {t('detail_alerts_disabled_globally')}
        </p>
      )}
      {ORDER.filter((type) => !compact || ['below_target', 'percent_drop', 'cheaper_offer', 'back_in_stock'].includes(type)).map((type) => {
        const a = byType.get(type);
        const enabled = !!a?.enabled;
        const label =
          type === 'percent_drop'
            ? t('alert_percent_drop', { value: a?.threshold ?? settings.alerts.defaultDropPercent })
            : type === 'amount_drop'
              ? t('alert_amount_drop', { amount: a?.threshold ? f.money(a.threshold, cur) : '…' })
              : type === 'lowest_in_period'
                ? t('alert_lowest_in_period', { days: a?.periodDays ?? 30 })
                : t(`alert_${type}`);
        const needsTarget = type === 'below_target' && item.targetPrice === null;
        return (
          <div key={type} className="flex flex-col gap-2">
            <Toggle
              checked={enabled && !needsTarget}
              disabled={needsTarget}
              onChange={(v) => void upsertAlert(item.id, type, { enabled: v, ...(type === 'percent_drop' && !a?.threshold ? { threshold: settings.alerts.defaultDropPercent } : {}) })}
              label={label}
              description={needsTarget ? t('alert_needs_target') : undefined}
            />
            {enabled && !compact && (type === 'percent_drop' || type === 'amount_drop' || type === 'lowest_in_period') && <ThresholdInput alert={a!} />}
          </div>
        );
      })}
    </div>
  );
}

function ThresholdInput({ alert }: { alert: PriceAlert }) {
  const { t } = useApp();
  const isPeriod = alert.type === 'lowest_in_period';
  const [value, setValue] = useState(String((isPeriod ? alert.periodDays : alert.threshold) ?? ''));
  const save = () => {
    const n = parseNumberInput(value);
    if (n === null || Number.isNaN(n) || n <= 0) return;
    void upsertAlert(alert.itemId, alert.type, isPeriod ? { periodDays: Math.round(n) } : { threshold: n });
  };
  return (
    <div className="ml-0 flex items-center gap-2 pl-0">
      <span className="text-[12px] text-muted">{isPeriod ? t('alert_period') : t('alert_threshold')}</span>
      <Input className="h-8 w-24 tabular" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && save()} aria-label={isPeriod ? t('alert_period') : t('alert_threshold')} />
      {alert.type === 'percent_drop' && <span className="text-[12px] text-muted">%</span>}
    </div>
  );
}

export function TargetPriceEditor({ item, currency, latest, compact }: { item: WishlistItem; currency: string | null; latest: number | null; compact?: boolean }) {
  const { t, f, settings } = useApp();
  const toast = useToast();
  const cur = item.targetCurrency ?? currency ?? settings.displayCurrency;
  const [value, setValue] = useState(item.targetPrice === null ? '' : String(item.targetPrice));
  const reached = item.targetPrice !== null && latest !== null && latest <= item.targetPrice && cur === currency;
  const save = async () => {
    const n = parseNumberInput(value);
    if (Number.isNaN(n)) return;
    await updateItem(item.id, { targetPrice: n, targetCurrency: n === null ? null : cur });
    toast.show(t('alert_saved'));
  };
  return (
    <div className={cn('flex flex-col gap-2', compact && 'gap-1.5')}>
      <div className="flex items-center gap-2">
        <label className="relative flex-1">
          <span className="sr-only">{t('field_target_price')}</span>
          <Target className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-hot" />
          <Input className="tabular pl-9" inputMode="decimal" value={value} placeholder={latest ? String(Math.round(latest * 0.85)) : t('detail_set_target')} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] font-semibold text-muted">{cur}</span>
        </label>
        <Button size="md" variant="soft" icon={<Check className="size-4" />} onClick={() => void save()}>
          {t('act_save')}
        </Button>
      </div>
      {reached ? (
        <p className="rounded-xl bg-hot-soft px-3 py-2 text-[12.5px] font-semibold text-hot">{t('detail_target_reached')}</p>
      ) : item.targetPrice !== null && latest !== null && cur === currency ? (
        <p className="text-[12px] text-muted">{t('detail_target_gap', { amount: f.money(Math.max(0, latest - item.targetPrice), cur) })}</p>
      ) : null}
    </div>
  );
}
