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

1. **Write to the Subsurface maintainers** (draft in section 7). Their agreement matters on three points: a paid app using their free, donation-funded cloud; the wording "compatible with Subsurface"; publication on the App Store.
2. **Check the licences of the dependencies.** GPLv2 is generally considered incompatible with Apache 2.0, which many Android libraries use. Not checked yet for OpenDives.
3. **App Store.** The Free Software Foundation considers Apple's terms incompatible with the GPL. Subsurface-mobile is published there all the same; the maintainers' view is needed before OpenDives does the same.
4. **Google Play rules.** Its commission and its in-app payment rules change often. To check when the price is set.
5. **Trademark.** Decide whether to register "OpenDives".
6. **Cloud costs.** Decide whether part of the app's revenue goes to Subsurface's cloud (see the bracketed sentence in the draft).

## 7. Draft message to the Subsurface maintainers

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

## Sources

- Selling Free Software, GNU Project: https://www.gnu.org/philosophy/selling
- Subsurface contribution guide: `third_party/subsurface/CONTRIBUTING.md`
- Subsurface cloud and project facts: [Analysis of the Subsurface project](subsurface-analysis.md)
- Proof of concept and round-trip result: [poc/README.md](../poc/README.md)
