import { writable } from 'svelte/store';

// "Device" is a layout/density preference only. It never limits features and never touches project data.
export type DeviceChoice = 'phone' | 'tablet' | 'desktop' | 'auto';
export type LayoutClass = 'phone' | 'tablet' | 'desktop';

const KEY = 'hatpacker.device';
const VALID: DeviceChoice[] = ['phone', 'tablet', 'desktop', 'auto'];

// The choice is saved in localStorage AND in a long-lived cookie, so it still survives on browsers
// where one of the two is blocked or cleared separately (some in-app / privacy browsers).
function fromStore(): string | null {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
}
function fromCookie(): string | null {
    try {
        const m = document.cookie.match(new RegExp('(?:^|; )' + KEY.replace('.', '\\.') + '=([^;]*)'));
        return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
}
function save(v: string) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* optional */ }
    try { document.cookie = `${KEY}=${encodeURIComponent(v)}; max-age=31536000; path=/; SameSite=Lax`; } catch (e) { /* optional */ }
}

function read(): DeviceChoice | null {
    const v = (fromStore() ?? fromCookie()) as DeviceChoice | null;
    return v && VALID.includes(v) ? v : null;
}

// null = nothing chosen yet (show Welcome)
export const deviceChoice = writable<DeviceChoice | null>(read());
export const layoutClass = writable<LayoutClass>('desktop');

// Breakpoints (viewport width, px). The real viewport decides the structure; the chosen device
// only changes density / touch-size tokens (see styles.css).
export const BP_PHONE = 640;    // below: phone layout
export const BP_DESKTOP = 1024; // from here: desktop layout (side tool panel)

// A phone held sideways is wider than 640px but only ~320-430px tall: it still gets the phone layout.
export const PHONE_LANDSCAPE_MAX_H = 480;
function classify(w: number, h: number): LayoutClass {
    if(w < BP_PHONE || (h <= PHONE_LANDSCAPE_MAX_H && w < BP_DESKTOP)) return 'phone';
    return w < BP_DESKTOP ? 'tablet' : 'desktop';
}

export function initLayout() {
    const root = document.documentElement;
    const apply = () => {
        const c = classify(window.innerWidth, window.innerHeight);
        root.dataset.layout = c;
        root.dataset.orient = window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
        layoutClass.set(c);
    };
    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    deviceChoice.subscribe((v) => {
        root.dataset.device = v ?? 'auto';
        if(v !== null) save(v);
    });
}
