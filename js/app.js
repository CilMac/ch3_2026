// Câblage DOM de l'appli : event listeners et rendu, pas de logique métier (voir les autres modules).

import { getToken, setToken, clearToken, getDeviceLabel, setDeviceLabel, maskToken } from './config.js';
import { readData, writeData, SyncError } from './githubSync.js';
import { getPendingEntries, queueEntry, removePendingEntry } from './offlineQueue.js';
import { getState, setMode, setVolume, setPoids, setDegre, formatFr, computeUnitesFrom } from './calc.js';
import { buildEntry, addEntry } from './dataStore.js';
import { getSession, addToSession, resetSession } from './session.js';
import { typeLabel, sortEntries, removeEntry } from './entries.js';
import { filterByPeriod, computeStats, statsParJourSemaine, statsParType, JOURS_SEMAINE } from './stats.js';
import { iconePourConsoHebdo, iconePourConsoJour, ICONES } from './constants.js';
import { ensureShape, isValidDataShape, buildFavori, addFavori, removeFavori } from './dataStore.js';
import { mondayOf, addDays, isSameDay, groupByWeek, weekDetail, deuxJoursConsecutifsSans, isoWeekNumber } from './bilans.js';
import { weeklyBarChartSvg, categoryBarChartSvg } from './chart.js';
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

// ── Badge de statut de connexion (visible sur tous les écrans) ──

const connBadge = document.getElementById('conn-badge');

function refreshConnBadge() {
  connBadge.hidden = !!getToken();
}

const weekBadge = document.getElementById('week-badge');
const weekBadgeText = document.getElementById('week-badge-text');

let currentWeekTotal = null;

function renderWeekBadge(total) {
  currentWeekTotal = total;
  weekBadge.hidden = false;
  weekBadgeText.textContent = `Cette semaine : ${formatFr(total, 2)} / ${CONSO_SEMAINE_MAX} U ${iconePourConsoHebdo(total)}`;
}

function bumpWeekBadge(date, unites) {
  if (currentWeekTotal === null) return; // pas encore chargé — se mettra à jour au prochain fetch
  if (mondayOf(date).getTime() === mondayOf(new Date()).getTime()) {
    renderWeekBadge(currentWeekTotal + unites);
  }
}

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

// ── Favoris (conso récurrentes) ──

const favorisList = document.getElementById('favoris-list');
const favorisListSummary = document.getElementById('favoris-list-summary');
const favorisStatus = document.getElementById('favoris-status');
const favoriNomInput = document.getElementById('favori-nom');
const favoriModeVolumeBtn = document.getElementById('favori-mode-volume-btn');
const favoriModePoidsBtn = document.getElementById('favori-mode-poids-btn');
const favoriQtyLabel = document.getElementById('favori-qty-label');
const favoriQtyInput = document.getElementById('favori-qty');
const favoriDegreInput = document.getElementById('favori-degre');
const favoriUnitesPreview = document.getElementById('favori-unites-preview');
const favoriTypeSelect = document.getElementById('favori-type');
const favoriAddBtn = document.getElementById('favori-add-btn');

let favoris = [];
let favorisLoaded = false;
let favoriMode = 'volume';

function renderFavoriUnitesPreview() {
  const unites = computeUnitesFrom({
    mode: favoriMode,
    volume: parseFloat(favoriQtyInput.value) || 0,
    poids: parseFloat(favoriQtyInput.value) || 0,
    degre: parseFloat(favoriDegreInput.value) || 0,
  });
  favoriUnitesPreview.textContent = formatFr(unites, 2);
}

function applyFavoriMode(mode) {
  favoriMode = mode === 'poids' ? 'poids' : 'volume';
  const isVolume = favoriMode === 'volume';
  favoriModeVolumeBtn.classList.toggle('active', isVolume);
  favoriModePoidsBtn.classList.toggle('active', !isVolume);
  favoriQtyLabel.textContent = isVolume ? 'Volume (cl)' : 'Poids (g)';
  renderFavoriUnitesPreview();
}

