'use strict';

/*
 * Aide formateur — comptage des questionnaires de satisfaction.
 *
 * Toutes les données restent sur l'appareil (localStorage), sous la forme :
 *   { version: 1, modeles: [Modele], evaluations: [Evaluation] }
 *   Modele = { id, nom, criteres: [libellé] }   — bibliothèque des formations et de leurs critères
 *   Evaluation = { id, formation (nom du modèle choisi, ou ''), titre, date, formateur,
 *                  nbAttendu (grilles à saisir, ou null), echelle, seuil,
 *                  criteres: [{ id, libelle }],
 *                  reponses: [{ id, lettre, saisie, notes: { [idCritere]: n | null } }] }
 * Chaque grille porte une lettre (A, B, … Z, AA, AB…), rangées dans cet ordre.
 * Une note null signifie « pas de note » (tiret sur la grille) : elle n'entre pas dans les moyennes.
 */

const CLE_STOCKAGE = 'aide-formateur.v1';
const ECHELLES = [4, 5, 10];
const SEUIL_PAR_DEFAUT = { 4: 3, 5: 4, 10: 7 };
// Formation proposée dans la bibliothèque au premier lancement.
const MODELE_INITIAL_NOM = 'PAAP';
const MODELE_INITIAL_CRITERES = [
  'Les informations pratiques données avant la formation ont été suffisantes',
  'La présentation et l\'objectif de la journée ont été clairs',
  'La journée m\'a permis de connaître le projet Restos',
  'La formation m\'a permis de connaître les dispositifs d\'aide à la personne mis en place aux Restos',
  'La formation m\'a permis de comprendre ce qu\'est un bon accueil aux Restos',
  'La formation me permettra de pratiquer une écoute au service des personnes accueillies',
  'La formation m\'a permis de comprendre la diversité des personnes accueillies et de leurs besoins',
  'La formation m\'a permis de me sentir capable d\'aider à l\'expression des besoins des personnes accueillies afin de les orienter vers les bons interlocuteurs, activités Restos ou autres structures',
  'La formation m\'a permis de comprendre l\'importance de l\'équipe aux Restos',
  'En fin de journée, la formation a répondu à mes attentes',
];

// ---------- Stockage ----------

function charger() {
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE);
    if (brut) {
      const donnees = JSON.parse(brut);
      if (Array.isArray(donnees.evaluations)) {
        donnees.evaluations.forEach(normaliser);
        if (!Array.isArray(donnees.modeles)) donnees.modeles = modelesInitiaux();
        return donnees;
      }
    }
  } catch (e) {
    console.error('Lecture des données impossible', e);
  }
  return { version: 1, modeles: modelesInitiaux(), evaluations: [] };
}

function modelesInitiaux() {
  return [{ id: nouvelId(), nom: MODELE_INITIAL_NOM, criteres: [...MODELE_INITIAL_CRITERES] }];
}

function modelesTries() {
  return [...db.modeles].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

let db = charger();

/** Complète les données d'avant les lettres : A, B, C… dans l'ordre de saisie. */
function normaliser(ev) {
  ev.reponses.forEach((r, i) => { if (!r.lettre) r.lettre = lettreGrille(i); });
  ev.reponses.sort((a, b) => rangLettre(a.lettre) - rangLettre(b.lettre));
  return ev;
}

/** 0 → A, 25 → Z, 26 → AA, 27 → AB… */
function lettreGrille(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}

function rangLettre(lettre) {
  return [...lettre].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
}

/** Première lettre libre : après un retrait, la grille retirée est la suivante à ressaisir. */
function prochaineLettre(ev) {
  const prises = new Set(ev.reponses.map(r => r.lettre));
  let i = 0;
  while (prises.has(lettreGrille(i))) i++;
  return lettreGrille(i);
}

function enregistrer() {
  localStorage.setItem(CLE_STOCKAGE, JSON.stringify(db));
}

function nouvelId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function trouverEvaluation(id) {
  return db.evaluations.find(e => e.id === id);
}

// ---------- Calculs ----------

/** Statistiques d'une évaluation, par critère et au global. */
function statistiques(ev) {
  const parCritere = ev.criteres.map(c => {
    const repartition = new Array(ev.echelle + 1).fill(0); // indice = note
    let somme = 0, n = 0, satisfaits = 0;
    for (const r of ev.reponses) {
      const note = r.notes[c.id];
      if (note == null) continue;
      repartition[note]++;
      somme += note;
      n++;
      if (note >= ev.seuil) satisfaits++;
    }
    return {
      critere: c,
      n,
      moyenne: n ? somme / n : null,
      tauxSatisfaction: n ? satisfaits / n : null,
      repartition,
    };
  });

  let somme = 0, n = 0, satisfaits = 0;
  for (const s of parCritere) {
    for (let note = 1; note <= ev.echelle; note++) {
      const k = s.repartition[note];
      somme += k * note;
      n += k;
      if (note >= ev.seuil) satisfaits += k;
    }
  }
  return {
    nbQuestionnaires: ev.reponses.length,
    parCritere,
    moyenne: n ? somme / n : null,
    tauxSatisfaction: n ? satisfaits / n : null,
  };
}

/** Les notes de l'échelle, de la plus haute à la plus basse, comme sur les questionnaires papier. */
function notesDecroissantes(echelle) {
  return Array.from({ length: echelle }, (_, i) => echelle - i);
}

// ---------- Grille saisie au clavier ----------
//
// Un caractère par critère, dans l'ordre des critères :
//   chiffre = note (0 vaut 10 sur l'échelle 1 à 10) ;  - . # = pas de note ;
//   *X = X pour tous les critères restants (« *5 » : tout à 5, « 43*5 » : 4, 3 puis 5 partout) ;
//   les espaces sont ignorés (« 55455 43455 »).

function caractereNote(note) {
  return note == null ? '-' : note === 10 ? '0' : String(note);
}

/** Code compact d'une réponse, dans la même syntaxe que la saisie. */
function codeGrille(notes, ev) {
  return ev.criteres.map(c => caractereNote(notes[c.id])).join('');
}

/** Lit une grille ; renvoie { valeurs: [note | null, ...], erreur } (valeurs dans l'ordre des critères). */
function lireGrille(code, ev) {
  const s = code.replace(/\s+/g, '');
  const nb = ev.criteres.length;
  const valeurs = [];
  const lireNote = (c) => {
    if ('-.#'.includes(c)) return null;
    const n = c === '0' && ev.echelle === 10 ? 10 : Number(c);
    if (!/^\d$/.test(c) || n < 1 || n > ev.echelle) {
      throw new Error(`« ${c} » n'est pas une note valide (1 à ${ev.echelle}, ou - pour pas de note)`);
    }
    return n;
  };
  try {
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '*') {
        if (i + 1 === s.length) break; // « * » en cours de frappe
        if (i + 2 < s.length) throw new Error('Rien ne doit suivre « *X »');
        const n = lireNote(s[i + 1]);
        while (valeurs.length < nb) valeurs.push(n);
        break;
      }
      if (valeurs.length === nb) throw new Error(`Trop de notes : ${nb} critères seulement`);
      valeurs.push(lireNote(s[i]));
    }
    return { valeurs, erreur: null };
  } catch (e) {
    return { valeurs, erreur: e.message };
  }
}

