<!-- Original line illustration (desk, monitor with sprite frames, hat, map pin). The strokes draw themselves on,
     the fills pop in with a spring, then the pin floats. Without motion everything is simply shown. -->
<svg class="desk-scene" viewBox="0 0 320 210" role="img" aria-label="A desk with a monitor showing sprite frames, a hat and a map pin" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <circle class="pop blob" cx="150" cy="108" r="78" fill="var(--surface-3)" stroke="none" style="--d: 60ms" />
    <g class="float">
        <path class="draw" pathLength="1" style="--d: 150ms" d="M48 74c-10-9-10-25 0-33s26-8 32 2c6 10 3 22-6 31l-12 16-14-16z" fill="var(--surface)" />
        <circle class="pop" cx="62" cy="55" r="7" fill="var(--accent)" style="--d: 650ms" />
    </g>
    <path class="draw" pathLength="1" style="--d: 500ms" d="M80 78c24 26 28-24 52-6s26 30 58-14c10-14 18-26 26-30" />
    <circle class="pop pulse" cx="222" cy="38" r="8" fill="var(--accent)" stroke="none" style="--d: 1150ms" />

    <!-- monitor -->
    <path class="draw" pathLength="1" style="--d: 250ms" d="M92 70a8 8 0 0 1 8-8h134a8 8 0 0 1 8 8v78a8 8 0 0 1-8 8H100a8 8 0 0 1-8-8z" fill="var(--surface)" />
    <path class="draw" pathLength="1" style="--d: 700ms" d="M167 156v20M140 176h54" />
    <!-- sprite frames on the screen -->
    <rect class="pop f1" x="106" y="76" width="30" height="30" rx="5" fill="var(--surface-3)" style="--d: 800ms" />
    <rect class="pop f2" x="145" y="76" width="30" height="30" rx="5" fill="var(--accent)" style="--d: 900ms" />
    <rect class="pop f3" x="184" y="76" width="30" height="30" rx="5" fill="var(--surface-3)" style="--d: 1000ms" />
    <rect class="pop f4" x="106" y="114" width="30" height="26" rx="5" fill="var(--surface-3)" style="--d: 1100ms" />
    <rect class="pop f5" x="145" y="114" width="30" height="26" rx="5" fill="var(--surface-3)" style="--d: 1200ms" />
    <path class="draw" pathLength="1" style="--d: 1300ms" d="M152 91l6 6 11-12" />

    <!-- the hat sitting on the monitor -->
    <g class="hat">
        <path class="draw" pathLength="1" style="--d: 900ms" d="M204 62c-2-18-1-30 4-34h24c5 4 6 16 4 34" fill="var(--accent)" />
        <path class="draw" pathLength="1" style="--d: 1000ms" d="M196 62c0-4 14-6 28-6s28 2 28 6" />
        <path class="draw" pathLength="1" style="--d: 1100ms" d="M206 49h28" />
    </g>

    <!-- desk -->
    <rect class="desk" x="20" y="188" width="280" height="14" rx="7" fill="var(--ink)" stroke="none" />
</svg>

<style>
    .desk-scene {
        --ink: var(--outline);
        display: block;
        width: var(--scene-w, min(100%, 300px));
        height: auto;
        max-height: 100%;
        overflow: visible;
    }

    @media (prefers-reduced-motion: no-preference) {
        .draw {
            stroke-dasharray: 1;
            stroke-dashoffset: 0;
            animation: hp-draw 0.8s var(--ease-std) backwards;
            animation-delay: var(--d, 0ms);
        }
        .pop {
            transform-box: fill-box;
            transform-origin: center;
            animation: hp-pop var(--dur-spring) var(--ease-spring) backwards;
            animation-delay: var(--d, 0ms);
        }
        .desk {
            transform-box: fill-box;
            transform-origin: left center;
            animation: hp-grow 0.6s var(--ease-in) backwards;
        }
        .float {
            animation: hp-float 3.2s ease-in-out 1.8s infinite alternate;
        }
        .pulse {
            animation: hp-pop var(--dur-spring) var(--ease-spring) 1150ms backwards, hp-pulse 1.8s ease-in-out 2s infinite;
        }
        .hat {
            transform-box: fill-box;
            transform-origin: 50% 100%;
            animation: hp-wobble 4.5s ease-in-out 2.4s infinite;
        }
        .f2 { animation: hp-pop var(--dur-spring) var(--ease-spring) 900ms backwards, hp-blink 2.6s ease-in-out 2.4s infinite; }
    }
</style>
