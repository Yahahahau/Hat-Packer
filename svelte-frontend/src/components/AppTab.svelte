<script lang="ts">
    import Icon from "./Icon.svelte";

    export let id: string;
    export let curChoice: string;
    export let text: string;
    export let icon = '';
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
    <span>{text}</span>
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
        overflow: hidden;
        text-overflow: ellipsis;
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
