// Module isolé : seuils métier (repères officiels), centralisés pour être faciles
// à auditer/ajuster plutôt que dispersés dans chaque écran.

export const CONSO_SEMAINE_MAX = 10;   // unités / semaine
export const TOLERANCE = 0.1;          // 10 % de dépassement toléré
export const CONSO_JOUR_MAX_TOLEREE = 4; // unités / occasion
export const JOURS_CONSECUTIFS_SANS = 2; // jours sans conso recommandés

export const ICONES = {
  super: '👍',
  bien: '😇',
  moyen: '🤔',
  mauvais: '😡',
};

export function iconePourConsoHebdo(consoHebdoMoy) {
  const toleree = CONSO_SEMAINE_MAX * (1 + TOLERANCE);
  if (consoHebdoMoy < CONSO_SEMAINE_MAX / 2) return ICONES.super;
  if (consoHebdoMoy <= CONSO_SEMAINE_MAX) return ICONES.bien;
  if (consoHebdoMoy <= toleree) return ICONES.moyen;
  return ICONES.mauvais;
}

export function iconePourConsoJour(maxJour) {
  return maxJour <= CONSO_JOUR_MAX_TOLEREE ? ICONES.bien : ICONES.mauvais;
}
