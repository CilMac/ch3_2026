// Module isolé : forme canonique des données et construction des entrées.
// Rien ici ne parle au réseau (voir githubSync.js pour ça).

export function ensureShape(data) {
  if (data && typeof data === 'object' && Array.isArray(data.entries)) {
    return data;
  }
  return { version: 1, entries: [] };
}

export function buildEntry({ date, unites, volume, poids, degre, mode, type, note }) {
  return {
    id: (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date: date.toISOString(),
    unites,
    mode,
    volume: mode === 'volume' ? volume : null,
    poids: mode === 'poids' ? poids : null,
    degre,
    type: type || 'autre',
    note: note ? note.trim() : '',
  };
}

// utilisé pour valider un fichier avant import (voir écran Configuration)
export function isValidDataShape(data) {
  return !!data && typeof data === 'object' && Array.isArray(data.entries);
}

export function addEntry(current, entry) {
  const base = ensureShape(current);
  return {
    ...base,
    updatedAt: new Date().toISOString(),
    entries: [...base.entries, entry],
  };
}
