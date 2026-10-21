// Génère les icônes PNG de l'appli (histogramme blanc sur fond bleu), sans dépendance.
// Usage : node tools/make-icons.js
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const FOND = [0x1f, 0x5f, 0x99];
const BARRE = [0xff, 0xff, 0xff];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function bloc(type, donnees) {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length);
  const corps = Buffer.concat([Buffer.from(type, 'ascii'), donnees]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corps));
  return Buffer.concat([longueur, corps, crc]);
}

function png(taille, pixel) {
  const brut = Buffer.alloc(taille * (taille * 3 + 1));
  for (let y = 0; y < taille; y++) {
    const ligne = y * (taille * 3 + 1);
    for (let x = 0; x < taille; x++) pixel(x, y).forEach((v, i) => { brut[ligne + 1 + x * 3 + i] = v; });
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0);
  ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 2; // RVB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', ihdr),
    bloc('IDAT', zlib.deflateSync(brut)),
    bloc('IEND', Buffer.alloc(0)),
  ]);
}

/** Cinq barres croissantes ; `marge` = part de l'icône laissée libre sur chaque bord. */
function icone(taille, marge) {
  const hauteurs = [0.3, 0.5, 0.65, 0.85, 1];
  const zone = 1 - 2 * marge;
  const largeur = zone / (hauteurs.length * 1.5 - 0.5);
  return png(taille, (x, y) => {
    const u = x / taille, v = y / taille;
    for (let i = 0; i < hauteurs.length; i++) {
      const g = marge + i * largeur * 1.5;
      const haut = marge + zone * (1 - hauteurs[i]);
      if (u >= g && u < g + largeur && v >= haut && v < 1 - marge) return BARRE;
    }
    return FOND;
  });
}

const dossier = path.join(__dirname, '..', 'icons');
fs.writeFileSync(path.join(dossier, 'icon-192.png'), icone(192, 0.2));
fs.writeFileSync(path.join(dossier, 'icon-512.png'), icone(512, 0.2));
// Version « maskable » : Android peut rogner jusqu'à 10 % sur les bords, on éloigne le motif.
fs.writeFileSync(path.join(dossier, 'icon-maskable-512.png'), icone(512, 0.28));
console.log('Icônes générées dans', dossier);
