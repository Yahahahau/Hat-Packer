// Light ("Lavender Desk") is the default look; dark is the same design on ink. The choice is remembered.
const KEY = 'hatpacker.theme';
export type Theme = 'light' | 'dark';

export function getTheme(): Theme
{
    try { if(localStorage.getItem(KEY) === 'dark') return 'dark'; } catch (e) { /* blocked storage */ }
    return 'light';
}

export function applyTheme(t: Theme)
{
    // body + html both carry the class so the page background never mismatches
    document.documentElement.classList.toggle('light-mode', t === 'light');
    document.body.classList.toggle('light-mode', t === 'light');
    try { localStorage.setItem(KEY, t); } catch (e) { /* optional */ }
}

export function initTheme() { applyTheme(getTheme()); }
