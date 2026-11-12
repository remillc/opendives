// SPDX-License-Identifier: GPL-2.0
// Prints the stack of every uncaught error and rejected promise as
// "JS-ERROR ..." lines (Capacitor's own report gives only a line and a column).
// Added before the app's module by tests/ios/run-app.sh and tests/ios/run-maps.sh.
(() => {
  const print = (kind, error) => console.log('JS-ERROR', kind, String(error?.message ?? error), '\n' + (error?.stack ?? '(no stack)'));
  window.addEventListener('error', (e) => print('error', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => print('rejection', e.reason));
  const original = console.error;
  console.error = (...args) => {
    for (const a of args) if (a instanceof Error) print('console.error', a);
    original.apply(console, args);
  };
})();
