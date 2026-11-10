import { useCallback, useState } from 'react';
import type { ExtractionResult } from '@/core/types';
import { draftFromExtraction, emptyDraft, type ProductDraft } from '@/core/draft';
import { addDraftAsOffer, checkDuplicates, saveDraftAsNewItem, type DuplicateReport } from '@/db/repo';
import { send, type ExtractError, type TabInfo } from '@/services/messages';
import { useApp } from '../app/AppContext';

export type SnagPhase = 'idle' | 'detecting' | 'review' | 'duplicate' | 'saved';

export interface SnagState {
  phase: SnagPhase;
  extraction: ExtractionResult | null;
  draft: ProductDraft | null;
  error: ExtractError | null;
  tab: TabInfo | null;
  duplicates: DuplicateReport | null;
  savedItemId: string | null;
  savedAsOffer: boolean;
}

const INITIAL: SnagState = { phase: 'idle', extraction: null, draft: null, error: null, tab: null, duplicates: null, savedItemId: null, savedAsOffer: false };

/**
 * Detect → review → duplicate check → save. Shared by the popup and side panel.
 * Extraction failures always fall back to manual entry (never a dead end).
 */
export function useSnagFlow() {
  const { settings } = useApp();
  const [state, setState] = useState<SnagState>(INITIAL);
  const [busy, setBusy] = useState(false);

  const loadExtraction = useCallback((res: { ok: true; result: ExtractionResult; tab: TabInfo | null } | { ok: false; error: ExtractError; tab?: TabInfo | null }) => {
    if (res.ok) {
      const draft = draftFromExtraction(res.result);
      if (res.result.status === 'none') draft.methods = ['manual'];
      setState({ ...INITIAL, phase: 'review', extraction: res.result, draft, tab: res.tab, error: res.result.status === 'none' ? 'failed' : null });
    } else {
      const url = res.tab?.url && !res.tab.restricted ? res.tab.url : '';
      const draft = emptyDraft(url);
      draft.title = res.tab?.title ?? '';
      setState({ ...INITIAL, phase: 'review', draft, error: res.error, tab: res.tab ?? null });
    }
  }, []);

  const detect = useCallback(
    async (tabId?: number) => {
      setState({ ...INITIAL, phase: 'detecting' });
      try {
        loadExtraction(await send({ type: 'tab:extract', tabId }));
      } catch {
        loadExtraction({ ok: false, error: 'failed' });
      }
    },
    [loadExtraction],
  );

  const manual = useCallback((seed?: Partial<ProductDraft>) => {
    setState({ ...INITIAL, phase: 'review', draft: { ...emptyDraft(seed?.url ?? ''), ...seed } });
  }, []);

  const saveNew = useCallback(
    async (draft: ProductDraft) => {
      setBusy(true);
      try {
        const { item } = await saveDraftAsNewItem(draft, settings);
        setState((s) => ({ ...s, phase: 'saved', draft, savedItemId: item.id, savedAsOffer: false, duplicates: null }));
      } finally {
        setBusy(false);
      }
    },
    [settings],
  );

  const addAsOffer = useCallback(
    async (itemId: string, draft: ProductDraft) => {
      setBusy(true);
      try {
        await addDraftAsOffer(itemId, draft, settings);
        setState((s) => ({ ...s, phase: 'saved', draft, savedItemId: itemId, savedAsOffer: true, duplicates: null }));
      } finally {
        setBusy(false);
      }
    },
    [settings],
  );

  const submit = useCallback(
    async (draft: ProductDraft) => {
      setBusy(true);
      try {
        const report = await checkDuplicates(draft);
        if (report.sameListing || report.candidates.length) {
          setState((s) => ({ ...s, phase: 'duplicate', draft, duplicates: report }));
          return;
        }
      } finally {
        setBusy(false);
      }
      await saveNew(draft);
    },
    [saveNew],
  );

  const reset = useCallback(() => setState(INITIAL), []);
  const backToReview = useCallback(() => setState((s) => ({ ...s, phase: 'review', duplicates: null })), []);

  return { state, busy, detect, manual, submit, saveNew, addAsOffer, reset, backToReview, loadExtraction };
}