// ---------- Mise en forme ----------

function esc(texte) {
  return String(texte ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function fmtNombre(x, decimales = 2) {
  return x == null ? '—' : x.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

function fmtPourcent(x) {
  return x == null ? '—' : Math.round(x * 100) + ' %';
}

function fmtDate(iso) {
  if (!iso) return '';
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

/*
 * Couleurs des notes : palette divergente rouge (notes basses) → gris neutre → bleu (notes hautes),
 * vérifiée pour le daltonisme. On projette l'échelle (1–4, 1–5, 1–10) sur ces 5 teintes.
 */
const COULEURS_NOTES = ['#b42d2d', '#e66767', '#c9c8c2', '#5598e7', '#1c5cab'];

function indiceCouleur(note, echelle) {
  return Math.round((note - 1) * 4 / (echelle - 1));
}

function couleurNote(note, echelle) {
  return COULEURS_NOTES[indiceCouleur(note, echelle)];
}

/** Texte lisible sur la couleur d'une note (foncé sur le gris neutre, blanc ailleurs). */
function encreSurNote(note, echelle) {
  return indiceCouleur(note, echelle) === 2 ? 'var(--texte)' : '#fff';
}

function aujourdhui() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

let minuteurToast;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => { el.hidden = true; }, 2200);
}

/**
 * Demande de confirmation dans l'appli plutôt que par la boîte native du navigateur :
 * certains navigateurs intégrés ne l'affichent pas et répondent « Annuler » d'office.
 */
function confirmer(message, { ok = 'Confirmer', danger = false } = {}) {
  return new Promise(resolve => {
    const d = document.createElement('dialog');
    d.className = 'dialogue';
    d.innerHTML = `<p>${esc(message)}</p>
      <div class="ligne">
        <span class="espace"></span>
        <button type="button" class="btn" value="non">Annuler</button>
        <button type="button" class="btn ${danger ? 'danger' : 'principal'}" value="oui">${esc(ok)}</button>
      </div>`;
    d.addEventListener('click', (e) => {
      const bouton = e.target.closest('button');
      if (bouton) d.close(bouton.value);
    });
    d.addEventListener('close', () => {
      d.remove();
      resolve(d.returnValue === 'oui');
    });
    document.body.appendChild(d);
    d.showModal();
    // Entrée valide directement, sauf pour les actions destructrices.
    d.querySelector(danger ? '[value=non]' : '[value=oui]').focus();
  });
}

function telecharger(nomFichier, contenu, type) {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function nomFichier(ev, suffixe, extension) {
  const base = `${ev.date || ''}_${ev.titre}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return `${base || 'evaluation'}_${suffixe}.${extension}`;
}

// ---------- Exports ----------

function csvCellule(v) {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(lignes) {
  // Point-virgule et BOM : ouverture directe dans Excel/LibreOffice en français.
  return '\uFEFF' + lignes.map(l => l.map(csvCellule).join(';')).join('\r\n') + '\r\n';
}

function exporterReponsesCsv(ev) {
  const lignes = [['Grille', 'Saisie le', ...ev.criteres.map(c => c.libelle)]];
  ev.reponses.forEach(r => {
    lignes.push([
      r.lettre,
      new Date(r.saisie).toLocaleString('fr-FR'),
      ...ev.criteres.map(c => r.notes[c.id] ?? ''),
    ]);
  });
  telecharger(nomFichier(ev, 'reponses', 'csv'), csv(lignes), 'text/csv;charset=utf-8');
}

function exporterBilanCsv(ev) {
  const st = statistiques(ev);
  const notes = notesDecroissantes(ev.echelle);
  const lignes = [
    ['Formation', ev.titre],
    ['Date', fmtDate(ev.date)],
    ['Formateurs', ev.formateur || ''],
    ['Grilles saisies', st.nbQuestionnaires],
    ['Grilles à saisir', ev.nbAttendu || ''],
    ['Échelle', `1 à ${ev.echelle}`],
    ['Satisfait à partir de', ev.seuil],
    [],
    ['Critère', 'Réponses', 'Moyenne', 'Taux de satisfaction', ...notes.map(n => `Nb de ${n}`)],
    ...st.parCritere.map(s => [
      s.critere.libelle, s.n, fmtNombre(s.moyenne), fmtPourcent(s.tauxSatisfaction),
      ...notes.map(n => s.repartition[n]),
    ]),
    ['Ensemble', '', fmtNombre(st.moyenne), fmtPourcent(st.tauxSatisfaction)],
  ];
  telecharger(nomFichier(ev, 'bilan', 'csv'), csv(lignes), 'text/csv;charset=utf-8');
}

function bilanTexte(ev) {
  const st = statistiques(ev);
  const lignes = [
    `Bilan de satisfaction — ${ev.titre}`,
    [fmtDate(ev.date), ev.formateur].filter(Boolean).join(' — '),
    `${st.nbQuestionnaires}${ev.nbAttendu ? ` / ${ev.nbAttendu}` : ''} questionnaire(s), échelle 1 à ${ev.echelle}, satisfait à partir de ${ev.seuil}`,
    '',
    ...st.parCritere.map(s =>
      `• ${s.critere.libelle} : ${fmtNombre(s.moyenne)} / ${ev.echelle} (${fmtPourcent(s.tauxSatisfaction)} satisfaits, ${s.n} rép.)`),
    '',
    `Ensemble : ${fmtNombre(st.moyenne)} / ${ev.echelle} — ${fmtPourcent(st.tauxSatisfaction)} de satisfaction`,
  ];
  return lignes.join('\n');
}

// ---------- Vues ----------

const app = document.getElementById('app');

/** Bandeau d'avancement de la saisie, si le nombre de grilles à saisir est connu. */
function avancement(ev) {
  const attendu = ev.nbAttendu;
  if (!attendu) return '';
  const faits = ev.reponses.length;
  const etat = faits < attendu ? '' : faits === attendu ? 'termine' : 'depasse';
  const texte = faits < attendu
    ? `${faits} / ${attendu} grilles saisies — reste ${attendu - faits}`
    : faits === attendu
      ? `Les ${attendu} grilles sont saisies ✓`
      : `${faits} grilles saisies pour ${attendu} prévues (${faits - attendu} de trop ?)`;
  return `<div class="avancement ${etat}">
    <div class="jauge"><span style="width:${Math.min(100, 100 * faits / attendu)}%"></span></div>
    <div>${texte}</div>
  </div>`;
}

function onglets(ev, actif) {
  const o = (cle, libelle) =>
    `<a href="#/eval/${ev.id}/${cle}" class="${cle === actif ? 'actif' : ''}">${libelle}</a>`;
  return `<nav class="onglets">${o('saisie', 'Saisie')}${o('comptage', 'Comptage')}${o('bilan', 'Bilan')}${o('reglages', 'Réglages')}</nav>`;
}

function vueAccueil() {
  const evs = [...db.evaluations].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  app.innerHTML = `
    <h1>Mes évaluations</h1>
    ${evs.length ? evs.map(ev => {
      const st = statistiques(ev);
      return `<a class="carte" href="#/eval/${ev.id}/saisie">
        <div><strong>${esc(ev.titre)}</strong></div>
        <div class="meta">${ev.formation ? `<span class="etiquette">${esc(ev.formation)}</span> ` : ''}${esc(fmtDate(ev.date))}${ev.formateur ? ' — ' + esc(ev.formateur) : ''}</div>
        <div class="meta">${st.nbQuestionnaires}${ev.nbAttendu ? ` / ${ev.nbAttendu}` : ''} grille(s) · moyenne ${fmtNombre(st.moyenne)} / ${ev.echelle} · ${fmtPourcent(st.tauxSatisfaction)} satisfaits</div>
      </a>`;
    }).join('') : '<p class="vide">Aucune évaluation pour l\'instant.<br>Créez-en une pour commencer la saisie.</p>'}
    <a class="btn principal flottant" href="#/nouvelle">+ Nouvelle évaluation</a>
  `;
}

/** Formulaire commun à la création et aux réglages. */
function formulaireEvaluation(ev, estNouvelle) {
  const verrouEchelle = ev.reponses.length > 0;
  return `
    <form id="form-eval" class="carte">
      ${estNouvelle ? ''
        : `<p style="margin:0"><strong>Formation :</strong> ${ev.formation ? esc(ev.formation) : '<span class="aide">non précisée</span>'}</p>`}

      <label for="f-titre">Intitulé de la session</label>
      <input type="text" id="f-titre" required value="${esc(ev.titre)}" placeholder="ex. PAAP — Lyon, groupe du matin">

      <label for="f-date">Date</label>
      <input type="date" id="f-date" value="${esc(ev.date)}">

      <label for="f-formateur">Formateurs <span class="aide">(facultatif)</span></label>
      <input type="text" id="f-formateur" value="${esc(ev.formateur)}">

      <label for="f-attendu">Nombre de grilles à saisir <span class="aide">(facultatif : nombre de questionnaires papier reçus)</span></label>
      <input type="number" id="f-attendu" min="1" step="1" inputmode="numeric" value="${ev.nbAttendu || ''}">

      <div class="ligne">
        <div class="espace">
          <label for="f-echelle">Échelle des notes</label>
          <select id="f-echelle" ${verrouEchelle ? 'disabled' : ''}>
            ${ECHELLES.map(e => `<option value="${e}" ${e === ev.echelle ? 'selected' : ''}>1 à ${e}</option>`).join('')}
          </select>
        </div>
        <div class="espace">
          <label for="f-seuil">Satisfait à partir de</label>
          <select id="f-seuil"></select>
        </div>
      </div>
      ${verrouEchelle ? '<p class="aide">L\'échelle ne peut plus changer : des questionnaires sont déjà saisis.</p>' : ''}

      ${estNouvelle ? `
        <div class="ligne" style="margin-top:14px">
          <label for="f-modele" style="margin:0">Critères de la formation</label>
          <span class="espace"></span>
          <select id="f-modele" required class="choix-modele">
            <option value="">— Choisir —</option>
            ${modelesTries().map(m => `<option value="${m.id}">${esc(m.nom)}</option>`).join('')}
            <option value="libre">Autre (saisie libre)</option>
          </select>
        </div>
        <textarea id="f-criteres" style="margin-top:6px">${esc(ev.criteres.map(c => c.libelle).join('\n'))}</textarea>
        <p class="aide">Un critère par ligne, modifiables pour cette session.
          Les listes se gèrent dans la <a href="#/bibliotheque">bibliothèque des formations</a>.</p>`
      : `
        <label for="f-criteres">Critères évalués <span class="aide">(un par ligne)</span></label>
        <textarea id="f-criteres">${esc(ev.criteres.map(c => c.libelle).join('\n'))}</textarea>`}
      ${verrouEchelle ? '<p class="aide">Supprimer un critère efface aussi ses notes déjà saisies.</p>' : ''}

      <div class="ligne" style="margin-top:16px">
        <button type="submit" class="btn principal">${estNouvelle ? 'Créer et commencer la saisie' : 'Enregistrer'}</button>
        <a class="btn" href="${estNouvelle ? '#/' : `#/eval/${ev.id}/saisie`}">Annuler</a>
      </div>
    </form>
  `;
}

function brancherFormulaire(ev, estNouvelle) {
  const echelle = document.getElementById('f-echelle');
  const choixModele = document.getElementById('f-modele');
  if (choixModele) {
    const titre = document.getElementById('f-titre');
    let titreAuto = '';
    const appliquerModele = () => {
      const m = db.modeles.find(x => x.id === choixModele.value);
      if (!m) return;
      document.getElementById('f-criteres').value = m.criteres.join('\n');
      // L'intitulé suit la formation tant qu'on ne l'a pas personnalisé.
      if (!titre.value.trim() || titre.value === titreAuto) titre.value = titreAuto = m.nom;
    };
    choixModele.addEventListener('change', appliquerModele);
    // Par défaut : la formation de la dernière évaluation, sinon la seule de la bibliothèque.
    const derniere = db.evaluations[db.evaluations.length - 1];
    const parDefaut = db.modeles.find(m => m.nom === derniere?.formation) || (db.modeles.length === 1 ? db.modeles[0] : null);
    if (parDefaut) {
      choixModele.value = parDefaut.id;
      appliquerModele();
    }
  }
  const seuil = document.getElementById('f-seuil');
  const remplirSeuils = (valeur) => {
    const max = Number(echelle.value);
    seuil.innerHTML = Array.from({ length: max }, (_, i) => i + 1)
      .map(n => `<option value="${n}" ${n === valeur ? 'selected' : ''}>${n}</option>`).join('');
  };
  remplirSeuils(ev.seuil);
  echelle.addEventListener('change', () => remplirSeuils(SEUIL_PAR_DEFAUT[echelle.value]));

  document.getElementById('form-eval').addEventListener('submit', async (e) => {
    e.preventDefault();
    const libelles = document.getElementById('f-criteres').value
      .split('\n').map(s => s.trim()).filter(Boolean);
    if (!libelles.length) {
      toast('Indiquez au moins un critère.');
      return;
    }
    const supprimes = ev.criteres.filter(c => !libelles.includes(c.libelle));
    if (!estNouvelle && supprimes.length && ev.reponses.length &&
        !await confirmer(`Supprimer ${supprimes.length} critère(s) et les notes déjà saisies pour ${supprimes.length > 1 ? 'eux' : 'lui'} ?`, { ok: 'Supprimer', danger: true })) {
      return;
    }

    // On garde l'identifiant des critères conservés, pour ne pas perdre leurs notes.
    const parLibelle = new Map(ev.criteres.map(c => [c.libelle, c]));
    ev.criteres = libelles.map(l => parLibelle.get(l) || { id: nouvelId(), libelle: l });
    const ids = new Set(ev.criteres.map(c => c.id));
    for (const r of ev.reponses) {
      for (const id of Object.keys(r.notes)) if (!ids.has(id)) delete r.notes[id];
    }

    if (estNouvelle) ev.formation = db.modeles.find(m => m.id === choixModele.value)?.nom || '';
    ev.titre = document.getElementById('f-titre').value.trim();
    ev.date = document.getElementById('f-date').value;
    ev.formateur = document.getElementById('f-formateur').value.trim();
    ev.nbAttendu = Math.max(0, Math.floor(Number(document.getElementById('f-attendu').value))) || null;
    if (!ev.reponses.length) ev.echelle = Number(echelle.value);
    ev.seuil = Number(seuil.value);

    if (estNouvelle) db.evaluations.push(ev);
    enregistrer();
    toast(estNouvelle ? 'Évaluation créée' : 'Réglages enregistrés');
    location.hash = `#/eval/${ev.id}/saisie`;
  });
}

function vueNouvelle() {
  const ev = {
    id: nouvelId(),
    formation: '',
    titre: '',
    date: aujourdhui(),
    formateur: '',
    echelle: 5,
    seuil: SEUIL_PAR_DEFAUT[5],
    nbAttendu: null,
    criteres: [],
    reponses: [],
  };
  // Critères : ceux de la formation choisie. Échelle, seuil et formateur : repris de la dernière évaluation.
  const derniere = db.evaluations[db.evaluations.length - 1];
  if (derniere) {
    ev.echelle = derniere.echelle;
    ev.seuil = derniere.seuil;
    ev.formateur = derniere.formateur;
  }
  app.innerHTML = `<h1>Nouvelle évaluation</h1>${formulaireEvaluation(ev, true)}`;
  brancherFormulaire(ev, true);
  document.getElementById('f-titre').focus();
}

function vueReglages(ev) {
  app.innerHTML = `
    <h1>${esc(ev.titre)}</h1>
    ${onglets(ev, 'reglages')}
    ${formulaireEvaluation(ev, false)}
    <h2>Zone sensible</h2>
    <div class="carte">
      <button class="btn danger" id="supprimer">Supprimer cette évaluation</button>
    </div>
  `;
  brancherFormulaire(ev, false);
  document.getElementById('supprimer').addEventListener('click', async () => {
    if (!await confirmer(`Supprimer « ${ev.titre} » et ses ${ev.reponses.length} grille(s) ? Cette action est définitive.`, { ok: 'Supprimer', danger: true })) return;
    db.evaluations = db.evaluations.filter(e => e.id !== ev.id);
    enregistrer();
    toast('Évaluation supprimée');
    location.hash = '#/';
  });
}

// Ligne sélectionnée dans la zone de saisie, par évaluation (conservée d'un affichage à l'autre).
const selectionSaisie = {};

/**
 * Écran de saisie : en haut, une ligne par grille (A, B, C…) modifiable sur place ;
 * en dessous, le détail des notes de la ligne sélectionnée, modifiable aux boutons.
 * Rien n'est enregistré avant validation (Entrée ou bouton).
 */
function vueSaisie(ev, { focus = false } = {}) {
  const parLettre = new Map(ev.reponses.map(r => [r.lettre, r]));
  const lettres = new Set(parLettre.keys());
  for (let i = 0; i < (ev.nbAttendu || 0); i++) lettres.add(lettreGrille(i));
  lettres.add(prochaineLettre(ev));
  const lignes = [...lettres].sort((a, b) => rangLettre(a) - rangLettre(b));

  if (!lignes.includes(selectionSaisie[ev.id])) selectionSaisie[ev.id] = prochaineLettre(ev);
  let selection = selectionSaisie[ev.id];

  // Brouillon de chaque ligne : notes en cours d'édition et erreur de lecture éventuelle.
  const brouillons = {};
  const brouillon = (l) => brouillons[l] ??= { notes: { ...(parLettre.get(l)?.notes || {}) }, erreur: null };

  /** Code d'un brouillon ; les critères pas encore saisis en fin de grille sont omis. */
  const codeBrouillon = (notes) => {
    let dernier = -1;
    ev.criteres.forEach((c, i) => { if (c.id in notes) dernier = i; });
    return ev.criteres.slice(0, dernier + 1).map(c => caractereNote(notes[c.id])).join('');
  };

  const aideSyntaxe = `${ev.criteres.length} notes à la suite, ex. ${
    esc(codeGrille(Object.fromEntries(ev.criteres.map((c, i) => [c.id, ev.echelle - (i % 2)])), ev))
  } ; *${caractereNote(ev.echelle)} = tout à ${ev.echelle} ; - = pas de note${ev.echelle === 10 ? ' ; 0 = 10' : ''} ; Entrée pour valider`;

  app.innerHTML = `
    <h1>${esc(ev.titre)}</h1>
    ${onglets(ev, 'saisie')}
    ${avancement(ev)}

    <h2>Saisie (${ev.reponses.length}${ev.nbAttendu ? ` / ${ev.nbAttendu}` : ''})</h2>
    <p class="aide">${aideSyntaxe}</p>
    <div class="carte liste-grilles" id="liste-grilles">
      ${lignes.map(l => {
        const r = parLettre.get(l);
        return `<div class="ligne-grille ${r ? '' : 'vide'}" data-lettre="${l}">
          <span class="lettre">${l}</span>
          <input type="text" class="grille" data-lettre="${l}" value="${r ? esc(codeGrille(r.notes, ev)) : ''}"
                 placeholder="${r ? '' : 'à saisir'}" inputmode="tel" autocomplete="off" autocapitalize="off"
                 spellcheck="false" enterkeyhint="done" aria-label="Grille ${l}">
          ${r ? `<button type="button" class="btn petit danger" data-retirer="${l}" title="Retirer la grille ${l}">Retirer</button>`
              : '<span class="place-bouton"></span>'}
        </div>`;
      }).join('')}
    </div>

    <div class="carte" id="detail">
      <div class="ligne">
        <strong id="titre-detail"></strong>
        <span class="espace"></span>
        <span class="compteur" id="compteur"></span>
      </div>
      <div class="aide" id="grille-message">&nbsp;</div>
      ${ev.criteres.map(c => `
        <div class="critere" data-critere="${c.id}">
          <div class="libelle">${esc(c.libelle)}</div>
          <div class="notes">
            ${notesDecroissantes(ev.echelle)
              .map(n => `<button type="button" data-note="${n}">${n}</button>`).join('')}
            <button type="button" class="sans" data-note="" title="Pas de note">Sans</button>
          </div>
        </div>`).join('')}
      <div class="ligne" style="margin-top:14px">
        <button class="btn principal espace" id="valider"></button>
        <button class="btn" id="annuler" title="Revenir à la version enregistrée">Annuler</button>
      </div>
    </div>
  `;

  const champ = (l) => app.querySelector(`input.grille[data-lettre="${l}"]`);
  const ligne = (l) => app.querySelector(`.ligne-grille[data-lettre="${l}"]`);
  const messageGrille = document.getElementById('grille-message');
  const liste = document.getElementById('liste-grilles');

  /** Fait défiler la liste (et elle seule) pour rendre la ligne visible. */
  const montrer = (l) => {
    const d = ligne(l);
    if (d.offsetTop < liste.scrollTop) liste.scrollTop = d.offsetTop - 6;
    else if (d.offsetTop + d.offsetHeight > liste.scrollTop + liste.clientHeight) {
      liste.scrollTop = d.offsetTop + d.offsetHeight - liste.clientHeight + 6;
    }
  };

  /** Met à jour le détail (boutons, compteur, message) et l'état des lignes. */
  const majAffichage = () => {
    const { notes, erreur } = brouillon(selection);
    const enregistree = parLettre.get(selection);
    app.querySelectorAll('.ligne-grille').forEach(div => {
      const l = div.dataset.lettre;
      div.classList.toggle('selection', l === selection);
      const r = parLettre.get(l);
      const b = brouillons[l];
      div.classList.toggle('modifiee', !!b && (r ? codeBrouillon(b.notes) !== codeGrille(r.notes, ev) : Object.keys(b.notes).length > 0));
      div.classList.toggle('erreur', !!b?.erreur);
    });
    document.getElementById('titre-detail').textContent =
      `Grille ${selection}${enregistree ? '' : ' — nouvelle'}`;
    document.getElementById('valider').textContent =
      enregistree ? `Enregistrer la grille ${selection}` : `Valider la grille ${selection}`;
    app.querySelectorAll('.critere').forEach(bloc => {
      const id = bloc.dataset.critere;
      bloc.querySelectorAll('button[data-note]').forEach(b => {
        const valeur = b.dataset.note === '' ? null : Number(b.dataset.note);
        const choisi = id in notes && notes[id] === valeur;
        b.classList.toggle('choisi', choisi);
        b.style.background = choisi && valeur != null ? couleurNote(valeur, ev.echelle) : '';
        b.style.color = choisi && valeur != null ? encreSurNote(valeur, ev.echelle) : '';
      });
    });
    const nbNotes = Object.keys(notes).length;
    document.getElementById('compteur').textContent = `${nbNotes} / ${ev.criteres.length} critères`;
    messageGrille.textContent = erreur || ' ';
    messageGrille.classList.toggle('erreur', !!erreur);
  };

  const selectionner = (l) => {
    if (l === selection) return;
    selection = selectionSaisie[ev.id] = l;
    majAffichage();
    montrer(l);
  };

  /** Ligne à proposer après la validation de `l` : la première grille vide qui suit, sinon la prochaine lettre. */
  const ligneSuivante = (l) => {
    const prises = new Set(ev.reponses.map(r => r.lettre));
    const vide = lignes.find(x => rangLettre(x) > rangLettre(l) && !prises.has(x));
    return vide || prochaineLettre(ev);
  };

  const valider = async (l) => {
    const { notes, erreur } = brouillon(l);
    const r = parLettre.get(l);
    if (erreur) {
      toast(erreur);
      champ(l).focus();
      return;
    }
    const manquants = ev.criteres.filter(c => !(c.id in notes)).length;
    if (manquants === ev.criteres.length) {
      toast(r ? 'Grille vide : utilisez « Retirer » pour la supprimer.' : 'La grille est vide.');
      return;
    }
    if (!r && ev.nbAttendu && ev.reponses.length >= ev.nbAttendu &&
        !await confirmer(`Les ${ev.nbAttendu} grilles prévues sont déjà saisies. Enregistrer quand même la grille ${l} ?`, { ok: 'Enregistrer' })) return;
    if (manquants && !await confirmer(`Grille ${l} : ${manquants} critère(s) non saisi(s), les compter comme « pas de note » ?`, { ok: 'Oui, sans note' })) return;
    const complet = {};
    for (const c of ev.criteres) complet[c.id] = notes[c.id] ?? null;
    if (r) {
      r.notes = complet;
      r.modification = new Date().toISOString();
    } else {
      ev.reponses.push({ id: nouvelId(), lettre: l, saisie: new Date().toISOString(), notes: complet });
      normaliser(ev);
    }
    enregistrer();
    toast(r ? `Grille ${l} modifiée`
      : ev.nbAttendu && ev.reponses.length === ev.nbAttendu ? `Les ${ev.nbAttendu} grilles sont saisies`
      : `Grille ${l} enregistrée`);
    // On enchaîne sur la grille suivante, curseur prêt.
    selectionSaisie[ev.id] = ligneSuivante(l);
    vueSaisie(ev, { focus: true });
  };

  // --- Lignes de la zone de saisie ---
  app.querySelectorAll('.ligne-grille').forEach(div => {
    const l = div.dataset.lettre;
    div.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      selectionner(l);
      if (e.target.tagName !== 'INPUT') champ(l).focus();
    });
  });
  app.querySelectorAll('input.grille').forEach(input => {
    const l = input.dataset.lettre;
    input.addEventListener('focus', () => selectionner(l));
    input.addEventListener('input', () => {
      const { valeurs, erreur } = lireGrille(input.value, ev);
      const notes = {};
      valeurs.forEach((v, i) => { notes[ev.criteres[i].id] = v; });
      brouillons[l] = { notes, erreur };
      selectionner(l);
      majAffichage();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        valider(l);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // Flèches : passer d'une ligne à l'autre.
        e.preventDefault();
        const voisine = lignes[lignes.indexOf(l) + (e.key === 'ArrowDown' ? 1 : -1)];
        if (voisine) champ(voisine).focus();
      }
    });
  });

  app.querySelectorAll('[data-retirer]').forEach(b => b.addEventListener('click', async () => {
    const l = b.dataset.retirer;
    if (!await confirmer(`Retirer la grille ${l} ? Elle redeviendra à saisir.`, { ok: 'Retirer', danger: true })) return;
    ev.reponses = ev.reponses.filter(r => r.lettre !== l);
    enregistrer();
    toast(`Grille ${l} retirée`);
    selectionSaisie[ev.id] = l;
    vueSaisie(ev);
  }));

  // --- Détail : les boutons modifient la ligne sélectionnée ---
  app.querySelectorAll('.critere').forEach(bloc => {
    const id = bloc.dataset.critere;
    bloc.addEventListener('click', (e) => {
      const bouton = e.target.closest('button[data-note]');
      if (!bouton) return;
      const b = brouillon(selection);
      b.notes[id] = bouton.dataset.note === '' ? null : Number(bouton.dataset.note);
      b.erreur = null;
      champ(selection).value = codeBrouillon(b.notes);
      majAffichage();
    });
  });

  document.getElementById('valider').addEventListener('click', () => valider(selection));
  document.getElementById('annuler').addEventListener('click', () => {
    delete brouillons[selection];
    const r = parLettre.get(selection);
    champ(selection).value = r ? codeGrille(r.notes, ev) : '';
    majAffichage();
    champ(selection).focus();
  });

  majAffichage();
  window.scrollTo(0, 0);
  montrer(selection);
  if (focus) champ(selection).focus({ preventScroll: true });
}

