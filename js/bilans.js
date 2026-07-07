// Module isolé : découpage par semaine (lundi-dimanche) et logique associée.
// Le regroupement se fait par "lundi de la semaine" (date réelle) plutôt que par
// numéro de semaine ISO, pour éviter les écarts de calcul de semaine selon la
// plateforme (bug documenté dans l'ancienne appli iOS entre Mac et iPhone).

const round2 = (n) => Math.round(n * 100) / 100;

function dateOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function mondayOf(date) {
  const d = dateOnly(date);
  const day = d.getDay(); // 0 = dimanche .. 6 = samedi
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function isSameDay(a, b) {
  return dateOnly(a).getTime() === dateOnly(b).getTime();
}

function weekKey(date) {
  const m = mondayOf(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${m.getFullYear()}-${pad(m.getMonth() + 1)}-${pad(m.getDate())}`;
}

export function groupByWeek(entries) {
  const map = new Map();
  entries.forEach((e) => {
    const d = new Date(e.date);
    const key = weekKey(d);
    if (!map.has(key)) map.set(key, { weekStart: mondayOf(d), total: 0, entries: [] });
    const bucket = map.get(key);
    bucket.total = round2(bucket.total + e.unites);
    bucket.entries.push(e);
  });
  return [...map.values()].sort((a, b) => b.weekStart - a.weekStart);
}

export function weekDetail(entries, weekStart) {
  const start = dateOnly(weekStart);
  const days = [];
  for (let i = 0; i < 7; i++) {
    days.push({ date: addDays(start, i), total: 0 });
  }
  entries.forEach((e) => {
    const d = dateOnly(new Date(e.date));
    const diffDays = Math.round((d - start) / 86400000);
    if (diffDays >= 0 && diffDays < 7) {
      days[diffDays].total = round2(days[diffDays].total + e.unites);
    }
  });
  const total = round2(days.reduce((s, d) => s + d.total, 0));
  const maxJour = Math.max(...days.map((d) => d.total));
  return { days, total, maxJour };
}

// 'oui' | 'non' | 'indetermine'
export function deuxJoursConsecutifsSans(days, today) {
  const etats = days.map((d) => {
    if (dateOnly(d.date) > dateOnly(today)) return 'inconnu';
    return d.total === 0 ? 'sans' : 'avec';
  });
  for (let i = 1; i < etats.length; i++) {
    if (etats[i] === 'sans' && etats[i - 1] === 'sans') return 'oui';
  }
  return etats.includes('inconnu') ? 'indetermine' : 'non';
}
