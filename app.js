import { getToken, setToken, clearToken, getDeviceLabel, setDeviceLabel, maskToken } from './config.js';
import { readData, writeData } from './githubSync.js';
import { getState, setMode, setVolume, setPoids, setDegre, formatFr } from './calc.js';
import { buildEntry, addEntry } from './dataStore.js';
import { getSession, addToSession, resetSession } from './session.js';
import { typeLabel, sortEntries, removeEntry } from './entries.js';
import { filterByPeriod, computeStats } from './stats.js';
import { iconePourConsoHebdo, iconePourConsoJour, ICONES } from './constants.js';
import { ensureShape, isValidDataShape } from './dataStore.js';
import { mondayOf, addDays, isSameDay, groupByWeek, weekDetail, deuxJoursConsecutifsSans } from './bilans.js';
import { weeklyBarChartSvg } from './chart.js';
import { CONSO_SEMAINE_MAX } from './constants.js';
import { calculAlcoolemie, formatDelai } from './alcoolemie.js';
import { currentStreak, longestStreak } from './streaks.js';

// ── Navigation entre vues ──

const tabButtons = document.querySelectorAll('.tab-btn[data-target]');
const views = document.querySelectorAll('.view[data-view]');
const viewChangeListeners = [];

function onViewChange(fn) {
  viewChangeListeners.push(fn);
}

function showView(name) {
  views.forEach((v) => { v.hidden = v.dataset.view !== name; });
  tabButtons.forEach((b) => { b.classList.toggle('active', b.dataset.target === name); });
  viewChangeListeners.forEach((fn) => fn(name));
}

document.querySelectorAll('[data-target]').forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.target));
});

// ── Calculateur ──

const modeVolumeBtn = document.getElementById('mode-volume-btn');
const modePoidsBtn = document.getElementById('mode-poids-btn');
const qtyLabel = document.getElementById('qty-label');
const qtyInput = document.getElementById('qty-input');
const qtyMinusBtn = document.getElementById('qty-minus-btn');
const qtyPlusBtn = document.getElementById('qty-plus-btn');
const volumePresets = document.getElementById('volume-presets');
const degreInput = document.getElementById('degre-input');
const degreMinusBtn = document.getElementById('degre-minus-btn');
const degrePlusBtn = document.getElementById('degre-plus-btn');
const degreFineStep = document.getElementById('degre-fine-step');
const unitesResult = document.getElementById('unites-result');
const calcInfoBtn = document.getElementById('calc-info-btn');
const calcInfoText = document.getElementById('calc-info-text');

function renderResult() {
  const { unites } = getState();
  unitesResult.textContent = formatFr(unites, 2);
}

function applyMode(mode) {
  setMode(mode);
  const isVolume = mode === 'volume';
  modeVolumeBtn.classList.toggle('active', isVolume);
  modePoidsBtn.classList.toggle('active', !isVolume);
  qtyLabel.textContent = isVolume ? 'Volume (cl)' : 'Poids (g)';
  volumePresets.hidden = !isVolume;
  qtyInput.value = isVolume ? getState().volume : getState().poids;
  renderResult();
}

modeVolumeBtn.addEventListener('click', () => applyMode('volume'));
modePoidsBtn.addEventListener('click', () => applyMode('poids'));

qtyInput.addEventListener('input', () => {
  const value = parseFloat(qtyInput.value) || 0;
  if (getState().mode === 'volume') setVolume(value);
  else setPoids(value);
  renderResult();
});

qtyMinusBtn.addEventListener('click', () => {
  qtyInput.value = Math.max(0, (parseFloat(qtyInput.value) || 0) - 1);
  qtyInput.dispatchEvent(new Event('input'));
});
qtyPlusBtn.addEventListener('click', () => {
  qtyInput.value = (parseFloat(qtyInput.value) || 0) + 1;
  qtyInput.dispatchEvent(new Event('input'));
});

volumePresets.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-volume]');
  if (!btn) return;
  qtyInput.value = btn.dataset.volume;
  qtyInput.dispatchEvent(new Event('input'));
});

