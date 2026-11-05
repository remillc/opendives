# OpenDives — Fondations de l'interface

2026-11-05 · Christian Rémillard

## 1. Résumé

OpenDives vise **les plongeurs loisir et techniques**. L'interface est simple par défaut, et les fonctions techniques (déco, trimix, recycleur) restent accessibles sans encombrer l'écran du plongeur loisir. Elle suit les conventions natives d'iOS et d'Android, grâce à Framework7. Elle n'utilise **aucune fonction ni aucun motif visuel typiques des interfaces générées par IA** (section 3).

- **Ce document fixe** les situations d'usage, les principes, l'organisation de l'app et une piste visuelle. Il ne contient pas encore d'écrans.
- **Point de départ** : les tâches et le classement par niveaux de la rétro-ingénierie, pas les écrans de Subsurface.
- **Ensuite** : maquettes des écrans clés (section 6), sur téléphone et tablette, avec de vraies données de plongée.

## 2. Plongeurs et situations d'usage

Le même plongeur n'utilise pas l'app de la même façon sur le bateau, le soir et chez lui. C'est la situation, plus que le profil du plongeur, qui doit guider la conception.

**Trois profils**

| Profil | Ce qu'il fait | Ce qu'il attend d'OpenDives |
| --- | --- | --- |
| Plongeur loisir en voyage | 2 à 3 plongées par jour pendant une semaine, ordinateur Bluetooth, souvent sans réseau | Télécharger vite, noter le site et les compagnons, revoir ses plongées, garder un carnet propre |
| Plongeur local régulier | Lac, carrière ou fleuve, toute l'année, mêmes sites et mêmes compagnons | Saisie quasi automatique (site détecté, compagnons habituels), statistiques sur la durée, températures |
| Plongeur technique | Nitrox, trimix, déco, parfois recycleur, plusieurs ordinateurs | Profil détaillé (plafond, ppO2, tissus), planification avec gaz de secours, comparaison des ordinateurs |

**Situations**

| Moment | Contexte physique | Besoin | Conséquence pour l'interface |
| --- | --- | --- | --- |
| Sur le bateau, entre deux plongées | Mains mouillées, plein soleil, roulis, gants parfois, pas de réseau | Télécharger, noter le site et les compagnons en quelques gestes | Grandes cibles tactiles, fort contraste, saisie par choix plutôt qu'au clavier, tout fonctionne hors ligne |
| Avant la plongée | Au sec, souvent pressé | Vérifier un mélange, consulter la désaturation | Calculateur de gaz à deux gestes de l'accueil |
| Le soir, à l'hôtel | Calme, écran sombre, réseau variable | Revoir le profil, ajouter les photos, compléter les notes, regrouper en voyage | Profil lisible et explorable au doigt, mode sombre soigné |
| À la maison | Téléphone ou tablette, du temps | Importer l'historique, nettoyer les sites, statistiques, planifier la prochaine sortie | Vue tablette en deux colonnes, édition groupée |
| Partout | Coexistence possible avec Subsurface | Retrouver les mêmes données partout | État de synchronisation toujours compréhensible, sans alarmer |

## 3. Principes de conception

Huit principes guident chaque écran. Quand deux principes entrent en conflit, le plus haut dans la liste l'emporte.

