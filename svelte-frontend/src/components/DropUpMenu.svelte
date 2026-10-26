<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { quadInOut } from "svelte/easing";
    import Icon from "./Icon.svelte";

    let menuShown = false;
    export let buttonText: string;
    export let icon = '';
    export let primary = false;
    export let disabled = false;
    // open the menu above ("up") or below ("down") the button, aligned to its left or right edge
    export let direction: 'up' | 'down' = 'up';
    export let align: 'left' | 'right' = 'left';

    let menuDiv: HTMLDivElement = null;

    onMount(() => {
        document.addEventListener('click', onClickHandler);
    });
    onDestroy(() => {
        document.removeEventListener('click', onClickHandler);
    });

    function onClickHandler(e) {
        if(menuDiv && e.target !== menuDiv)
        {
            menuShown = false;
        }
    }

    function fadeNSlide(node, options)
    {
        const fadeAnim = fade(node, options);
        return {
            duration: options.duration,
            css: fadeAnim.css
        };
    }
</script>

<div class="dropup">
    <button
        type="button"
        class:btn-primary={primary}
        {disabled}
        aria-haspopup="menu"
        aria-expanded={menuShown}
        on:click|stopPropagation={() => { menuShown = !menuShown }}
    >
        {#if icon}<Icon name={icon} />{/if}
        <span>{buttonText}</span>
        <Icon name={direction === 'up' ? 'chevron-up' : 'chevron-down'} size={16} />
    </button>
    {#if menuShown}
        <div
            bind:this={menuDiv}
            role="menu"
            class="drop-up-menu {direction} {align}"
            in:fadeNSlide="{{ duration: 100, easing: quadInOut }}"
            out:fadeNSlide="{{ duration: 100, easing: quadInOut }}"
        >
            <slot />
        </div>
    {/if}
</div>

<style>
    .dropup {
        position: relative;
        display: inline-flex;
    }

    .dropup > button {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
    }

    .drop-up-menu {
        position: absolute;
        z-index: 30;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 230px;
        padding: 6px;
        background-color: var(--surface);
        border: 1px solid var(--border-strong);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
    }

    .drop-up-menu.up { bottom: calc(100% + 8px); }
    .drop-up-menu.down { top: calc(100% + 8px); }
    .drop-up-menu.left { left: 0; }
    .drop-up-menu.right { right: 0; }

    /* menu entries are flat (see .drop-up-menu button in styles.css) */
    .drop-up-menu :global(button) {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        justify-content: flex-start;
        text-align: left;
        white-space: nowrap;
    }
</style>