document.querySelectorAll('[data-degre]').forEach((btn) => {
  btn.addEventListener('click', () => {
    degreInput.value = btn.dataset.degre;
    degreInput.dispatchEvent(new Event('input'));
  });
});

degreInput.addEventListener('input', () => {
  setDegre(parseFloat(degreInput.value) || 0);
  renderResult();
});

degreFineStep.addEventListener('change', () => {
  degreInput.step = degreFineStep.checked ? '0.1' : '0.5';
});

degreMinusBtn.addEventListener('click', () => {
  const step = parseFloat(degreInput.step) || 0.5;
  degreInput.value = Math.max(0, (parseFloat(degreInput.value) || 0) - step);
  degreInput.dispatchEvent(new Event('input'));
});
degrePlusBtn.addEventListener('click', () => {
  const step = parseFloat(degreInput.step) || 0.5;
  degreInput.value = (parseFloat(degreInput.value) || 0) + step;
  degreInput.dispatchEvent(new Event('input'));
});

calcInfoBtn.addEventListener('click', () => {
  calcInfoText.hidden = !calcInfoText.hidden;
});

applyMode('volume');
degreInput.value = getState().degre;
renderResult();

// ── Archivage ──

const calcSummaryText = document.getElementById('calc-summary-text');
const entryDatetimeInput = document.getElementById('entry-datetime');
const entryTypeSelect = document.getElementById('entry-type');
const entryNoteInput = document.getElementById('entry-note');
const archiveBtn = document.getElementById('archive-btn');
const archiveStatus = document.getElementById('archive-status');

const sessionTotalEl = document.getElementById('session-total');
const sessionCountEl = document.getElementById('session-count');
const cumulBtn = document.getElementById('cumul-btn');
const razBtn = document.getElementById('raz-btn');

function toDatetimeLocalValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderCalcSummary() {
  const { mode, volume, poids, degre, unites } = getState();
  const qty = mode === 'volume' ? `${formatFr(volume, 0)} cl` : `${formatFr(poids, 0)} g`;
  calcSummaryText.textContent = `${qty} à ${formatFr(degre, 1)}° → ${formatFr(unites, 2)} unités`;
}

function renderSession() {
  const { total, count } = getSession();
  sessionTotalEl.textContent = formatFr(total, 2);
  sessionCountEl.textContent = count > 1 ? `${count} verres` : `${count} verre`;
}

function refreshArchiveButtonState() {
  archiveBtn.disabled = !getToken();
}

entryDatetimeInput.value = toDatetimeLocalValue(new Date());

archiveBtn.addEventListener('click', async () => {
  const token = getToken();
  archiveBtn.disabled = true;
  archiveStatus.textContent = 'Écriture sur GitHub…';
  archiveStatus.className = 'status warn';
  try {
    const calcState = getState();
    const date = entryDatetimeInput.value ? new Date(entryDatetimeInput.value) : new Date();
    const entry = buildEntry({
      date,
      unites: calcState.unites,
      volume: calcState.volume,
      poids: calcState.poids,
      degre: calcState.degre,
      mode: calcState.mode,
      type: entryTypeSelect.value,
      note: entryNoteInput.value,
    });
    await writeData(
      (current) => addEntry(current, entry),
      { message: `archivage : ${formatFr(entry.unites, 2)} unités`, token }
    );
    archiveStatus.textContent = `Archivé : ${formatFr(entry.unites, 2)} unités le ${date.toLocaleString('fr-FR')}.`;
    archiveStatus.className = 'status ok';
    entryNoteInput.value = '';
    entryDatetimeInput.value = toDatetimeLocalValue(new Date());
  } catch (e) {
    archiveStatus.textContent = `Erreur : ${e.message}`;
    archiveStatus.className = 'status error';
  } finally {
    refreshArchiveButtonState();
  }
});

// ── Alcoolémie ──

