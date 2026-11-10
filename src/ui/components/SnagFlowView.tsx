import { CircleCheck, ExternalLink, Heart, Layers, PencilLine, ShieldAlert } from 'lucide-react';
import { useApp } from '../app/AppContext';
import type { useSnagFlow } from '../hooks/useSnagFlow';
import { openDashboard } from '../lib/nav';
import { LogoMark } from './Logo';
import { Badge, Button, Card, cn } from './primitives';
import { ConfidenceBadge, ProductImage } from './product';
import { ProductForm } from './ProductForm';
import { useToast } from './overlay';

type Flow = ReturnType<typeof useSnagFlow>;

export function DetectingState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
      <div className="animate-snag">
        <LogoMark size={52} />
      </div>
      <p className="text-sm font-medium text-muted">{label}</p>
    </div>
  );
}

export function SnagFlowView({ flow, compact = true, onDone }: { flow: Flow; compact?: boolean; onDone?: () => void }) {
  const { t } = useApp();
  const toast = useToast();
  const { state, busy } = flow;

  if (state.phase === 'detecting') return <DetectingState label={t('snag_detecting')} />;

  if (state.phase === 'saved' && state.draft) {
    return (
      <Card className="flex flex-col items-center gap-3 p-5 text-center animate-pop-in">
        <div className="relative">
          <ProductImage src={state.draft.imageUrl} alt={state.draft.title} className="size-20 border border-line p-1.5" />
          <span className="absolute -right-2 -bottom-2 grid size-8 place-items-center rounded-full bg-mint-500 text-white shadow-lg ring-4 ring-surface">
            <CircleCheck className="size-5" />
          </span>
        </div>
        <div>
          <h3 className="font-display text-base font-extrabold text-fg">{state.savedAsOffer ? t('snag_offer_added', { name: state.draft.title.slice(0, 40) }) : t('snag_success')}</h3>
          <p className="mt-1 line-clamp-2 text-[13px] text-muted">{state.draft.title}</p>
        </div>
        <div className="flex w-full gap-2">
          <Button block onClick={() => (onDone ? onDone() : flow.reset())}>
            {t('act_done')}
          </Button>
          <Button block variant="primary" icon={<ExternalLink className="size-4" />} onClick={() => state.savedItemId && openDashboard(`/item/${state.savedItemId}`)}>
            {t('act_open')}
          </Button>
        </div>
      </Card>
    );
  }

  if (state.phase === 'duplicate' && state.draft && state.duplicates) {
    const { sameListing, candidates } = state.duplicates;
    if (sameListing) {
      return (
        <Card className="flex flex-col gap-3 p-4 animate-pop-in">
          <div className="flex items-center gap-3">
            <ProductImage src={sameListing.item.imageUrl} alt={sameListing.item.title} className="size-14 border border-line p-1" />
            <div className="min-w-0">
              <Badge tone="lilac" icon={<Heart className="size-3 fill-current" />}>
                {t('sp_in_wishlist')}
              </Badge>
              <p className="mt-1 line-clamp-2 text-[13px] font-semibold text-fg">{sameListing.item.title}</p>
            </div>
          </div>
          <p className="text-[13px] text-muted">{t('snag_already_saved')}</p>
          <div className="flex gap-2">
            <Button block onClick={flow.backToReview}>
              {t('act_back')}
            </Button>
            <Button block variant="primary" onClick={() => openDashboard(`/item/${sameListing.item.id}`)}>
              {t('snag_view_existing')}
            </Button>
          </div>
        </Card>
      );
    }
    const top = candidates[0]!;
    return (
      <Card className="flex flex-col gap-3 p-4 animate-pop-in">
        <div className="flex items-start gap-2">
          <Layers className="mt-0.5 size-5 shrink-0 text-accent" />
          <div>
            <h3 className="text-sm font-bold text-fg">{t('snag_possible_duplicate')}</h3>
            <p className="mt-0.5 text-[12.5px] text-muted">{t('snag_possible_duplicate_body', { name: top.item.title.slice(0, 60) })}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-2">
          <ProductImage src={top.item.imageUrl} alt={top.item.title} className="size-12 border border-line p-1" rounded="rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">{top.item.title}</p>
            <ConfidenceBadge confidence={top.result.confidence ?? 'possible'} />
          </div>
        </div>
        <div className="grid gap-2">
          <Button variant="primary" loading={busy} onClick={() => void flow.addAsOffer(top.item.id, state.draft!).then(() => toast.show(t('snag_offer_added', { name: top.item.title.slice(0, 40) })))}>
            {t('snag_add_as_offer')}
          </Button>
          <div className="flex gap-2">
            <Button block onClick={() => void flow.saveNew(state.draft!)} disabled={busy}>
              {t('snag_save_anyway')}
            </Button>
            <Button block variant="ghost" onClick={flow.backToReview}>
              {t('act_back')}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  if (state.phase === 'review' && state.draft) {
    const note =
      state.error === 'restricted'
        ? t('snag_restricted')
        : state.error === 'no_access'
          ? t('sp_or_click')
          : state.error || state.extraction?.status === 'none'
            ? t('snag_unsupported_body')
            : state.extraction?.status === 'partial'
              ? t('snag_review_hint')
              : null;
    return (
      <div className="flex flex-col gap-3 animate-fade-up">
        {note && (
          <div className={cn('flex gap-2 rounded-2xl px-3 py-2.5 text-[12.5px]', state.error ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-accent')}>
            {state.error ? <ShieldAlert className="mt-px size-4 shrink-0" /> : <PencilLine className="mt-px size-4 shrink-0" />}
            <div>
              {(state.error || state.extraction?.status === 'none') && <b className="block">{state.error === 'restricted' ? t('sp_restricted') : t('snag_unsupported_title')}</b>}
              {note}
            </div>
          </div>
        )}
        <ProductForm
          key={state.draft.url + state.draft.title}
          initial={state.draft}
          extraction={state.extraction ?? undefined}
          compact={compact}
          busy={busy}
          onSubmit={(d) => void flow.submit(d)}
          onCancel={onDone ?? flow.reset}
        />
      </div>
    );
  }
  return null;
}
