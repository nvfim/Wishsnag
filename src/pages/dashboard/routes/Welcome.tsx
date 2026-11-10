import { useState } from 'react';
import { ArrowLeft, ArrowRight, BellRing, Heart, MapPin, PartyPopper } from 'lucide-react';
import type { Settings } from '@/core/types';
import { useApp } from '@/ui/app/AppContext';
import { LogoMark } from '@/ui/components/Logo';
import { Toggle } from '@/ui/components/forms';
import { Button, Card } from '@/ui/components/primitives';
import { DeliveryLocationFields, RegionFields } from '@/ui/components/RegionFields';
import { navigate } from '../router';

/** First-run onboarding. Country choices are confirmed by the user — never assumed. */
export function Welcome() {
  const { t, settings, updateSettings } = useApp();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Settings>(settings);
  const total = 4;
  const patch = (p: Partial<Settings>) => {
    const next = { ...draft, ...p };
    setDraft(next);
    // Language switches immediately so the rest of onboarding is readable.
    if (p.language && p.language !== settings.language) void updateSettings({ language: p.language });
  };
  const finish = async () => {
    await updateSettings({ ...draft, onboarded: true });
    navigate('/');
  };
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 py-4">
      <div className="flex items-center justify-between text-[12.5px] font-semibold text-muted">
        <span>{t('onb_step', { step: step + 1, total })}</span>
        <div className="flex gap-1.5" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i <= step ? 'w-6 bg-lilac-500' : 'w-3 bg-line'}`} />
          ))}
        </div>
      </div>
      <Card className="flex flex-col gap-5 p-6 sm:p-8 animate-fade-up" key={step}>
        {step === 0 && (
          <div className="flex flex-col items-center gap-4 text-center">
            <LogoMark size={84} />
            <h1 className="font-display text-3xl font-extrabold">{t('onb_welcome_title')}</h1>
            <p className="brand-text font-display text-lg font-extrabold">{t('tagline')}</p>
            <p className="max-w-md text-[14px] text-muted">{t('onb_welcome_body')}</p>
            <div className="mt-2 grid w-full gap-3 text-left sm:grid-cols-3">
              {[t('gs_step1'), t('gs_step2'), t('gs_step3')].map((s, i) => (
                <div key={i} className="rounded-2xl bg-surface-2 p-3 text-[12.5px] text-muted">
                  <span className="mb-1 block font-display text-lg font-extrabold text-accent">{i + 1}</span>
                  {s}
                </div>
              ))}
            </div>
          </div>
        )}
        {step === 1 && (
          <>
            <Header icon={<Heart className="size-5" />} title={t('onb_region_title')} body={t('onb_region_body')} />
            <RegionFields value={draft} onChange={patch} />
            <p className="rounded-2xl bg-surface-2 px-3 py-2 text-[12.5px] text-muted">{t('onb_coverage_note')}</p>
          </>
        )}
        {step === 2 && (
          <>
            <Header icon={<MapPin className="size-5" />} title={t('onb_location_title')} body={t('onb_location_body')} />
            <DeliveryLocationFields country={draft.deliveryCountry} value={draft.deliveryLocation} onChange={(deliveryLocation) => setDraft({ ...draft, deliveryLocation })} />
          </>
        )}
        {step === 3 && (
          <>
            <Header icon={<BellRing className="size-5" />} title={t('onb_alerts_title')} body={t('onb_alerts_body')} />
            <Toggle checked={draft.alerts.enabled} onChange={(enabled) => setDraft({ ...draft, alerts: { ...draft.alerts, enabled } })} label={t('alerts_enabled')} />
            <Toggle checked={draft.alerts.desktop} onChange={(desktop) => setDraft({ ...draft, alerts: { ...draft.alerts, desktop } })} label={t('alerts_desktop')} />
            <Toggle checked={draft.monitoring.enabled} onChange={(enabled) => setDraft({ ...draft, monitoring: { ...draft.monitoring, enabled } })} label={t('monitoring_enabled')} description={t('monitoring_explainer')} />
            <div className="mt-2 flex flex-col items-center gap-2 text-center">
              <PartyPopper className="size-8 text-hot" />
              <p className="font-display text-lg font-bold">{t('onb_done_title')}</p>
              <p className="text-[13px] text-muted">{t('onb_done_body')}</p>
            </div>
          </>
        )}
        <div className="flex justify-between gap-2">
          {step > 0 ? (
            <Button icon={<ArrowLeft className="size-4" />} onClick={() => setStep((s) => s - 1)}>
              {t('act_back')}
            </Button>
          ) : (
            <span />
          )}
          {step < total - 1 ? (
            <Button variant="primary" onClick={() => setStep((s) => s + 1)}>
              {step === 0 ? t('onb_start') : t('act_next')} <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button variant="primary" icon={<Heart className="size-4 fill-current" />} onClick={() => void finish()}>
              {t('onb_finish')}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function Header({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">{icon}</span>
      <div>
        <h1 className="font-display text-xl font-extrabold">{title}</h1>
        <p className="mt-0.5 text-[13px] text-muted">{body}</p>
      </div>
    </div>
  );
}