function vueComptage(ev) {
  const st = statistiques(ev);
  const notes = notesDecroissantes(ev.echelle);
  const sans = (s) => st.nbQuestionnaires - s.n;

  /** Grille à deux lignes : valeurs (fixes, en couleur) en haut, nombres en dessous. */
  const grille = (nombres, nbSans) => `
    <table class="grille-comptage">
      <tr class="valeurs">
        ${notes.map(n => `<th style="background:${couleurNote(n, ev.echelle)};color:${encreSurNote(n, ev.echelle)}">${n}</th>`).join('')}
        <th class="sans">Sans</th>
      </tr>
      <tr class="nombres">
        ${notes.map(n => `<td class="${nombres[n] ? '' : 'zero'}">${nombres[n]}</td>`).join('')}
        <td class="${nbSans ? '' : 'zero'}">${nbSans}</td>
      </tr>
    </table>`;

  const totaux = {};
  for (const n of notes) totaux[n] = st.parCritere.reduce((t, s) => t + s.repartition[n], 0);

  app.innerHTML = `
    <h1>${esc(ev.titre)}</h1>
    ${onglets(ev, 'comptage')}
    <p class="aide">Pour chaque critère : la note en haut, le nombre de grilles qui l'ont donnée en dessous
      (${st.nbQuestionnaires} grille(s)).</p>
    ${st.parCritere.map((s, i) => `
      <div class="carte comptage-critere">
        <div class="entete">
          <span><strong>${i + 1}.</strong> ${esc(s.critere.libelle)}</span>
          <span class="moy">${fmtNombre(s.moyenne)}</span>
        </div>
        ${grille(s.repartition, sans(s))}
      </div>`).join('')}
    <div class="carte comptage-critere total">
      <div class="entete">
        <strong>Total, tous critères</strong>
        <span class="moy">${fmtNombre(st.moyenne)}</span>
      </div>
      ${grille(totaux, st.parCritere.reduce((t, s) => t + sans(s), 0))}
    </div>
  `;
}

