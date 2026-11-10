import { useEffect } from 'react';
import { Link2 } from 'lucide-react';
import { kv, STORAGE_KEYS } from '@/platform/storage';
import type { PendingDraft } from '@/background/index';
import { useApp } from '@/ui/app/AppContext';
import { useSnagFlow } from '@/ui/hooks/useSnagFlow';
import { Card, SectionHeader } from '@/ui/components/primitives';
import { SnagFlowView } from '@/ui/components/SnagFlowView';
import { navigate, type Route } from '../router';

export function AddProduct({ route }: { route: Route }) {
  const { t } = useApp();
  const flow = useSnagFlow();
  const { manual, loadExtraction } = flow;
  useEffect(() => {
    void (async () => {
      if (route.query.get('pending')) {
        const p = await kv().get<PendingDraft>(STORAGE_KEYS.pendingDraft);
        if (p && Date.now() - p.createdAt < 5 * 60_000) {
          await kv().remove(STORAGE_KEYS.pendingDraft);
          if (p.manual) return manual(p.manual);
          if (p.extraction) return loadExtraction(p.extraction);
        }
      }
      manual({ url: route.query.get('url') ?? '' });
    })();
  }, [route.query, manual, loadExtraction]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <SectionHeader title={t('snag_manual_title')} subtitle={t('snag_unsupported_body')} />
      <Card className="p-5">
        <SnagFlowView flow={flow} compact={false} onDone={() => navigate('/wishlist')} />
      </Card>
      <p className="flex items-center gap-2 text-[12.5px] text-muted">
        <Link2 className="size-4" /> {t('gs_step1')}
      </p>
    </div>
  );
}
