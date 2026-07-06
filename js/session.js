// Module isolé : cumul de session (en mémoire, non persisté), utilisé pour le
// calcul d'alcoolémie. Alimenté automatiquement dès qu'une conso est archivée
// (voir archiveBtn dans app.js), avant même la tentative d'écriture réseau —
// l'estimation d'alcoolémie doit rester à jour même si l'écriture échoue ou
// est mise en attente (hors-ligne). Pas de bouton de cumul manuel séparé.

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
