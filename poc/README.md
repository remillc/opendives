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

Les dépôts `A[main]`, `B[main]`, etc. sont des dépôts git locaux : ce test ne contacte pas le cloud.

## Cloud réel, en lecture seule (5 novembre 2026)

**But :** lire avec le cœur de Subsurface un vrai carnet du cloud, écrit par Subsurface, puis le réécrire localement sans rien envoyer au serveur.

**Résultat :** sur un compte de développement de 1 353 plongées, le carnet est cloné et chargé. La réécriture est identique, octet pour octet, sauf pour 2 plongées (voir plus bas). Le serveur n'a pas changé : sa tête est la même avant et après.

**Ce qui a été ajouté :**

- **`core/compat/cloud_compat.cpp` :** portage sans Qt de `canReachCloudServer()`.
  - Même requête « make-latte » vers les serveurs, avec réponse 418 attendue.
  - Même ordre des serveurs et mêmes effets sur `prefs` et `git_local_only`.
  - S'y ajoute `getCloudURL()`.
- **`platform_https.h` :** la requête HTTPS est fournie par la plateforme, avec un certificat obligatoirement validé.
  - `https_openssl.cpp` : la version Linux.
  - Android utilise aussi `https_openssl.cpp`, avec un fichier d'autorités fourni par l'app (voir `app/README.md`).
- **Façade :**
  - `cloud_branch_status()` est une sonde en lecture seule, avec la validation TLS normale de libgit2.
  - `apply_log_prefs()` est le portage de `QMLManager::consumeFinishedLoad()`.
- **`tests/cloud.cpp` et `tests/run-cloud-readonly.sh` :**
  - Le test refuse de charger si la branche n'existe pas sur le serveur.
  - Il ne travaille que sur des copies sans distant `origin`.
  - Il vérifie que la tête du serveur n'a pas changé.

**Ce qu'on a appris :**

- **Réglages du carnet :** les unités et les préférences de `00-Subsurface` sont lues dans `git_prefs`, mais `save-git` écrit `prefs`. Subsurface-mobile les recopie après chaque chargement. Sans cette étape, désormais dans `apply_log_prefs()`, le premier enregistrement aurait remplacé `units PERSONALIZE FEET CUFT PSI CELSIUS LBS MINUTES` par `units METRIC`. **L'app doit appeler `apply_log_prefs()` après chaque chargement.**
- **Événements simultanés :** deux événements de même instant et de même nom sont jugés égaux (`divecomputer.cpp:337`). Comme `add_event_to_dc()` insère avec `lower_bound`, leur ordre s'inverse à chaque chargement, donc à chaque enregistrement. Deux plongées du compte ont deux `gaschange` à 0:10. Rien n'est perdu, mais leur fichier change à chaque sauvegarde, dans Subsurface comme dans OpenDives. Ce constat vient de la lecture du code, sans vérification avec l'application Subsurface.
- **Bogue de Subsurface, `git-access.cpp:52` :** `includes_string_caseinsensitive()` renvoie vrai dès que les premiers caractères **diffèrent**. Presque tout échec de clone est alors traité comme « branche absente du serveur ». Le cœur crée un dépôt avec un commit vide, « Initial commit to create empty repo. », puis tente une synchronisation.
  - Si la branche existe sur le serveur, il n'y a pas d'ancêtre commun : rien n'est poussé, et le cache est mis de côté.
  - D'où la sonde préalable dans OpenDives.
  - À signaler à Subsurface le jour où il y aura un contact.
- **Certificats :** `certificate_check_cb()` accepte tout certificat X.509 pour les serveurs du cloud. Subsurface compte sur `canReachCloudServer()` pour avoir validé TLS juste avant. Notre portage valide bien le certificat, mais la connexion git elle-même reste sans validation, comme dans Subsurface.
- **WSL :** libgit2 ne peut pas faire de `mmap` sur un disque Windows (`/mnt/c`, `/mnt/f`) : « failed to mmap. Could not write data ». Le dossier de travail du test doit être dans le système de fichiers de WSL.

**Reproduire.** Les identifiants sont dans un fichier hors du dépôt, avec `OPENDIVES_CLOUD_EMAIL=` et `OPENDIVES_CLOUD_PASSWORD=`. Le mot de passe n'est jamais affiché.

```sh
tests/run-cloud-readonly.sh build/poc/cloud build/poc/roundtrip /mnt/c/Users/<vous>/.opendives/cloud-dev.env ~/opendives-cloud-rt
```

## Ce qui reste hors du POC

- iOS (Xcode).
- L'envoi vers le cloud, c'est-à-dire l'enregistrement d'une modification puis la synchronisation.
- Les imports qui dépendent encore de Qt : Suunto JSON et l'en-tête CSV Seabear, laissés vides ici.
- Les traductions : `trGettext` renvoie le texte anglais.
