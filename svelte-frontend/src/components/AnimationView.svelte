<script lang="ts">
    import Modal from "./Modal.svelte";
    import { AnimationController } from '../animationcontroller';
    import { onMount, tick } from "svelte";
    import Icon from "./Icon.svelte";
    import type { SpriteFrameData } from "../spriteframedata";
    import { spriteframes } from '../stores'
    import { persisted } from '../persist';

    export let showView = false;

    let canvasElement:HTMLCanvasElement = null;
    let stageElement:HTMLDivElement = null;

    let selectedOption: string;
    
    let prefixes = new Map<string, SpriteFrameData[]>();
    let prefixArray = [];

    let animController:AnimationController = null;
    // the controls panel (prefix / FPS / scale) is collapsible and remembers its state
    const controlsOpen = persisted<boolean>('animControlsOpen', typeof window === 'undefined' || (window.innerWidth >= 640 && window.innerHeight > 480));
    let stripFrames: SpriteFrameData[] = [];
    let curIdx = 0;
    let stripElement: HTMLDivElement = null;

    onMount(()=>{
        animController = new AnimationController(canvasElement.getContext('2d'));
        animController.onFrame = (i) => { curIdx = i; };
        // keep the preview fitted when the window rotates / resizes while it is open
        let ro: ResizeObserver | null = null;
        if(typeof ResizeObserver !== 'undefined')
        {
            ro = new ResizeObserver(() => { if(showView) { fitCanvasToStage(); redraw(); } });
            ro.observe(stageElement);
        }
        return () => { ro && ro.disconnect(); };
    });

    // react only to the dialog opening / closing (never to animController changes: loadPrefix assigns it)
    let wasShown = false;
    $: onShownChange(showView);
    function onShownChange(shown: boolean)
    {
        if(shown === wasShown || animController === null) return;
        wasShown = shown;
        if(shown)
        {
            animController.clearCanvas();
            // the dialog has to be laid out before we can measure the stage
            tick().then(() => requestAnimationFrame(() => { if(!prefixArray.includes(selectedOption)) selectedOption = prefixArray[0]; fitCanvasToStage(); loadPrefix(selectedOption); }));
        }
        else
        {
            animController.stopAnimation();
            stripFrames = [];
        }
    }

    $: {
        if(showView)
        {
            prefixes = new Map();
            prefixArray = [];
            for(let spr of $spriteframes)
            {
                if(!prefixes.has(spr.animationPrefix))
                {
                    prefixes.set(spr.animationPrefix, [ spr ]);
                }
                else
                {
                    let frames = prefixes.get(spr.animationPrefix);
                    prefixes.set(spr.animationPrefix, [ ...frames, spr ]);
                }
                
            }
            for(let k of prefixes.keys())
            {
                prefixArray = [ ...prefixArray, k ];
            }
        }
    }

    // size the drawing buffer to the preview area so the canvas never overflows the dialog
    // (display only: the real image size and the exported data are never touched)
    function fitCanvasToStage()
    {
        if(canvasElement && stageElement && stageElement.clientWidth > 0 && stageElement.clientHeight > 0)
        {
            if(canvasElement.width !== stageElement.clientWidth) canvasElement.width = stageElement.clientWidth;
            if(canvasElement.height !== stageElement.clientHeight) canvasElement.height = stageElement.clientHeight;
        }
    }

    // after the buffer was resized the canvas is blank: draw the current frame again
    function redraw()
    {
        if(animController && !animController.isPlaying && animController.curFrames.length > 0) animController.showFrame(animController.curFrameIndex);
    }

    // scale so that the biggest frame fits the stage (never enlarges above 100%); preview only
    function fitScale()
    {
        if(!animController || !stageElement || animController.curFrames.length === 0) return;
        let w = 1, h = 1;
        for(const f of animController.curFrames) { w = Math.max(w, f.frameRect.frameWidth || f.rect.width); h = Math.max(h, f.frameRect.frameHeight || f.rect.height); }
        const k = Math.min(1, (stageElement.clientWidth - 16) / w, (stageElement.clientHeight - 16) / h);
        animController.animationScale = Math.max(0.01, Math.floor(k * 100) / 100);
        redraw();
        animController = animController;
    }

    async function loadPrefix(prefix: string)
    {
        if(!animController) return;
        animController.stopAnimation();
        const frames = prefixes.get(prefix) || [];
        stripFrames = [];
        curIdx = 0;
        if(frames.length > 0)
        {
            await animController.initFrames(frames);
            stripFrames = frames; // after the images are loaded, so the thumbnails can be drawn
            fitScale();
            animController.showFrame(0);
        }
        animController = animController;
    }

    async function togglePlay()
    {
        if(!animController) return;
        if(animController.isPlaying)
        {
            animController.pause();
        }
        else
        {
            if(animController.curFrames.length === 0) await loadPrefix(selectedOption);
            if(animController.curFrames.length > 0) animController.play();
        }
        animController = animController; // update ui
    }

    function pickFrame(i: number)
    {
        if(!animController) return;
        animController.pause();
        animController.showFrame(i);
        curIdx = animController.curFrameIndex;
        animController = animController;
    }

    // small picture of each frame for the strip (display only)
    function thumb(node: HTMLCanvasElement, args: { frame: SpriteFrameData, ctrl: AnimationController, index: number })
    {
        function paint(a: typeof args)
        {
            const img = a.ctrl && a.ctrl.curImgs[a.index];
            const r = a.frame.rect;
            if(!img || !r.width || !r.height) return;
            const k = Math.min(1, 64 / Math.max(r.width, r.height));
            node.width = Math.max(1, Math.round(r.width * k));
            node.height = Math.max(1, Math.round(r.height * k));
            const c = node.getContext('2d');
            c.clearRect(0, 0, node.width, node.height);
            if(a.frame.transform.flipX || a.frame.transform.flipY)
            {
                c.translate(a.frame.transform.flipX ? node.width : 0, a.frame.transform.flipY ? node.height : 0);
                c.scale(a.frame.transform.flipX ? -1 : 1, a.frame.transform.flipY ? -1 : 1);
            }
            c.drawImage(img, r.x, r.y, r.width, r.height, 0, 0, node.width, node.height);
        }
        paint(args);
        return { update(a: typeof args) { paint(a); } };
    }

    // keep the selected strip item in view after taps / prefix changes (not while playing: no scroll fighting)
    $: if(stripElement && animController && !animController.isPlaying)
    {
        const el = stripElement.querySelector<HTMLElement>(`[data-i="${curIdx}"]`);
        if(el) stripElement.scrollTo({ left: el.offsetLeft - (stripElement.clientWidth - el.clientWidth) / 2, behavior: 'auto' });
    }
