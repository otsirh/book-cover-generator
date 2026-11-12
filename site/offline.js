// Work offline: a service worker keeps the site's pages and files (public/sw.js), registered by
// every page, so the first one opened is enough. The pages run under Trusted Types, so the worker's
// URL goes through a policy that allows only it.
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const types = /** @type {any} */ (window).trustedTypes;
    const url = types
      ? types
          .createPolicy('sw', {
            createScriptURL: (/** @type {string} */ u) => {
              if (u !== '/sw.js') throw new TypeError(`Not the service worker: ${u}`);
              return u;
            },
          })
          .createScriptURL('/sw.js')
      : '/sw.js';
    navigator.serviceWorker.register(url).catch((err) => console.warn('No offline copy:', err));
  } catch (err) {
    console.warn('No offline copy:', err);
  }
}
