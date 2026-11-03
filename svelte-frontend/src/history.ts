import { writable, get } from 'svelte/store';
import { spriteframes, spritesheet_map } from './stores';
import type { SpriteFrameData } from './spriteframedata';

// Undo / Redo for everything that changes the frame list (import, delete, clone, order, prefix, XML edits).
// A snapshot is the frame list (cloned frame objects; File references are shared, not copied) plus
// the spritesheet usage map. Selection-only changes are not part of the history.
type Snap = { frames: SpriteFrameData[]; sheets: Map<string, [string, number]>; label: string };

const LIMIT = 40;
let past: Snap[] = [];
let future: Snap[] = [];
let pending: Snap | null = null;

export const historyState = writable({ canUndo: false, canRedo: false, undoLabel: '', redoLabel: '' });

function publish()
{
    historyState.set({
        canUndo: past.length > 0,
        canRedo: future.length > 0,
        undoLabel: past.length ? past[past.length - 1].label : '',
        redoLabel: future.length ? future[future.length - 1].label : '',
    });
}

function snap(label: string): Snap
{
    const sheets = new Map<string, [string, number]>();
    get(spritesheet_map).forEach((v, k) => sheets.set(k, [ v[0], v[1] ]));
    return { frames: get(spriteframes).map((f) => f.clone()), sheets, label };
}

function sig(frames: SpriteFrameData[]): string
{
    return JSON.stringify(frames.map((f) => [ f.sprId, f.animationPrefix, f.rect, f.transform, f.frameRect ]));
}

function restore(s: Snap)
{
    spritesheet_map.set(new Map(Array.from(s.sheets.entries()).map(([ k, v ]) => [ k, [ v[0], v[1] ] as [string, number] ])));
    spriteframes.set(s.frames.map((f) => f.clone()));
}

/** Call BEFORE a change to the frame list. */
export function recordHistory(label: string)
{
    past.push(snap(label));
    if(past.length > LIMIT) past.shift();
    future = [];
    publish();
}

/** For edits made inside a dialog: remember the state on open, keep it only if something changed on close. */
export function beginPending(label: string) { pending = snap(label); }
export function endPending()
{
    if(pending === null) return;
    const p = pending;
    pending = null;
    if(sig(p.frames) !== sig(get(spriteframes)))
    {
        past.push(p);
        if(past.length > LIMIT) past.shift();
        future = [];
        publish();
    }
}

export function undo(): string | null
{
    const s = past.pop();
    if(!s) return null;
    future.push(snap(s.label));
    restore(s);
    publish();
    return s.label;
}

export function redo(): string | null
{
    const s = future.pop();
    if(!s) return null;
    past.push(snap(s.label));
    restore(s);
    publish();
    return s.label;
}