const poidsInput = document.getElementById('poids-input');
const aMangeCheckbox = document.getElementById('a-mange-checkbox');
const seuilLegalInput = document.getElementById('seuil-legal-input');
const tauxHommeEl = document.getElementById('taux-homme');
const tauxFemmeEl = document.getElementById('taux-femme');
const delaiHommeEl = document.getElementById('delai-homme');
const delaiFemmeEl = document.getElementById('delai-femme');

function renderAlcoolemie() {
  const { total } = getSession();
  const poidsKg = parseFloat(poidsInput.value) || 0;
  const seuilLegal = parseFloat(seuilLegalInput.value) || 0;
  const { tauxHomme, tauxFemme, delaiHomme, delaiFemme } = calculAlcoolemie({
    unitesCumulees: total,
    poidsKg,
    aMange: aMangeCheckbox.checked,
    seuilLegal,
  });
  tauxHommeEl.textContent = `${formatFr(tauxHomme, 2)} g/L`;
  tauxFemmeEl.textContent = `${formatFr(tauxFemme, 2)} g/L`;
  delaiHommeEl.textContent = formatDelai(delaiHomme);
  delaiFemmeEl.textContent = formatDelai(delaiFemme);
}

poidsInput.addEventListener('input', renderAlcoolemie);
aMangeCheckbox.addEventListener('change', renderAlcoolemie);
seuilLegalInput.addEventListener('input', renderAlcoolemie);

cumulBtn.addEventListener('click', () => {
  addToSession(getState().unites);
  renderSession();
  renderAlcoolemie();
});

razBtn.addEventListener('click', () => {
  resetSession();
  renderSession();
  renderAlcoolemie();
});

onViewChange((name) => {
  if (name === 'archivage') {
    renderCalcSummary();
    refreshArchiveButtonState();
    renderAlcoolemie();
  }
});

renderSession();
renderAlcoolemie();

// ── Détail / historique ──

const detailRefreshBtn = document.getElementById('detail-refresh-btn');
const detailSortBtn = document.getElementById('detail-sort-btn');
const detailStatus = document.getElementById('detail-status');
const detailList = document.getElementById('detail-list');

let detailEntries = [];
let detailSortOrder = 'desc';
let detailLoaded = false;

function formatEntryDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function renderDetailList() {
  const sorted = sortEntries(detailEntries, detailSortOrder);
  detailList.innerHTML = '';

  if (sorted.length === 0) {
    const li = document.createElement('li');
    li.className = 'entry-empty';
    li.textContent = 'Aucune consommation archivée pour l’instant.';
    detailList.appendChild(li);
    return;
  }

  sorted.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'entry-item';

    const qty = entry.mode === 'poids' ? `${formatFr(entry.poids ?? 0, 0)} g` : `${formatFr(entry.volume ?? 0, 0)} cl`;

    li.innerHTML = `
      <div class="entry-main">
        <span class="entry-date">${formatEntryDate(entry.date)}</span>
        <span class="entry-unites">${formatFr(entry.unites, 2)} unités</span>
      </div>
      <div class="entry-sub">
        <span>${typeLabel(entry.type)}</span>
        <span>${qty} à ${formatFr(entry.degre, 1)}°</span>
        ${entry.note ? `<span class="entry-note">« ${entry.note} »</span>` : ''}
      </div>
    `;

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'entry-delete-btn';
    deleteBtn.textContent = 'Supprimer';
    deleteBtn.disabled = !getToken();
    deleteBtn.addEventListener('click', () => deleteEntry(entry.id));
    li.appendChild(deleteBtn);

    detailList.appendChild(li);
  });
}

async function loadDetail() {
  detailStatus.textContent = 'Chargement…';
  detailStatus.className = 'status warn';
  try {
    const data = await readData();
    detailEntries = (data && Array.isArray(data.entries)) ? data.entries : [];
    detailLoaded = true;
    detailStatus.textContent = '';
    detailStatus.className = 'status';
    renderDetailList();
  } catch (e) {
    detailStatus.textContent = `Erreur de lecture : ${e.message}`;
    detailStatus.className = 'status error';
  }
}

