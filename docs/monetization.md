# Monetisation and the relationship with Subsurface

Christian's reflections and decision of 14 November 2026. This is not legal advice: the legal points below must be checked with someone qualified before the first paid release.

## 1. The two constraints

1. **Subsurface's licence must be respected.** OpenDives reuses Subsurface's core, so the whole distributed app is under GPLv2.
2. **Christian wants to contribute to improving Subsurface's interface.** Monetising OpenDives must not get in the way of that, and should not be done behind the Subsurface project's back.

## 2. What GPLv2 allows, requires and forbids

- **Allowed: selling the app.** The GPL sets no limit on the price asked for a copy.
- **Required: the source code.** Anyone who receives the app can ask for the complete source of that version, build scripts included. The repository (github.com/remillc/opendives) is already public; each release must point to its exact commit and to the pinned Subsurface commit.
- **Required: notices.** Copyright notices and the licence text stay in the app (About, « Bibliothèques libres ») and files derived from Subsurface keep their `SPDX-License-Identifier: GPL-2.0` header.
- **Forbidden: extra restrictions.** No "non-commercial" clause, no licence key whose terms forbid sharing, no closed "pro" edition of the app.
- **Consequence: a paid unlock inside the app does not hold.** Anyone may remove it from the source and publish the result under another name.
- **Dual licensing is not available** for the core: its copyright belongs to Subsurface's many contributors, not to Christian.
- **A server is not covered.** GPLv2 applies to what is distributed. Code that runs only on an OpenDives server, and is never shipped to users, can stay private.

## 3. Revenue models considered

| Model | How | Limit |
| --- | --- | --- |
| Paid app in the stores, source free on GitHub | The price pays for convenience: installation, updates, trust | Someone may publish a free copy |
| Donations and sponsorship | GitHub Sponsors, a "support" button | Small and irregular income |
| Paid online services | OpenDives backup or sync, pressure-gauge reading from a photo, hosting of offline maps | A server to run; the client code stays free |
| Trademark | The OpenDives name and logo belong to Christian, not to the GPL | A trademark to register |

The services are the strongest source: a fork cannot copy a service. The trademark protects the paid app: a copy has to change its name.

## 4. Decision

**Decided on 14 November 2026:** a low-priced app on Google Play, with the code public under GPLv2, and a paid service later.

What follows from it:

- The source stays public and each release is tagged, so the paid app and its source always match.
- Building the app from source stays possible and free. The price is for the store version.
- No feature of the app is locked behind a payment in the client code. What is paid later is a service (see section 3).
- The OpenDives name and logo are the protection against copies: registering the trademark is worth considering before the first paid release.
- iPhone comes later and depends on point 3 of section 6.

## 5. Contributing to Subsurface

OpenDives' interface is written in Svelte with Framework7; Subsurface-mobile's is in Qt/QML. The interface code cannot be taken as is. What can go upstream:

- **Fixes to the core.** Subsurface accepts signed-off commits ("Signed-off-by", Developer Certificate of Origin) under GPLv2.
- **The design work.** The mock-ups, `system-design.md`, `ui-foundations.md`, `ui-specification.md` and `ui-writing.md` can be published under a free licence for the Subsurface team to draw on. Subsurface's contribution guide says that usability, accessibility and visual design proposals are welcome, and asks to discuss them first in the bug tracker or the User Forum.
- **What the tests find.** Differences that the git round-trip test and the planner tests turn up in the core, reported in the bug tracker.

## 6. Open points before the first paid release

1. **Write to the Subsurface maintainers** (draft in section 8), once they can try the app (section 7). Not in the short term (decided on 14 November 2026): the draft waits, and `AGENTS.md` keeps « Subsurface maintainers: no contact for now ». Their agreement matters on three points: a paid app using their free, donation-funded cloud; the wording "compatible with Subsurface"; publication on the App Store.
2. **Check the licences of the dependencies.** GPLv2 is generally considered incompatible with Apache 2.0, which many Android libraries use. Not checked yet for OpenDives.
3. **App Store.** The Free Software Foundation considers Apple's terms incompatible with the GPL. Subsurface-mobile is published there all the same; the maintainers' view is needed before OpenDives does the same.
4. **Google Play rules.** Its commission and its in-app payment rules change often. To check when the price is set.
5. **Trademark.** Decide whether to register "OpenDives".
6. **Cloud costs.** Decide whether part of the app's revenue goes to Subsurface's cloud (see the bracketed sentence in the draft, and section 9 for what a share would amount to).

## 7. Letting the maintainers try the app

Christian's requirement of 14 November 2026: when the message goes out, the maintainers must be able to try the app.

**How:** the APK attached to the GitHub release, installed by sideloading. The message links to https://github.com/remillc/opendives/releases/latest, which always shows the newest release. This needs no store account and no review, and the maintainers are developers. Google Play testing (open or closed track) can come later, when the app is on Google Play. There is no iPhone build to share: the iOS build only runs in the GitHub workflow, and TestFlight needs an Apple developer account.