function vueBilan(ev) {
  const st = statistiques(ev);
  const notesEchelle = notesDecroissantes(ev.echelle);

  app.innerHTML = `
    <h1>${esc(ev.titre)}</h1>
    ${onglets(ev, 'bilan')}
    <div class="chiffres">
      <div class="chiffre"><div class="valeur">${st.nbQuestionnaires}${ev.nbAttendu ? `<small> / ${ev.nbAttendu}</small>` : ''}</div><div class="nom">grilles</div></div>
      <div class="chiffre"><div class="valeur">${fmtNombre(st.moyenne)}</div><div class="nom">moyenne / ${ev.echelle}</div></div>
      <div class="chiffre"><div class="valeur">${fmtPourcent(st.tauxSatisfaction)}</div><div class="nom">satisfaits (≥ ${ev.seuil})</div></div>
    </div>
    <div class="legende" style="margin-bottom:12px">
      ${notesEchelle.map(n => `<span><i class="pastille" style="background:${couleurNote(n, ev.echelle)}"></i>${n}</span>`).join('')}
    </div>

    ${st.parCritere.map(s => `
      <div class="carte stat-critere">
        <div class="entete">
          <strong>${esc(s.critere.libelle)}</strong>
          <span class="moy">${fmtNombre(s.moyenne)} / ${ev.echelle}</span>
        </div>
        <div class="repartition" title="Répartition des notes">
          ${s.n ? notesEchelle.filter(n => s.repartition[n]).map(n =>
            `<span style="width:${100 * s.repartition[n] / s.n}%;background:${couleurNote(n, ev.echelle)}" title="${n} : ${s.repartition[n]}"></span>`).join('') : ''}
        </div>
        <div class="meta">
          ${fmtPourcent(s.tauxSatisfaction)} satisfaits · ${s.n} réponse(s) ·
          ${notesEchelle.map(n => `${n}:${s.repartition[n]}`).join(' ')}
        </div>
      </div>`).join('')}

    <h2>Vue 3D : critères × grilles</h2>
    ${ev.reponses.length ? `
      <div class="carte">
        <div class="ligne">
          <div class="legende">
            ${notesEchelle.map(n => `<span><i class="pastille" style="background:${couleurNote(n, ev.echelle)}"></i>${n}</span>`).join('')}
            <span><i class="pastille pastille-vide"></i>Sans</span>
          </div>
          <span class="espace"></span>
          <button type="button" class="btn petit" id="vue3d-reinit">Recentrer</button>
        </div>
        <div class="barres3d" id="vue3d"></div>
        <p class="aide">Hauteur = note. Colonnes : critères 1 à ${ev.criteres.length} ; lignes : grilles ${esc(ev.reponses[0].lettre)} à ${esc(ev.reponses[ev.reponses.length - 1].lettre)}.
          Glisser pour tourner ; survoler ou toucher une barre pour le détail. Le tableau chiffré est dans l'onglet Comptage.</p>
      </div>` : '<p class="aide">Aucune grille saisie.</p>'}

    <h2>Exporter</h2>
    <div class="carte ligne">
      <button class="btn" id="copier">Copier le bilan</button>
      <button class="btn" id="csv-bilan">Bilan (CSV)</button>
      <button class="btn" id="csv-reponses">Réponses (CSV)</button>
    </div>
  `;

  document.getElementById('copier').addEventListener('click', async () => {
    const texte = bilanTexte(ev);
    try {
      await navigator.clipboard.writeText(texte);
      toast('Bilan copié');
    } catch {
      // Presse-papiers indisponible (page non sécurisée) : partage natif en repli.
      if (navigator.share) navigator.share({ title: ev.titre, text: texte }).catch(() => {});
      else prompt('Copiez le bilan :', texte);
    }
  });
  const zone3d = document.getElementById('vue3d');
  if (zone3d) {
    const vue = new Barres3D(zone3d, {
      colonnes: ev.criteres.map((c, i) => String(i + 1)),
      lignes: ev.reponses.map(r => r.lettre),
      valeurs: ev.reponses.map(r => ev.criteres.map(c => r.notes[c.id] ?? null)),
      max: ev.echelle,
      couleur: (note) => couleurNote(note, ev.echelle),
      infobulle: (l, c) => {
        const note = ev.reponses[l].notes[ev.criteres[c].id];
        return `Grille ${ev.reponses[l].lettre} · critère ${c + 1} : ${note == null ? 'sans note' : `${note} / ${ev.echelle}`}\n${ev.criteres[c].libelle}`;
      },
    });
    document.getElementById('vue3d-reinit').addEventListener('click', () => vue.reinitialiser());
  }
  document.getElementById('csv-bilan').addEventListener('click', () => exporterBilanCsv(ev));
  document.getElementById('csv-reponses').addEventListener('click', () => exporterReponsesCsv(ev));
}

