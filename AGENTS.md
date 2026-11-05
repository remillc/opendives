# AGENTS.md — OpenDives

Instructions pour les agents de code (Claude Code, etc.) qui travaillent dans ce dépôt. Les échanges et la documentation se font **en français**.

## Le projet

OpenDives est une application mobile complète de carnet de plongée. Elle améliore Subsurface-mobile, mais ce n'est pas un simple compagnon de l'application de bureau. Elle tourne sur iPhone, Android et tablettes (iPad et Android) dès la première version.

- **Données :** le cloud Subsurface (dépôts git sur `ssrf-cloud-*.subsurface-divelog.org`) est **la seule source de données synchronisée**. On s'y connecte ; on ne le remplace pas. Pas d'autres fournisseurs.
- **GeoNames et divelogs.de** fonctionnent comme dans Subsurface : import ou envoi ponctuel, sans synchronisation.
- **Mode local** sans compte, possible.
- **Photos :** elles restent sur l'appareil.
- **Coexistence :** Subsurface-mobile peut être installé sur le même téléphone, avec le même compte. Les règles sont dans le document d'architecture ; ne rien faire qui casse un carnet lu par Subsurface.
- **Mainteneurs de Subsurface :** aucun contact pour l'instant.

## Pile technique (décidée)

- **Application :** Capacitor (hybride).
- **Couche web :** Svelte 5 + Framework7 v9, en **JavaScript avec JSDoc**. Pas de TypeScript.
- **Code métier :** le cœur C++ de Subsurface, réutilisé tel quel, plus libdivecomputer. Il est exposé à la couche web par un plugin natif Capacitor (Swift / Kotlin + JNI).
- **Cartes hors ligne :** tuiles PMTiles auto-hébergées, produites à partir des données OpenStreetMap.

## Règle d'or : Subsurface n'est jamais modifié

- `third_party/subsurface` est un **sous-module épinglé**. On ne modifie aucun de ses fichiers. Pour suivre Subsurface, on change le commit épinglé, puis on relance les tests.
- Tout ce qu'OpenDives ajoute pour compiler ce code va dans `core/compat/` :
  - faux en-têtes Qt (`qtshim/`) ;
  - en-têtes de remplacement (`shadow/`, trouvés grâce à `-iquote`) ;
  - fonctions utilitaires réécrites (`*_compat.cpp`).
- Un correctif dans `patches/` est réservé aux cas où c'est inévitable, et doit être justifié.
- Tout ce qui touche aux données écrites (format git, XML, coordonnées) est porté **à l'identique** de Subsurface. Les données inconnues sont conservées telles quelles.

## Interface

- **iPhone et iPad :** conventions iOS (Human Interface Guidelines).
- **Android :** **Material Design 3 standard**, pas Expressive.
- **Tablettes :** une variante iOS et une variante Android.
- **Pas de motifs d'interface ou de fonctions typiques des agents IA :** pas d'assistant conversationnel, de résumé « magique », de bouton étincelle, etc.
- **Ne pas reproduire les écrans de Subsurface-mobile :** c'est sa principale faiblesse.
- **Filtres :** sur tous les critères d'une plongée, y compris le matériel.
  - Le mode de plongée (circuit ouvert ou recycleur) est mis en avant.
  - Pas de filtre sur le poids ni sur le type de lest.
  - Les autres équipements passent par les tags.
  - Les statistiques s'appliquent aux résultats filtrés.
- **Onglet Statistiques :** il s'ouvre sur des statistiques précompilées et offre un bouton « Filtre libre ». Exemples : nombre de plongées par compagnon, heures de plongée par combinaison.
- **Périmètre de la v1 :** toutes les fonctions classées « essentiel » et « adapté », et toutes les nouveautés mobiles (classement dans le document de rétro-ingénierie).

## Structure du dépôt

```
AGENTS.md                 ce fichier
core/compat/              ajouts d'OpenDives pour compiler le cœur Subsurface sans Qt
poc/                      preuve de concept : build.sh + rapport (README.md)
tests/                    roundtrip.cpp + run-roundtrip.sh
third_party/subsurface/   sous-module Subsurface épinglé (+ son sous-module libdivecomputer)
docs/                     documents de conception
```

## Commandes

Sous Linux ou WSL ; les dépendances sont listées en tête de `poc/build.sh`.

```sh
git submodule update --init third_party/subsurface
git -C third_party/subsurface submodule update --init libdivecomputer
poc/build.sh                      # compile le cœur + build/poc/roundtrip
tests/run-roundtrip.sh build/poc/roundtrip build/rt \
  third_party/subsurface/dives/*.xml third_party/subsurface/dives/*.ssrf
```

Le test attendu est **97 réussis, 1 échec connu** (`TestDiveSeabearNewFormat.xml`), expliqué dans `poc/README.md`. Toute nouvelle régression doit être corrigée avant de livrer.

## Conventions

- Messages de commit en français, à l'impératif ou au résumé court.
- Fichiers de code repris ou dérivés de Subsurface : en-tête `SPDX-License-Identifier: GPL-2.0`. OpenDives est sous GPLv2, parce qu'il réutilise le cœur de Subsurface.
- Ne jamais committer d'identifiants du cloud Subsurface ni de carnet de plongée personnel.
