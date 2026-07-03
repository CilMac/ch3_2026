// Module isolé : estimation du taux d'alcoolémie (formule de Widmark simplifiée),
// à partir du cumul de session (session.js). Indicatif uniquement.

const R_HOMME = 0.7;
const R_FEMME = 0.6;
const VIT_ELIM_HOMME = 0.125; // g/L par heure
const VIT_ELIM_FEMME = 0.092; // g/L par heure
const DELAI_PIC_A_JEUN = 30;  // minutes
const DELAI_PIC_REPAS = 60;   // minutes

const round2 = (n) => Math.round(n * 100) / 100;

export function tauxAlcoolemie(unitesCumulees, poidsKg, r) {
  if (poidsKg <= 0) return 0;
  return round2((unitesCumulees * 10) / (poidsKg * r));
}

// retourne le délai total en minutes avant de repasser sous le seuil (0 si déjà sous le seuil)
export function delaiRetourSeuil(taux, seuilLegal, vitElim, aMange) {
  const diff = taux - seuilLegal;
  if (diff <= 0) return 0;
  const delaiPic = aMange ? DELAI_PIC_REPAS : DELAI_PIC_A_JEUN;
  return Math.round((60 * diff) / vitElim) + delaiPic;
}

export function formatDelai(minutes) {
  if (minutes <= 0) return 'Aucun :-)';
  const h = Math.floor(minutes / 60);
  const m = minutes - h * 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function calculAlcoolemie({ unitesCumulees, poidsKg, aMange, seuilLegal }) {
  const tauxHomme = tauxAlcoolemie(unitesCumulees, poidsKg, R_HOMME);
  const tauxFemme = tauxAlcoolemie(unitesCumulees, poidsKg, R_FEMME);
  return {
    tauxHomme,
    tauxFemme,
    delaiHomme: delaiRetourSeuil(tauxHomme, seuilLegal, VIT_ELIM_HOMME, aMange),
    delaiFemme: delaiRetourSeuil(tauxFemme, seuilLegal, VIT_ELIM_FEMME, aMange),
  };
}