// ---------- Bibliothèque des formations ----------

function vueBibliotheque() {
  const modeles = modelesTries();
  const usages = (m) => db.evaluations.filter(ev => ev.formation === m.nom).length;
  app.innerHTML = `
    <h1>Bibliothèque des formations</h1>
    <p class="aide">Chaque formation a sa liste de critères. Elle est proposée à la création d'une évaluation ;
      la modifier ici ne change pas les évaluations déjà créées.</p>
    ${modeles.length ? modeles.map(m => `
      <a class="carte" href="#/bibliotheque/${m.id}">
        <div><strong>${esc(m.nom)}</strong></div>
        <div class="meta">${m.criteres.length} critère(s) · ${usages(m)} évaluation(s)</div>
      </a>`).join('') : '<p class="vide">La bibliothèque est vide.</p>'}
    <a class="btn principal flottant" href="#/bibliotheque/nouvelle">+ Nouvelle formation</a>
  `;
}

function vueModele(id) {
  const existant = db.modeles.find(m => m.id === id);
  const m = existant || { id: nouvelId(), nom: '', criteres: [] };
  app.innerHTML = `
    <h1>${existant ? esc(m.nom) : 'Nouvelle formation'}</h1>
    <form id="form-modele" class="carte">
      <label for="m-nom">Nom de la formation</label>
      <input type="text" id="m-nom" required value="${esc(m.nom)}" placeholder="ex. PAAP">
      <label for="m-criteres">Critères <span class="aide">(un par ligne, dans l'ordre du questionnaire papier)</span></label>
      <textarea id="m-criteres">${esc(m.criteres.join('\n'))}</textarea>
      <div class="ligne" style="margin-top:16px">
        <button type="submit" class="btn principal">Enregistrer</button>
        <a class="btn" href="#/bibliotheque">Annuler</a>
        <span class="espace"></span>
        ${existant ? '<button type="button" class="btn danger" id="supprimer-modele">Supprimer</button>' : ''}
      </div>
    </form>
  `;
  document.getElementById('form-modele').addEventListener('submit', (e) => {
    e.preventDefault();
    const nom = document.getElementById('m-nom').value.trim();
    const criteres = document.getElementById('m-criteres').value.split('\n').map(x => x.trim()).filter(Boolean);
    if (!criteres.length) {
      toast('Indiquez au moins un critère.');
      return;
    }
    if (db.modeles.some(x => x.id !== m.id && x.nom.toLowerCase() === nom.toLowerCase())) {
      toast(`La formation « ${nom} » existe déjà.`);
      return;
    }
    // Les évaluations désignent leur formation par son nom : on suit un renommage.
    if (existant && existant.nom !== nom) {
      db.evaluations.forEach(ev => { if (ev.formation === existant.nom) ev.formation = nom; });
    }
    m.nom = nom;
    m.criteres = criteres;
    if (!existant) db.modeles.push(m);
    enregistrer();
    toast(`Formation « ${nom} » enregistrée`);
    location.hash = '#/bibliotheque';
  });
  document.getElementById('supprimer-modele')?.addEventListener('click', async () => {
    if (!await confirmer(`Supprimer « ${m.nom} » de la bibliothèque ? Les évaluations déjà créées sont conservées.`, { ok: 'Supprimer', danger: true })) return;
    db.modeles = db.modeles.filter(x => x.id !== m.id);
    enregistrer();
    toast('Formation supprimée');
    location.hash = '#/bibliotheque';
  });
}