async function deleteEntry(id) {
  const token = getToken();
  if (!token) return;
  const entry = detailEntries.find((e) => e.id === id);
  const confirmMsg = entry
    ? `Supprimer cette entrée (${formatFr(entry.unites, 2)} unités, ${formatEntryDate(entry.date)}) ?`
    : 'Supprimer cette entrée ?';
  if (!confirm(confirmMsg)) return;

  detailStatus.textContent = 'Suppression…';
  detailStatus.className = 'status warn';
  try {
    const result = await writeData(
      (current) => removeEntry(current, id),
      { message: 'suppression entrée', token }
    );
    detailEntries = result.data.entries;
    detailStatus.textContent = 'Entrée supprimée.';
    detailStatus.className = 'status ok';
    renderDetailList();
  } catch (e) {
    detailStatus.textContent = `Erreur de suppression : ${e.message}`;
    detailStatus.className = 'status error';
  }
}

detailRefreshBtn.addEventListener('click', loadDetail);

detailSortBtn.addEventListener('click', () => {
  detailSortOrder = detailSortOrder === 'desc' ? 'asc' : 'desc';
  detailSortBtn.textContent = detailSortOrder === 'desc' ? 'Tri : plus récent d’abord' : 'Tri : plus ancien d’abord';
  renderDetailList();
});

onViewChange((name) => {
  if (name === 'detail' && !detailLoaded) {
    loadDetail();
  }
});

// ── Synthèse ──

const periodeButtons = document.querySelectorAll('[data-period]');
const periodePersoBlock = document.getElementById('periode-perso-block');
const periodeDebutInput = document.getElementById('periode-debut');
const periodeFinInput = document.getElementById('periode-fin');
const syntheseRefreshBtn = document.getElementById('synthese-refresh-btn');
const syntheseStatus = document.getElementById('synthese-status');
const syntheseContent = document.getElementById('synthese-content');
const syntheseLegendeBtn = document.getElementById('synthese-legende-btn');
const syntheseLegendeText = document.getElementById('synthese-legende-text');
const resetRevealBtn = document.getElementById('reset-reveal-btn');
const resetConfirmBlock = document.getElementById('reset-confirm-block');
const resetWarningText = document.getElementById('reset-warning-text');
const resetAckExport = document.getElementById('reset-ack-export');
const resetConfirmInput = document.getElementById('reset-confirm-input');
const resetConfirmBtn = document.getElementById('reset-confirm-btn');
const resetCancelBtn = document.getElementById('reset-cancel-btn');
const resetStatus = document.getElementById('reset-status');
const RESET_CONFIRM_WORD = 'EFFACER';

const statTotal = document.getElementById('stat-total');
const statSaisies = document.getElementById('stat-saisies');
const statJoursConso = document.getElementById('stat-jours-conso');
const statTaux = document.getElementById('stat-taux');
const statSemaines = document.getElementById('stat-semaines');
const statMoyenne = document.getElementById('stat-moyenne');
const statMax = document.getElementById('stat-max');

let syntheseEntries = [];
let syntheseLoaded = false;
let periodeType = 'annee';

function formatDateFr(d) {
  return d.toLocaleDateString('fr-FR');
}

