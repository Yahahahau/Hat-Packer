<script lang="ts">
    import Modal from "./Modal.svelte";
    import { AnimationController } from '../animationcontroller';
    import { onMount, tick } from "svelte";
    import Icon from "./Icon.svelte";
    import type { SpriteFrameData } from "../spriteframedata";
    import { spriteframes } from '../stores'

    export let showView = false;

    let canvasElement:HTMLCanvasElement = null;
    let stageElement:HTMLDivElement = null;

    let selectedOption: string;
    
    let prefixes = new Map<string, SpriteFrameData[]>();
    let prefixArray = [];

    let animController:AnimationController = null;
    onMount(()=>{
        animController = new AnimationController(canvasElement.getContext('2d'));
    });

    $: {
        if(animController !== null)
        {
            if(showView)
            {
                console.log("Clearing canvas: ", animController.isPlaying);
                animController.clearCanvas();
                // the dialog has to be laid out before we can measure the stage
                tick().then(() => requestAnimationFrame(() => { fitCanvasToStage(); animController.clearCanvas(); }));
            }
            else
            {
                animController.stopAnimation();
            }
            animController = animController; // to update svelte state
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
    function fitCanvasToStage()
    {
        if(canvasElement && stageElement && stageElement.clientWidth > 0 && stageElement.clientHeight > 0)
        {
            canvasElement.width = stageElement.clientWidth;
            canvasElement.height = stageElement.clientHeight;
        }
    }

    async function playAnimation()
    {
        if(animController.animId === null)
        {
            await animController.initFrames(prefixes.get(selectedOption));
            animController.play();
            fitCanvasToStage();
        }
        else
        {
            animController.stopAnimation();
        }
        console.log("Anim is " + animController.animId);
        animController = animController; // update ui
    }
</script>

<Modal bind:showModal={showView} size="lg">
    <h4 slot="header">View Animation</h4>
    <div class="anim-layout">
        <div class="anim-view-container">
            <label class="field grow" for="anim-prefix">
                <span>Animation Prefix</span>
                <select on:change={()=> {animController.stopAnimation(); animController = animController}} name="anim-prefix" id="anim-prefix" bind:value={selectedOption}>
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
                    <span>Animation Scale</span>
                    <input type="number" name="anim-scale" id="anim-scale" min="0.01" max="4" bind:value={animController.animationScale} step="0.01" />
                </label>
            {/if}
            <button class="btn-primary play-btn" on:click={playAnimation}>
                <Icon name={(animController?.isPlaying) ? 'stop' : 'play'} />
                { (animController?.isPlaying) ? 'Stop' : 'Play' } Animation
            </button>
        </div>
        <div class="stage" bind:this={stageElement}>
            <canvas bind:this={canvasElement}></canvas>
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
        min-height: 200px;
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

    canvas {
        position: absolute;
        inset: 0;
        display: block;
    }
</style>
