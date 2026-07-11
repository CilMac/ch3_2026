// Module isolé : tous les appels à l'API GitHub Contents passent par ici.
// Le reste de l'appli ne connaît que readData() / writeData().

import { getToken } from './config.js';

const OWNER = 'CilMac';
const REPO = 'ch3_2026';
const BRANCH = 'main';
const DATA_PATH = 'data/data.json';
const CONTENTS_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${DATA_PATH}`;

export class SyncError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
    this.cause = cause;
  }
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function base64ToUtf8(b64) {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

// Récupère le contenu courant + son sha (nécessaire pour toute écriture).
// token facultatif : sans token, lecture publique non authentifiée (limite 60 req/h).
async function fetchContents(token) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${CONTENTS_URL}?ref=${BRANCH}`, { headers, cache: 'no-store' });

  if (res.status === 404) {
    return { data: null, sha: null };
  }
  if (res.status === 401 || res.status === 403) {
    const message = token
      ? `Jeton invalide, expiré, ou droits insuffisants (HTTP ${res.status})`
      : `Accès refusé par GitHub sans jeton (HTTP ${res.status}) — probablement la limite de requêtes anonymes (60/h) atteinte, pas un problème de jeton.`;
    throw new SyncError('AUTH_FAILED', message, await safeJson(res));
  }
  if (!res.ok) {
    const body = await safeJson(res);
    throw new SyncError('READ_FAILED', `Lecture impossible (HTTP ${res.status})`, body);
  }

  const json = await res.json();
  const text = base64ToUtf8(json.content);
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new SyncError('PARSE_FAILED', 'data.json existant mais illisible (JSON invalide)', e);
  }
  return { data, sha: json.sha };
}

// Lecture publique par défaut (60 req/h anonymes) ; utilise le jeton configuré s'il y en a un
// (5000 req/h authentifiées). Si ce jeton s'avère invalide/expiré, on retente une fois en
// anonyme plutôt que d'échouer — la lecture reste publique par nature, un jeton cassé ne doit
// pas la bloquer.
export async function readData() {
  const token = getToken();
  try {
    const { data } = await fetchContents(token || null);
    return data;
  } catch (e) {
    if (token && e instanceof SyncError && e.code === 'AUTH_FAILED') {
      const { data } = await fetchContents(null);
      return data;
    }
    throw e;
  }
}

// Écriture avec gestion du conflit de version (sha obsolète) :
// updaterFn reçoit les données actuelles (ou null si le fichier n'existe pas encore)
// et retourne les nouvelles données à écrire. En cas de conflit (409/422 lié au sha),
// on relit la dernière version et on rejoue updaterFn dessus avant de réessayer.
export async function writeData(updaterFn, { message, token, maxRetries = 3 } = {}) {
  if (!token) {
    throw new SyncError('NO_TOKEN', "Aucun jeton d'accès configuré sur cet appareil.");
  }

  let lastConflict = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { data: current, sha } = await fetchContents(token);
    const nextData = updaterFn(current);

    const body = {
      message: message || 'maj data.json',
      content: utf8ToBase64(JSON.stringify(nextData, null, 2) + '\n'),
      branch: BRANCH,
    };
    if (sha) body.sha = sha;

    const res = await fetch(CONTENTS_URL, {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const json = await res.json();
      return { data: nextData, sha: json.content.sha, commitUrl: json.commit && json.commit.html_url };
    }

    if (res.status === 409 || res.status === 422) {
      // sha périmé : une autre écriture a eu lieu entre-temps -> on relit et on retente.
      lastConflict = new SyncError('CONFLICT', `Conflit de version détecté (tentative ${attempt + 1}/${maxRetries + 1})`);
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      throw new SyncError('AUTH_FAILED', `Jeton invalide, expiré, ou droits insuffisants (HTTP ${res.status})`, await safeJson(res));
    }

    throw new SyncError('WRITE_FAILED', `Écriture impossible (HTTP ${res.status})`, await safeJson(res));
  }

  throw new SyncError('CONFLICT_EXHAUSTED', 'Trop de conflits successifs, écriture abandonnée — réessaie.', lastConflict);
}
