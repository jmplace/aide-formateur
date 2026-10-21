// Petit serveur statique pour tester l'appli en local : node tools/serve.js [port]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const racine = path.join(__dirname, '..');
const port = Number(process.argv[2]) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.json': 'application/json',
};

http.createServer((req, res) => {
  let chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (chemin.endsWith('/')) chemin += 'index.html';
  const fichier = path.join(racine, path.normalize(chemin));
  if (!fichier.startsWith(racine)) { res.writeHead(403); res.end(); return; }
  fs.readFile(fichier, (err, data) => {
    if (err) { res.writeHead(404); res.end('Introuvable'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(port, () => console.log(`Aide formateur : http://localhost:${port}/`));