function renderSynthese() {
  let customStart = null;
  let customEnd = null;
  if (periodeType === 'perso') {
    customStart = periodeDebutInput.value ? new Date(`${periodeDebutInput.value}T00:00:00`) : null;
    customEnd = periodeFinInput.value ? new Date(`${periodeFinInput.value}T23:59:59`) : null;
  }

  const { filtered, start, end } = filterByPeriod(syntheseEntries, periodeType, customStart, customEnd);
  const stats = computeStats(filtered, start, end);

  if (!stats) {
    syntheseContent.hidden = true;
    syntheseStatus.textContent = syntheseEntries.length === 0
      ? 'Aucune consommation archivée pour l’instant.'
      : 'Aucune donnée sur cette période.';
    syntheseStatus.className = 'status warn';
    return;
  }

  syntheseStatus.textContent = `Du ${formatDateFr(start)} au ${formatDateFr(end)}`;
  syntheseStatus.className = 'status';
  syntheseContent.hidden = false;

  statTotal.textContent = formatFr(stats.totalUnites, 2);
  statSaisies.textContent = stats.nbSaisies;
  statJoursConso.textContent = stats.nbJoursConso;
  statTaux.textContent = `${formatFr(stats.tauxJoursAvecConso, 1)} %`;
  statSemaines.textContent = formatFr(stats.nbSemaines, 1);
  statMoyenne.textContent = `${formatFr(stats.consoHebdoMoy, 2)} ${iconePourConsoHebdo(stats.consoHebdoMoy)}`;

  const maxDateCh = stats.maxJourDate
    ? new Date(`${stats.maxJourDate}T00:00:00`).toLocaleDateString('fr-FR')
    : '—';
  statMax.textContent = `${formatFr(stats.maxJour, 2)} ${iconePourConsoJour(stats.maxJour)} (${maxDateCh})`;
}

// ── Bilan de la semaine / Bilan général ──

const bilanPrevBtn = document.getElementById('bilan-prev-btn');
const bilanTodayBtn = document.getElementById('bilan-today-btn');
const bilanNextBtn = document.getElementById('bilan-next-btn');
const bilanHebdoLabel = document.getElementById('bilan-hebdo-label');
const bilanTotalEl = document.getElementById('bilan-total');
const bilanMaxEl = document.getElementById('bilan-max');
const bilanDeuxJoursEl = document.getElementById('bilan-deuxjours');
const bilanDaysList = document.getElementById('bilan-days');
const bilanGeneralList = document.getElementById('bilan-general-list');
const chartContainer = document.getElementById('chart-container');

let bilanWeekStart = mondayOf(new Date());

const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function renderBilanHebdo() {
  const { days, total, maxJour } = weekDetail(syntheseEntries, bilanWeekStart);
  const today = new Date();

  bilanHebdoLabel.textContent = `Semaine du ${formatDateFr(bilanWeekStart)} au ${formatDateFr(addDays(bilanWeekStart, 6))}`;
  bilanTotalEl.textContent = `${formatFr(total, 2)} ${iconePourConsoHebdo(total)}`;
  bilanMaxEl.textContent = `${formatFr(maxJour, 2)} ${iconePourConsoJour(maxJour)}`;

  const etat = deuxJoursConsecutifsSans(days, today);
  bilanDeuxJoursEl.textContent = etat === 'oui' ? `Oui ${ICONES.bien}`
    : etat === 'non' ? `Non ${ICONES.mauvais}`
    : `Indéterminé ${ICONES.moyen}`;

  bilanDaysList.innerHTML = '';
  days.forEach((d, i) => {
    const li = document.createElement('li');
    li.className = 'week-day-row' + (isSameDay(d.date, today) ? ' is-today' : '');
    li.innerHTML = `<span>${JOURS_SEMAINE[i]} ${formatDateFr(d.date)}</span><span>${formatFr(d.total, 2)} unités</span>`;
    bilanDaysList.appendChild(li);
  });
}

function renderBilanGeneral() {
  const weeks = groupByWeek(syntheseEntries);
  bilanGeneralList.innerHTML = '';

  if (weeks.length === 0) {
    const li = document.createElement('li');
    li.className = 'entry-empty';
    li.textContent = 'Aucune donnée.';
    bilanGeneralList.appendChild(li);
    return;
  }

  weeks.forEach((w) => {
    const li = document.createElement('li');
    li.className = 'entry-item';
    li.innerHTML = `
      <div class="entry-main">
        <span class="entry-date">Semaine du ${formatDateFr(w.weekStart)} au ${formatDateFr(addDays(w.weekStart, 6))}</span>
        <span class="entry-unites">${formatFr(w.total, 2)} ${iconePourConsoHebdo(w.total)}</span>
      </div>
    `;
    bilanGeneralList.appendChild(li);
  });
}

