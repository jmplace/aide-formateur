'use strict';

/*
 * Aide formateur — comptage des questionnaires de satisfaction.
 *
 * Toutes les données restent sur l'appareil (localStorage), sous la forme :
 *   { version: 1, evaluations: [Evaluation] }
 *   Evaluation = { id, titre, date, formateur, echelle, seuil,
 *                  criteres: [{ id, libelle }],
 *                  reponses: [{ id, saisie, notes: { [idCritere]: n | null }, commentaire }] }
 * Une note null signifie « sans réponse » : elle n'entre pas dans les moyennes.
 */

const CLE_STOCKAGE = 'aide-formateur.v1';
const ECHELLES = [4, 5, 10];
const SEUIL_PAR_DEFAUT = { 4: 3, 5: 4, 10: 7 };
const CRITERES_PAR_DEFAUT = [
  'Atteinte des objectifs de la formation',
  'Contenu et supports',
  'Qualité de l\'animation',
  'Rythme et durée',
  'Organisation et conditions matérielles',
  'Satisfaction globale',
];

// ---------- Stockage ----------

function charger() {
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE);
    if (brut) {
      const donnees = JSON.parse(brut);
      if (Array.isArray(donnees.evaluations)) return donnees;
    }
  } catch (e) {
    console.error('Lecture des données impossible', e);
  }
  return { version: 1, evaluations: [] };
}

let db = charger();

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

/** Couleur d'une note : on projette l'échelle sur les 5 teintes rouge → vert. */
function couleurNote(note, echelle) {
  const i = Math.round(1 + (note - 1) * 4 / (echelle - 1));
  return `var(--n${i})`;
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
  const lignes = [['N°', 'Saisi le', ...ev.criteres.map(c => c.libelle), 'Commentaire']];
  ev.reponses.forEach((r, i) => {
    lignes.push([
      i + 1,
      new Date(r.saisie).toLocaleString('fr-FR'),
      ...ev.criteres.map(c => r.notes[c.id] ?? ''),
      r.commentaire || '',
    ]);
  });
  telecharger(nomFichier(ev, 'reponses', 'csv'), csv(lignes), 'text/csv;charset=utf-8');
}

function exporterBilanCsv(ev) {
  const st = statistiques(ev);
  const notes = Array.from({ length: ev.echelle }, (_, i) => i + 1);
  const lignes = [
    ['Formation', ev.titre],
    ['Date', fmtDate(ev.date)],
    ['Formateur', ev.formateur || ''],
    ['Questionnaires', st.nbQuestionnaires],
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
    `${st.nbQuestionnaires} questionnaire(s), échelle 1 à ${ev.echelle}, satisfait à partir de ${ev.seuil}`,
    '',
    ...st.parCritere.map(s =>
      `• ${s.critere.libelle} : ${fmtNombre(s.moyenne)} / ${ev.echelle} (${fmtPourcent(s.tauxSatisfaction)} satisfaits, ${s.n} rép.)`),
    '',
    `Ensemble : ${fmtNombre(st.moyenne)} / ${ev.echelle} — ${fmtPourcent(st.tauxSatisfaction)} de satisfaction`,
  ];
  const commentaires = ev.reponses.map(r => r.commentaire).filter(Boolean);
  if (commentaires.length) {
    lignes.push('', 'Commentaires :', ...commentaires.map(c => `- ${c}`));
  }
  return lignes.join('\n');
}

// ---------- Vues ----------

const app = document.getElementById('app');

function onglets(ev, actif) {
  const o = (cle, libelle) =>
    `<a href="#/eval/${ev.id}/${cle}" class="${cle === actif ? 'actif' : ''}">${libelle}</a>`;
  return `<nav class="onglets">${o('saisie', 'Saisie')}${o('bilan', 'Bilan')}${o('reglages', 'Réglages')}</nav>`;
}