function vueSauvegarde() {
  const nb = db.evaluations.length;
  const nbRep = db.evaluations.reduce((t, e) => t + e.reponses.length, 0);
  app.innerHTML = `
    <h1>Sauvegarde</h1>
    <div class="carte">
      <p>Les données sont stockées uniquement sur cet appareil : ${nb} évaluation(s), ${nbRep} grille(s),
      ${db.modeles.length} formation(s) en bibliothèque.
      Exportez régulièrement une sauvegarde, notamment avant de vider le navigateur ou de changer de téléphone.</p>
      <div class="ligne">
        <button class="btn principal" id="exporter">Exporter (JSON)</button>
        <label class="btn" style="margin:0">Importer…<input type="file" id="importer" accept=".json,application/json" hidden></label>
      </div>
      <p class="aide">L'import ajoute les évaluations et les formations du fichier ; celles déjà présentes
      (même évaluation, ou formation de même nom) sont remplacées.</p>
    </div>
  `;
  document.getElementById('exporter').addEventListener('click', () => {
    telecharger(`aide-formateur_sauvegarde_${aujourdhui()}.json`, JSON.stringify(db, null, 2), 'application/json');
  });
  document.getElementById('importer').addEventListener('change', async (e) => {
    const fichier = e.target.files[0];
    if (!fichier) return;
    try {
      const donnees = JSON.parse(await fichier.text());
      if (!Array.isArray(donnees.evaluations)) throw new Error('format');
      const valides = donnees.evaluations.filter(ev =>
        ev && ev.id && Array.isArray(ev.criteres) && Array.isArray(ev.reponses) && ECHELLES.includes(ev.echelle)).map(normaliser);
      const modeles = (Array.isArray(donnees.modeles) ? donnees.modeles : [])
        .filter(m => m && m.id && m.nom && Array.isArray(m.criteres));
      if (!await confirmer(`Importer ${valides.length} évaluation(s) et ${modeles.length} formation(s) ?`, { ok: 'Importer' })) return;
      const ids = new Set(valides.map(ev => ev.id));
      db.evaluations = db.evaluations.filter(ev => !ids.has(ev.id)).concat(valides);
      const noms = new Set(modeles.map(m => m.nom.toLowerCase()));
      db.modeles = db.modeles.filter(m => !noms.has(m.nom.toLowerCase())).concat(modeles);
      enregistrer();
      toast(`${valides.length} évaluation(s) et ${modeles.length} formation(s) importée(s)`);
      vueSauvegarde();
    } catch {
      toast('Fichier de sauvegarde illisible.');
    }
  });
}

// ---------- Routage ----------

function router() {
  const morceaux = location.hash.replace(/^#\/?/, '').split('/');
  window.scrollTo(0, 0);
  if (morceaux[0] === 'nouvelle') return vueNouvelle();
  if (morceaux[0] === 'sauvegarde') return vueSauvegarde();
  if (morceaux[0] === 'bibliotheque') return morceaux[1] ? vueModele(morceaux[1]) : vueBibliotheque();
  if (morceaux[0] === 'eval') {
    const ev = trouverEvaluation(morceaux[1]);
    if (ev) {
      if (morceaux[2] === 'bilan') return vueBilan(ev);
      if (morceaux[2] === 'comptage') return vueComptage(ev);
      if (morceaux[2] === 'reglages') return vueReglages(ev);
      return vueSaisie(ev);
    }
  }
  vueAccueil();
}

window.addEventListener('hashchange', router);
router();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker non enregistré', e));
  });
}
