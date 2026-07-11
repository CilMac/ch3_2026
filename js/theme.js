// Thème visuel (préférence d'appareil, jamais dans data/data.json).
// "classique" est le défaut pour un appareil sans préférence enregistrée ; "washi" reste
// disponible et redevient actif si l'utilisateur le sélectionne (choix mémorisé ensuite).

const THEME_KEY = 'ch3_theme';

export function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'classique';
}

export function setTheme(name) {
  localStorage.setItem(THEME_KEY, name);
  document.documentElement.setAttribute('data-theme', name);
}

export function toggleTheme() {
  const next = getTheme() === 'washi' ? 'classique' : 'washi';
  setTheme(next);
  return next;
}
