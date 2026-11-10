/** Opens a dashboard route, reusing the current tab when already inside the dashboard. */
export function openDashboard(route = '/'): void {
  const hash = route.startsWith('/') ? route : `/${route}`;
  if (typeof location !== 'undefined' && location.pathname.endsWith('/dashboard.html')) {
    location.hash = hash;
    return;
  }
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    void chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html#${hash}`) });
  } else {
    window.open(`dashboard.html#${hash}`, '_blank', 'noopener');
  }
}

/** Opens an external retailer link safely (new tab, no opener, http(s) only). */
export function openExternal(url: string | null | undefined): void {
  if (!url || !/^https?:\/\//i.test(url)) return;
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) void chrome.tabs.create({ url });
  else window.open(url, '_blank', 'noopener,noreferrer');
}

export async function openSidePanel(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.sidePanel?.open) return false;
  try {
    const win = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: win.id! });
    return true;
  } catch {
    return false;
  }
}