favoriModeVolumeBtn.addEventListener('click', () => applyFavoriMode('volume'));
favoriModePoidsBtn.addEventListener('click', () => applyFavoriMode('poids'));
favoriQtyInput.addEventListener('input', renderFavoriUnitesPreview);
favoriDegreInput.addEventListener('input', renderFavoriUnitesPreview);

function refreshFavorisButtonState() {
  favoriAddBtn.disabled = !getToken();
  document.querySelectorAll('.favori-delete-btn').forEach((b) => { b.disabled = !getToken(); });
  document.querySelectorAll('.favori-archive-btn').forEach((b) => { b.disabled = !getToken(); });
}

function applyFavori(fav) {
  applyMode(fav.mode);
  qtyInput.value = fav.mode === 'volume' ? fav.volume : fav.poids;
  qtyInput.dispatchEvent(new Event('input'));
  degreInput.value = fav.degre;
  degreInput.dispatchEvent(new Event('input'));
  entryTypeSelect.value = fav.type;
  entryNoteInput.value = `Favori : ${fav.nom}`;
  renderCalcSummary();
  favorisStatus.textContent = `« ${fav.nom} » appliqué au calculateur ci-dessous — vérifie puis clique Archiver.`;
  favorisStatus.className = 'status ok';
  document.getElementById('calc-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Archivage direct d'un favori (avec fenêtre d'annulation) ──

const favoriArchiveConfirm = document.getElementById('favori-archive-confirm');
const favoriArchiveConfirmText = document.getElementById('favori-archive-confirm-text');
const favoriArchiveUndoBtn = document.getElementById('favori-archive-undo-btn');

let favoriArchiveConfirmTimer = null;
let favoriArchiveConfirmState = null;

function hideFavoriArchiveConfirm() {
  favoriArchiveConfirm.hidden = true;
  favoriArchiveConfirmState = null;
  if (favoriArchiveConfirmTimer) {
    clearTimeout(favoriArchiveConfirmTimer);
    favoriArchiveConfirmTimer = null;
  }
}

function showFavoriArchiveConfirm(fav, entry, state) {
  favoriArchiveConfirmState = state;
  const heure = new Date(entry.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  favoriArchiveConfirmText.textContent = `Archivé : « ${fav.nom} » — ${formatFr(entry.unites, 2)} unité(s) à ${heure}.`;
  favoriArchiveConfirm.hidden = false;
  if (favoriArchiveConfirmTimer) clearTimeout(favoriArchiveConfirmTimer);
  favoriArchiveConfirmTimer = setTimeout(hideFavoriArchiveConfirm, 7000);
}

async function undoWrittenFavoriEntry(id) {
  const token = getToken();
  if (!token) return;
  try {
    await writeData((current) => removeEntry(current, id), { message: 'annulation archivage favori', token });
    detailLoaded = false;
    syntheseLoaded = false;
    renderDetailList();
  } catch (e) {
    favorisStatus.textContent = `Erreur lors de l’annulation : ${e.message}`;
    favorisStatus.className = 'status error';
  }
}

favoriArchiveUndoBtn.addEventListener('click', () => {
  const state = favoriArchiveConfirmState;
  if (!state) return;
  state.cancelled = true;
  if (state.resolved === 'written') {
    undoWrittenFavoriEntry(state.entry.id);
  } else if (state.resolved === 'queued') {
    removePendingEntry(state.entry.id);
    renderPendingStatus();
    renderDetailList();
  }
  favorisStatus.textContent = `Archivage de « ${state.fav.nom} » annulé.`;
  favorisStatus.className = 'status warn';
  hideFavoriArchiveConfirm();
});

function archiveFavoriDirect(fav, btn) {
  const token = getToken();
  if (!token) return;

  const date = new Date();
  const unites = computeUnitesFrom({ mode: fav.mode, volume: fav.volume, poids: fav.poids, degre: fav.degre });
  const entry = buildEntry({
    date,
    unites,
    volume: fav.volume,
    poids: fav.poids,
    degre: fav.degre,
    mode: fav.mode,
    type: fav.type,
    note: `Favori : ${fav.nom}`,
  });

  addToSession(entry.unites);
  renderSession();
  renderAlcoolemie();
  bumpWeekBadge(date, entry.unites);

  const state = { entry, fav, cancelled: false, resolved: null };
  showFavoriArchiveConfirm(fav, entry, state);

  btn.disabled = true;
  writeData(
    (current) => addEntry(current, entry),
    { message: `archivage : ${formatFr(entry.unites, 2)} unités`, token }
  ).then(() => {
    state.resolved = 'written';
    detailLoaded = false;
    syntheseLoaded = false;
    trySyncPending();
    if (state.cancelled) undoWrittenFavoriEntry(entry.id);
  }).catch((e) => {
    if (e instanceof SyncError) {
      state.resolved = 'error';
      if (!state.cancelled) {
        favorisStatus.textContent = `Erreur : ${e.message}`;
        favorisStatus.className = 'status error';
      }
    } else if (!state.cancelled) {
      queueEntry(entry);
      state.resolved = 'queued';
      detailLoaded = false;
      syntheseLoaded = false;
      renderPendingStatus();
    }
  }).finally(() => {
    btn.disabled = !getToken();
  });
}

function renderFavoris() {
  favorisList.innerHTML = '';
  favorisListSummary.textContent = favoris.length > 0
    ? `Mes favoris (${favoris.length})`
    : 'Mes favoris';

  if (favoris.length === 0) {
    const li = document.createElement('li');
    li.className = 'entry-empty';
    li.textContent = 'Aucun favori pour l’instant.';
    favorisList.appendChild(li);
    return;
  }

  favoris.forEach((fav) => {
    const li = document.createElement('li');
    li.className = 'entry-item';

    const qty = fav.mode === 'poids' ? `${formatFr(fav.poids ?? 0, 0)} g` : `${formatFr(fav.volume ?? 0, 0)} cl`;
    const unites = computeUnitesFrom({ mode: fav.mode, volume: fav.volume, poids: fav.poids, degre: fav.degre });

    li.innerHTML = `
      <div class="entry-main">
        <span class="favori-nom">${fav.nom}</span>
        <span class="entry-unites">${formatFr(unites, 2)} unités</span>
      </div>
      <div class="entry-sub">
        <span>${typeLabel(fav.type)}</span>
        <span>${qty} à ${formatFr(fav.degre, 1)}°</span>
      </div>
    `;

    const btnRow = document.createElement('div');
    btnRow.className = 'btn-row';

    const archiveFavBtn = document.createElement('button');
    archiveFavBtn.type = 'button';
    archiveFavBtn.className = 'btn-primary btn-small favori-archive-btn';
    archiveFavBtn.textContent = 'Archiver';
    archiveFavBtn.disabled = !getToken();
    archiveFavBtn.addEventListener('click', () => archiveFavoriDirect(fav, archiveFavBtn));
    btnRow.appendChild(archiveFavBtn);

    const editLink = document.createElement('button');
    editLink.type = 'button';
    editLink.className = 'favori-edit-link';
    editLink.textContent = 'Modifier avant d’archiver';
    editLink.addEventListener('click', () => applyFavori(fav));
    btnRow.appendChild(editLink);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-secondary btn-small btn-danger favori-delete-btn';
    deleteBtn.textContent = 'Supprimer';
    deleteBtn.disabled = !getToken();
    deleteBtn.addEventListener('click', () => deleteFavori(fav.id));
    btnRow.appendChild(deleteBtn);

    li.appendChild(btnRow);
    favorisList.appendChild(li);
  });
}

async function loadFavoris() {
  try {
    const data = await readData();
    favoris = (data && Array.isArray(data.favoris)) ? data.favoris : [];
    favorisLoaded = true;
    renderFavoris();
    // Même lecture réutilisée pour le badge "Cette semaine" (visible sur tous les écrans) —
    // on inclut les conso en attente hors-ligne pour ne pas les sous-compter avant leur sync.
    const entries = (data && Array.isArray(data.entries)) ? data.entries : [];
    const { total } = weekDetail([...entries, ...getPendingEntries()], mondayOf(new Date()));
    renderWeekBadge(total);
  } catch (e) {
    favorisStatus.textContent = `Erreur de lecture des favoris : ${e.message}`;
    favorisStatus.className = 'status error';
  }
}

favoriAddBtn.addEventListener('click', async () => {
  const token = getToken();
  if (!token) return;
  const nom = favoriNomInput.value.trim();
  if (!nom) {
    favorisStatus.textContent = 'Donne un nom au favori avant de l’ajouter.';
    favorisStatus.className = 'status warn';
    return;
  }

  const favori = buildFavori({
    nom,
    mode: favoriMode,
    volume: parseFloat(favoriQtyInput.value) || 0,
    poids: parseFloat(favoriQtyInput.value) || 0,
    degre: parseFloat(favoriDegreInput.value) || 0,
    type: favoriTypeSelect.value,
  });

  favoriAddBtn.disabled = true;
  favorisStatus.textContent = 'Ajout du favori…';
  favorisStatus.className = 'status warn';
  try {
    const result = await writeData(
      (current) => addFavori(current, favori),
      { message: `favori : ${favori.nom}`, token }
    );
    favoris = result.data.favoris;
    renderFavoris();
    favorisStatus.textContent = `Favori « ${favori.nom} » ajouté.`;
    favorisStatus.className = 'status ok';
    favoriNomInput.value = '';
    favoriQtyInput.value = '';
    favoriDegreInput.value = '';
    renderFavoriUnitesPreview();
  } catch (e) {
    favorisStatus.textContent = `Erreur : ${e.message}`;
    favorisStatus.className = 'status error';
  } finally {
    refreshFavorisButtonState();
  }
});

async function deleteFavori(id) {
  const token = getToken();
  if (!token) return;
  const favori = favoris.find((f) => f.id === id);
  const confirmMsg = favori ? `Supprimer le favori « ${favori.nom} » ?` : 'Supprimer ce favori ?';
  if (!confirm(confirmMsg)) return;

  favorisStatus.textContent = 'Suppression…';
  favorisStatus.className = 'status warn';
  try {
    const result = await writeData(
      (current) => removeFavori(current, id),
      { message: 'suppression favori', token }
    );
    favoris = result.data.favoris;
    renderFavoris();
    favorisStatus.textContent = 'Favori supprimé.';
    favorisStatus.className = 'status ok';
  } catch (e) {
    favorisStatus.textContent = `Erreur de suppression : ${e.message}`;
    favorisStatus.className = 'status error';
  }
}

renderFavoriUnitesPreview();
loadFavoris();

onViewChange((name) => {
  if (name === 'calcul' && !favorisLoaded) {
    loadFavoris();
  }
});

// Le badge "Cette semaine" est un compteur en mémoire, jamais décrémenté par un changement fait
// ailleurs (autre appareil, suppression via l'API GitHub) — on le refait à neuf chaque fois que
// l'app revient au premier plan, pour éviter qu'il dérive en silence sur un appareil resté ouvert.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    loadFavoris();
  }
});

// ── Archivage ──

const calcSummaryText = document.getElementById('calc-summary-text');
const replayLastBtn = document.getElementById('replay-last-btn');
const entryDatetimeInput = document.getElementById('entry-datetime');
const entryTypeSelect = document.getElementById('entry-type');
const entryNoteInput = document.getElementById('entry-note');
const archiveBtn = document.getElementById('archive-btn');
const archiveStatus = document.getElementById('archive-status');

const sessionTotalEl = document.getElementById('session-total');
const sessionCountEl = document.getElementById('session-count');
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

replayLastBtn.addEventListener('click', async () => {
  replayLastBtn.disabled = true;
  archiveStatus.textContent = 'Récupération de la dernière consommation…';
  archiveStatus.className = 'status warn';
  try {
    const data = await readData();
    const entries = (data && Array.isArray(data.entries)) ? data.entries : [];
    if (entries.length === 0) {
      archiveStatus.textContent = 'Aucune consommation enregistrée pour l’instant.';
      archiveStatus.className = 'status warn';
      return;
    }
    const [last] = sortEntries(entries, 'desc');
    applyMode(last.mode);
    qtyInput.value = last.mode === 'volume' ? last.volume : last.poids;
    qtyInput.dispatchEvent(new Event('input'));
    degreInput.value = last.degre;
    degreInput.dispatchEvent(new Event('input'));
    entryTypeSelect.value = last.type;
    renderCalcSummary();
    const qtyLabelTxt = last.mode === 'volume' ? `${formatFr(last.volume, 0)} cl` : `${formatFr(last.poids, 0)} g`;
    archiveStatus.textContent = `Dernière conso rechargée : ${typeLabel(last.type)}, ${qtyLabelTxt} à ${formatFr(last.degre, 1)}°. Vérifie la date et archive si ça te va.`;
    archiveStatus.className = 'status';
  } catch (e) {
    archiveStatus.textContent = `Erreur : ${e.message}`;
    archiveStatus.className = 'status error';
  } finally {
    replayLastBtn.disabled = false;
  }
});

function renderSession() {
  const { total, count } = getSession();
  sessionTotalEl.textContent = formatFr(total, 2);
  sessionCountEl.textContent = count > 1 ? `${count} verres` : `${count} verre`;
}

function refreshArchiveButtonState() {
  archiveBtn.disabled = !getToken();
}

function refreshEntryDatetimeMax() {
  entryDatetimeInput.max = toDatetimeLocalValue(new Date());
}

entryDatetimeInput.value = toDatetimeLocalValue(new Date());
refreshEntryDatetimeMax();
renderCalcSummary();
refreshArchiveButtonState();

archiveBtn.addEventListener('click', async () => {
  const token = getToken();
  const date = entryDatetimeInput.value ? new Date(entryDatetimeInput.value) : new Date();
  if (date > new Date()) {
    archiveStatus.textContent = 'La date ne peut pas être dans le futur.';
    archiveStatus.className = 'status error';
    return;
  }
  archiveBtn.disabled = true;
  archiveStatus.textContent = 'Écriture sur GitHub…';
  archiveStatus.className = 'status warn';
  const calcState = getState();
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
  try {
    addToSession(entry.unites);
    renderSession();
    renderAlcoolemie();
    bumpWeekBadge(date, entry.unites);
    await writeData(
      (current) => addEntry(current, entry),
      { message: `archivage : ${formatFr(entry.unites, 2)} unités`, token }
    );
    archiveStatus.textContent = `Archivé : ${formatFr(entry.unites, 2)} unités le ${date.toLocaleString('fr-FR')}.`;
    archiveStatus.className = 'status ok';
    entryNoteInput.value = '';
    entryDatetimeInput.value = toDatetimeLocalValue(new Date());
    detailLoaded = false;
    syntheseLoaded = false;
    trySyncPending();
  } catch (e) {
    if (e instanceof SyncError) {
      archiveStatus.textContent = `Erreur : ${e.message}`;
      archiveStatus.className = 'status error';
    } else {
      queueEntry(entry);
      archiveStatus.textContent = 'Pas de réseau — conso mise en attente (visible dans Journal), sera synchronisée automatiquement dès que possible.';
      archiveStatus.className = 'status warn';
      entryNoteInput.value = '';
      entryDatetimeInput.value = toDatetimeLocalValue(new Date());
      detailLoaded = false;
      syntheseLoaded = false;
      renderPendingStatus();
    }
  } finally {
    refreshArchiveButtonState();
  }
});

const pendingStatusEl = document.getElementById('pending-status');

function renderPendingStatus() {
  const pending = getPendingEntries();
  if (pending.length === 0) {
    pendingStatusEl.hidden = true;
    pendingStatusEl.textContent = '';
    return;
  }
  pendingStatusEl.hidden = false;
  pendingStatusEl.textContent = pending.length > 1
    ? `${pending.length} consommations en attente de synchronisation (visibles dans Journal).`
    : '1 consommation en attente de synchronisation (visible dans Journal).';
}

let syncingPending = false;

async function trySyncPending() {
  if (syncingPending) return;
  const token = getToken();
  if (!token) return;
  const pending = getPendingEntries();
  if (pending.length === 0) return;

  syncingPending = true;
  for (const entry of pending) {
    try {
      await writeData(
        (current) => addEntry(current, entry),
        { message: `archivage (hors-ligne) : ${formatFr(entry.unites, 2)} unités`, token }
      );
      removePendingEntry(entry.id);
      detailLoaded = false;
      syntheseLoaded = false;
    } catch {
      break; // toujours hors-ligne (ou erreur) : on retentera plus tard, l'entrée reste en attente.
    }
  }
  syncingPending = false;
  renderPendingStatus();
  renderDetailList();
}

window.addEventListener('online', trySyncPending);
renderPendingStatus();
trySyncPending();

// ── Alcoolémie ──

const cumulInfoBtn = document.getElementById('cumul-info-btn');
const cumulInfoText = document.getElementById('cumul-info-text');
cumulInfoBtn.addEventListener('click', () => {
  cumulInfoText.hidden = !cumulInfoText.hidden;
});

const alcoolemieInfoBtn = document.getElementById('alcoolemie-info-btn');
const alcoolemieInfoText = document.getElementById('alcoolemie-info-text');
alcoolemieInfoBtn.addEventListener('click', () => {
  alcoolemieInfoText.hidden = !alcoolemieInfoText.hidden;
});

const poidsInput = document.getElementById('poids-input');
const poidsValueEl = document.getElementById('poids-value');
const aMangeCheckbox = document.getElementById('a-mange-checkbox');
const seuilLegalInput = document.getElementById('seuil-legal-input');
const seuilLegalValueEl = document.getElementById('seuil-legal-value');
const tauxHommeEl = document.getElementById('taux-homme');
const tauxFemmeEl = document.getElementById('taux-femme');
const delaiHommeEl = document.getElementById('delai-homme');
const delaiFemmeEl = document.getElementById('delai-femme');

function renderAlcoolemie() {
  const { total } = getSession();
  const poidsKg = parseFloat(poidsInput.value) || 0;
  const seuilLegal = parseFloat(seuilLegalInput.value) || 0;
  poidsValueEl.textContent = formatFr(poidsKg, 0);
  seuilLegalValueEl.textContent = formatFr(seuilLegal, 1);
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

razBtn.addEventListener('click', () => {
  resetSession();
  renderSession();
  renderAlcoolemie();
});

onViewChange((name) => {
  if (name === 'calcul') {
    renderCalcSummary();
    refreshArchiveButtonState();
    refreshEntryDatetimeMax();
  }
  if (name === 'soiree') {
    renderAlcoolemie();
  }
});

renderSession();
renderAlcoolemie();

// ── Journal / historique ──

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

function buildEntryListItem(entry, isPending) {
  const li = document.createElement('li');
  li.className = 'entry-item';

  const qty = entry.mode === 'poids' ? `${formatFr(entry.poids ?? 0, 0)} g` : `${formatFr(entry.volume ?? 0, 0)} cl`;

  li.innerHTML = `
    <div class="entry-main">
      <span class="entry-date">${formatEntryDate(entry.date)}</span>
      <span class="entry-unites">${formatFr(entry.unites, 2)} unités</span>
    </div>
    <div class="entry-sub">
      ${isPending ? '<span class="tag">⏳ en attente</span>' : ''}
      <span>${typeLabel(entry.type)}</span>
      <span>${qty} à ${formatFr(entry.degre, 1)}°</span>
      ${entry.note ? `<span class="entry-note">« ${entry.note} »</span>` : ''}
    </div>
  `;

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'entry-delete-btn';
  if (isPending) {
    deleteBtn.textContent = 'Retirer de la file';
    deleteBtn.addEventListener('click', () => cancelPendingEntry(entry.id));
  } else {
    deleteBtn.textContent = 'Supprimer';
    deleteBtn.disabled = !getToken();
    deleteBtn.addEventListener('click', () => deleteEntry(entry.id));
  }
  li.appendChild(deleteBtn);
  return li;
}

function renderDetailList() {
  const pending = getPendingEntries();
  const pendingIds = new Set(pending.map((e) => e.id));
  const merged = [...detailEntries, ...pending];
  detailList.innerHTML = '';

  if (merged.length === 0) {
    const li = document.createElement('li');
    li.className = 'entry-empty';
    li.textContent = 'Aucune consommation archivée pour l’instant.';
    detailList.appendChild(li);
    return;
  }

  const weeks = groupByWeek(merged);
  const orderedWeeks = detailSortOrder === 'asc' ? [...weeks].reverse() : weeks;

  orderedWeeks.forEach((week, i) => {
    const details = document.createElement('details');
    details.className = 'week-accordion';
    details.open = i === 0;

    const summary = document.createElement('summary');
    summary.innerHTML = `
      <span class="week-accordion-label">Semaine ${isoWeekNumber(week.weekStart)} (du ${formatDateFr(week.weekStart)} au ${formatDateFr(addDays(week.weekStart, 6))})</span>
      <span class="week-accordion-total">${formatFr(week.total, 2)} unités ${iconePourConsoHebdo(week.total)}</span>
    `;
    details.appendChild(summary);

    const ul = document.createElement('ul');
    ul.className = 'entry-list';
    sortEntries(week.entries, detailSortOrder).forEach((entry) => {
      ul.appendChild(buildEntryListItem(entry, pendingIds.has(entry.id)));
    });
    details.appendChild(ul);

    const li = document.createElement('li');
    li.className = 'week-accordion-item';
    li.appendChild(details);
    detailList.appendChild(li);
  });
}

function cancelPendingEntry(id) {
  if (!confirm('Retirer cette consommation en attente ? Elle ne sera jamais archivée.')) return;
  const entry = getPendingEntries().find((e) => e.id === id);
  removePendingEntry(id);
  if (entry) bumpWeekBadge(new Date(entry.date), -entry.unites);
  renderPendingStatus();
  renderDetailList();
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
    renderDetailList();
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
    syntheseLoaded = false;
    if (entry) bumpWeekBadge(new Date(entry.date), -entry.unites);
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

const syntheseSubnav = document.getElementById('synthese-subnav');
const syntheseSubviews = document.querySelectorAll('.subview[data-subview]');

syntheseSubnav.querySelectorAll('[data-subview]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.subview;
    syntheseSubviews.forEach((v) => { v.hidden = v.dataset.subview !== target; });
    syntheseSubnav.querySelectorAll('[data-subview]').forEach((b) => b.classList.toggle('active', b.dataset.subview === target));
  });
});

