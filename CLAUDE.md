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
      "type": "biere|vin|spiritueux|autre",
      "note": ""
    }
  ]
}
```

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
  (cf. le flux "Tout effacer" dans Synthèse : révéler → cocher → taper "EFFACER" → confirm()
  natif final). Reproduire ce niveau de friction pour toute nouvelle action irréversible.

## Backlog / pistes d'amélioration ergonomie (identifiées, pas encore faites)

- Presets de Calcul et types de boisson dans Archivage ne couvrent pas le saké (habitude
  réelle de l'utilisateur) — ajouter "Saké" au menu type + des presets volume/degré adaptés.
- Détail : suppression uniquement, pas d'édition en place d'une entrée mal saisie.
- Synthèse : très long scroll vertical (stats + séries + bilan hebdo + tendance + bilan général
  + réinitialisation empilés) — l'appli iOS d'origine séparait ça en écrans distincts.
  Le filtre de période en haut ne s'applique qu'aux stats du haut, pas aux sections suivantes
  (bilan hebdo/général/tendance ont chacun leur périmètre fixe) — source de confusion possible.
- Réinitialisation vit dans Synthèse (écran de consultation) plutôt que Configuration.
- Aucun indicateur de statut de connexion/jeton visible hors de l'onglet Configuration.
- Pas de raccourci "rejouer la dernière conso" pour un usage répétitif.

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
