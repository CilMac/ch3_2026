// Config locale à cet appareil : jeton GitHub + nom d'appareil.
// Tout est en localStorage, jamais committé, jamais transmis ailleurs qu'à l'API GitHub.

const TOKEN_KEY = 'ch3_github_token';
const DEVICE_KEY = 'ch3_device_label';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getDeviceLabel() {
  return localStorage.getItem(DEVICE_KEY) || '';
}

export function setDeviceLabel(label) {
  if (label) localStorage.setItem(DEVICE_KEY, label);
  else localStorage.removeItem(DEVICE_KEY);
}

// Pour affichage de confirmation sans jamais réafficher le jeton en clair.
export function maskToken(token) {
  if (!token) return '';
  if (token.length <= 8) return '••••';
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}