const periodeButtons = document.querySelectorAll('[data-period]');
const periodePersoBlock = document.getElementById('periode-perso-block');
const periodeDebutInput = document.getElementById('periode-debut');
const periodeFinInput = document.getElementById('periode-fin');
const syntheseRefreshBtn = document.getElementById('synthese-refresh-btn');
const syntheseStatus = document.getElementById('synthese-status');
const syntheseContent = document.getElementById('synthese-content');
const syntheseLegendeBtn = document.getElementById('synthese-legende-btn');
const syntheseLegendeText = document.getElementById('synthese-legende-text');

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

function getPeriodStats() {
  let customStart = null;
  let customEnd = null;
  if (periodeType === 'perso') {
    customStart = periodeDebutInput.value ? new Date(`${periodeDebutInput.value}T00:00:00`) : null;
    customEnd = periodeFinInput.value ? new Date(`${periodeFinInput.value}T23:59:59`) : null;
  }
  const { filtered, start, end } = filterByPeriod(syntheseEntries, periodeType, customStart, customEnd);
  return { stats: computeStats(filtered, start, end), start, end, filtered };
}

const PERIODE_LABELS = {
  annee: 'l’année en cours',
  tout: 'tout l’historique',
  perso: 'la période sélectionnée',
};

function renderSynthese() {
  const { stats, start, end } = getPeriodStats();

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
const bilanGeneralPeriodeTag = document.getElementById('bilan-general-periode-tag');
const bilanGeneralMoyenneValue = document.getElementById('bilan-general-moyenne-value');
const bilanGeneralDetail = document.getElementById('bilan-general-detail');
const bilanGeneralList = document.getElementById('bilan-general-list');
const chartContainer = document.getElementById('chart-container');
const chartJourContainer = document.getElementById('chart-jour-container');
const chartJourPeriodeTag = document.getElementById('chart-jour-periode-tag');
const chartTypeContainer = document.getElementById('chart-type-container');
const chartTypePeriodeTag = document.getElementById('chart-type-periode-tag');

let bilanWeekStart = mondayOf(new Date());

function renderBilanHebdo() {
  const { days, total, maxJour } = weekDetail(syntheseEntries, bilanWeekStart);
  const today = new Date();

  bilanHebdoLabel.textContent = `Semaine ${isoWeekNumber(bilanWeekStart)} (du ${formatDateFr(bilanWeekStart)} au ${formatDateFr(addDays(bilanWeekStart, 6))})`;
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
  const { stats } = getPeriodStats();
  bilanGeneralPeriodeTag.textContent = PERIODE_LABELS[periodeType];
  bilanGeneralMoyenneValue.textContent = stats
    ? `${formatFr(stats.consoHebdoMoy, 2)} U ${iconePourConsoHebdo(stats.consoHebdoMoy)}`
    : '—';
  bilanGeneralDetail.textContent = stats
    ? `${formatFr(stats.totalUnites, 2)} unités sur ${formatFr(stats.nbSemaines, 1)} semaine(s)`
    : '—';

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
        <span class="entry-date">Semaine ${isoWeekNumber(w.weekStart)} (du ${formatDateFr(w.weekStart)} au ${formatDateFr(addDays(w.weekStart, 6))})</span>
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

function renderChartJour() {
  const { filtered } = getPeriodStats();
  chartJourPeriodeTag.textContent = PERIODE_LABELS[periodeType];
  const svg = categoryBarChartSvg(statsParJourSemaine(filtered || []));
  chartJourContainer.innerHTML = svg || '<p class="entry-empty">Pas encore assez de données sur cette période.</p>';
}

function renderChartType() {
  const { filtered } = getPeriodStats();
  chartTypePeriodeTag.textContent = PERIODE_LABELS[periodeType];
  const data = statsParType(filtered || []).map((d) => ({ label: typeLabel(d.type), total: d.total }));
  const svg = categoryBarChartSvg(data);
  chartTypeContainer.innerHTML = svg || '<p class="entry-empty">Pas encore assez de données sur cette période.</p>';
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
    renderChartJour();
    renderChartType();
    renderStreaks();
  } catch (e) {
    syntheseStatus.textContent = `Erreur de lecture : ${e.message}`;
    syntheseStatus.className = 'status error';
  }
}

function onPeriodeChange() {
  renderSynthese();
  renderBilanGeneral();
  renderChartJour();
  renderChartType();
}

periodeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    periodeType = btn.dataset.period;
    periodeButtons.forEach((b) => b.classList.toggle('active', b.dataset.period === periodeType));
    periodePersoBlock.hidden = periodeType !== 'perso';
    onPeriodeChange();
  });
});

