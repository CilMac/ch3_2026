// Module isolé : logique pure du calcul d'unités d'alcool.
// 1 unité = 10 g d'alcool pur. Densité éthanol = 0,8.

const state = {
  mode: 'volume', // 'volume' | 'poids'
  volume: 25,     // cl
  poids: 0,       // g
  degre: 12,
};

export function getState() {
  return { ...state, unites: computeUnites() };
}

export function computeUnitesFrom({ mode, volume, poids, degre }) {
  const unites = mode === 'volume'
    ? (volume * degre * 0.8) / 100
    : (poids * degre) / 1000;
  return Math.round(unites * 100) / 100;
}

export function computeUnites() {
  return computeUnitesFrom(state);
}

export function setMode(mode) {
  state.mode = mode === 'poids' ? 'poids' : 'volume';
}

export function setVolume(v) {
  state.volume = Math.max(0, v);
}

export function setPoids(p) {
  state.poids = Math.max(0, p);
}

export function setDegre(d) {
  state.degre = Math.max(0, d);
}

export function formatFr(nb, decimals = 2) {
  return nb.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
