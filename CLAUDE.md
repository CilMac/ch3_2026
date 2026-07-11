# CH3-CH2-OH — suivi personnel de consommation (web)

Réécriture complète d'une app iOS Swift (première appli iPhone de l'utilisateur) en page web
statique. Déployée via GitHub Pages : `https://cilmac.github.io/ch3_2026/`.
Dépôt : `github.com/CilMac/ch3_2026` (public, owner CilMac).

## Architecture

- **Aucun framework.** HTML/CSS/JS vanilla, ES modules natifs (`<script type="module">`).
- **Style washi/bois** : mêmes variables CSS et polices (Shippori Mincho, DM Serif Display)
  que les autres pages du même auteur (ex. Soroban). Voir `css/style.css` pour les tokens
  (`--wood-dk`, `--wood-mid`, `--amber`, etc.).
- **Stockage : uniquement `data/data.json` sur GitHub**, pas de backend, pas de compte,
  pas de localStorage pour les données (seulement pour le jeton et les préférences d'appareil).
  - Lecture : `GET /repos/CilMac/ch3_2026/contents/data/data.json` — publique par nature (pas de
    scope particulier requis), mais authentifiée avec le jeton configuré s'il y en a un (limite
    5000 req/h au lieu de 60/h anonyme, partagée par IP — facile à atteindre avec plusieurs
    appareils). Si ce jeton s'avère invalide/expiré, `readData()` (`js/githubSync.js`) retente
    automatiquement en anonyme plutôt que d'échouer — un jeton cassé ne doit pas casser la
    lecture, seulement faire perdre le bénéfice du quota élargi. Le message d'erreur 401/403
    distingue les deux cas ("jeton invalide" seulement si un jeton a réellement été envoyé).
  - Écriture : `PUT` sur le même endpoint, avec le SHA courant (géré automatiquement, avec
    retry en cas de conflit de version). Nécessite un jeton fine-grained (`Contents: write`,
    limité à ce repo) que l'utilisateur colle dans l'onglet Configuration ; stocké en
    `localStorage` par appareil, jamais committé.
  - Tout ça est isolé dans `js/githubSync.js` — le reste du code ne parle jamais directement
    à l'API GitHub.

## Structure des fichiers

```
index.html          squelette + toutes les vues (une section par onglet, cachée/affichée en JS)
css/style.css        tout le style
js/app.js             câblage DOM uniquement (event listeners, rendu) — pas de logique métier
js/githubSync.js      seul module qui parle à l'API GitHub (lecture/écriture, gestion de conflit)
js/config.js          jeton + nom d'appareil (localStorage)
js/calc.js            calcul d'unités d'alcool (logique pure)
js/dataStore.js        forme canonique des données, construction/validation d'une entrée
js/session.js          cumul de session en mémoire (pour l'alcoolémie)
js/offlineQueue.js      file d'attente localStorage des archivages échoués faute de réseau
js/entries.js          tri/formatage des entrées (Détail)
js/stats.js            filtrage par période + stats agrégées (Synthèse)
js/bilans.js           regroupement par semaine calendaire (lundi-dimanche), pas par n° ISO
js/chart.js            génère un graphique SVG en barres (chaîne de caractères, sans DOM)
js/alcoolemie.js        formule de Widmark simplifiée
js/streaks.js           séries de jours consécutifs sans conso
js/constants.js         seuils officiels centralisés (10 U/semaine, 4 U/occasion, etc.)
data/data.json          UNIQUEMENT sur GitHub — ne jamais créer de version locale avec de vraies données
```

**Convention établie** : chaque fichier `js/*.js` (sauf `app.js` et `githubSync.js`) est un
module isolé de logique pure, sans DOM ni réseau, facilement testable. `app.js` fait tout le
câblage DOM et appelle ces modules. Garder cette séparation pour tout ajout.

## Modèle de données (`data/data.json`)

