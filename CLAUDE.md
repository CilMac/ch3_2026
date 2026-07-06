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
  - Lecture : `GET /repos/CilMac/ch3_2026/contents/data/data.json` — publique, sans jeton.
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

**Structure de l'onglet Calcul** : le bandeau "Mode de saisie" (`#mode-volume-btn`/`#mode-poids-btn`)
a été étendu à 3 boutons en ajoutant `#mode-favoris-btn`, pour éviter d'avoir à scroller vers le
panneau favoris sur mobile. `showCalcSubview('volume'|'poids'|'favoris')` (`js/app.js`) bascule
entre deux conteneurs frères (`#calc-panel` / `#favoris-panel`) et appelle `applyMode()` pour les
deux premiers modes. Toute action qui modifie l'état du calculateur en arrière-plan (bouton
"Utiliser" d'un favori, "Rejouer la dernière conso" dans Archivage) doit appeler `showCalcSubview()`
et non `applyMode()` directement, sinon le résultat reste caché derrière le panneau resté actif.
"Utiliser" un favori pré-remplit aussi la note d'Archivage avec `Favori : <nom>` (modifiable avant
d'archiver), pour retrouver l'origine de l'entrée dans Détail.

## Contrainte d'environnement importante

**`git push` échoue systématiquement dans cet environnement Claude Code** (pas de credentials
configurés). Workflow de contournement :
1. Commiter localement normalement (fetch + rebase sur `origin/main` d'abord si l'utilisateur
   a testé l'appli en live entre-temps — chaque archivage/suppression réel crée un commit direct
   sur GitHub via l'API, invisible localement tant qu'on n'a pas fetch).
2. Demander à l'utilisateur d'uploader les fichiers changés via l'interface web GitHub
   ("Add file" → "Upload files"). **Ne jamais glisser le dossier `data/`** (vraies données,
   aucune autre sauvegarde).
3. **Vérifier après coup par SHA, pas par "ça a déployé".** L'upload manuel est source
   d'erreurs vécues : fichier déposé à la racine au lieu du bon sous-dossier (il faut être
   *dans* le dossier cible sur GitHub avant de cliquer Upload), ou mauvaise version glissée
   par erreur (a cassé le site pour tout le monde en même temps, pas juste un appareil).
   Toujours comparer le SHA git local (`sha1("blob " + len + "\0" + bytes)`) à celui renvoyé par
   `GET /repos/CilMac/ch3_2026/contents/<path>` avant de déclarer un correctif résolu.

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

Synthèse est découpée en 4 sous-écrans via une sous-navigation locale (`#synthese-subnav`,
boutons `[data-subview]`, cf. `js/app.js`) plutôt qu'un seul long scroll : **Stats** (stats
globales + filtre de période + Séries), **Bilan hebdo** (semaine sélectionnée, navigation
préc/suiv), **Tendance** (graphique 12 semaines), **Bilan général** (liste complète par semaine).
Le filtre de période ne s'affiche que dans l'onglet Stats, ce qui évite l'ambiguïté qu'il y avait
avant (il ne s'appliquait qu'aux stats du haut mais apparaissait au-dessus de tout). Réinitialisation
a été déplacée dans Configuration (entre Export/Import et Test de synchronisation) — Synthèse est
redevenue un écran de consultation pure.

## Navigation : 6 onglets

`Calcul | Archivage | Détail | Synthèse | ℹ️ Info | ⚙️ Configuration`. Info et Configuration sont
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
  calculé pour la période choisie dans **Stats** (`periodeType`/`getPeriodStats()`, factorisé et
  partagé entre `renderSynthese()` et `renderBilanGeneral()`) — se met à jour dès que la période
  change dans Stats, même si on regarde Bilan général à ce moment-là.

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
