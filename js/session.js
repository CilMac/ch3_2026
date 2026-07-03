// Module isolé : cumul de session (en mémoire, non persisté), utilisé pour
// préparer le futur calcul d'alcoolémie (lot ultérieur). Sans lien avec
// l'archivage permanent dans data.json.

const session = { total: 0, count: 0 };

export function getSession() {
  return { ...session };
}

export function addToSession(unites) {
  session.total = Math.round((session.total + unites) * 100) / 100;
  session.count += 1;
  return getSession();
}

export function resetSession() {
  session.total = 0;
  session.count = 0;
  return getSession();
}
