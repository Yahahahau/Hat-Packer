import { writable } from 'svelte/store';

// "Device" is a layout/density preference only. It never limits features and never touches project data.
export type DeviceChoice = 'phone' | 'tablet' | 'desktop' | 'auto';
export type LayoutClass = 'phone' | 'tablet' | 'desktop';

const KEY = 'hatpacker.device';
const VALID: DeviceChoice[] = ['phone', 'tablet', 'desktop', 'auto'];

function read(): DeviceChoice | null {
    try {
        const v = localStorage.getItem(KEY) as DeviceChoice | null;
        return v && VALID.includes(v) ? v : null;
    } catch (e) {
        return null; // storage blocked: the Welcome page is shown and the choice just lives in memory
    }
}

// null = nothing chosen yet (show Welcome)
export const deviceChoice = writable<DeviceChoice | null>(read());
export const layoutClass = writable<LayoutClass>('desktop');

// Breakpoints (viewport width, px). The real viewport decides the structure; the chosen device
// only changes density / touch-size tokens (see styles.css).
export const BP_PHONE = 640;    // below: phone layout
export const BP_DESKTOP = 1024; // from here: desktop layout (side tool panel)

function classify(w: number): LayoutClass {
    return w < BP_PHONE ? 'phone' : (w < BP_DESKTOP ? 'tablet' : 'desktop');
}

export function initLayout() {
    const root = document.documentElement;
    const apply = () => {
        const c = classify(window.innerWidth);
        root.dataset.layout = c;
        root.dataset.orient = window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
        layoutClass.set(c);
    };
    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    deviceChoice.subscribe((v) => {
        root.dataset.device = v ?? 'auto';
        if(v !== null) {
            try { localStorage.setItem(KEY, v); } catch (e) { /* optional */ }
        }
    });
}