function renderChart() {
  const weeks = groupByWeek(syntheseEntries);
  const svg = weeklyBarChartSvg(weeks, { threshold: CONSO_SEMAINE_MAX });
  chartContainer.innerHTML = svg || '<p class="entry-empty">Pas encore assez de données pour un graphique.</p>';
}

const streakCurrentEl = document.getElementById('streak-current');
const streakRecordEl = document.getElementById('streak-record');

function renderStreaks() {
  const current = currentStreak(syntheseEntries);
  const record = longestStreak(syntheseEntries);
  const plural = (n) => (n > 1 ? 'jours' : 'jour');
  streakCurrentEl.textContent = `${current} ${plural(current)}`;
  streakRecordEl.textContent = `${record} ${plural(record)}`;
}

bilanPrevBtn.addEventListener('click', () => {
  bilanWeekStart = addDays(bilanWeekStart, -7);
  renderBilanHebdo();
});
bilanNextBtn.addEventListener('click', () => {
  bilanWeekStart = addDays(bilanWeekStart, 7);
  renderBilanHebdo();
});
bilanTodayBtn.addEventListener('click', () => {
  bilanWeekStart = mondayOf(new Date());
  renderBilanHebdo();
});

async function loadSynthese() {
  syntheseStatus.textContent = 'Chargement…';
  syntheseStatus.className = 'status warn';
  syntheseContent.hidden = true;
  try {
    const data = await readData();
    syntheseEntries = (data && Array.isArray(data.entries)) ? data.entries : [];
    syntheseLoaded = true;
    renderSynthese();
    renderBilanHebdo();
    renderBilanGeneral();
    renderChart();
    renderStreaks();
  } catch (e) {
    syntheseStatus.textContent = `Erreur de lecture : ${e.message}`;
    syntheseStatus.className = 'status error';
  }
}

periodeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    periodeType = btn.dataset.period;
    periodeButtons.forEach((b) => b.classList.toggle('active', b.dataset.period === periodeType));
    periodePersoBlock.hidden = periodeType !== 'perso';
    renderSynthese();
  });
});

periodeDebutInput.addEventListener('change', renderSynthese);
periodeFinInput.addEventListener('change', renderSynthese);

syntheseRefreshBtn.addEventListener('click', loadSynthese);

syntheseLegendeBtn.addEventListener('click', () => {
  syntheseLegendeText.hidden = !syntheseLegendeText.hidden;
});

function refreshResetButtonState() {
  resetRevealBtn.disabled = !getToken();
}

function closeResetConfirm() {
  resetConfirmBlock.hidden = true;
  resetAckExport.checked = false;
  resetConfirmInput.value = '';
  resetConfirmBtn.disabled = true;
}

function refreshResetConfirmButtonState() {
  const wordMatches = resetConfirmInput.value.trim() === RESET_CONFIRM_WORD;
  resetConfirmBtn.disabled = !(wordMatches && resetAckExport.checked);
}

resetRevealBtn.addEventListener('click', () => {
  const count = syntheseEntries.length;
  resetWarningText.textContent = count > 0
    ? `⚠️ ${count} entrée(s) seront supprimées définitivement, sans aucune sauvegarde automatique.`
    : `⚠️ Aucune entrée actuellement, mais cette action reste irréversible si de nouvelles données arrivent avant confirmation.`;
  resetConfirmBlock.hidden = false;
  resetAckExport.checked = false;
  resetConfirmInput.value = '';
  refreshResetConfirmButtonState();
});

resetCancelBtn.addEventListener('click', closeResetConfirm);

resetAckExport.addEventListener('change', refreshResetConfirmButtonState);
resetConfirmInput.addEventListener('input', refreshResetConfirmButtonState);

