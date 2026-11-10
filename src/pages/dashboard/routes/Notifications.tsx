import { BellRing, PackageCheck, Sparkles, Target, TrendingDown } from 'lucide-react';
import type { AppNotification } from '@/core/types';
import { notificationKindIcon } from '@/core/alerts/messages';
import { clearNotifications, markNotificationsRead } from '@/db/repo';
import { send } from '@/services/messages';
import { useApp } from '@/ui/app/AppContext';
import { useNotifications } from '@/ui/hooks/data';
import { Button, Card, EmptyState, SectionHeader, cn } from '@/ui/components/primitives';
import { useConfirm } from '@/ui/components/overlay';
import { openExternal } from '@/ui/lib/nav';
import { navigate } from '../router';

const ICONS = { drop: TrendingDown, target: Target, stock: PackageCheck, cheaper: Sparkles, system: BellRing } as const;
const TONES = { drop: 'bg-savings-soft text-savings', target: 'bg-hot-soft text-hot', stock: 'bg-accent-soft text-accent', cheaper: 'bg-savings-soft text-savings', system: 'bg-surface-2 text-muted' } as const;

export function NotificationList({ notifications, compact, onNavigate }: { notifications: AppNotification[]; compact?: boolean; onNavigate?: () => void }) {
  const { t, f } = useApp();
  if (!notifications.length) return <EmptyState compact icon={<BellRing className="size-6" />} title={t('notif_empty')} />;
  return (
    <ul className="flex flex-col gap-1">
      {notifications.map((n) => {
        const kind = notificationKindIcon(n.kind);
        const Icon = ICONS[kind];
        return (
          <li key={n.id}>
            <div className={cn('flex gap-3 rounded-2xl p-3 transition-colors hover:bg-surface-2', !n.readAt && 'bg-accent-soft/40')}>
              <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', TONES[kind])}>
                <Icon className="size-[18px]" />
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={async () => {
                  await markNotificationsRead([n.id]);
                  void send({ type: 'badge:refresh' }).catch(() => undefined);
                  onNavigate?.();
                  if (n.itemId) navigate(`/item/${n.itemId}`);
                }}
              >
                <p className="text-[13.5px] font-bold text-fg">{n.title}</p>
                <p className={cn('text-[12.5px] text-muted', compact && 'line-clamp-2')}>{n.message}</p>
                <p className="mt-0.5 text-[11px] text-muted">{f.relative(n.createdAt)}</p>
              </button>
              {n.url && !compact && (
                <Button size="sm" variant="soft" onClick={() => openExternal(n.url)}>
                  {n.ctaLabel}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function NotificationsPage() {
  const { t } = useApp();
  const confirm = useConfirm();
  const list = useNotifications(500);
  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader
        title={t('notif_title')}
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void markNotificationsRead().then(() => send({ type: 'badge:refresh' }).catch(() => undefined))}>
              {t('notif_mark_all_read')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={async () => {
                if (await confirm({ title: t('notif_clear'), confirmLabel: t('notif_clear'), cancelLabel: t('act_cancel'), danger: true })) {
                  await clearNotifications();
                  void send({ type: 'badge:refresh' }).catch(() => undefined);
                }
              }}
            >
              {t('notif_clear')}
            </Button>
          </div>
        }
      />
      <Card className="p-2">
        <NotificationList notifications={list ?? []} />
      </Card>
    </div>
  );
}