</script>

<Modal bind:showModal={showView} size="lg" full>
    <h4 slot="header">View Animation</h4>
    <div class="anim-layout">
        <div class="stage" bind:this={stageElement}>
            <canvas bind:this={canvasElement}></canvas>
        </div>

        <!-- frame strip: swipe sideways, tap a frame to look at it -->
        <div class="strip" bind:this={stripElement} role="listbox" aria-label="Frames of this animation">
            {#each stripFrames as fr, i (fr.sprId)}
                <button type="button" class="strip-item btn-flat" class:on={i === curIdx} data-i={i} role="option" aria-selected={i === curIdx} aria-label={'Frame ' + (i + 1)} on:click={() => pickFrame(i)}>
                    <canvas use:thumb={{ frame: fr, ctrl: animController, index: i }}></canvas>
                    <span>{i + 1}</span>
                </button>
            {/each}
        </div>

        <div class="transport">
            <button type="button" aria-label="Previous frame" disabled={stripFrames.length < 2} on:click={() => pickFrame(curIdx - 1)}><Icon name="chevron-left" /></button>
            <button class="btn-primary play-btn" disabled={stripFrames.length < 1} on:click={togglePlay}>
                <Icon name={(animController?.isPlaying) ? 'stop' : 'play'} />
                { (animController?.isPlaying) ? 'Pause' : 'Play' }
            </button>
            <button type="button" aria-label="Next frame" disabled={stripFrames.length < 2} on:click={() => pickFrame(curIdx + 1)}><Icon name="chevron-right" /></button>
            <span class="pos">{stripFrames.length ? curIdx + 1 : 0} / {stripFrames.length}</span>
            <button type="button" class="ctl-toggle" aria-expanded={$controlsOpen} aria-controls="anim-controls" on:click={() => controlsOpen.update((v) => !v)}>
                <Icon name={$controlsOpen ? 'chevron-down' : 'chevron-up'} /> <span>Controls</span>
            </button>
        </div>

        <div id="anim-controls" class="anim-view-container" hidden={!$controlsOpen}>
            <label class="field grow" for="anim-prefix">
                <span>Animation Prefix</span>
                <select on:change={()=> { loadPrefix(selectedOption); }} name="anim-prefix" id="anim-prefix" bind:value={selectedOption}>
                    {#each prefixArray as prefix (prefix)}
                        <option value="{prefix}">{prefix}</option>
                    {/each}
                </select>
            </label>
            {#if animController}
                <label class="field" for="fps">
                    <span>FPS</span>
                    <input type="number" name="fps" id="fps" min="1" max="120" bind:value={animController.fps} />
                </label>
                <label class="field" for="anim-scale">
                    <span>Preview scale</span>
                    <input type="number" name="anim-scale" id="anim-scale" min="0.01" max="4" bind:value={animController.animationScale} step="0.01" on:change={redraw} />
                </label>
                <button type="button" on:click={fitScale}>Fit</button>
            {/if}
        </div>
    </div>
</Modal>

<style>
    .anim-layout {
        display: flex;
        flex-direction: column;
        gap: 12px;
        flex: 1 1 auto;
        min-height: 0;
    }

    .anim-view-container {
        flex: none;
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: 10px 14px;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .field span {
        font-size: 0.8rem;
        color: var(--text-muted);
    }

    .field.grow {
        flex: 1 1 200px;
        min-width: 0;
    }

    .field input {
        width: 110px;
    }

    .play-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
    }

    .stage {
        position: relative;
        flex: 1 1 auto;
        min-height: 120px;
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background-color: var(--checker-a);
        background-image:
            linear-gradient(45deg, var(--checker-b) 25%, transparent 25%, transparent 75%, var(--checker-b) 75%),
            linear-gradient(45deg, var(--checker-b) 25%, transparent 25%, transparent 75%, var(--checker-b) 75%);
        background-size: 20px 20px;
        background-position: 0 0, 10px 10px;
    }

    .stage canvas {
        position: absolute;
        inset: 0;
        display: block;
    }

    .strip {
        flex: none;
        display: flex;
        gap: 6px;
        overflow-x: auto;
        overflow-y: hidden;
        overscroll-behavior-x: contain;   /* sideways swipes stay inside the strip */
        touch-action: pan-x;
        -webkit-overflow-scrolling: touch;
        scroll-snap-type: x proximity;
        padding: 2px 2px 6px;
        min-height: 78px;
    }
    .strip-item {
        flex: none;
        scroll-snap-align: center;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
        width: 72px; height: 72px; padding: 3px; min-height: 0;
        border: 2px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--surface);
    }
    .strip-item.on { border-color: var(--accent); background: var(--accent-soft); }
    .strip-item canvas { position: static; max-width: 100%; max-height: 48px; width: auto; height: auto; image-rendering: auto; }
    .strip-item span { font-size: 0.68rem; color: var(--text-muted); }
    .transport { flex: none; display: flex; align-items: center; gap: 8px; }
    .transport > button:not(.play-btn):not(.ctl-toggle) { width: 44px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
    .transport .play-btn { flex: 0 0 auto; min-width: 110px; justify-content: center; }
    .pos { color: var(--text-muted); font-size: 0.85rem; white-space: nowrap; }
    .ctl-toggle { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; }
    .anim-view-container[hidden] { display: none; }
</style>
