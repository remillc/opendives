// @ts-check
// Whether the device thinks it has a network (the browser's own flag, which
// Android's WebView keeps up to date). Reactive.

export const connection = $state({ online: typeof navigator === 'undefined' ? true : navigator.onLine });

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => (connection.online = true));
  window.addEventListener('offline', () => (connection.online = false));
}
