# Squelette d'application Android

**But :** vérifier que l'application tourne sur un vrai téléphone et affiche des plongées lues par le cœur C++ de Subsurface, non modifié, au format git. Ce n'est pas l'interface finale.

**Résultat (5 novembre 2026) :** le critère est atteint sur un Pixel 10 Pro XL sous Android 17. Les 29 plongées de `SampleDivesV2.ssrf` s'affichent, et un second lancement les relit depuis git.

## Ce qui marche

- **Application :** Capacitor 7, Svelte 5, Framework7 v9 et Vite, en JavaScript avec JSDoc. Le thème automatique donne le rendu Material sur Android. Un seul écran : le carnet, regroupé par voyage.
- **Cœur :** les 69 fichiers du POC, compilés pour `arm64-v8a` et `x86_64`. Le sous-module Subsurface n'a aucune modification.
- **Plugin `OpenDivesCore` (Kotlin + JNI) :**
  - `importSample()` enregistre l'exemple comme dépôt git avec `parse_file` puis `save_dives("<chemin>[main]")`.
  - `listDives()` relit ce dépôt avec `parse_file` et renvoie le JSON.
  - Le cœur tourne sur un seul fil dédié.

## Vérifications faites

| Vérification | Résultat |
| --- | --- |
| Premier lancement (journal du téléphone) | Dépôt absent, 29 plongées enregistrées, puis 29 relues |
| Second lancement après arrêt forcé | Dépôt présent, 29 plongées relues, sans import |
| Dépôt copié du téléphone vers le poste | `git fsck` sans erreur ; 1 commit |
| Comparaison avec le même import fait sur le poste | Arbre git identique (`9ed06c7`) |
| Lecture de la copie par le programme du POC | 29 plongées, 16 sites, 4 voyages ; export XML identique à celui du poste |
| Test d'aller-retour sous WSL (poste) | 97 réussis, 1 échec connu (`TestDiveSeabearNewFormat.xml`) |

L'application `x86_64` a été compilée et embarquée, mais pas lancée sur un émulateur.

## Tailles

| Élément | Taille |
| --- | --- |
| APK de débogage, deux architectures | 12,9 Mo (12 949 731 octets) |
| APK de débogage, `arm64-v8a` seule | 8,8 Mo (8 808 203 octets) |
| `libopendives.so`, `arm64-v8a` | 4,1 Mo (4 103 240 octets) |
| `libopendives.so`, `x86_64` | 4,1 Mo (4 137 944 octets) |
| JavaScript, puis CSS (non compressés) | 897 Ko, puis 505 Ko |
| Carnet d'exemple embarqué (non compressé) | 1,7 Mo |

Les bibliothèques contiennent déjà toutes les dépendances, sauf la zlib du système. Aucun APK de publication n'a été produit : il sera plus petit.

## Problèmes rencontrés

- **libgit2 et le NDK :** libgit2 impose `-std=c90`, où les en-têtes du NDK ne connaissent pas `inline`. Corrigé par `-Dinline=__inline__` dans `native/build-deps.sh`, sans toucher à ses sources.
- **Vite et le plugin local :** le plugin étant un lien vers `../plugins`, Vite ne trouvait pas `@capacitor/core`. Corrigé par `resolve.dedupe`.
- **Java :** Android Studio 2026.2 embarque Java 25. Les compilations sont lancées avec un JDK 21, comme Capacitor 7 le demande. Dans Android Studio, il faut choisir ce JDK comme « Gradle JDK ».
- **Compilation en deux temps :** libdivecomputer utilise autotools. Le natif se compile donc sous WSL et l'APK sous Windows. Gradle ne recompile pas le natif : relancez `native/build-android.sh` si le C++ change.
- **API minimale :** elle passe de 23 (valeur de Capacitor) à 24, celle du natif.

## À savoir pour la suite

- **Signature des commits :** les commits sont signés « Subsurface », le comportement par défaut du cœur, alors que l'architecture prévoit « OpenDives ». Rien n'est encore réglé pour cela.
- **Message d'erreur à l'enregistrement :** le cœur écrit `origin lookup failed` pour un dépôt sans distant, et l'enregistrement réussit quand même. Le mode local devra éviter d'afficher ce message.
- **Branche `HEAD` :** `git_create_local_repo` laisse `HEAD` sur `master`, sans commit, alors que les données sont sur `main`. C'est le code de Subsurface, et le cœur lit bien `main`.
- **Voyages à l'écran :** le fichier en déclare 4, mais il active aussi le regroupement automatique. `listDives` en renvoie donc 6, à 5 noms différents, car deux plongées isolées forment chacune un voyage automatique. Le lieu « Hoodsport » apparaît deux fois, car ce sont deux voyages distincts.
- **Identifiants de voyage :** ils changent à chaque chargement et ne doivent pas être conservés.
- **Écran :** l'heure et les icônes de la barre d'état, en blanc, sont peu lisibles sur le fond clair. Les valeurs s'écrivent « 4.1 m », pas « 4,1 m ». À reprendre avec la vraie interface.
- **Identifiant de l'application :** `org.opendives.app` est provisoire, à confirmer avant toute publication.
- **Hors de ce squelette :** cloud (libgit2 est compilé sans HTTPS), iOS, téléchargement depuis un ordinateur de plongée, modification des plongées.

## Reproduire

Les commandes sont dans [AGENTS.md](../AGENTS.md#commandes).
