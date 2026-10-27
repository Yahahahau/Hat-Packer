import { writable, get } from 'svelte/store';

// UI button click sounds. Files live in public/assets/sounds/ui/ (relative path -> works under any base path).
const SOUND_DIR = 'assets/sounds/ui';
const FILES = {
    normal: 'ui-click-one.mp3',   // ordinary buttons
    primary: 'ui-click-2.mp3',    // main actions (Add PNGs, Generate ...)
    danger: 'ui-click-3.mp3',     // delete / clear
    menu: 'ui-click-4.mp3',       // menu entries, close buttons, small flat buttons
};
type Kind = keyof typeof FILES;

const KEY = 'hatpacker.sound';
function loadEnabled(): boolean {
    try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; }
}
export const soundEnabled = writable<boolean>(loadEnabled());
soundEnabled.subscribe((v) => { try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch (e) {} });

const cache: Partial<Record<Kind, HTMLAudioElement>> = {};
function base(kind: Kind): HTMLAudioElement {
    let a = cache[kind];
    if(!a) {
        a = new Audio(`${SOUND_DIR}/${FILES[kind]}`);
        a.preload = 'auto';
        cache[kind] = a;
    }
    return a;
}

function kindOf(btn: HTMLElement): Kind {
    if(btn.classList.contains('btn-danger') || btn.classList.contains('menu-danger')) return 'danger';
    if(btn.classList.contains('btn-primary')) return 'primary';
    if(btn.classList.contains('btn-flat') || btn.closest('[role=menu]') || btn.closest('.modal-footer')) return 'menu';
    return 'normal';
}

export function playUiSound(kind: Kind = 'normal') {
    if(!get(soundEnabled)) return;
    try {
        const a = base(kind).cloneNode(true) as HTMLAudioElement; // clone so quick taps can overlap
        a.volume = 0.6;
        const p = a.play();
        if(p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* sound is optional */ }
}

export function initUiSounds() {
    // one listener for every button; runs on the real click, so disabled buttons stay silent
    document.addEventListener('click', (e) => {
        const t = e.target as HTMLElement | null;
        const btn = t && t.closest ? (t.closest('button') as HTMLButtonElement | null) : null;
        if(!btn || btn.disabled) return;
        playUiSound(kindOf(btn));
    }, true);
    (['normal', 'primary', 'danger', 'menu'] as Kind[]).forEach(base); // preload
}