```json
{
  "version": 1,
  "updatedAt": "ISO date",
  "entries": [
    {
      "id": "uuid",
      "date": "ISO date complète",
      "unites": 2.4,
      "mode": "volume|poids",
      "volume": 25, "poids": null,
      "degre": 12,
      "type": "biere|vin|sake|spiritueux|autre",
      "note": ""
    }
  ],
  "favoris": [
    {
      "id": "uuid",
      "nom": "Sancerre blanc",
      "mode": "volume|poids",
      "volume": 12, "poids": null,
      "degre": 13,
      "type": "biere|vin|sake|spiritueux|autre"
    }
  ]
}
```

`favoris` : conso récurrentes gérées par l'utilisateur (ajout/suppression) dans un panneau de
l'onglet Calcul. Cliquer sur un favori pré-remplit le calculateur (mode/volume-ou-poids/degré/type)
via les mêmes helpers que "Rejouer la dernière conso" — n'archive rien automatiquement.
`ensureShape()` (`js/dataStore.js`) garantit que `favoris` est toujours un tableau, y compris sur
un `data.json` créé avant l'existence de ce champ.

**Structure de l'onglet Calcul (écran fusionné)** : Calcul et Archivage ont été fusionnés sur un
seul écran (`data-view="calcul"`), dans cet ordre : bloc "Mes favoris" (toujours visible, replié
par défaut dans un `<details id="favoris-list-details">` avec un résumé "Mes favoris (N)"),
calculateur (`#calc-panel`, sélecteur Volume/Poids `#mode-volume-btn`/`#mode-poids-btn` placé sur
la même ligne que le titre "Calcul d'unités" via `.panel-header-row`), puis bloc "Enregistrer cette
consommation" (ex-panneau Archivage : résumé, rejouer la dernière conso, date/type/note,
`#archive-btn`). L'ancien mode "Favoris" du sélecteur segmenté (3 boutons) et `showCalcSubview()`
ont disparu : chaque favori a maintenant sa propre carte avec 3 actions sur une seule ligne
(`.btn-row`) — **Archiver** (bouton primaire, archive directement via `archiveFavoriDirect()`, même
pattern que l'ancien `archiveBtn` : cumul de session, badge semaine, écriture GitHub, mise en file
hors-ligne, avec une bannière de confirmation `#favori-archive-confirm` + bouton Annuler actif
~7s), **Modifier avant d'archiver** (lien discret, appelle `applyFavori()` qui préremplit le
calculateur et scrolle vers `#calc-panel`, sans changer d'onglet), et **Supprimer**. L'ancien
onglet "Archivage" est devenu **"Soirée"** (`data-view="soiree"`) : ne garde que cumul de session
+ alcoolémie ; `renderAlcoolemie()` s'y déclenche via `onViewChange`, tandis que résumé/bouton
archiver/date-max se rafraîchissent à l'affichage de "calcul".

## Déploiement

