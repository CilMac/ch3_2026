// Module isolé : calcul des statistiques agrégées (logique pure, pas de DOM ni de réseau).

function dateKey(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function diffDaysInclusive(start, end) {
  const MS_DAY = 86400000;
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endDay - startDay) / MS_DAY) + 1;
}

const round2 = (n) => Math.round(n * 100) / 100;
const round1 = (n) => Math.round(n * 10) / 10;

export function filterByPeriod(entries, periodType, customStart, customEnd) {
  if (entries.length === 0) return { filtered: [], start: null, end: null };
  const now = new Date();

  if (periodType === 'annee') {
    const year = now.getFullYear();
    const filtered = entries.filter((e) => new Date(e.date).getFullYear() === year);
    if (filtered.length === 0) return { filtered: [], start: null, end: null };
    const firstDate = new Date(Math.min(...filtered.map((e) => new Date(e.date).getTime())));
    return { filtered, start: firstDate, end: now };
  }

  if (periodType === 'perso') {
    if (!customStart || !customEnd) return { filtered: [], start: null, end: null };
    const filtered = entries.filter((e) => {
      const d = new Date(e.date);
      return d >= customStart && d <= customEnd;
    });
    return { filtered, start: customStart, end: customEnd };
  }

  // 'tout'
  const firstDate = new Date(Math.min(...entries.map((e) => new Date(e.date).getTime())));
  return { filtered: entries, start: firstDate, end: now };
}

export function computeStats(entries, periodStart, periodEnd) {
  if (entries.length === 0 || !periodStart || !periodEnd) return null;

  const totalUnites = round2(entries.reduce((s, e) => s + e.unites, 0));
  const nbSaisies = entries.length;

  const parJour = {};
  entries.forEach((e) => {
    const k = dateKey(e.date);
    parJour[k] = (parJour[k] || 0) + e.unites;
  });
  const nbJoursConso = Object.keys(parJour).length;

  let maxJourKey = null;
  let maxJourVal = 0;
  for (const [k, v] of Object.entries(parJour)) {
    if (v >= maxJourVal) { maxJourVal = v; maxJourKey = k; }
  }

  const nbJoursDepuisDebut = Math.max(1, diffDaysInclusive(periodStart, periodEnd));
  const tauxJoursAvecConso = round1((nbJoursConso / nbJoursDepuisDebut) * 100);
  const nbSemaines = round1(nbJoursDepuisDebut / 7);
  const consoHebdoMoy = nbSemaines > 0 ? round2(totalUnites / nbSemaines) : 0;

  return {
    totalUnites,
    nbSaisies,
    nbJoursConso,
    tauxJoursAvecConso,
    nbSemaines,
    consoHebdoMoy,
    maxJour: round2(maxJourVal),
    maxJourDate: maxJourKey,
    nbJoursDepuisDebut,
  };
}

export const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export function statsParJourSemaine(entries) {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  entries.forEach((e) => {
    const jsDay = new Date(e.date).getDay(); // 0 = dimanche .. 6 = samedi
    const idx = jsDay === 0 ? 6 : jsDay - 1; // 0 = lundi .. 6 = dimanche
    totals[idx] = round2(totals[idx] + e.unites);
  });
  return JOURS_SEMAINE.map((label, i) => ({ label, total: totals[i] }));
}

export function statsParType(entries) {
  const totals = {};
  entries.forEach((e) => {
    const type = e.type || 'autre';
    totals[type] = round2((totals[type] || 0) + e.unites);
  });
  return Object.entries(totals)
    .map(([type, total]) => ({ type, total }))
    .sort((a, b) => b.total - a.total);
}
