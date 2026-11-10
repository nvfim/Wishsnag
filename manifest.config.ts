/**
 * WishSnag Chrome extension manifest (Manifest V3).
 * Generated at build time so the version stays in sync with package.json.
 *
 * Permission rationale (also shown to users in Settings → Privacy & permissions):
 * - activeTab + scripting: read product details from the tab you are on, only when you click WishSnag,
 *   use the right-click menu or the keyboard shortcut.
 * - storage / unlimitedStorage: keep your wishlist and price history on this device (IndexedDB + chrome.storage).
 * - alarms: schedule optional background price checks and exchange-rate refreshes.
 * - notifications: price-drop and target-price alerts.
 * - contextMenus: "Snag to Wishlist" in the right-click menu.
 * - sidePanel: the shopping companion panel.
 * - optional_host_permissions: requested per store, only when you enable automatic price checks or
 *   auto-detection on that store. Never requested up front.
 */
import pkg from './package.json' with { type: 'json' };

export interface ManifestOptions {
  /** Adds host access to the local fixture server used by the Playwright end-to-end tests. */
  e2e?: boolean;
}

export function buildManifest(options: ManifestOptions = {}): chrome.runtime.ManifestV3 {
  const manifest: chrome.runtime.ManifestV3 = {
    manifest_version: 3,
    name: '__MSG_appName__',
    short_name: 'WishSnag',
    description: '__MSG_appDescription__',
    version: pkg.version,
    default_locale: 'en',
    minimum_chrome_version: '116',
    icons: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
    action: {
      default_title: '__MSG_actionTitle__',
      default_popup: 'popup.html',
      default_icon: {
        '16': 'icons/icon-16.png',
        '32': 'icons/icon-32.png',
        '48': 'icons/icon-48.png',
        '128': 'icons/icon-128.png',
      },
    },
    side_panel: { default_path: 'sidepanel.html' },
    background: { service_worker: 'background.js', type: 'module' },
    permissions: [
      'activeTab',
      'scripting',
      'storage',
      'unlimitedStorage',
      'alarms',
      'notifications',
      'contextMenus',
      'sidePanel',
    ],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+W' },
        description: '__MSG_commandOpenPopup__',
      },
      'snag-current-page': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: '__MSG_commandSnag__',
      },
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; base-uri 'self'; form-action 'none'",
    },
  };
  if (options.e2e) {
    // Fixture stores served locally under country domains (mapped to 127.0.0.1 by the test browser).
    manifest.host_permissions = ['http://127.0.0.1/*', 'http://*.wishsnag-fixture.com.au/*', 'http://*.wishsnag-fixture.com.bd/*', 'http://*.wishsnag-fixture.co.uk/*'];
  }
  return manifest;
}