**`git push` fonctionne normalement depuis le 2026-07-06** : un jeton fine-grained (`Contents:
write`, limité à ce repo) est configuré dans l'URL du remote origin (`git remote -v` pour vérifier,
ne pas l'afficher/reconfigurer sans raison). Commiter puis `git push origin main` directement ; en
cas de rejet non-fast-forward (usage réel de l'appli entre-temps, qui crée des commits directs sur
GitHub via l'API), `git fetch origin main && git merge --ff-only origin/main` puis repousser.

**Le déploiement GitHub Pages lui-même reste capricieux** (indépendant du push) : le workflow
"pages build and deployment" échoue parfois à l'étape "Deploy to GitHub Pages" avec le message
générique "Deployment failed, try again later." alors que le build réussit. Vu plusieurs fois,
avec une fréquence croissante. Remèdes par ordre d'essai : (1) "Re-run failed jobs" sur le run
échoué (`github.com/CilMac/ch3_2026/actions`) — parfois suffisant ; (2) si ça échoue encore ou
reste bloqué en "queued" indéfiniment, Settings → Pages → "Unpublish site", attendre, puis
reconfigurer Source = "Deploy from a branch" / branche `main` / dossier `/(root)` et Save (au
besoin, mettre la branche sur "None" puis la remettre sur `main` pour débloquer le bouton Save
resté grisé). Vérifier après coup que le site sert le bon contenu (`curl` + SHA), pas juste que
le run est vert.

## Tests / vérification

- Preview server local via `npx serve` sur le dossier `web-ch3_2026` (voir `.claude/launch.json`
  à la racine du projet parent) — parle à la vraie API GitHub même en local.
- **Ne jamais tester une écriture réelle sans un vrai jeton fourni explicitement par
  l'utilisateur.** Pour tester les chemins d'erreur/UI sans risque : jeton factice
  (`github_pat_FAKE...`) → échoue proprement en 401, ne touche à rien.
- Pour tester une suppression/import réel : créer une entrée de test explicite, vérifier,
  supprimer, re-vérifier via l'API que `data/data.json` est revenu à l'état attendu.
- L'utilisateur veut des confirmations multiples et explicites sur toute action destructive
  (cf. le flux "Tout effacer" dans Configuration : révéler → cocher → taper "EFFACER" → confirm()
  natif final). Reproduire ce niveau de friction pour toute nouvelle action irréversible.

## Sous-écrans de Synthèse

Synthèse est découpée en 3 sous-écrans via une sous-navigation locale (`#synthese-subnav`,
boutons `[data-subview]`, cf. `js/app.js`) plutôt qu'un seul long scroll : **Vue d'ensemble**
(`data-subview="stats"`, attribut inchangé pour ne rien casser côté JS/CSS malgré le libellé
renommé — stats globales + filtre de période + Séries + Bilan général, dans cet ordre, empilés
sur le même écran), **Bilan hebdo** (semaine sélectionnée, navigation préc/suiv), **Tendance**
(graphique 12 semaines + graphiques par jour/type). Anciennement 4 sous-écrans avec "Stats" et
"Bilan général" séparés ; fusionnés en juillet 2026 car ils partageaient déjà le même filtre de
période et se rendaient toujours ensemble (`onPeriodeChange()`) — la séparation en deux onglets
n'apportait plus rien, seulement un clic de navigation en plus. Le filtre de période ne s'affiche
que dans Vue d'ensemble, ce qui évite l'ambiguïté qu'il y avait avant (il ne s'appliquait qu'aux
stats du haut mais apparaissait au-dessus de tout). Réinitialisation a été déplacée dans
Configuration (entre Export/Import et Test de synchronisation) — Synthèse est redevenue un écran
de consultation pure.

## Navigation : 6 onglets