resetConfirmBtn.addEventListener('click', async () => {
  const token = getToken();
  if (!token) return;
  if (resetConfirmInput.value.trim() !== RESET_CONFIRM_WORD || !resetAckExport.checked) return;

  const count = syntheseEntries.length;
  if (!confirm(`Dernière étape : supprimer définitivement ${count} entrée(s) ? Il n’y a pas de retour en arrière possible.`)) return;

  resetConfirmBtn.disabled = true;
  resetStatus.textContent = 'Réinitialisation…';
  resetStatus.className = 'status warn';
  try {
    await writeData(
      (current) => ({ ...ensureShape(current), updatedAt: new Date().toISOString(), entries: [] }),
      { message: 'réinitialisation complète', token }
    );
    resetStatus.textContent = 'Historique entièrement effacé.';
    resetStatus.className = 'status ok';
    syntheseEntries = [];
    renderSynthese();
    renderBilanHebdo();
    renderBilanGeneral();
    renderChart();
    renderStreaks();
    detailLoaded = false;
    closeResetConfirm();
  } catch (e) {
    resetStatus.textContent = `Erreur : ${e.message}`;
    resetStatus.className = 'status error';
  } finally {
    refreshResetButtonState();
  }
});

onViewChange((name) => {
  if (name === 'synthese' && !syntheseLoaded) {
    loadSynthese();
  }
});

// ── Configuration (jeton GitHub) ──

const tokenInput = document.getElementById('token-input');
const toggleVisibilityBtn = document.getElementById('toggle-token-visibility');
const saveTokenBtn = document.getElementById('save-token-btn');
const clearTokenBtn = document.getElementById('clear-token-btn');
const tokenStatus = document.getElementById('token-status');
const deviceLabelInput = document.getElementById('device-label-input');

const testReadBtn = document.getElementById('test-read-btn');
const testWriteBtn = document.getElementById('test-write-btn');
const resultBox = document.getElementById('sync-result');
const logBox = document.getElementById('sync-log');

function log(message, kind = 'info') {
  const li = document.createElement('li');
  const time = new Date().toLocaleTimeString('fr-FR');
  li.textContent = `[${time}] ${message}`;
  li.className = kind;
  logBox.prepend(li);
}

function refreshTokenStatus() {
  const token = getToken();
  if (token) {
    tokenStatus.textContent = `Jeton configuré (${maskToken(token)})`;
    tokenStatus.className = 'status ok';
    testWriteBtn.disabled = false;
  } else {
    tokenStatus.textContent = 'Aucun jeton configuré — lecture seule possible, écriture désactivée.';
    tokenStatus.className = 'status warn';
    testWriteBtn.disabled = true;
  }
  refreshArchiveButtonState();
  refreshResetButtonState();
  document.querySelectorAll('.entry-delete-btn').forEach((b) => { b.disabled = !getToken(); });
}

toggleVisibilityBtn.addEventListener('click', () => {
  tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password';
});

saveTokenBtn.addEventListener('click', () => {
  const value = tokenInput.value.trim();
  if (!value) {
    log('Aucun jeton saisi.', 'warn');
    return;
  }
  setToken(value);
  tokenInput.value = '';
  refreshTokenStatus();
  log('Jeton enregistré sur cet appareil (localStorage).', 'ok');
});

clearTokenBtn.addEventListener('click', () => {
  clearToken();
  tokenInput.value = '';
  refreshTokenStatus();
  log('Jeton effacé de cet appareil.', 'ok');
});

deviceLabelInput.value = getDeviceLabel();
deviceLabelInput.addEventListener('change', () => {
  setDeviceLabel(deviceLabelInput.value.trim());
});

testReadBtn.addEventListener('click', async () => {
  testReadBtn.disabled = true;
  log('Lecture de data/data.json…');
  try {
    const data = await readData();
    if (data === null) {
      resultBox.textContent = '(fichier introuvable sur GitHub — normal si jamais écrit encore)';
      log('Fichier introuvable (404) — normal avant la première écriture.', 'warn');
    } else {
      resultBox.textContent = JSON.stringify(data, null, 2);
      log('Lecture réussie.', 'ok');
    }
  } catch (e) {
    resultBox.textContent = `Erreur : ${e.message}`;
    log(`Échec lecture : ${e.message}`, 'error');
  } finally {
    testReadBtn.disabled = false;
  }
});

