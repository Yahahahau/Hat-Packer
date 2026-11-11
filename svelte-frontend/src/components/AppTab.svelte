<script lang="ts">
    import Icon from "./Icon.svelte";

    export let id: string;
    export let curChoice: string;
    export let text: string;
    export let icon = '';
    export let shortText = text; // shown on phones
</script>

<button
    type="button"
    role="tab"
    class="app-tab"
    class:selected={id === curChoice}
    aria-selected={id === curChoice}
    on:click={() => { curChoice = id; }}
>
    {#if icon}<Icon name={icon} size={18} />{/if}
    <span class="t-full">{text}</span>
    <span class="t-short">{shortText}</span>
</button>

<style>
    .app-tab {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        flex: 1 1 auto;
        min-width: 0;
        white-space: nowrap;
    }

    .app-tab span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .t-short { display: none; }

    /* phones: tabs share the row and shorten instead of pushing the page wider */
    @media screen and (max-width: 560px) {
        .app-tab {
            flex: 1 1 0;
            gap: 5px;
            padding: 0 6px;
            font-size: 0.8rem;
        }
        .t-full { display: none; }
        .t-short { display: inline; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    }

    /* the highlight is the sliding pill (#tab-indicator in App.svelte); the tab itself only changes its text colour */
    .app-tab {
        position: relative;
        z-index: 1;
        background-color: transparent;
        border-color: transparent;
        color: var(--text-muted);
        transition: color 380ms cubic-bezier(0.65, 0, 0.35, 1), background-color var(--dur-hover) var(--ease-std), transform var(--dur-press) var(--ease-std);
    }
    .app-tab:enabled:hover { background-color: transparent; color: var(--text); }
    .app-tab.selected,
    .app-tab.selected:enabled:hover {
        background-color: transparent;
        border-color: transparent;
        color: var(--accent-contrast);
    }
</style>