periodeDebutInput.addEventListener('change', onPeriodeChange);
periodeFinInput.addEventListener('change', onPeriodeChange);

syntheseRefreshBtn.addEventListener('click', loadSynthese);

syntheseLegendeBtn.addEventListener('click', () => {
  syntheseLegendeText.hidden = !syntheseLegendeText.hidden;
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
  refreshFavorisButtonState();
  refreshConnBadge();
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
    favorisLoaded = false;
  } catch (e) {
    exportImportStatus.textContent = `Erreur d’import : ${e.message}`;
    exportImportStatus.className = 'status error';
  } finally {
    importBtn.disabled = !getToken() || !pendingImportData;
  }
});

// ── Réinitialisation ──

const resetRevealBtn = document.getElementById('reset-reveal-btn');
const resetConfirmBlock = document.getElementById('reset-confirm-block');
const resetWarningText = document.getElementById('reset-warning-text');
const resetAckExport = document.getElementById('reset-ack-export');
const resetConfirmInput = document.getElementById('reset-confirm-input');
const resetConfirmBtn = document.getElementById('reset-confirm-btn');
const resetCancelBtn = document.getElementById('reset-cancel-btn');
const resetStatus = document.getElementById('reset-status');
const RESET_CONFIRM_WORD = 'EFFACER';

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
    syntheseLoaded = false;
    favorisLoaded = false;
    renderWeekBadge(0);
    closeResetConfirm();
  } catch (e) {
    resetStatus.textContent = `Erreur : ${e.message}`;
    resetStatus.className = 'status error';
  } finally {
    refreshResetButtonState();
  }
});

refreshTokenStatus();