testWriteBtn.addEventListener('click', async () => {
  const token = getToken();
  testWriteBtn.disabled = true;
  log('Écriture de test sur data/data.json…');
  try {
    const result = await writeData(
      (current) => {
        const base = current && typeof current === 'object' ? current : { version: 1, entries: [] };
        return {
          ...base,
          updatedAt: new Date().toISOString(),
          _lot1Test: {
            message: 'ping de validation Lot 1',
            device: getDeviceLabel() || 'appareil sans nom',
            at: new Date().toISOString(),
          },
        };
      },
      { message: 'test synchro Lot 1', token }
    );
    resultBox.textContent = JSON.stringify(result.data, null, 2);
    log(`Écriture réussie (sha ${result.sha.slice(0, 7)}…).`, 'ok');
  } catch (e) {
    resultBox.textContent = `Erreur : ${e.message}`;
    log(`Échec écriture : ${e.message}`, 'error');
  } finally {
    testWriteBtn.disabled = false;
  }
});

// ── Export / Import ──

const exportBtn = document.getElementById('export-btn');
const importFileInput = document.getElementById('import-file-input');
const importBtn = document.getElementById('import-btn');
const exportImportStatus = document.getElementById('export-import-status');

let pendingImportData = null;

exportBtn.addEventListener('click', async () => {
  exportBtn.disabled = true;
  exportImportStatus.textContent = 'Préparation de l’export…';
  exportImportStatus.className = 'status warn';
  try {
    const data = await readData();
    if (!data) {
      exportImportStatus.textContent = 'Rien à exporter — aucune donnée sur GitHub pour l’instant.';
      exportImportStatus.className = 'status warn';
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ch3_2026-export-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    exportImportStatus.textContent = `Export téléchargé (${data.entries.length} entrée(s)).`;
    exportImportStatus.className = 'status ok';
  } catch (e) {
    exportImportStatus.textContent = `Erreur : ${e.message}`;
    exportImportStatus.className = 'status error';
  } finally {
    exportBtn.disabled = false;
  }
});

importFileInput.addEventListener('change', async () => {
  pendingImportData = null;
  importBtn.disabled = true;
  const file = importFileInput.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!isValidDataShape(parsed)) {
      exportImportStatus.textContent = 'Fichier invalide : forme inattendue (pas de tableau "entries").';
      exportImportStatus.className = 'status error';
      return;
    }
    pendingImportData = parsed;
    exportImportStatus.textContent = `Fichier valide : ${parsed.entries.length} entrée(s) prête(s) à importer.`;
    exportImportStatus.className = 'status';
    importBtn.disabled = !getToken();
  } catch (e) {
    exportImportStatus.textContent = `Fichier illisible : ${e.message}`;
    exportImportStatus.className = 'status error';
  }
});

importBtn.addEventListener('click', async () => {
  const token = getToken();
  if (!token || !pendingImportData) return;
  if (!confirm(`Importer ce fichier va REMPLACER tout l’historique actuel (${pendingImportData.entries.length} entrée(s)). Continuer ?`)) return;

  importBtn.disabled = true;
  exportImportStatus.textContent = 'Import en cours…';
  exportImportStatus.className = 'status warn';
  try {
    await writeData(
      () => ({ ...ensureShape(pendingImportData), updatedAt: new Date().toISOString() }),
      { message: 'import manuel (remplace tout)', token }
    );
    exportImportStatus.textContent = 'Import réussi — historique remplacé.';
    exportImportStatus.className = 'status ok';
    pendingImportData = null;
    importFileInput.value = '';
    syntheseLoaded = false;
    detailLoaded = false;
  } catch (e) {
    exportImportStatus.textContent = `Erreur d’import : ${e.message}`;
    exportImportStatus.className = 'status error';
  } finally {
    importBtn.disabled = !getToken() || !pendingImportData;
  }
});

refreshTokenStatus();
