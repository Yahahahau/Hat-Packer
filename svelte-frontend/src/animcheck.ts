// Plays the checkbox animation (CSS in public/global.css) when a checkbox changes.
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function playCheck(el: HTMLInputElement) {
    if(!el || reduced()) return;
    const r = el.getBoundingClientRect();
    if(r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) return; // hidden / off-screen: just snap
    el.classList.remove('ck-play-on', 'ck-play-off');
    void el.offsetWidth; // restart the animation if it was still running
    el.classList.add(el.checked ? 'ck-play-on' : 'ck-play-off');
    // safety net: whatever happens, go back to the still image (checked / unchecked) after the animation
    window.setTimeout(() => el.classList.remove('ck-play-on', 'ck-play-off'), 700);
}

export function initAnimatedChecks() {
    document.addEventListener('change', (e) => {
        const t = e.target as HTMLInputElement | null;
        if(t && t.tagName === 'INPUT' && t.type === 'checkbox') playCheck(t);
    }, true);
    document.addEventListener('animationend', (e) => {
        const t = e.target as HTMLElement;
        if(t && t.classList && (t.classList.contains('ck-play-on') || t.classList.contains('ck-play-off'))) {
            t.classList.remove('ck-play-on', 'ck-play-off');
        }
    }, true);
}
