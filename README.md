# Football Whispers — Widget Légendes (Kane · Mbappé · Ronaldo · Messi)

Widget autonome affichant 4 joueurs avec, pour chacun :

- **Photo** (CDN SportMonks)
- **Saison en cours en club, toutes compétitions confondues** : matchs, buts, passes décisives
- **Sélection nationale depuis la Coupe du Monde 2022** : pays, matchs, buts, passes décisives

Données issues de l'**API SportMonks Football v3** (même token que le projet DataBetting).

## Fichiers

| Fichier | Rôle |
|---|---|
| `fetch-data.js` | Récupère et agrège les données SportMonks, génère `data.json` **et** `index.html` |
| `index.html` | **Le widget** — autonome (données + CSS + JS intégrés), prêt à intégrer |
| `data.json` | Données brutes calculées (pour réutilisation éventuelle) |
| `serve.js` | Petit serveur statique local pour prévisualiser (`node serve.js` → http://localhost:4178) |

## Rafraîchir les chiffres

```bash
node fetch-data.js
```

Régénère `data.json` et `index.html` avec les dernières stats. À relancer périodiquement (ex. après chaque journée). Le token peut être surchargé via la variable d'environnement `SPORTMONKS_API_TOKEN`.

## Intégrer sur Footballwhispers.com

**Option A — copier/coller** : ouvrir `index.html`, copier tout le contenu et le coller dans un bloc HTML personnalisé (WordPress : bloc « HTML personnalisé »).

**Option B — iframe** : héberger `index.html` et l'embarquer :

```html
<iframe src="https://…/index.html" style="width:100%;border:0;height:1100px" loading="lazy"></iframe>
```

Le widget est responsive : 4 colonnes en desktop, 2 en tablette, 1 en mobile.

## Choix de données

- **« Saison 2025/2026 »** = saison club en cours, toutes compétitions officielles cumulées (championnat + coupes + coupes d'Europe), **hors matchs amicaux de club**.
  - Kane / Mbappé / Ronaldo : saison européenne **2025/2026**.
  - Messi (MLS, saisons en année civile) : saison **2026** en cours — il n'existe pas de saison « 2025/2026 » en MLS.
- **« Depuis la CDM 2022 »** = toutes les compétitions de sélection nationale dont la saison a débuté **après la finale du Mondial 2022 (18/12/2022)** : éliminatoires, Ligue des Nations, Euro 2024 / Copa América 2024, matchs amicaux internationaux.
- **Buts** = total (penalties inclus).
