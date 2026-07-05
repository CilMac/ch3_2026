// Module isolé : tri et formatage des entrées (logique pure, pas de DOM ni de réseau).

const TYPE_LABELS = {
  biere: 'Bière',
  vin: 'Vin',
  sake: 'Saké',
  spiritueux: 'Spiritueux',
  autre: 'Autre',
};

export function typeLabel(type) {
  return TYPE_LABELS[type] || 'Autre';
}

export function sortEntries(entries, order = 'desc') {
  const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
  return order === 'desc' ? sorted.reverse() : sorted;
}

export function removeEntry(current, id) {
  const entries = (current && Array.isArray(current.entries)) ? current.entries : [];
  return {
    ...current,
    updatedAt: new Date().toISOString(),
    entries: entries.filter((e) => e.id !== id),
  };
}
