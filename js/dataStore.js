// Module isolé : forme canonique des données et construction des entrées.
// Rien ici ne parle au réseau (voir githubSync.js pour ça).

export function ensureShape(data) {
  if (data && typeof data === 'object' && Array.isArray(data.entries)) {
    return { ...data, favoris: Array.isArray(data.favoris) ? data.favoris : [] };
  }
  return { version: 1, entries: [], favoris: [] };
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

export function buildFavori({ nom, mode, volume, poids, degre, type }) {
  return {
    id: (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    nom: nom.trim(),
    mode,
    volume: mode === 'volume' ? volume : null,
    poids: mode === 'poids' ? poids : null,
    degre,
    type: type || 'autre',
  };
}

export function addFavori(current, favori) {
  const base = ensureShape(current);
  return {
    ...base,
    updatedAt: new Date().toISOString(),
    favoris: [...base.favoris, favori],
  };
}

export function removeFavori(current, id) {
  const base = ensureShape(current);
  return {
    ...base,
    updatedAt: new Date().toISOString(),
    favoris: base.favoris.filter((f) => f.id !== id),
  };
}
