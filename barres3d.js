'use strict';

/*
 * Barres 3D sur un plan : une barre par (critère × grille), hauteur = note.
 * Dessin sur <canvas> en projection simple (rotation autour de la verticale + inclinaison),
 * faces triées de l'arrière vers l'avant. Glisser pour tourner ; survol ou toucher = info-bulle.
 */

/* exported Barres3D */
class Barres3D {
  /**
   * @param {HTMLElement} conteneur  élément qui reçoit le canvas et l'info-bulle
   * @param {object} donnees  { colonnes: [libellé court], lignes: [libellé], valeurs: [[note|null]] (lignes × colonnes),
   *                            max, couleur(note) → hex, infobulle(ligne, colonne) → texte }
   */
  constructor(conteneur, donnees) {
    this.d = donnees;
    this.angle = -35 * Math.PI / 180;    // rotation autour de la verticale
    this.inclinaison = 50 * Math.PI / 180; // 90° = vue de dessus
    this.conteneur = conteneur;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'barres3d-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Barres 3D des notes par critère et par grille');
    this.bulle = document.createElement('div');
    this.bulle.className = 'barres3d-bulle';
    this.bulle.hidden = true;
    conteneur.append(this.canvas, this.bulle);
    this.survol = null;
    this.brancher();
    this.observateur = new ResizeObserver(() => this.dessiner());
    this.observateur.observe(conteneur);
  }

  reinitialiser() {
    this.angle = -35 * Math.PI / 180;
    this.inclinaison = 50 * Math.PI / 180;
    this.dessiner();
  }

  // --- Géométrie ---

  /** Projette un point du monde (x = colonne, y = ligne, z = hauteur en unités de note). */
  projeter(x, y, z) {
    const { cx, cy, k, hz } = this.cadre;
    const xr = x * Math.cos(this.angle) - y * Math.sin(this.angle);
    const yr = x * Math.sin(this.angle) + y * Math.cos(this.angle);
    return [cx + xr * k, cy + yr * k * Math.sin(this.inclinaison) - z * hz * k * Math.cos(this.inclinaison), yr];
  }

  /** Échelle et centrage pour que tout le plan et les barres les plus hautes tiennent dans le canvas. */
  cadrer(largeur, hauteur) {
    const nC = this.d.colonnes.length, nL = this.d.lignes.length;
    // Hauteur d'une barre au maximum : ~ 1/3 du plus grand côté du plan.
    const hz = Math.max(nC, nL) / 3 / this.d.max;
    this.cadre = { cx: 0, cy: 0, k: 1, hz };
    const coins = [];
    for (const x of [-0.8, nC + 0.2]) for (const y of [-0.8, nL + 0.2]) for (const z of [0, this.d.max]) {
      coins.push(this.projeter(x - nC / 2, y - nL / 2, z));
    }
    const xs = coins.map(c => c[0]), ys = coins.map(c => c[1]);
    const marge = 28;
    const k = Math.min((largeur - 2 * marge) / (Math.max(...xs) - Math.min(...xs)),
                       (hauteur - 2 * marge) / (Math.max(...ys) - Math.min(...ys)));
    this.cadre = {
      k, hz,
      cx: largeur / 2 - k * (Math.max(...xs) + Math.min(...xs)) / 2,
      cy: hauteur / 2 - k * (Math.max(...ys) + Math.min(...ys)) / 2,
    };
  }

  // --- Dessin ---

  dessiner() {
    const largeur = this.conteneur.clientWidth;
    if (!largeur) return;
    const hauteur = Math.round(Math.min(460, Math.max(300, largeur * 0.75)));
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = largeur * ratio;
    this.canvas.height = hauteur * ratio;
    this.canvas.style.height = hauteur + 'px';
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, largeur, hauteur);
    this.cadrer(largeur, hauteur);

    const { colonnes, lignes, valeurs } = this.d;
    const nC = colonnes.length, nL = lignes.length;
    const P = (x, y, z) => this.projeter(x - nC / 2, y - nL / 2, z);
    const styles = getComputedStyle(document.documentElement);
    const encre = styles.getPropertyValue('--texte').trim() || '#1d2430';
    const encreDouce = styles.getPropertyValue('--gris').trim() || '#6b7480';
    const bord = styles.getPropertyValue('--bord').trim() || '#d5dbe3';

    // Plan : quadrillage discret.
    ctx.lineWidth = 1;
    ctx.strokeStyle = bord;
    ctx.beginPath();
    for (let c = 0; c <= nC; c++) { ctx.moveTo(...P(c, 0, 0).slice(0, 2)); ctx.lineTo(...P(c, nL, 0).slice(0, 2)); }
    for (let l = 0; l <= nL; l++) { ctx.moveTo(...P(0, l, 0).slice(0, 2)); ctx.lineTo(...P(nC, l, 0).slice(0, 2)); }
    ctx.stroke();

    // Barres, de l'arrière vers l'avant.
    const barres = [];
    for (let l = 0; l < nL; l++) for (let c = 0; c < nC; c++) {
      barres.push({ l, c, note: valeurs[l][c], profondeur: P(c + 0.5, l + 0.5, 0)[2] });
    }
    barres.sort((a, b) => a.profondeur - b.profondeur);
    this.zones = [];
    const g = 0.14; // espace entre barres
    for (const b of barres) {
      const x0 = b.c + g, x1 = b.c + 1 - g, y0 = b.l + g, y1 = b.l + 1 - g;
      const actif = this.survol && this.survol.l === b.l && this.survol.c === b.c;
      if (b.note == null) {
        // Pas de note : simple case pointillée au sol.
        const sol = [P(x0, y0, 0), P(x1, y0, 0), P(x1, y1, 0), P(x0, y1, 0)];
        this.polygone(ctx, sol, actif ? '#eef1f5' : null, encreDouce, [3, 3]);
        this.zones.push({ l: b.l, c: b.c, polys: [sol] });
        continue;
      }
      const z = b.note;
      const base = this.d.couleur(b.note);
      // Faces latérales : on ne dessine que celles tournées vers le spectateur.
      const faces = [
        { pts: [[x0, y1], [x1, y1]], normale: [0, 1] },
        { pts: [[x1, y0], [x0, y0]], normale: [0, -1] },
        { pts: [[x1, y1], [x1, y0]], normale: [1, 0] },
        { pts: [[x0, y0], [x0, y1]], normale: [-1, 0] },
      ];
      const polys = [];
      for (const f of faces) {
        const ny = f.normale[0] * Math.sin(this.angle) + f.normale[1] * Math.cos(this.angle);
        if (ny <= 0) continue;
        const [[ax, ay], [bx, by]] = f.pts;
        const poly = [P(ax, ay, 0), P(bx, by, 0), P(bx, by, z), P(ax, ay, z)];
        const nx = f.normale[0] * Math.cos(this.angle) - f.normale[1] * Math.sin(this.angle);
        // Ombrage selon l'orientation : plus sombre quand la face est de biais.
        this.polygone(ctx, poly, assombrir(base, 0.18 + 0.14 * Math.abs(nx)), '#ffffff');
        polys.push(poly);
      }
      const dessus = [P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)];
      this.polygone(ctx, dessus, base, actif ? encre : '#ffffff', null, actif ? 2 : 1);
      polys.push(dessus);
      this.zones.push({ l: b.l, c: b.c, polys });
    }

    // Libellés des axes (texte en encre, jamais à la couleur des séries).
    ctx.fillStyle = encre;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const avant = Math.cos(this.angle) >= 0 ? nL + 0.55 : -0.55;
    const cote = Math.sin(this.angle) <= 0 ? -0.55 : nC + 0.55;
    colonnes.forEach((t, c) => { const [x, y] = P(c + 0.5, avant, 0); ctx.fillText(t, x, y); });
    ctx.fillStyle = encreDouce;
    lignes.forEach((t, l) => { const [x, y] = P(cote, l + 0.5, 0); ctx.fillText(t, x, y); });
  }

  polygone(ctx, pts, remplissage, trait, tirets = null, epaisseur = 1) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    if (remplissage) { ctx.fillStyle = remplissage; ctx.fill(); }
    if (trait) {
      ctx.setLineDash(tirets || []);
      ctx.lineWidth = epaisseur;
      ctx.strokeStyle = trait;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // --- Interaction ---

  /** Barre sous le point (la plus en avant gagne). */
  toucher(x, y) {
    for (let i = (this.zones || []).length - 1; i >= 0; i--) {
      if (this.zones[i].polys.some(p => dansPolygone(x, y, p))) return this.zones[i];
    }
    return null;
  }

  montrerBulle(x, y) {
    const zone = this.toucher(x, y);
    const avant = this.survol;
    this.survol = zone ? { l: zone.l, c: zone.c } : null;
    if (zone) {
      this.bulle.textContent = this.d.infobulle(zone.l, zone.c);
      this.bulle.hidden = false;
      const l = this.conteneur.clientWidth;
      this.bulle.style.left = Math.min(Math.max(8, x + 12), l - this.bulle.offsetWidth - 8) + 'px';
      this.bulle.style.top = Math.max(4, y - this.bulle.offsetHeight - 12) + 'px';
    } else {
      this.bulle.hidden = true;
    }
    if ((avant?.l !== this.survol?.l) || (avant?.c !== this.survol?.c)) this.dessiner();
  }

  brancher() {
    let glisse = null;
    const position = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      glisse = { x: e.clientX, y: e.clientY, angle: this.angle, inclinaison: this.inclinaison, bouge: false };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (glisse) {
        const dx = e.clientX - glisse.x, dy = e.clientY - glisse.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) glisse.bouge = true;
        if (glisse.bouge) {
          // On « attrape » le plan : il suit le curseur (glisser à gauche fait tourner l’avant vers la gauche).
          this.angle = glisse.angle - dx * 0.01;
          this.inclinaison = Math.min(85, Math.max(15, glisse.inclinaison * 180 / Math.PI + dy * 0.4)) * Math.PI / 180;
          this.bulle.hidden = true;
          this.survol = null;
          this.dessiner();
          return;
        }
      }
      if (e.pointerType === 'mouse') this.montrerBulle(...position(e));
    });
    this.canvas.addEventListener('pointerup', (e) => {
      // Un toucher sans glisser affiche l'info-bulle (mobile).
      if (glisse && !glisse.bouge) this.montrerBulle(...position(e));
      glisse = null;
    });
    this.canvas.addEventListener('pointerleave', () => {
      if (glisse) return;
      this.bulle.hidden = true;
      if (this.survol) { this.survol = null; this.dessiner(); }
    });
  }
}

function dansPolygone(x, y, pts) {
  let dedans = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

/** Assombrit une couleur #rrggbb d'une fraction t (0 → inchangée, 1 → noir). */
function assombrir(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v * (1 - t));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}