function vueAccueil() {
  const evs = [...db.evaluations].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  app.innerHTML = `
    <h1>Mes évaluations</h1>
    ${evs.length ? evs.map(ev => {
      const st = statistiques(ev);
      return `<a class="carte" href="#/eval/${ev.id}/saisie">
        <div><strong>${esc(ev.titre)}</strong></div>
        <div class="meta">${esc(fmtDate(ev.date))}${ev.formateur ? ' — ' + esc(ev.formateur) : ''}</div>
        <div class="meta">${st.nbQuestionnaires} questionnaire(s) · moyenne ${fmtNombre(st.moyenne)} / ${ev.echelle} · ${fmtPourcent(st.tauxSatisfaction)} satisfaits</div>
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
      <label for="f-titre">Intitulé de la formation</label>
      <input type="text" id="f-titre" required value="${esc(ev.titre)}" placeholder="ex. Excel perfectionnement — groupe B">

      <label for="f-date">Date</label>
      <input type="date" id="f-date" value="${esc(ev.date)}">

      <label for="f-formateur">Formateur <span class="aide">(facultatif)</span></label>
      <input type="text" id="f-formateur" value="${esc(ev.formateur)}">

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

      <label for="f-criteres">Critères évalués <span class="aide">(un par ligne)</span></label>
      <textarea id="f-criteres">${esc(ev.criteres.map(c => c.libelle).join('\n'))}</textarea>
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
  const seuil = document.getElementById('f-seuil');
  const remplirSeuils = (valeur) => {
    const max = Number(echelle.value);
    seuil.innerHTML = Array.from({ length: max }, (_, i) => i + 1)
      .map(n => `<option value="${n}" ${n === valeur ? 'selected' : ''}>${n}</option>`).join('');
  };
  remplirSeuils(ev.seuil);
  echelle.addEventListener('change', () => remplirSeuils(SEUIL_PAR_DEFAUT[echelle.value]));

  document.getElementById('form-eval').addEventListener('submit', (e) => {
    e.preventDefault();
    const libelles = document.getElementById('f-criteres').value
      .split('\n').map(s => s.trim()).filter(Boolean);
    if (!libelles.length) {
      toast('Indiquez au moins un critère.');
      return;
    }
    const supprimes = ev.criteres.filter(c => !libelles.includes(c.libelle));
    if (!estNouvelle && supprimes.length && ev.reponses.length &&
        !confirm(`Supprimer ${supprimes.length} critère(s) et les notes déjà saisies pour ${supprimes.length > 1 ? 'eux' : 'lui'} ?`)) {
      return;
    }

    // On garde l'identifiant des critères conservés, pour ne pas perdre leurs notes.
    const parLibelle = new Map(ev.criteres.map(c => [c.libelle, c]));
    ev.criteres = libelles.map(l => parLibelle.get(l) || { id: nouvelId(), libelle: l });
    const ids = new Set(ev.criteres.map(c => c.id));
    for (const r of ev.reponses) {
      for (const id of Object.keys(r.notes)) if (!ids.has(id)) delete r.notes[id];
    }

    ev.titre = document.getElementById('f-titre').value.trim();
    ev.date = document.getElementById('f-date').value;
    ev.formateur = document.getElementById('f-formateur').value.trim();
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
    titre: '',
    date: aujourdhui(),
    formateur: '',
    echelle: 5,
    seuil: SEUIL_PAR_DEFAUT[5],
    criteres: CRITERES_PAR_DEFAUT.map(l => ({ id: nouvelId(), libelle: l })),
    reponses: [],
  };
  // Reprend les critères et réglages de la dernière évaluation créée, s'il y en a une.
  const derniere = db.evaluations[db.evaluations.length - 1];
  if (derniere) {
    ev.echelle = derniere.echelle;
    ev.seuil = derniere.seuil;
    ev.formateur = derniere.formateur;
    ev.criteres = derniere.criteres.map(c => ({ id: nouvelId(), libelle: c.libelle }));
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
  document.getElementById('supprimer').addEventListener('click', () => {
    if (!confirm(`Supprimer « ${ev.titre} » et ses ${ev.reponses.length} questionnaire(s) ? Cette action est définitive.`)) return;
    db.evaluations = db.evaluations.filter(e => e.id !== ev.id);
    enregistrer();
    toast('Évaluation supprimée');
    location.hash = '#/';
  });
}

function vueSaisie(ev) {
  // Le questionnaire en cours n'est enregistré qu'à la validation.
  const notes = {};
  const resume = (r) => ev.criteres.map(c => r.notes[c.id] ?? '·').join(' ');

  app.innerHTML = `
    <h1>${esc(ev.titre)}</h1>
    ${onglets(ev, 'saisie')}
    <div class="carte">
      <div class="ligne">
        <strong>Questionnaire n° ${ev.reponses.length + 1}</strong>
        <span class="espace"></span>
        <span class="compteur" id="compteur"></span>
      </div>
      ${ev.criteres.map(c => `
        <div class="critere" data-critere="${c.id}">
          <div class="libelle">${esc(c.libelle)}</div>
          <div class="notes">
            ${Array.from({ length: ev.echelle }, (_, i) => i + 1)
              .map(n => `<button type="button" data-note="${n}">${n}</button>`).join('')}
            <button type="button" class="sans" data-note="">Sans</button>
          </div>
        </div>`).join('')}
      <label for="commentaire">Commentaire <span class="aide">(facultatif)</span></label>
      <textarea id="commentaire" style="min-height:70px"></textarea>
      <div class="ligne" style="margin-top:14px">
        <button class="btn principal espace" id="valider">Valider ce questionnaire</button>
        <button class="btn" id="effacer">Effacer</button>
      </div>
    </div>

    <h2>Déjà saisis (${ev.reponses.length})</h2>
    <div class="carte">
      ${ev.reponses.length ? [...ev.reponses].reverse().map((r, k) => `
        <div class="reponse">
          <span><strong>n° ${ev.reponses.length - k}</strong> <code>${esc(resume(r))}</code>${r.commentaire ? ' 💬' : ''}</span>
          <button class="btn petit danger" data-supprimer="${r.id}">Retirer</button>
        </div>`).join('') : '<p class="meta">Aucun questionnaire saisi.</p>'}
    </div>
  `;

  const compteur = document.getElementById('compteur');
  const majCompteur = () => {
    const faits = Object.keys(notes).length;
    compteur.textContent = `${faits} / ${ev.criteres.length} critères`;
  };
  majCompteur();

  app.querySelectorAll('.critere').forEach(bloc => {
    const id = bloc.dataset.critere;
    bloc.addEventListener('click', (e) => {
      const bouton = e.target.closest('button[data-note]');
      if (!bouton) return;
      notes[id] = bouton.dataset.note === '' ? null : Number(bouton.dataset.note);
      bloc.querySelectorAll('button').forEach(b => {
        b.classList.remove('choisi');
        b.style.background = '';
      });
      bouton.classList.add('choisi');
      if (notes[id] != null) bouton.style.background = couleurNote(notes[id], ev.echelle);
      majCompteur();
    });
  });

  document.getElementById('valider').addEventListener('click', () => {
    const commentaire = document.getElementById('commentaire').value.trim();
    const manquants = ev.criteres.filter(c => !(c.id in notes)).length;
    if (manquants === ev.criteres.length && !commentaire) {
      toast('Le questionnaire est vide.');
      return;
    }
    if (manquants && !confirm(`${manquants} critère(s) sans note : les compter comme « sans réponse » ?`)) return;
    const complet = {};
    for (const c of ev.criteres) complet[c.id] = notes[c.id] ?? null;
    ev.reponses.push({ id: nouvelId(), saisie: new Date().toISOString(), notes: complet, commentaire });
    enregistrer();
    toast(`Questionnaire n° ${ev.reponses.length} enregistré`);
    vueSaisie(ev);
    window.scrollTo(0, 0);
  });

  document.getElementById('effacer').addEventListener('click', () => vueSaisie(ev));

  app.querySelectorAll('[data-supprimer]').forEach(b => b.addEventListener('click', () => {
    const i = ev.reponses.findIndex(r => r.id === b.dataset.supprimer);
    if (i < 0 || !confirm(`Retirer le questionnaire n° ${i + 1} ?`)) return;
    ev.reponses.splice(i, 1);
    enregistrer();
    toast('Questionnaire retiré');
    vueSaisie(ev);
  }));
}

function vueBilan(ev) {
  const st = statistiques(ev);
  const notesEchelle = Array.from({ length: ev.echelle }, (_, i) => i + 1);
  const commentaires = ev.reponses.map(r => r.commentaire).filter(Boolean);

  app.innerHTML = `
    <h1>${esc(ev.titre)}</h1>
    ${onglets(ev, 'bilan')}
    <div class="chiffres">
      <div class="chiffre"><div class="valeur">${st.nbQuestionnaires}</div><div class="nom">questionnaires</div></div>
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

    ${commentaires.length ? `
      <h2>Commentaires (${commentaires.length})</h2>
      <div class="carte"><ul class="commentaires">${commentaires.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}

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
  document.getElementById('csv-bilan').addEventListener('click', () => exporterBilanCsv(ev));
  document.getElementById('csv-reponses').addEventListener('click', () => exporterReponsesCsv(ev));
}

function vueSauvegarde() {
  const nb = db.evaluations.length;
  const nbRep = db.evaluations.reduce((t, e) => t + e.reponses.length, 0);
  app.innerHTML = `
    <h1>Sauvegarde</h1>
    <div class="carte">
      <p>Les données sont stockées uniquement sur cet appareil : ${nb} évaluation(s), ${nbRep} questionnaire(s).
      Exportez régulièrement une sauvegarde, notamment avant de vider le navigateur ou de changer de téléphone.</p>
      <div class="ligne">
        <button class="btn principal" id="exporter">Exporter (JSON)</button>
        <label class="btn" style="margin:0">Importer…<input type="file" id="importer" accept=".json,application/json" hidden></label>
      </div>
      <p class="aide">L'import ajoute les évaluations du fichier ; celles déjà présentes (même identifiant) sont remplacées.</p>
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
        ev && ev.id && Array.isArray(ev.criteres) && Array.isArray(ev.reponses) && ECHELLES.includes(ev.echelle));
      if (!confirm(`Importer ${valides.length} évaluation(s) ?`)) return;
      const ids = new Set(valides.map(ev => ev.id));
      db.evaluations = db.evaluations.filter(ev => !ids.has(ev.id)).concat(valides);
      enregistrer();
      toast(`${valides.length} évaluation(s) importée(s)`);
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
  if (morceaux[0] === 'eval') {
    const ev = trouverEvaluation(morceaux[1]);
    if (ev) {
      if (morceaux[2] === 'bilan') return vueBilan(ev);
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
