// Module isolé : file d'attente locale (localStorage) des consommations archivées
// hors-ligne, en attente de synchronisation avec data/data.json.

const QUEUE_KEY = 'ch3_pending_entries';

export function getPendingEntries() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(entries) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(entries));
}

export function queueEntry(entry) {
  saveQueue([...getPendingEntries(), entry]);
}

export function removePendingEntry(id) {
  saveQueue(getPendingEntries().filter((e) => e.id !== id));
}