1. **La plongée d'abord.** Le profil et les chiffres de la plongée sont le contenu principal, pas un décor autour de menus. Chaque plongée est reconnaissable à la forme de son profil.
2. **Utilisable sur le bateau.** Cibles tactiles d'au moins 48 points, texte lisible en plein soleil, choix dans des listes (sites proches, compagnons habituels) plutôt que saisie au clavier. Aucune fonction essentielle ne dépend du réseau.
3. **Natif avant tout.** Les composants et gestes d'iOS et d'Android (via Framework7) sont utilisés tels quels. On ne crée un composant propre que là où aucun n'existe, par exemple pour le profil.
4. **Simple par défaut, technique sur demande.** Les données techniques (plafond, tissus, ppO2, hélium) apparaissent quand la plongée en contient ou quand le plongeur les active. Un plongeur loisir ne voit pas de champs trimix vides.
5. **Annuler plutôt que confirmer.** Les actions s'appliquent tout de suite et s'annulent en un geste. Une confirmation est réservée aux actions irréversibles (suppression du compte, écrasement de données cloud).
6. **La synchronisation se fait oublier.** L'état est visible discrètement (synchronisé, en attente de réseau, conflit résolu). Il n'interrompt le plongeur que s'il doit agir.
7. **Le vocabulaire du plongeur.** Palier, plafond, SAC, MOD, gaz, ordinateur de plongée : les mots du métier, avec les unités choisies par le plongeur. Les boutons disent ce qu'ils font (« Télécharger les plongées ») et le résultat reprend le même mot (« 3 plongées téléchargées »).
8. **Aucun motif typique d'IA.** OpenDives n'a pas de fonction d'IA, et rien dans son allure ne doit le suggérer :
   - pas d'assistant conversationnel, de bouton « suggérer » ni de résumé généré ;
   - pas d'icônes d'étincelles ou d'emoji, pas de dégradés décoratifs, pas de cartes identiques à grosses ombres, pas de tuiles de chiffres sur chaque écran ;
   - pas d'étiquettes en majuscules au-dessus des titres, pas de mot isolé mis en couleur dans un titre, pas de chaînes « A · B · C », pas de flèche « → » ajoutée aux boutons ;
   - pas d'animations d'entrée sur chaque élément : le mouvement ne répond qu'à un geste du plongeur ;
   - pas de texte de remplissage : maquettes et écrans vides utilisent de vraies données et des consignes utiles (« Associez votre ordinateur pour télécharger vos plongées »).

L'accessibilité n'est pas un principe à part : c'est un plancher. Lecteurs d'écran (VoiceOver, TalkBack), tailles de texte du système, contrastes suffisants, mouvements réduits respectés, et des couleurs qui ne portent jamais seules une information.

## 4. Organisation de l'app et navigation

> *Schéma : organisation de l'app · 4 sections et les réglages — visible dans [le document en ligne](https://claude.ai/artifact/8goh1sZMXM9npSVThnA61r).*

