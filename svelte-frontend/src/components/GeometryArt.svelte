<!-- Original geometric artwork in the black & white language of the reference (triangles, stripes, concentric arcs,
     dotted fields, a speckled "marble" shape). Strokes draw on and shapes pop in with the existing motion keyframes;
     without motion everything is simply shown. Colours follow the theme through --art-fg / --art-bg. -->
<svg class="art" viewBox="0 0 320 250" role="img" aria-label="Abstract black and white geometric artwork" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <defs>
        <pattern id="art-dots" width="12" height="12" patternUnits="userSpaceOnUse">
            <path class="fg" d="M6 2 9.5 8.5h-7z" stroke="none" />
        </pattern>
        <pattern id="art-stripes" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
            <rect class="fg" width="4" height="8" stroke="none" />
        </pattern>
        <filter id="art-grit" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -9 4.6" result="spots" />
            <feComposite in="spots" in2="SourceGraphic" operator="in" />
        </filter>
        <clipPath id="art-clip-a"><path d="M36 44 196 18 128 176z" /></clipPath>
    </defs>

    <!-- speckled marble triangle -->
    <path class="fg pop" style="--d: 60ms" d="M36 44 196 18 128 176z" />
    <g clip-path="url(#art-clip-a)" class="grit pop" style="--d: 300ms">
        <rect x="20" y="10" width="200" height="180" fill="#000" filter="url(#art-grit)" />
    </g>
    <path class="st bg draw" pathLength="1" style="--d: 500ms" d="M96 28c10 30 6 52 20 84s-2 40 4 56" stroke-width="1.6" />
    <path class="st bg draw" pathLength="1" style="--d: 650ms" d="M70 60c20 6 36 22 50 22" stroke-width="1.2" />

    <!-- concentric arcs -->
    <g class="spin">
        <circle class="st draw" pathLength="1" style="--d: 350ms" cx="214" cy="118" r="52" stroke-width="7" />
        <circle class="st draw" pathLength="1" style="--d: 500ms" cx="214" cy="118" r="38" stroke-width="7" />
        <circle class="st draw" pathLength="1" style="--d: 650ms" cx="214" cy="118" r="24" stroke-width="7" />
        <circle class="fg pop" style="--d: 800ms" cx="214" cy="118" r="9" />
    </g>

    <!-- striped and dotted triangles -->
    <path class="stripe pop" style="--d: 450ms" d="M14 176 118 126 128 206z" fill="url(#art-stripes)" />
    <path class="st draw" pathLength="1" style="--d: 700ms" d="M14 176 118 126 128 206z" stroke-width="2" />
    <g class="float">
        <path class="pop" style="--d: 600ms" d="M150 190 292 112 282 236z" fill="url(#art-dots)" />
    </g>

    <!-- details: solid wedge, zigzag, hairlines -->
    <path class="fg pop wedge" style="--d: 900ms" d="M262 170 300 160 280 198z" />
    <path class="st draw" pathLength="1" style="--d: 800ms" d="M24 20l9-9 9 9 9-9 9 9 9-9 9 9" stroke-width="2.2" />
    <path class="st draw" pathLength="1" style="--d: 900ms" d="M226 14 270 6M214 26 292 12" stroke-width="1.4" />
    <path class="st draw" pathLength="1" style="--d: 1000ms" d="M20 232h120" stroke-width="1.4" />
    <circle class="mark pop pulse" style="--d: 1100ms" cx="300" cy="30" r="5" />
</svg>

<style>
    .art {
        --art-fg: #f4f4f5;
        --art-bg: #17171a;
        display: block;
        width: var(--scene-w, min(100%, 300px));
        height: auto;
        max-height: 100%;
        overflow: visible;
    }
    :global(.light-mode) .art { --art-fg: #141416; --art-bg: #f4f4f5; }
    .fg { fill: var(--art-fg); }
    .bg { stroke: var(--art-bg); }
    .st { stroke: var(--art-fg); }
    .mark { fill: var(--mark); }
    .grit { opacity: 0.9; }
    /* the speckles are drawn dark on the light triangle; invert them on a light page */
    .stripe { opacity: 1; }

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
        .float { animation: hp-float 3.2s ease-in-out 1.8s infinite alternate; }
        .pulse { animation: hp-pop var(--dur-spring) var(--ease-spring) 1100ms backwards, hp-pulse 1.8s ease-in-out 2s infinite; }
        .wedge { transform-box: fill-box; transform-origin: 50% 100%; animation: hp-pop var(--dur-spring) var(--ease-spring) 900ms backwards, hp-wobble 4.5s ease-in-out 2.4s infinite; }
    }
</style>
