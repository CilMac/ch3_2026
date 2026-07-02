import { getToken, setToken, clearToken, getDeviceLabel, setDeviceLabel, maskToken } from './config.js';
import { readData, writeData } from './githubSync.js';

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

refreshTokenStatus();