L'app s'ouvre sur le **Carnet**, là où se passe l'essentiel : télécharger, compléter, revoir. Le téléchargement est l'action principale de cette section, toujours à portée du pouce (bouton flottant sur Android, bouton de barre d'outils sur iOS). Les réglages ne méritent pas un onglet : on y va rarement, et ils s'ouvrent depuis le carnet.

|  | Téléphone | Tablette |
| --- | --- | --- |
| Navigation principale | Barre d'onglets en bas (4 onglets) | Barre latérale à gauche |
| Carnet | Liste, puis détail en plein écran ; balayage entre plongées | Liste et détail côte à côte |
| Profil de plongée | En tête du détail ; plein écran en mode paysage | Large, avec les couches techniques à côté |
| Édition groupée, statistiques, planificateur | Version simplifiée | Panneaux supplémentaires |
| Retour | Geste natif (balayage depuis le bord sur iOS, bouton ou geste retour sur Android) | Idem |

**Un seul filtre, partagé.** Le filtre se règle depuis le carnet ou depuis les statistiques, et il s'applique aux deux, ainsi qu'à la carte des sites. Il couvre tous les critères d'une plongée, matériel compris (combinaison, bouteille, lest, ordinateur), sur téléphone comme sur tablette. Tant qu'un filtre est actif, une ligne en tête d'écran le rappelle avec le nombre de plongées retenues, et un geste l'enlève. Les filtres utiles peuvent être enregistrés, comme dans Subsurface.

**Statistiques : décidé le 5 novembre 2026.** L'onglet Statistiques s'ouvre sur une **page précompilée** : les totaux (plongées, temps sous l'eau, la plus profonde), puis le temps et le nombre de plongées par mode (circuit ouvert ou recycleur), par combinaison, par compagnon et par ordinateur, ensuite par année et par site. Toucher une ligne ouvre ces plongées avec leurs statistiques détaillées. Un bouton **Filtre libre** donne accès à tous les critères pour les croisements plus rares. Ce flux a été préféré au parcours « filtrer puis consulter », qui oblige à savoir quoi chercher.

## 5. Piste d'identité visuelle

L'identité d'OpenDives tient dans **le profil de plongée**, pas dans un habillage. Autour, l'interface reste native et sobre. La piste emprunte au monde réel de la plongée : la lumière qui s'assombrit avec la profondeur et l'orange des bouées de surface.

**L'idée : la colonne d'eau.** Dans le profil, la zone sous la courbe se remplit d'une eau qui s'assombrit avec la profondeur, à la même échelle sur toutes les plongées. Ce dégradé n'est pas décoratif : il code la profondeur. Une plongée à 40 m se reconnaît d'un coup d'œil face à une plongée à 12 m. Dans la liste, chaque plongée est représentée par la miniature de son profil, à la place d'une icône.

**Couleurs**

**Remplacé le 5 novembre 2026.** Cette première piste « eau et bouée » est abandonnée : les couleurs ne doivent pas évoquer l'eau ou le ciel, mais provoquer l'envie de replonger, avec confiance et maîtrise. La palette retenue est **sapin et mandarine sur fond crème** ; ses valeurs sont dans la [spécification de l'interface](specification-interface.md). Le principe de la colonne d'eau reste : plus c'est profond, plus c'est foncé, dans la teinte sapin.

| Nom | Valeur | Usage |
| --- | --- | --- |
| Eau profonde | #1D5C6B | Couleur principale : sert de base au thème Material You sur Android et de teinte d'accent sur iOS ; fond de la colonne d'eau |
| Eau de surface | #8CC3CF | Haut de la colonne d'eau ; le dégradé va d'Eau de surface à Eau profonde selon la profondeur |
| Bouée | #C94A0A | Action principale (télécharger) et position actuelle sur la carte ; l'orange des bouées de surface, foncé pour rester lisible avec un texte blanc |
| Alarme | #C62828 | Plafond dépassé, remontée rapide, erreurs ; jamais utilisé ailleurs |
| Oxygène | #2E7D32 | Courbe de ppO2 et mélanges nitrox dans le profil |

Les fonds, textes et séparateurs restent ceux du système (iOS et Material You), en mode clair et sombre. Le mode sombre est soigné pour le soir et le bateau de nuit.

**Référence Android (décidé le 5 novembre 2026).** On suit Material Design 3 dans sa version standard, pas la variante « Expressive » : bouton d'action flottant carré à coins arrondis, boutons ordinaires en forme de pilule, barre de navigation sur téléphone et rail de navigation sur tablette. Sur iPhone et iPad, on suit les conventions d'Apple (Human Interface Guidelines).

**Typographie.** Les polices du système : SF Pro sur iOS, Roboto sur Android. C'est le choix natif, et il garde le texte lisible à toutes les tailles d'accessibilité. Une seule règle propre à OpenDives : les chiffres de plongée (profondeur, durée, pression) utilisent les **chiffres tabulaires**, pour que les colonnes de valeurs restent alignées d'une ligne à l'autre.

**Mise en page.** Listes natives pleine largeur plutôt que cartes, alignement à gauche, valeurs numériques alignées en colonnes. Dans une ligne de la liste, les métadonnées sont placées en colonnes, pas enchaînées avec des points médians.

**Ce que j'ai écarté et pourquoi.** Mon premier réflexe était l'habillage « océan » : fond bleu en dégradé, vague dans l'en-tête, cartes arrondies à ombre douce. C'est l'allure par défaut de presque toutes les apps de plongée et des interfaces générées. Je l'ai remplacé par un dégradé réservé aux données (la colonne d'eau) et un accent emprunté à l'équipement réel (la bouée). L'interface autour reste celle du système. Ces couleurs sont une piste : les maquettes serviront à les valider ou à les ajuster.

## 6. Écrans clés à maquetter en premier

Cinq écrans couvrent les situations les plus fréquentes et les choix de conception les plus risqués. Ils seront maquettés sur iPhone (style iOS) et sur téléphone Android (Material You), plus une vue tablette.

| Écran | Situation | Ce que la maquette doit valider |
| --- | --- | --- |
| Carnet (liste des plongées) | Partout | Miniature du profil comme identité de chaque plongée, regroupement par voyage, lisibilité des chiffres en colonnes, accès au téléchargement |
| Détail d'une plongée | Le soir | La colonne d'eau, l'exploration du profil au doigt, la place des données techniques (masquées pour une plongée loisir, visibles pour une plongée trimix) |
| Téléchargement depuis l'ordinateur | Sur le bateau | Association la première fois, puis téléchargement en un geste ; progression et résultat clairs |
| Saisie rapide après téléchargement | Sur le bateau | Site proposé d'après le GPS, compagnons habituels en un toucher, sans clavier |
| Carnet sur tablette | À la maison | Liste et détail côte à côte, profil large, édition groupée |

S'ajoutent deux écrans, après la décision du 5 novembre 2026 sur les filtres : **l'éditeur de filtre** (tous les critères, regroupés par thème, matériel compris) et **les statistiques d'un résultat filtré** (par exemple, toutes les plongées faites avec un ordinateur ou une combinaison).

**Données utilisées.** Les profils viennent des fichiers d'exemple du dépôt Subsurface : par exemple une plongée au lac Coleridge (`test42.xml`), une série de trois plongées, dont une en Finlande (`test40-42.xml`) et une plongée au recycleur à Northern Arch (`test-apd-inspiration-reference.xml`). On utilise ainsi de vraies formes de profil et de vraies valeurs, pas des données inventées.

**Ensuite.** Une fois ce document validé, je réalise ces maquettes dans un espace de design que vous pourrez commenter et modifier. On pourra comparer deux variantes pour les choix les plus incertains, comme la miniature du profil dans la liste et la place des données techniques.

## 7. Décisions prises pendant les maquettes (5 novembre 2026)

Les maquettes couvrent maintenant, sur iPhone et téléphone Android : premier lancement, sites et carte hors ligne, outils et calculateur de gaz, planificateur, modification d'une plongée, réglages, détail en mode sombre, et quatre états (carnet vide, téléchargement échoué, hors ligne avec modifications en attente, conflit de synchronisation). Sur iPad et tablette Android : sites, outils, modification d'une plongée et réglages.

| Sujet | Décision |
| --- | --- |
| Premier lancement | Trois choix, chacun avec sa conséquence écrite : compte existant (sauvegarde dans le cloud, copie sur l'appareil consultable sans réseau), créer un compte (gratuit, partagé entre appareils), commencer sans compte (carnet seulement sur cet appareil, sans sauvegarde ; on peut créer un compte plus tard et y envoyer le carnet) |
| Unités | Chaque mesure se règle à part : profondeur, température, pression, volume, poids (par exemple profondeur en pieds et température en °C). C'est le mode « personnalisé » de Subsurface, déjà synchronisé par le cloud |
| Planificateur | Il peut partir d'une plongée du carnet : il en reprend le gaz, la bouteille, la pression de départ et la consommation (SAC) mesurée. Accès depuis Outils (« Nouvelle plongée ou à partir du carnet ») et depuis la fiche d'une plongée (« Planifier à partir de cette plongée ») |
| Réserve de gaz | Quand il resterait moins que la réserve minimale pour remonter à deux, le planificateur l'affiche en couleur Alarme, avec l'écart en bar |
| Conflit de synchronisation | Subsurface fusionne lui-même la plupart des modifications concurrentes ; quand il ne peut pas (« Remote storage and local data diverged »), OpenDives proposerait de garder la version de l'appareil ou celle du cloud, après comparaison, sans rien perdre avant le choix. **À valider** : c'est un ajout à la couche de synchronisation d'OpenDives, sans modifier Subsurface |

**divelogs.de (décidé le 5 novembre 2026).** À la création d'un compte, on peut reprendre son carnet divelogs.de : les plongées sont téléchargées une seule fois dans le compte Subsurface, sans synchronisation ensuite. OpenDives ne conserve pas les identifiants divelogs.de.

Les valeurs des maquettes du planificateur viennent du vrai planificateur de Subsurface, compilé sans Qt dans la preuve de concept.
