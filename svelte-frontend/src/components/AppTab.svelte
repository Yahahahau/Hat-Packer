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

    /* the active mode is the accent button that stays pressed in */
    .app-tab.selected,
    .app-tab.selected:enabled:hover,
    .app-tab.selected:enabled:active {
        background-color: var(--accent);
        border-color: var(--btn-primary-edge);
        color: var(--accent-contrast);
        transform: translateY(var(--btn-press));
        box-shadow:
            0 calc(var(--btn-depth) - var(--btn-press)) 0 var(--btn-primary-edge),
            inset 0 2px 0 rgba(255, 255, 255, 0.15);
    }
</style>
