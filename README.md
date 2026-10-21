# Aide formateur

Application web installable (PWA) pour **comptabiliser les questionnaires de satisfaction** d'une formation :
saisie rapide au téléphone, moyennes et taux de satisfaction par critère, export du bilan.

## Fonctionnalités

- Une **évaluation** par session de formation : intitulé, date, formateur, critères (un par ligne),
  échelle (1–4, 1–5 ou 1–10) et seuil « satisfait à partir de ».
- **Saisie** questionnaire par questionnaire avec de gros boutons ; « Sans » = pas de réponse
  (exclu des moyennes) ; commentaire libre ; possibilité de retirer un questionnaire.
- **Bilan** : nombre de questionnaires, moyenne et taux de satisfaction globaux et par critère,
  répartition des notes, commentaires.
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
| `sw.js` | Cache hors ligne — incrémenter `VERSION` à chaque mise en ligne |
| `manifest.webmanifest`, `icons/` | Installation (nom, icônes, couleurs) |
| `tools/make-icons.js` | Régénère les icônes PNG |
| `tools/serve.js` | Serveur statique de test |

## Suite envisagée

- APK natif (Android Studio) ou empaquetage de la PWA (Bubblewrap / Capacitor).
- Version Casio Graph 35+E II (MicroPython) reprenant la même logique de calcul.
