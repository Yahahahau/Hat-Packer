<script lang="ts">
    import { onMount } from 'svelte';
    import type { SpriteFrameData } from '../spriteframedata';
    import { AnimationController } from '../animationcontroller';
    import { spriteframes, spritesheet_map } from '../stores';
    import Icon from './Icon.svelte';
    let frameCanvas: HTMLCanvasElement;
    let frameDiv: HTMLDivElement;
    export let frameInfo: SpriteFrameData;
    export let onRangeClick: Function;
    export let rangeSelectionMode: boolean;

    let spriteframesize = 120;
    let showImage = false;

    // visible (trimmed) size = the rect that gets packed; original = frameWidth/frameHeight
    $: shownW = frameInfo.rect.width;
    $: shownH = frameInfo.rect.height;
    $: wasTrimmed = frameInfo.frameRect.frameWidth !== shownW || frameInfo.frameRect.frameHeight !== shownH;

    let animController: AnimationController;
    onMount(()=>{
        const obs = new IntersectionObserver(async (entries, observer)=>{
            const canv = entries[0];
            if(canv.isIntersecting && canv.intersectionRatio >= 0.20)
            {
                if(!showImage)
                {
                    // showing image
                    await loadImage();
                }
            }
            else
            {
                showImage = false;
            }
        }, {
            root: document.getElementById('sprite-frames'),
            rootMargin: "0px",
            threshold: [0.1, 0.2] // [0.25, 0.5, 0.75]
        });
        obs.observe(frameDiv);


        // set up animation controller to draw the frame
        animController = new AnimationController(frameCanvas.getContext('2d'));
    });

    $: {
        if(showImage && frameInfo._changed)
        {
            loadImage().then(()=>{});
            frameInfo._changed = false;
        }

        if(frameDiv)
        {
            if(frameInfo.selected)
            {
                frameDiv.classList.add('frame-selected');
            }
            else
            {
                frameDiv.classList.remove('frame-selected');
            }
        }
    }

    async function loadImage() {
        await animController.initFrames([ frameInfo ]);
        animController.clearCanvas();
        animController.animationScale = spriteframesize/Math.max(frameInfo.frameRect.frameWidth, frameInfo.frameRect.frameHeight);
        animController.drawImage(animController.curImgs[0], frameInfo, false);
        showImage = true;
    }

    function handleClick()
    {
        if(onRangeClick != null)
        {
            onRangeClick();
        }

        if(!rangeSelectionMode)
        {
            frameInfo.selected = !frameInfo.selected;
        }
        else
        {
            let _count = 0;
            const hasSelectedClass = frameDiv.classList.contains('frame-selected');
            let interId = setInterval(() => {
                if(_count >= 2)
                {
                    clearInterval(interId);
                    if(hasSelectedClass)
                    {
                        frameDiv.classList.add('frame-selected');
                    }
                    else
                    {
                        frameDiv.classList.remove('frame-selected');
                    }
                }
                frameDiv.classList.toggle('frame-selected');
                _count++;
            }, 150);
        }
    }

    function onDelete(sprframe: SpriteFrameData)
    {
        const ind = $spriteframes.indexOf(sprframe);
        if(ind !== -1)
        {
            $spriteframes.splice(ind, 1);
            spriteframes.set($spriteframes);

            if(frameInfo.type === 'spritesheet_frame')
            {
                const hash = frameInfo.spritesheetId;
                const [spshdata, count] = $spritesheet_map.get(hash);
                const newCount = count - 1;
                if(newCount > 0)
                {
                    spritesheet_map.update((prev) => {
                        prev.set(hash, [spshdata, newCount])
                        return prev;
                    });
                }
                else
                {
                    spritesheet_map.update((prev) => {
                        prev.delete(hash);
                        return prev;
                    });
                }
            }
        }
        else
        {
            console.log("[ERROR] Could not find element: " + sprframe);
        }
    }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<div
    on:click={handleClick}
    bind:this={frameDiv}
    class="frame-container frame-selected"
    role="button"
    tabindex="0"
    aria-pressed={frameInfo.selected}
    title={frameInfo.animationPrefix}
>
    <input class="frame-check" type="checkbox" name="selected-chkbox" id="selected-chkbox" checked={frameInfo.selected} tabindex="-1" />
    <button type="button" class="frame-delete btn-danger" title="Delete frame" aria-label="Delete frame" on:click|stopPropagation={()=>{ onDelete(frameInfo) }}>
        <Icon name="trash" size={16} />
    </button>
    <div class="frame-preview" style="width: {spriteframesize}px; height: {spriteframesize}px;">
        <canvas style="display: {(showImage) ? 'block' : 'none'};" width="{spriteframesize}px" height="{spriteframesize}px" bind:this={frameCanvas}>
            Rendering Error!
            Please use a browser that supports canvas rendering! (like Chrome or Firefox)
        </canvas>
    </div>
    <p class="frame-name">{frameInfo.animationPrefix}</p>
    <p class="frame-size" title="Packed size{wasTrimmed ? ' (after trim) / original size' : ''}">{shownW} &times; {shownH} px{#if wasTrimmed}<span class="frame-orig"> &middot; from {frameInfo.frameRect.frameWidth} &times; {frameInfo.frameRect.frameHeight}</span>{/if}</p>
</div>

<style>
    .frame-container {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        min-width: 0;
        padding: 36px 6px 6px;
        border: 2px solid var(--border);
        border-radius: var(--radius);
        background-color: var(--surface-2);
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
    }

    .frame-container:hover {
        border-color: var(--border-strong);
    }

    .frame-container:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
    }

    .frame-selected {
        border-color: var(--accent);
        background-color: var(--accent-soft);
    }

    .frame-preview {
        flex: none;
        border-radius: var(--radius-sm);
        background-color: var(--checker-a);
        background-image:
            linear-gradient(45deg, var(--checker-b) 25%, transparent 25%, transparent 75%, var(--checker-b) 75%),
            linear-gradient(45deg, var(--checker-b) 25%, transparent 25%, transparent 75%, var(--checker-b) 75%);
        background-size: 16px 16px;
        background-position: 0 0, 8px 8px;
        overflow: hidden;
    }

    .frame-preview canvas {
        width: 100%;
        height: 100%;
    }

    /* the whole card is the click target; the checkbox is just the state indicator */
    .frame-check {
        position: absolute;
        top: 9px;
        left: 10px;
        z-index: 1;
        width: 22px;
        height: 22px;
        margin: 0;
        pointer-events: none;
    }

    .frame-delete {
        --btn-depth: 3px;
        --btn-press: 2px;
        position: absolute;
        top: 4px;
        right: 6px;
        z-index: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        min-height: 34px;
        height: 34px;
        padding: 0;
        border-radius: 10px;
    }

    .frame-size {
        width: 100%;
        margin: -4px 0 0;
        font-size: 0.72rem;
        color: var(--text-muted);
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .frame-name {
        width: 100%;
        margin: 0;
        font-size: 0.85rem;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
</style>