`Calcul | Soirée | Détail | Synthèse | ℹ️ Info | ⚙️ Configuration`. Info et Configuration sont
des boutons icône seule (classe `.tab-btn-icon`, `aria-label` pour l'accessibilité puisqu'il n'y a
pas de texte visible) — pas de logique JS spécifique, ils passent par le même mécanisme générique
`[data-target]` / `.view[data-view]` que les autres onglets. Info contient deux panneaux : la
description des fonctionnalités (public) et "Sous le capot" (contenu technique, ex-panneau "À
propos" qui vivait auparavant dans Configuration).

## Badge de connexion et raccourci "rejouer"

Un badge cliquable (`#conn-badge`, hors de `<main>` donc visible sur tous les onglets) n'apparaît
que quand **aucun** jeton n'est présent en `localStorage` ("Pas de jeton") — masqué entièrement
sinon (`hidden`), pas de vérification de validité réelle auprès de GitHub, juste la présence.
Clic dessus → `data-target="config"`, réutilise le mécanisme générique de navigation. Mis à jour
dans `refreshTokenStatus()` (`js/app.js`).

Dans Archivage, le bouton "↺ Rejouer la dernière conso" (`#replay-last-btn`) relit
`data/data.json`, prend l'entrée la plus récente et réapplique son mode/volume-ou-poids/degré/type
au Calculateur (mêmes helpers `applyMode`/dispatch d'événements `input` que la saisie manuelle) —
la date reste "maintenant", il faut toujours cliquer "Archiver" pour valider.

## Invalidation du cache Synthèse/Détail

`syntheseLoaded`/`detailLoaded` (flags qui évitent de refetch `data/data.json` à chaque changement
d'onglet) doivent être remis à `false` après **toute** écriture qui change les entrées — sinon
l'onglet qui n'a pas été rouvert affiche des données périmées jusqu'à un clic manuel sur
"Actualiser". Reset déjà en place pour import/réinitialisation ; ajouté aussi après archivage
(`archiveBtn` → reset des deux) et après suppression dans Détail (`deleteEntry` → reset de
`syntheseLoaded`, `detailEntries` étant déjà à jour localement donc pas besoin de reset
`detailLoaded`). Si un nouveau point d'écriture apparaît, penser à faire pareil.

## Contraintes de saisie dans Archivage

- Pas de date future : `entryDatetimeInput.max` est fixé à "maintenant" (recalculé à chaque
  ouverture de l'onglet Archivage via `refreshEntryDatetimeMax()`), et `archiveBtn` revalide
  côté JS avant tout `writeData` (le `max` HTML seul ne suffit pas à garantir la règle sur tous
  les navigateurs/dates saisies au clavier).
- La ligne "Moyenne hebdo sur *(période)*" en haut de **Bilan général** reprend le `consoHebdoMoy`
  calculé pour la période choisie dans **Vue d'ensemble** (`periodeType`/`getPeriodStats()`,
  factorisé et partagé entre `renderSynthese()` et `renderBilanGeneral()`) — se met à jour dès que
  la période change, même écran désormais (fusion Stats/Bilan général, voir plus haut).

## Cumul de session = archivage (plus de bouton "Cumuler" séparé)

Le bouton "Cumuler la conso actuelle" a été supprimé : `archiveBtn` appelle `addToSession(entry.unites)`
directement, **avant** la tentative d'écriture réseau (pas après), pour que l'estimation d'alcoolémie
reste juste même si l'écriture échoue ou est mise en attente hors-ligne (voir section suivante). Le
bouton "RAZ" reste le seul moyen de remettre le cumul à zéro (nouvelle soirée). Voir `js/session.js`.

## File d'attente hors-ligne (`js/offlineQueue.js`)

Si `archiveBtn` échoue avec une erreur qui n'est **pas** un `SyncError` (donc pas un problème
d'authentification/droits/conflit — juste `fetch` qui échoue, typiquement pas de réseau), l'entrée est
stockée dans `localStorage` (`getPendingEntries`/`queueEntry`/`removePendingEntry`) au lieu d'afficher
une simple erreur. Un compteur (`#pending-status` dans Archivage) indique combien de conso attendent.

`trySyncPending()` (verrouillé par `syncingPending` contre les exécutions concurrentes) retente
l'écriture de chaque entrée en attente, dans l'ordre, et s'arrête au premier échec (réseau toujours
coupé, ou jeton invalide — dans les deux cas l'entrée reste en file, jamais perdue). Déclenché : au
chargement de la page, sur l'évènement `online`, et après tout archivage réussi (flush opportuniste).

**`renderDetailList()` fusionne les entrées en attente avec l'historique synchronisé** (marquées
"⏳ en attente", bouton "Retirer de la file" au lieu de "Supprimer" — pas besoin de jeton pour ça,
rien n'est encore sur GitHub). Important : `loadDetail()` doit appeler `renderDetailList()` même dans
son `catch` (lecture réseau échouée), sinon les conso en attente resteraient invisibles précisément
dans le cas où c'est le plus utile (hors-ligne). Si un nouveau point d'écriture apparaît dans l'appli,
il devrait suivre le même principe (tenter l'écriture, mettre en file sur échec non-`SyncError`).

## Badge "Cette semaine" et graphiques par jour/type

`#week-badge` (dans `.badges-row`, à côté de `#conn-badge`) affiche en permanence le total d'unités
de la semaine calendaire en cours (lundi-dimanche, via `weekDetail`/`mondayOf` de `bilans.js`) et son
icône de repère (`iconePourConsoHebdo`) — vue proactive, contrairement à Synthèse qui est
rétrospective. Calculé dans `loadFavoris()` (renommage non fait, mais cette fonction fait maintenant
double usage : favoris + badge semaine, pour ne pas dupliquer la lecture réseau) en fusionnant
`data.entries` avec `getPendingEntries()` (sinon une conso hors-ligne non encore synchronisée
sous-compterait le badge). `bumpWeekBadge(date, unites)` l'incrémente en mémoire immédiatement à
l'archivage (même logique "avant l'écriture réseau" que le cumul de session) — jamais recalculé une
deuxième fois par `trySyncPending()`, pour ne pas compter deux fois la même entrée. `bumpWeekBadge`
est aussi appelé avec un delta **négatif** à toute suppression (`deleteEntry` dans Détail,
`cancelPendingEntry` pour une conso en attente) et le badge est remis à `0` directement après une
réinitialisation complète — sans ça, un appareil resté ouvert longtemps dérivait silencieusement
(bug réel observé : Mac et iPhone affichaient des totaux différents après des suppressions faites
sur un seul des deux appareils). Comme ce compteur ne peut de toute façon pas savoir ce qui change
sur *d'autres* appareils ou directement via l'API GitHub, un listener `visibilitychange` relance
`loadFavoris()` (donc un refetch complet + recalcul du badge) à chaque retour au premier plan de
l'app — le seul filet de sécurité vraiment fiable contre la dérive inter-appareils.

Dans Synthèse → Tendance, deux panneaux sous le graphique 12 semaines : "Par jour de la semaine"
(`statsParJourSemaine`) et "Par type de boisson" (`statsParType`), tous deux dans `js/stats.js`,
rendus via `categoryBarChartSvg` (`js/chart.js`, générique, sans ligne de seuil contrairement à
`weeklyBarChartSvg`). Contrairement au graphique 12-semaines (périmètre fixe), ces deux-là suivent
le filtre de période de Vue d'ensemble (même `getPeriodStats()`, qui expose maintenant aussi `filtered` en
plus de `stats`/`start`/`end`) — la fonction partagée `onPeriodeChange()` fait le lien entre les 3
boutons de période et les 4 rendus concernés (`renderSynthese`, `renderBilanGeneral`,
`renderChartJour`, `renderChartType`), pour éviter de recopier ces 4 appels à chaque point d'entrée.

## Unités d'alcool factorisées (`computeUnitesFrom`)

`js/calc.js` expose `computeUnitesFrom({ mode, volume, poids, degre })`, une version pure de la
formule (extraite de `computeUnites()`, qui délègue maintenant dessus avec l'état interne du
Calculateur). Utilisée par le formulaire d'ajout de favori (aperçu des unités en direct pendant la
saisie, `renderFavoriUnitesPreview()`) et par `renderFavoris()` (unités affichées comme titre de
chaque carte, comme dans Détail) — ces deux usages ont leur propre mode/volume/poids/degré,
indépendants de l'état du Calculateur principal, d'où l'intérêt de la version sans état partagé.

La moyenne hebdo de **Bilan général** est mise en avant dans un `.result-block` (comme "Unités
d'alcool" dans Calcul ou "Total cumulé" dans Archivage) plutôt qu'en simple texte — c'est
l'indicateur que l'utilisateur suit le plus, ça justifie le traitement visuel le plus visible de
l'écran.

## Historique en accordéon par semaine

Détail groupe désormais les entrées par semaine (`<details class="week-accordion">` natif, pas de
JS pour l'ouverture/fermeture) au lieu d'une liste plate — `groupByWeek()` (`js/bilans.js`) expose
maintenant aussi `entries: []` par semaine (pas seulement `total`), réutilisé ici. Respecte le tri
plus-récent/plus-ancien existant (`detailSortOrder`) à la fois pour l'ordre des semaines et pour
l'ordre des entrées dans chaque semaine. Seule la première semaine (selon le tri courant) est
ouverte par défaut. `buildEntryListItem()` a été extrait pour éviter de dupliquer le HTML d'une
carte d'entrée entre ce nouveau code et l'ancien.

## Thème visuel (washi / classique)

Attribut `data-theme` sur `<html>`, valeurs `"washi"` ou `"classique"` — préférence d'appareil
(`localStorage`, clé `ch3_theme`, jamais dans `data/data.json`). `js/theme.js` expose
`getTheme()`/`setTheme()`/`toggleTheme()` ; `getTheme()` retourne `"classique"` par défaut si
rien n'est stocké (c'est le seul endroit où ce défaut se décide). Un petit script inline tout en
haut de `<body>` (avant tout le reste du markup) applique le thème stocké avant le premier rendu
visible, pour éviter un flash du mauvais thème au chargement — `app.js` seul serait trop tardif.

`:root` garde les valeurs washi historiques ; `[data-theme="classique"]` (palette iOS : bleu
`#007AFF`, vert `#34C759`, jaune `#FFCC00`, orange `#FF9500`, rouge `#FF3B30`) surcharge les mêmes
variables sans toucher à `:root`. `--bg` et le bruit SVG de fond, ainsi que `--panel`, sont
volontairement identiques dans les deux thèmes (pas de fond blanc/clair, resterait trop lumineux
avec la texture washi) ; seuls accents, boutons, textes et graphiques changent. Les noms de
variables historiques (`--wood-dk`, `--wood-mid`…) sont conservés tels quels même en thème
classique où ils portent du bleu — renommer aurait touché ~40 occurrences pour rien.

Quasiment toutes les couleurs de `style.css` passent par des variables CSS (y compris des
variables `-rgb` compagnes, ex. `--wood-dk-rgb: 90,52,24`, pour les `rgba(var(--wood-dk-rgb), X)`
utilisés dans les bordures/ombres semi-transparentes) — éviter de réintroduire du hex/rgba codé en
dur hors de `:root` et du bloc `[data-theme="classique"]`.

Les graphiques (`js/chart.js`) ont leurs propres variables `--chart-safe`/`--chart-mid`/
`--chart-warn`/`--chart-over` (échelle de sévérité à 4 paliers de `barColor()`), découplées des
couleurs d'accent UI générales pour que la palette classique ne soit pas contrainte par la
sémantique du graphique. Le SVG référence `var(--xxx)` directement dans ses `fill`, donc la
bascule de thème se répercute sans régénérer le graphique.

Contrôle de bascule dans l'onglet Configuration (panneau "Apparence", pas sur l'écran d'accueil,
pour ne pas le surcharger) : un `.segmented`/`.seg-btn` (même composant que le sélecteur de mode
du Calculateur) plutôt qu'un bouton isolé.

## Lisibilité des graphiques (labels)

`.chart-axis-label`/`.chart-value-label` sont passés de 9px à 12px (et couleur pleine `--wood-dk`
plutôt qu'un ton clair peu contrasté) — 9px suffisait pour les dates courtes du graphique 12
semaines mais rendait illisibles les libellés plus longs des graphiques par jour/type ("Dimanche",
"Spiritueux"). Toujours vérifier visuellement (capture d'écran ou preview) après un changement de
taille de police dans un SVG généré par `chart.js`, la largeur de barre disponible dépend du nombre
de catégories.

## Sliders Poids / Seuil visé (onglet Soirée)

`#poids-input` (50-110 kg, défaut 85) et `#seuil-legal-input` (0,1-1,5 g/L, défaut 0,5) sont des
`<input type="range">` plutôt que des champs numériques — plus rapides à régler au doigt sur
mobile. La valeur choisie s'affiche en direct dans le `<label>` (`#poids-value`/`#seuil-legal-value`,
mis à jour dans `renderAlcoolemie()`, pas besoin de listener séparé). Style custom en CSS
(`input[type="range"]::-webkit-slider-thumb` / `::-moz-range-thumb`) pour matcher la palette
bois/ambre — les sliders natifs ne suivent pas `accent-color` de façon assez fine sur tous les
navigateurs.

## Backlog / pistes d'amélioration ergonomie (identifiées, pas encore faites)

(vide pour l'instant — tous les points identifiés lors du dernier passage en revue ont été traités)

## Historique des lots (pour contexte, ordre de construction)

1. Fondations (sync GitHub, écran config, style)
2. Calculateur d'unités
3. Archivage (+ cumul de session)
4. Détail/historique
5. Synthèse (stats + filtres de période)
6. Bilans hebdo/général
7. Graphique de tendance (nouveauté vs l'appli iOS d'origine)
8. Alcoolémie (Widmark simplifié)
9. Extras (séries, export/import JSON, écran à propos, PWA)
10. Finition (icône, manifest, durcissement de la confirmation de réinitialisation)