**Before sending the message:**

1. Publish the version to show. On 14 November 2026 the newest GitHub release is 0.2.0, while the app is at 0.3.0: release 0.3.0 or later first, with its green release report and its APK.
2. Install that APK on a phone that never had the app, and go through the first launch with a test account, in English.
3. Make sure the release notes say what works and what does not yet, so the maintainers do not report known gaps.
4. Keep the warning in the message: OpenDives writes to the logbook, and this is an early version. The maintainers should try it with a test cloud account or without an account, not with their main logbook.
5. Once the message is sent, update `AGENTS.md` (« Subsurface maintainers: no contact for now »).

## 8. Draft message to the Subsurface maintainers

**Status: on hold.** Christian decided on 14 November 2026 not to write to the maintainers in the short term. The draft is kept for later; nothing is sent, and the steps of section 7 wait with it.

**Where to send it:** Subsurface's contribution guide points new contributors to the User Forum (https://groups.google.com/g/subsurface-divelog) and to the bug tracker; the developer mailing list is closed to new subscribers. The User Forum is public, which suits this message. Dirk Hohndel maintains the project and runs the cloud.

**To decide before sending:** the sentence in square brackets commits Christian to something. Keep it, reword it or remove it.

> **Subject: OpenDives, a mobile app built on the Subsurface core, and how I could contribute**
>
> Hello,
>
> My name is Christian Rémillard. I am a diver, a Subsurface user, and I have spent my career as a web developer.
>
> I started OpenDives out of frustration. On a dive site, with only my phone in hand, I could not do what I wanted to do with Subsurface-mobile. I have come to believe that a mobile app designed as a companion to the desktop app is a dead end: the phone is the device divers have with them, so the mobile version should offer everything the desktop version does. I also wanted to put the experience I have built over a career in web development to work on Subsurface's user interface.
>
> OpenDives is the result so far. It is a full dive log for Android first, with iPhone and tablets to follow. It reuses the Subsurface core as is, without Qt, through a small compatibility layer, and reads and writes the same git format: the round trip passes on 97 of your 98 sample logs. The interface is new, written with web technologies. The app is under GPLv2 and its source is public: https://github.com/remillc/opendives
>
> You can try it today on Android: the APK of the latest version is attached to the latest release (https://github.com/remillc/opendives/releases/latest) and installs by sideloading. It is an early version, and it reads and writes the logbook, so please try it with a test cloud account or without an account rather than with your main logbook. There is no iPhone build to share yet.
>
> I would like to contribute to Subsurface, and I would rather ask you how than guess. What I can offer today:
>
> - fixes to the core, as signed-off commits, when my tests find something;
> - the design work (mock-ups, interface rules, writing guide), published freely, if it can be useful for Subsurface-mobile;
> - bug reports with reproducible cases.
>
> Tell me which of these would help you most, and whether the interface ideas interest you.
>
> I also have three questions, because I would like to do this with your agreement:
>
> 1. **The cloud.** OpenDives syncs with Subsurface cloud accounts, so that a diver keeps a single logbook across Subsurface and OpenDives. I plan to sell the app at a low price on Google Play, with the code remaining public. Are you comfortable with a paid app using the cloud that you run on donations? If you are not, or only under conditions, I will follow your answer. [I would be glad to give part of the app's revenue towards the cloud's running costs.]
> 2. **The name.** May I describe OpenDives as "compatible with Subsurface" and "built on the Subsurface core"? I do not use the Subsurface name or logo otherwise.
> 3. **The App Store.** Later, I would like to publish an iPhone version. Do you have any objection to an app that contains the Subsurface core being distributed on the App Store, as Subsurface-mobile is?
>
> Thank you for Subsurface, and for your time.
>
> Christian Rémillard

## 9. Pricing and potential revenue (exploration)

An exploration of 14 November 2026, not a forecast and not financial advice. Prices are in US dollars, before sales taxes and income tax. Every sales figure below is an assumption; the only measured numbers are the ones marked with a source.

### What the market looks like

| App | Price | Source |
| --- | --- | --- |
| Subsurface-mobile | Free; a "sponsor" edition, otherwise identical, exists for those who want to pay | Store description |
| DiveMate (Android, iOS) | Free, with paid add-ons: Bluetooth pack £5.99, backups £9.99 | Divernet |
| MacDive (iOS) | $9.99 once | Currents comparison |
| Dive Log, G. McLaughlin (iOS) | $14.99 once, plus $2.99 per dive-computer brand | App Store |
| Dive Log: Scuba Logbook (iOS) | $19.99 a year, $3.99 a month, or $39.99 once | App Store |
| Diving Log (Windows) | €39 once; its Android app comes with the Windows licence | Currents comparison |

Two things stand out. Paid dive logs sit between $10 and $15 once, and they are mostly on iOS: on Android the known apps are free or free with add-ons. And the audience is small: a third-party tracker counts about 30,000 installs of Subsurface-mobile on Google Play since 2016, and another counts 160,000 downloads for DiveMate in total, with 280 in the last 30 days. Those two apps are free; a paid app will reach fewer people.

### Google Play's cut and the fixed costs

- **Commission:** 15 % in practice on the first US$1 million a year. In the United States, the United Kingdom and the European Economic Area it has been split, since 30 June 2026, into a 10 % service fee and a 5 % billing fee; elsewhere the 15 % tier applies and the developer must enrol in it.
- **Developer account:** US$25 once on Google Play. Apple's is US$99 a year, when iPhone comes.
- **Not estimated here:** hosting of the offline maps, the opendives.app domain, a trademark registration, and the server of a future paid service.

### Price structure explored

1. **The app, one price paid once on Google Play.** Three price points are compared below: $4.99 (low, under every paid competitor), $9.99 (MacDive's price), $14.99 (the top of the range).
2. **No locked feature and no add-on per dive computer.** The GPL makes those pointless (section 2), and they are what divers complain about in the paid apps.
3. **Free from source.** Anyone can build the app from GitHub. Like Subsurface's sponsor edition, the store price is partly a way to support the project.
4. **Later, a yearly service.** For example backup or sync on an OpenDives server, or the pressure-gauge reading. The only yearly price found in this market is $19.99; $14.99 a year is used below as an example.

### What it could bring in a year

Net of Google's 15 %, for the app paid once:

| Sales in a year | at $4.99 | at $9.99 | at $14.99 |
| --- | --- | --- | --- |
| 100 (a few dozen divers a month find it) | $424 | $849 | $1,274 |
| 500 | $2,121 | $4,246 | $6,371 |
| 2,000 (more than half of DiveMate's yearly downloads, for a paid app) | $8,483 | $16,983 | $25,483 |

For the service, at $14.99 a year, net of 15 %: 25 subscribers bring $319 a year, 100 bring $1,274, 400 bring $5,097. The service has its own running costs, not counted here.

How to read this:

- The first two rows are the plausible ones for a new paid app in a small market with free competitors. The third is an upper bound, not an expectation.
- A one-time price pays once per diver: revenue follows new buyers and falls when the audience is reached. Only the service brings recurring revenue.
- At these volumes the revenue covers the project's costs and little more. It does not pay for the development time.
- The price can go up later more easily than down: buyers of a cheaper version keep it.

### A share for Subsurface

The draft message offers part of the revenue towards the cost of the cloud. Ways to do it:

| Formula | Example at $9.99 | 100 sales | 500 sales | 2,000 sales |
| --- | --- | --- | --- | --- |
| A percentage of net revenue | 5 % | $42 | $212 | $849 |
| | 10 % | $85 | $425 | $1,698 |
| | 20 % | $170 | $849 | $3,397 |
| A fixed amount per sale | $1 | $100 | $500 | $2,000 |
| A fixed yearly donation | set each year | — | — | — |

Points to weigh:

- A percentage follows the revenue and never costs more than the app earns. A fixed amount per sale weighs more on a low price ($1 is 24 % of the net at $4.99, 12 % at $9.99).
- The honest order of magnitude, in the plausible rows, is tens to a few hundred dollars a year. It is a gesture of support more than a funding source, and the message should not suggest otherwise.
- What the cloud costs Subsurface is not known. Their answer may be a preference for a sponsorship through their existing channels (their sponsoring page, Ko-fi, GitHub Sponsors) rather than a formula.
- If OpenDives later runs its own paid sync, it competes with their free cloud for the same divers: worth saying openly when the time comes.

## Sources

- Selling Free Software, GNU Project: https://www.gnu.org/philosophy/selling
- Subsurface contribution guide: `third_party/subsurface/CONTRIBUTING.md`
- Subsurface cloud and project facts: [Analysis of the Subsurface project](subsurface-analysis.md)
- Proof of concept and round-trip result: [poc/README.md](../poc/README.md)
- Google Play service fees: https://support.google.com/googleplay/android-developer/answer/112622 and https://pricepush.app/blog/google-play-subscription-fees-2026-real-math
- Developer account fees: https://tms-outsource.com/blog/posts/google-play-store-fees/
- Dive log prices: https://www.trycurrents.app/blog/best-dive-log-apps-comparison, https://divernet.com/scuba-gear/finding-the-best-dive-logging-app/, https://apps.apple.com/us/app/dive-log/id301049600, https://apps.apple.com/us/app/dive-log-scuba-logbook/id6790093894
- Install counts (third-party estimates): https://appwisp.com/app/android/org.subsurfacedivelog.mobile and https://www.appbrain.com/app/divemate-scuba-dive-log/com.confitek.divemateusb
- Subsurface-mobile's sponsor edition: its Google Play description, as shown on https://similarweb.com/app/google/org.subsurfacedivelog.mobile
