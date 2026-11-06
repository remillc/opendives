<script>
  // @ts-check
  // First launch (docs/mockups/android-accueil.dc.html, ios-accueil.dc.html,
  // android-compte-import.dc.html, ios-compte-import.dc.html). A popup with
  // its own view: the three choices, then signing in or creating an account
  // (routes /welcome/… in App.svelte). Shown on a first launch and after
  // signing out; nothing is loaded until a choice is made.
  import { Popup, View, f7 } from 'framework7-svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { accountFlow } from '../lib/account.js';

  /** Back to the three choices once closed, for the next time it opens. */
  function reset() {
    accountFlow.confirmedEmail = '';
    const view = /** @type {any} */ (f7.views).welcome;
    const first = view?.router.history[0];
    if (first && view.router.history.length > 1) view.router.back(first, { force: true, animate: false });
  }
</script>

<Popup class="od-welcome" opened={logbook.welcome} swipeToClose={false} closeByBackdropClick={false} onPopupClosed={reset}>
  <View name="welcome" url="/welcome/" />
</Popup>
