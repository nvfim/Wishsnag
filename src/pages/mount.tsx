import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/ui/styles.css';
import { AppProvider, applyCachedTheme } from '@/ui/app/AppContext';
import { LogoMark } from '@/ui/components/Logo';

export function mount(app: ReactNode): void {
  applyCachedTheme();
  const el = document.getElementById('root');
  if (!el) return;
  createRoot(el).render(
    <StrictMode>
      <AppProvider
        fallback={
          <div className="grid min-h-40 place-items-center">
            <LogoMark size={36} />
          </div>
        }
      >
        {app}
      </AppProvider>
    </StrictMode>,
  );
}
