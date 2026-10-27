<script lang="ts">
    import Icon from './Icon.svelte';
    import { APP_NAME, LOGO_URL } from '../branding';
    import { deviceChoice } from '../device';
    import type { DeviceChoice } from '../device';

    const devices: { id: DeviceChoice, icon: string, title: string, text: string }[] = [
        { id: 'phone', icon: 'phone', title: 'Phone', text: 'For mobile phones and portrait screens.' },
        { id: 'tablet', icon: 'tablet', title: 'Tablet', text: 'For iPad and tablets.' },
        { id: 'desktop', icon: 'desktop', title: 'Desktop', text: 'For computers and large screens.' },
    ];

    function choose(id: DeviceChoice) { $deviceChoice = id; }
</script>

<div id="welcome">
    <div id="welcome-inner">
        <header class="w-head">
            <img class="w-logo" src={LOGO_URL} alt="" width="160" height="94" draggable="false" />
            <h1>{APP_NAME}</h1>
        </header>
        <div class="w-text">
            <h2>Welcome to {APP_NAME}!</h2>
            <p>Choose the device you are using now. You can change this later in Settings.</p>
        </div>
        <div class="w-cards" role="group" aria-label="Device">
            {#each devices as d, i}
                <button type="button" class="device-card" style="--i: {i}" on:click={() => choose(d.id)}>
                    <span class="dc-icon"><Icon name={d.icon} size={44} /></span>
                    <span class="dc-title">{d.title}</span>
                    <span class="dc-text">{d.text}</span>
                    <span class="dc-pick">Use {d.title}</span>
                </button>
            {/each}
        </div>
        <button type="button" class="btn-flat w-auto" on:click={() => choose('auto')}>Not sure? Match my screen automatically</button>
    </div>
</div>

<style>
    #welcome {
        position: fixed;
        inset: 0;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        display: flex;
        padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    }

    #welcome-inner {
        margin: auto;
        width: min(860px, 100%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--gap-lg);
        text-align: center;
    }

    /* timing: header 0-300ms, welcome text 150-450ms, cards 250-500 / 350-600 / 450-700ms */
    .w-head {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        animation: w-rise 0.3s cubic-bezier(0.2, 0.8, 0.3, 1) backwards;
    }

    .w-logo {
        width: clamp(96px, 28vw, 160px);
        height: auto;
    }

    h1 {
        margin: 0;
        font-family: var(--font-ui);
        font-size: clamp(1.8rem, 6vw, 2.6rem);
        letter-spacing: 0.02em;
    }

    .w-text {
        animation: w-rise 0.3s cubic-bezier(0.2, 0.8, 0.3, 1) 150ms backwards;
    }

    h2 {
        margin: 0 0 4px;
        font-size: clamp(1.15rem, 3.6vw, 1.5rem);
    }

    .w-text p {
        margin: 0;
        color: var(--text-muted);
    }

    .w-cards {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--gap-lg);
        width: 100%;
        padding-bottom: var(--btn-depth);
    }

    .device-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        min-height: 0;
        padding: 20px 14px 16px;
        border-radius: 18px;
        text-align: center;
        /* 'backwards' only: after the intro the normal hover / press transforms take over */
        animation: card-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
        animation-delay: calc(250ms + var(--i) * 100ms);
    }

    /* hover (mouse/pencil hover) lifts the card; pressing sinks it into the page like the other chunky buttons */
    @media (hover: hover) {
        .device-card:enabled:hover {
            transform: translateY(-4px);
            box-shadow: 0 calc(var(--btn-depth) + 4px) 0 var(--btn-edge), inset 0 2px 0 rgba(255, 255, 255, 0.14);
        }
    }
    .device-card:enabled:active {
        transform: translateY(var(--btn-press));
        box-shadow: 0 calc(var(--btn-depth) - var(--btn-press)) 0 var(--btn-edge), inset 0 2px 0 rgba(255, 255, 255, 0.14);
    }

    .dc-icon { color: var(--accent); display: inline-flex; }
    .dc-title { font-size: 1.3rem; }
    .dc-text { font-family: var(--font-read); font-size: 0.88rem; color: var(--text-muted); letter-spacing: 0; }
    .dc-pick {
        margin-top: 6px;
        padding: 6px 14px;
        border-radius: 10px;
        background: var(--accent);
        color: var(--accent-contrast);
        font-size: 0.95rem;
    }

    .w-auto {
        animation: w-rise 0.3s ease-out 600ms backwards;
    }

    @keyframes w-rise {
        from { opacity: 0; transform: translateY(14px); }
        to { opacity: 1; transform: none; }
    }

    @keyframes card-in {
        from { opacity: 0; transform: translateY(22px) scale(0.94); }
        to { opacity: 1; transform: none; }
    }

    /* phone: cards stack in one column, each as a wide tappable row */
    @media screen and (max-width: 640px) {
        .w-cards { grid-template-columns: 1fr; gap: 10px; }
        .device-card {
            display: grid;
            grid-template-columns: auto 1fr;
            grid-template-areas: "icon title" "icon text";
            column-gap: 14px;
            row-gap: 0;
            align-items: center;
            text-align: left;
            padding: 12px 14px;
        }
        .dc-icon { grid-area: icon; }
        .dc-title { grid-area: title; }
        .dc-text { grid-area: text; }
        .dc-pick { display: none; }
    }

    @media (prefers-reduced-motion: reduce) {
        .w-head, .w-text, .device-card, .w-auto { animation: none; }
    }
</style>
