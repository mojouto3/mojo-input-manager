const STORAGE_KEY = 'mim-theme';

export function getTheme() {
  return localStorage.getItem(STORAGE_KEY) === 'cyan' ? 'cyan' : 'green';
}

export function setTheme(theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  document.documentElement.dataset.theme = theme;
}

export function applyStoredTheme() {
  document.documentElement.dataset.theme = getTheme();
}
