// Module isolé : séries de jours consécutifs sans consommation.
// La recherche ne remonte jamais avant la toute première saisie (avant ça, ce n'est
// pas "sans conso", c'est juste "pas encore suivi").

function dateOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function dayKey(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toDaySet(entries) {
  const set = new Set();
  entries.forEach((e) => set.add(dayKey(dateOnly(new Date(e.date)))));
  return set;
}

function firstTrackedDay(entries) {
  return dateOnly(new Date(Math.min(...entries.map((e) => new Date(e.date).getTime()))));
}

// jours consécutifs sans conso, en remontant depuis aujourd'hui (0 si conso saisie aujourd'hui)
export function currentStreak(entries, today = new Date()) {
  if (entries.length === 0) return 0;
  const daysWithConso = toDaySet(entries);
  const first = firstTrackedDay(entries);
  let streak = 0;
  let cursor = dateOnly(today);
  while (cursor >= first) {
    if (daysWithConso.has(dayKey(cursor))) break;
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

// plus longue série jamais enregistrée, de la première saisie à aujourd'hui
export function longestStreak(entries, today = new Date()) {
  if (entries.length === 0) return 0;
  const daysWithConso = toDaySet(entries);
  const first = firstTrackedDay(entries);
  const last = dateOnly(today);
  let longest = 0;
  let run = 0;
  let cursor = first;
  while (cursor <= last) {
    if (daysWithConso.has(dayKey(cursor))) {
      run = 0;
    } else {
      run++;
      if (run > longest) longest = run;
    }
    cursor = addDays(cursor, 1);
  }
  return longest;
}
