<script lang="ts">
    import SpriteFrame from '../components/SpriteFrame.svelte';
    import Icon from '../components/Icon.svelte';
    import SpritesheetGenControls from '../components/SpritesheetGenControls.svelte';
    import type { Wasm_T } from '../global';
    import { spriteframes } from '../stores';

    export let wasm: Wasm_T;
    export let charname: string;

    let rangeSelectionMode = false;
    let rangeStartIdx: number | null = null;
    let rangeEndIdx: number | null = null;

    function onRangeClick(index: number)
    {
        if(rangeSelectionMode)
        {
            if(rangeStartIdx === null)
            {
                // we have selected the start of the range
                rangeStartIdx = index;
                return;
            }
            if(rangeEndIdx === null)
            {
                // we have selected the end of the range
                rangeEndIdx = index;
                rangeSelectionMode = false;
                // loop and select this range
                spriteframes.update((prev) => {
                    let start: number, end: number;
                    if(rangeStartIdx <= rangeEndIdx)
                    {
                        start = rangeStartIdx;
                        end = rangeEndIdx;
                    }
                    else
                    {
                        start = rangeEndIdx;
                        end = rangeStartIdx;
                    }
                    for(let i = start; i <= end; i++)
                    {
                        prev[i].selected = !prev[i].selected;
                    }
                    return prev;
                });
                rangeStartIdx = null;
                rangeEndIdx = null;
                return;
            }
        }
    }
</script>


{#if rangeSelectionMode}
    <div id="range-hint" role="status">
        {rangeStartIdx === null ? 'Range select: tap the first frame of the range' : 'Range select: now tap the last frame of the range'}
    </div>
{/if}

<div id="sprite-frames" class:range-mode={rangeSelectionMode}>
    <!-- <RubberBandSelector /> -->
    {#each $spriteframes as dat, idx (dat.sprId)}
        <SpriteFrame {rangeSelectionMode} onRangeClick={() => { onRangeClick(idx); }} bind:frameInfo={dat} />
    {/each}
    {#if $spriteframes.length === 0}
        <div id="empty-state">
            <Icon name="image-plus" size={40} />
            <p><strong>No frames yet</strong></p>
            <p>Use <em>Add PNGs</em> to import images, or <em>Add Spritesheet</em> to import an existing spritesheet + XML.</p>
        </div>
    {/if}
</div>


<SpritesheetGenControls bind:rangeSelectionMode {charname} wasm={wasm} />


<style>
    /* Children of this component become direct flex items of the pane,
       so `order` decides where each block sits (the controls component uses 0 and 4). */
    #sprite-frames {
        order: 2;
        flex: 1 1 auto;
        min-height: 160px;
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
        grid-auto-rows: max-content;
        align-content: start;
        gap: 8px;
        padding: 8px;
        background-color: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
    }

    #sprite-frames.range-mode {
        border-color: var(--accent);
        box-shadow: inset 0 0 0 2px var(--accent-soft);
    }

    #range-hint {
        order: 1;
        padding: 8px 12px;
        border-radius: var(--radius-sm);
        background: var(--accent-soft);
        border: 1px solid var(--accent);
        font-size: 0.9rem;
    }

    #empty-state {
        grid-column: 1 / -1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: 48px 16px;
        text-align: center;
        color: var(--text-muted);
    }

    #empty-state p {
        margin: 4px 0 0;
        max-width: 34rem;
    }

    #empty-state strong {
        color: var(--text);
    }
</style>
