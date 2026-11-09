# Analytics in the app (to-do #1): paused

**Decision, 9 November 2026 (Christian):** to-do #1 is on pause. For now, OpenDives relies on the statistics of the stores (Google Play Console, App Store Connect). The app measures nothing and sends nothing about its use. The privacy policy stays as it is ("no audience measurement, no tracker").

Read this before restarting to-do #1.

## What the stores give, without any code

Installs, uninstalls, active users and devices; countries, languages, Android versions, device models, app versions; listing visits and conversion; ratings and reviews; crashes and freezes (Android Vitals), only from users who agreed to share diagnostics with Google.

They do not say what happens in the app (screens, use of the planner, download, sync), and they do not count the APK installed from GitHub. This list was given from general knowledge, not checked in the console.

## If in-app measurement comes back

The owner's first choice was Google Analytics. What was established:

- **Subsurface:** its GPL v2 licence does not forbid collecting usage data. Its code and documentation hold no analytics and no policy on the subject (searched in the pinned repository; its website was not checked, and its maintainers were not asked, as agreed). Sending usage data to Google is not forbidden, but it contrasts with the culture of a free software project.
- **Firebase SDK:** the usual way for an app. It is proprietary code inside the APK, linked with a GPL v2 app: probably incompatible with the licence, and probably not accepted by F-Droid. To avoid. Not checked by a lawyer.
- **`gtag.js` in the WebView:** to avoid. Google's script would run where the Subsurface cloud password and the git token are typed.
- **Recommended if Google Analytics is wanted:** no Google code in the app. The app sends a few events to a small relay on `opendives.app` (Cloudflare), which forwards them to Google Analytics through its Measurement Protocol. The API secret stays out of the app and Google does not see the user's IP address, at the cost of geolocation. Google describes this API as a complement to its own collection, "not to replace it": some automatic reports would stay empty.
- **Alternative:** the same relay storing the events on Cloudflare, with no third party.

## Open choices, not decided

1. How to integrate (the relay was recommended).
2. Consent: off by default and asked once was recommended, the only choice consistent with what the app promises today.
3. Events: proposed were app and Android versions, language, screens opened, use of the main functions and error counts by type. Nothing about dives, sites or the account. No email address or precise location may be sent to Google.
4. Dive computer make and model: recommended not to measure at first.

Any measurement requires rewriting the privacy policy (`app/public/privacy/`), which today promises the opposite, and naming Google if it is used. That text deserves legal advice, for Europe and Quebec's Law 25 in particular.
