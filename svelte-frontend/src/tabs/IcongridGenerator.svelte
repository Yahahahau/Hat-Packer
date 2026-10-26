<script lang="ts">
    import { openFileDialog, saveFile } from '../utils'
    import { arrayBufferToBase64, base64EncArr } from '../b64utils';
    import { onDestroy } from 'svelte';
    import type { Wasm_T } from '../global';
    import Icon from '../components/Icon.svelte';
    export let wasm: Wasm_T;
    export let charname: string; // name of character

    let isLegacy = false;
    let selectedFiles: File[] = [];
    let displayImg: HTMLImageElement = null;
    let loadingDlg: HTMLDialogElement = null;
    let hasPreview = false; // true once an icongrid image has been put in the preview

    let controlsDiv: HTMLDivElement = null;

    // for legacy version
    let curIcongrid: File = null;

    $: {
        if(controlsDiv)
        {
            if(isLegacy)
            {
                controlsDiv.classList.add('layout-legacy');
                controlsDiv.classList.remove('layout-normal');
            }
            else
            {
                controlsDiv.classList.remove('layout-legacy');
                controlsDiv.classList.add('layout-normal');
            }
        }
    }

    async function makeIcongrid()
    {
        if(!isLegacy)
        {
            const { IconPacker } = wasm;
            const iconPacker = IconPacker.new();
    
            if(selectedFiles.length > 0)
            {
                loadingDlg.showModal();
                for(let f of selectedFiles)
                {
                    iconPacker.add_image(await f.arrayBuffer());
                }
        
                let finalImageBytes = iconPacker.make_packed_image();
                displayImg.setAttribute('src', 'data:image/png;base64,' + base64EncArr(finalImageBytes))
                hasPreview = true;
                loadingDlg.close();
        
                let iconFilename = `icon-${charname !== undefined ? charname : 'character'}.png`;
                saveFile(finalImageBytes, iconFilename);
            }
            else
            {
                alert("No icons selected! Please select some icons");
            }
        }
        else
        {
            if(selectedFiles.length > 0)
            {
                if(curIcongrid !== null)
                {
                    loadingDlg.showModal();
                    const icongridBytes = new Uint8Array(await curIcongrid.arrayBuffer());
                    const imgBytesArray = [];
                    for(let f of selectedFiles)
                    {
                        imgBytesArray.push(arrayBufferToBase64(await f.arrayBuffer()));
                    }
                    const finalBytes = wasm.make_icongrid_legacy(icongridBytes, imgBytesArray);
                    displayImg.setAttribute('src', 'data:image/png;base64,' + base64EncArr(finalBytes));
                hasPreview = true;
                    loadingDlg.close();
                    saveFile(finalBytes, 'iconGrid.png');
                }
                else
                {
                    alert("No Icongrid selected! Please select an icongrid");
                }
            }
            else
            {
                alert("No icons selected! Please select some icons");
            }
        }
    }

    async function onIcongridAdd(e: Event)
    {
        curIcongrid = (e.target as HTMLInputElement).files[0];
        displayImg.setAttribute('src', 'data:image/png;base64,' + arrayBufferToBase64(await curIcongrid.arrayBuffer()));
                hasPreview = true;
    }

    function clearFiles(_:any)
    {
        selectedFiles = [];
    }

    onDestroy(()=>{
        document.removeEventListener('clearIcons', clearFiles);
    });

    document.addEventListener('clearIcons', clearFiles);


    function onFileSelection(e:Event)
    {
        selectedFiles = [ ...(e.target as HTMLInputElement).files ];
    }
</script>

<dialog bind:this={loadingDlg} id="loading-dialog">
    <p>Creating Icongrid....</p>
</dialog>

<div id="preview-div">
    <img bind:this={displayImg} src="" alt={"The " + ((isLegacy) ? "" : "final") + " icongrid will be displayed here."}>
    {#if !hasPreview}
        <div id="preview-empty">
            <Icon name="grid" size={40} />
            <p><strong>Icongrid preview</strong></p>
            <p>
                {#if isLegacy}
                    Legacy Mode: add an existing icongrid, add the icons you want to put in it, then generate.
                {:else}
                    Add two 150 &times; 150 icon PNGs, then press <em>Generate Icongrid</em>.
                {/if}
            </p>
        </div>
    {/if}
</div>

<div bind:this={controlsDiv} id="controls" class="layout-normal layout-legacy">
    <div class="group">
        <label for="legacy-mode" id="legacy-mode-label" class="chip">
            <input type="checkbox" bind:checked={isLegacy} name="legacy-mode" id="legacy-mode" />
            Legacy Mode
        </label>
        {#if isLegacy}
            <button id="add-icongrid" on:click={(_) => openFileDialog(onIcongridAdd, 'image/png', false) }><Icon name="grid" /> Add Icongrid</button>
            <button id="clear-icongrid" on:click={()=>{ curIcongrid = null; }}><Icon name="x" /> Clear Icongrid</button>
        {/if}
    </div>
    <div class="counts" aria-live="polite">Number of icons selected: <strong>{selectedFiles.length}</strong></div>
    <div class="group">
        <button on:click={clearFiles}><Icon name="trash" /> Clear Icons</button>
        <button id="add-icons" on:click={(_)=>openFileDialog(onFileSelection, 'image/png')}><Icon name="image-plus" /> Add Icons</button>
        <button id="generate-grid" class="btn-primary" on:click={makeIcongrid}><Icon name="download" /> Generate Icongrid</button>
    </div>
</div>

<style>
    #preview-div {
        position: relative;
        flex: 1 1 auto;
        min-height: 160px;
        overflow: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        padding: 12px;
        background-color: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
    }

    #preview-div img {
        display: block;
        max-width: none;
        background-color: var(--checker-a);
        background-image:
            linear-gradient(45deg, var(--checker-b) 25%, transparent 25%, transparent 75%, var(--checker-b) 75%),
            linear-gradient(45deg, var(--checker-b) 25%, transparent 25%, transparent 75%, var(--checker-b) 75%);
        background-size: 16px 16px;
        background-position: 0 0, 8px 8px;
    }

    /* an <img> without src is hidden so no broken-image icon / alt text shows */
    #preview-div img:not([src]),
    #preview-div img[src=""] {
        display: none;
    }

    #preview-empty {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 16px;
        text-align: center;
        color: var(--text-muted);
        pointer-events: none;
    }

    #preview-empty p {
        margin: 4px 0 0;
        max-width: 34rem;
    }

    #preview-empty strong {
        color: var(--text);
    }

    #controls {
        flex: none;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px 12px;
        padding: 8px 8px 13px;
        background-color: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
    }

    .group {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
    }

    #controls button {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
    }

    .counts {
        flex: 1 1 auto;
        text-align: center;
        color: var(--text-muted);
        font-size: 0.92rem;
    }

    .counts strong {
        color: var(--text);
    }

    .chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 0 12px;
        white-space: nowrap;
    }

    dialog#loading-dialog {
        border: 1px solid var(--border-strong);
        border-radius: 14px;
        background-color: var(--surface);
        color: var(--text);
        box-shadow: var(--shadow);
        padding: 8px 24px;
    }

    @media screen and (max-width: 720px) {
        .counts {
            order: 3;
            flex: 1 1 100%;
            text-align: left;
        }
    }
</style>
