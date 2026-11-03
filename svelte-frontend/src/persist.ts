import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';

// A store whose value is remembered in localStorage. Every access is wrapped in try/catch because
// storage can be blocked or empty (private windows, in-app browsers); the app works without it.
export function persisted<T>(key: string, initial: T): Writable<T>
{
    const k = 'hatpacker.ui.' + key;
    let start = initial;
    try {
        const raw = localStorage.getItem(k);
        if(raw !== null) start = JSON.parse(raw) as T;
    } catch (e) { /* use the default */ }
    const store = writable<T>(start);
    store.subscribe((v) => {
        try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* optional */ }
    });
    return store;
}
