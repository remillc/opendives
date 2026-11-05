# Preuve de concept : le cœur de Subsurface sans Qt

**But :** vérifier qu'OpenDives peut réutiliser le code métier de Subsurface tel quel, sans en modifier une ligne, pour lire et écrire le carnet de plongée au format git du cloud Subsurface.

**Résultat (5 novembre 2026) :** le cœur se compile et le test d'aller-retour passe sur 97 des 98 carnets d'exemple de Subsurface.

## Ce qui est compilé

- **Subsurface** au commit `258beb4` (4 novembre 2026). 72 fichiers de `core/`, dont `load-git`, `save-git`, `git-access`, `parse-xml`, `save-xml`, `filterconstraint` et `fulltext`. Aucune modification.
- **libdivecomputer**, version Subsurface-NG au commit `617ffd7`, celui que Subsurface épingle lui-même. Compilé en bibliothèque statique, sans USB ni Bluetooth : les transports seront fournis par la couche Capacitor.
- **`core/compat/`** : tout ce qu'OpenDives ajoute.
  - `qtshim/` : de faux en-têtes Qt (`QString`, `QDateTime`, `QRegularExpression`…) en C++ standard. Ils couvrent seulement ce que le cœur utilise. Le stockage interne est en UTF-32, et seule la locale « C » est gérée.
  - `shadow/commands/command.h` : il remplace l'en-tête de la pile d'annulation Qt, que `save-git.cpp` inclut pour rédiger le message de commit.
  - `qthelper_compat.cpp` : il réécrit les fonctions de `qthelper.cpp`, `string-format.cpp`, `metadata.cpp`, etc.
    - Celles qui touchent aux données sont portées à l'identique : coordonnées GPS et feuilles XSLT.
    - Les autres sont réduites au minimum.
  - `notifier_compat.cpp` : il fournit le notificateur Qt des sélections, sans effet ici.
  - `gen/` : en-têtes de version générés.

## Le test

`tests/run-roundtrip.sh` fait passer chaque carnet d'exemple (`dives/*.xml`, `*.ssrf`) par les étapes suivantes :

1. Import du carnet vers un dépôt git A.
2. Copie de A vers un nouveau dépôt B. Les écarts entre A et B sont **listés**, sans faire échouer le test.
3. Copie de B vers un nouveau dépôt C. **Strict** : l'arbre git de C doit être identique, octet pour octet, à celui de B.
4. Nouvel enregistrement de B par-dessus lui-même. **Strict** : l'arbre ne doit pas changer.
5. Export de B et de C en XML. **Strict** : les deux fichiers doivent être identiques.

Les écarts de l'étape 2 viennent du code de Subsurface, pas du POC :

- **`deviceid`**, sur 23 carnets. `load-git.cpp` (`parse_dc_deviceid`) lit cette ligne comme une donnée obsolète et ne la garde pas.
- **`meandepth`**, sur 18 carnets, de l'ordre de 1 à 2 mm. Le chargement depuis git recalcule la profondeur moyenne à partir des échantillons (`fixup_dc_duration`).

Ces deux écarts ont été repérés en lisant le code de Subsurface. Ils n'ont pas été comparés avec l'application Subsurface officielle, qui n'a pas été compilée ici.

**Seul échec :** `TestDiveSeabearNewFormat.xml`. Ce fichier contient des paires de plongées qui portent le même numéro et la même heure de départ. À chaque enregistrement, leur ordre s'inverse, donc l'arbre git change. Aucune donnée n'est perdue. Ce cas limite vient du tri de Subsurface ; il est à surveiller, mais il ne bloque rien.

## Reproduire

Il faut Linux ou WSL. Les paquets nécessaires sont listés en tête de `poc/build.sh`.

```sh
git submodule update --init --recursive
poc/build.sh                      # → build/poc/roundtrip  (≈ 1 min 30)
tests/run-roundtrip.sh build/poc/roundtrip build/rt third_party/subsurface/dives/*.xml third_party/subsurface/dives/*.ssrf
```

Les dépôts `A[main]`, `B[main]`, etc. sont des dépôts git locaux : le POC ne contacte pas le cloud.

## Ce qui reste hors du POC

- La compilation pour Android et iOS (NDK et Xcode), puis l'appel depuis Capacitor.
- La synchronisation avec le cloud réel : `canReachCloudServer` renvoie `false` dans ce build.
- Les imports qui dépendent encore de Qt : Suunto JSON et l'en-tête CSV Seabear, laissés vides ici.
- Les traductions : `trGettext` renvoie le texte anglais.
