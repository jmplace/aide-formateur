# Aide formateur

Application web installable (PWA) pour **comptabiliser les questionnaires de satisfaction** d'une formation :
saisie rapide au téléphone, moyennes et taux de satisfaction par critère, export du bilan.

## Fonctionnalités

- Une **bibliothèque des formations** (ex. PAAP) : nom et liste des critères du questionnaire.
- Une **évaluation** par session : formation choisie dans la bibliothèque (menu déroulant au-dessus
  des critères, qu'elle remplit), intitulé, date, formateurs, critères (un par ligne, modifiables),
  échelle (1–4, 1–5 ou 1–10), seuil « satisfait à partir de » et, si on le connaît, le **nombre de grilles
  à saisir** (questionnaires papier reçus) : la saisie affiche alors l'avancement (« 5 / 12, reste 7 »)
  et demande confirmation au-delà.
- **Saisie** d'après les questionnaires papier, sur un seul écran :
  - en haut, la zone **Saisie** : une ligne par grille, nommée **A, B, C… Z** (puis AA, AB…) comme on
    marque les feuilles ; on tape la grille directement sur sa ligne puis Entrée, ce qui enchaîne sur
    la grille vide suivante. Les grilles prévues mais pas encore saisies apparaissent comme lignes vides.
    Syntaxe : `5545543455` (un chiffre par critère, dans l'ordre), `*5` (tout à 5), `43*5`
    (4, 3 puis 5 partout), `-` pour un critère sans note, `0` pour 10 sur l'échelle 1 à 10, espaces ignorés ;
  - en dessous, le **détail** de la ligne sélectionnée (clic, ou flèches ↑↓) : notes de 5 à 1 par critère
    (5 à gauche, « Sans » = pas de note), modifiables aux boutons ;
  - une ligne modifiée apparaît en orange tant qu'elle n'est pas enregistrée (Entrée ou bouton) ;
    « Annuler » revient à la version enregistrée ;
  - **« + Ajouter une grille »** ajoute une ligne vide en fin de liste ; **✕** supprime une grille (ou une
    ligne vide) et les grilles suivantes prennent la lettre précédente (D devient C…). Le nombre de grilles
    à saisir suit ces ajouts et suppressions.

  Un critère sans note est exclu des moyennes.
- **Comptage** : tableau une ligne par critère, une colonne par note (5 à 1) : nombre de grilles
  ayant donné cette note.
- **Bilan** : nombre de grilles, moyenne et taux de satisfaction globaux et par critère,
  répartition des notes, et **vue 3D** (barres sur un plan critères × grilles, hauteur = note ;
  glisser pour tourner, survol ou toucher pour le détail).
- Couleurs des notes : rouge (basses) → jaune → vert (hautes).
- **Exports** : bilan copié en texte, bilan CSV, réponses détaillées CSV (format Excel français).
- **Sauvegarde** JSON exportable / importable. Les données restent sur l'appareil (localStorage).
- Fonctionne **hors ligne** une fois installée.

## Lancer en local

```bash
node tools/serve.js 8080
```

puis ouvrir http://localhost:8080/.

## Installer sur Android

Un navigateur n'accepte d'installer une PWA (et d'activer le mode hors ligne) que si elle est servie
en **HTTPS** (ou sur `localhost`). Le plus simple : publier le dossier sur GitHub Pages
(ou tout hébergement statique HTTPS), l'ouvrir dans Chrome sur le téléphone, puis
menu ⋮ → **Installer l'application**.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css` | Coquille et mise en page |
| `app.js` | Données, calculs (`statistiques`), vues et exports |
| `barres3d.js` | Vue 3D du bilan (canvas, sans bibliothèque) |
| `sw.js` | Cache hors ligne — incrémenter `VERSION` à chaque mise en ligne |
| `manifest.webmanifest`, `icons/` | Installation (nom, icônes, couleurs) |
| `tools/make-icons.js` | Régénère les icônes PNG |
| `tools/serve.js` | Serveur statique de test |

## Suite envisagée

- APK natif (Android Studio) ou empaquetage de la PWA (Bubblewrap / Capacitor).
- Version Casio Graph 35+E II (MicroPython) reprenant la même logique de calcul.
