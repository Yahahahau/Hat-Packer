<script lang="ts">
    import Modal from "./Modal.svelte";
    import type { SpriteFrameData } from "../spriteframedata";
    import { AnimationController } from "../animationcontroller";
    import { onMount } from "svelte";
    import { spriteframes } from '../stores';
    import { Parser } from 'expr-eval';

    export let showView = false;

    let currSelectedRow:number|null = null;
    let curSprFrame:SpriteFrameData = null;

    const frameProperties = [
        'frameX',
        'frameY',
        'frameWidth',
        'frameHeight',
    ];
    const transformProperties = [
        'newWidth',
        'newHeight',
    ];
    const boolProperties = [
        'flipX',
        'flipY',
    ];

    type Controls = {
        frameX: HTMLInputElement
        frameY: HTMLInputElement
        frameWidth: HTMLInputElement
        frameHeight: HTMLInputElement
        newWidth: HTMLInputElement
        newHeight: HTMLInputElement
        flipX: HTMLInputElement
        flipY: HTMLInputElement
    };

    const frameControls: Controls = {
        frameX: null,
        frameY: null,
        frameWidth: null,
        frameHeight: null,
        newWidth: null,
        newHeight: null,
        flipX: null,
        flipY: null
    };
    let _animScaleInput:HTMLInputElement = null;

    let rows:HTMLTableRowElement[] = [];
    let canvasElement:HTMLCanvasElement = null;
    let animController:AnimationController = new AnimationController(null);

    let showGroupChangeModal = false;

    onMount(()=>{
        animController = new AnimationController(canvasElement.getContext('2d'));
        _animScaleInput.value = ''+animController.animationScale;
    });

    function onKeyPressTable(ev: KeyboardEvent)
    {
        ev.preventDefault();
        switch (ev.key)
        {
            case 'ArrowUp':
                let nextRow = (currSelectedRow - 1 >= 0) ? currSelectedRow - 1 : $spriteframes.length - 1;
                _handleRowClick(nextRow);
                break;
            case 'ArrowDown':
                let prevRow = (currSelectedRow + 1) % $spriteframes.length;
                _handleRowClick(prevRow);
                break;
            case 'Home':
                _handleRowClick(0);
                break;
            case 'End':
                _handleRowClick($spriteframes.length - 1);
                break;
            default:
                // console.log(`Selected rows are at: ${selectedRows}`);
                break;
        }
        drawFrameWithBox($spriteframes[currSelectedRow]).then(() => {}); // too lazy to make this whole function async :p
        rows[currSelectedRow].scrollIntoView(false);
    }

    async function drawFrameWithBox(sprframe: SpriteFrameData)
    {
        if(canvasElement)
        {
            await animController.initFrames([ sprframe ]);
            animController.clearCanvas();
            animController.drawImage(animController.curImgs[0], sprframe, true);
        }
    }

    function _onAnimationScaleChange(e: Event)
    {
        animController.animationScale = parseFloat((e.target as HTMLInputElement).value);
        drawFrameWithBox(curSprFrame).then(()=>{});
        animController = animController;
    }

    function _handleRowClick(index: number)
    {
        currSelectedRow = index;
        curSprFrame = $spriteframes[index];
        for(const r of rows)
        {
            if(r)
            {
                r.classList.remove('cell-selected');
            }
        }
        rows[index].classList.add('cell-selected');

        for(const prop of frameProperties)
        {
            frameControls[prop].value = '' + curSprFrame.frameRect[prop];
        }
        for(const prop of transformProperties)
        {
            frameControls[prop].value = '' + curSprFrame.transform[prop];
        }
        for(const prop of boolProperties)
        {
            frameControls[prop].checked = curSprFrame.transform[prop];
        }
    }

    function onValueChange(e: Event)
    {
        for(const prop of frameProperties)
        {
            curSprFrame.frameRect[prop] = +frameControls[prop].value;
        }
        for(const prop of transformProperties)
        {
            curSprFrame.transform[prop] = +frameControls[prop].value;
        }
        for(const prop of boolProperties)
        {
            curSprFrame.transform[prop] = frameControls[prop].checked;
        }

        curSprFrame._changed = true;
        spriteframes.set($spriteframes);
        drawFrameWithBox(curSprFrame).then(()=>{});
    }

    let selectedRows:number[] = [];
    function onRowChecked(e:Event, idx: number)
    {
        const t = e.target as HTMLInputElement;
        if(t.checked)
        {
            selectedRows = [ ...selectedRows, idx ];
        }
        else
        {
            const ind = selectedRows.indexOf(idx);
            if(ind >= 0)
            {
                selectedRows.splice(ind, 1);
            }
            selectedRows = selectedRows;
        }
    }

    let modificationControls: Controls = {
        frameX: null,
        frameY: null,
        frameWidth: null,
        frameHeight: null,
        newWidth: null,
        newHeight: null,
        flipX: null,
        flipY: null,
    };
    function applyModification()
    {
        const rawValues = [];
        for(const prop of frameProperties)
        {
            rawValues.push([ prop, modificationControls[prop].value ]);
        }
        for(const prop of transformProperties)
        {
            rawValues.push([ prop, modificationControls[prop].value ]);
        }
        for(const prop of boolProperties)
        {
            rawValues.push([ prop, modificationControls[prop].value ]);
        }

        const mathParser = new Parser({ operators: { logical: true } });

        const exprs = new Map(rawValues.map(([prp, exprStr]) => {
            if(exprStr.length > 0)
            {
                return [prp, mathParser.parse(exprStr)];
            }
            else
            {
                return [ prp, null ];
            }
        }));
        // console.log(exprs);
        
        spriteframes.update((prev) => {
            for(const idx of selectedRows)
            {
                for(const prop of frameProperties)
                {
                    const expr = exprs.get(prop);
                    if(expr)
                    {
                        prev[idx].frameRect[prop] = Math.floor(expr.evaluate({ value: prev[idx].frameRect[prop] }));
                    }
                }
                for(const prop of transformProperties)
                {
                    const expr = exprs.get(prop);
                    if(expr)
                    {
                        prev[idx].transform[prop] = Math.floor(exprs.get(prop).evaluate({ value: prev[idx].transform[prop] }));
                    }
                }
                for(const prop of boolProperties)
                {
                    const expr = exprs.get(prop);
                    if(expr)
                    {
                        prev[idx].transform[prop] = !!(exprs.get(prop).evaluate({ value: prev[idx].transform[prop] }));
                    }
                }

                prev[idx]._changed = true;
            }
            return prev;
        });
        _handleRowClick(currSelectedRow);
        drawFrameWithBox($spriteframes[currSelectedRow]).then(() => {});

        showGroupChangeModal = false; // close modal

        const getCheckBox = (childElems: HTMLCollection) => { // helper to get checkbox element of a row
            for (const kid of childElems) {
                if(kid.children.length === 1)
                {
                    return kid.children[0];
                }
            }
            return null;
        };
        
        for (const rowIndex of selectedRows) {
            const _row = rows[rowIndex];
            const chkbx = getCheckBox(_row.children);
            if(chkbx)
            {
                const checkboxElem: HTMLInputElement = chkbx as HTMLInputElement;
                checkboxElem.checked = false;
            }
        }
        selectedRows = [];
    }
</script>


<Modal bind:showModal={showView} closeButtonMsg={"Save and Close"} size="lg">
    <div slot="header">
        <h4>XML View</h4>
    </div>
    <div id="view-container">
        <section id="table-pane" aria-label="Frame table">
            <div class="table-toolbar">
                <span class="muted">{$spriteframes.length} frame{$spriteframes.length === 1 ? '' : 's'} &middot; {selectedRows.length} checked</span>
                <button class="modify-btn-large-screen" disabled={selectedRows.length < 1} on:click={() => showGroupChangeModal = true}>Modify selected</button>
            </div>
            <div id="table-div">
                <table class="not-selectable" on:keydown={onKeyPressTable}>
                    <thead>
                        <tr>
                            <th></th>
                            <th class="col-prefix">Prefix</th>
                            <th>Width</th>
                            <th>Height</th>
                            <th>Frame X</th>
                            <th>Frame Y</th>
                            <th>Frame Width</th>
                            <th>Frame Height</th>
                            <th>New Image Width</th>
                            <th>New Image Height</th>
                            <th>flip X</th>
                            <th>flip Y</th>
                        </tr>
                    </thead>

                    <tbody>
                        {#each $spriteframes as spr,i (spr.sprId)}
                            <tr tabindex="{i}" bind:this={rows[i]} on:click|stopPropagation={async (_)=>{ _handleRowClick(i); await drawFrameWithBox(spr); }}>
                                <td>
                                    <input type="checkbox" name="select-{spr.sprId}" id="select-{spr.sprId}" on:change={async (e)=>{ _handleRowClick(i); await drawFrameWithBox(spr); onRowChecked(e, i); }}>
                                </td>
                                <td class="col-prefix" title={spr.animationPrefix}>{spr.animationPrefix}</td>
                                <td>{spr.rect.width}</td>
                                <td>{spr.rect.height}</td>
                                <td>{spr.frameRect.frameX}</td>
                                <td>{spr.frameRect.frameY}</td>
                                <td>{spr.frameRect.frameWidth}</td>
                                <td>{spr.frameRect.frameHeight}</td>
                                <td>{spr.transform.newWidth}</td>
                                <td>{spr.transform.newHeight}</td>
                                <td>{spr.transform.flipX}</td>
                                <td>{spr.transform.flipY}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </section>

        <section id="inspector" aria-label="Frame inspector">
            <div id="mini-table-view">
                <div class="mini-controls-horizontal">
                    <button disabled={$spriteframes.length < 1} on:click={async () => { _handleRowClick(((currSelectedRow - 1) < 0 ? $spriteframes.length - 1 : currSelectedRow - 1)); await drawFrameWithBox($spriteframes[currSelectedRow]); }}>&lt; Previous</button>
                    <table class="not-selectable">
                        <thead>
                            <tr>
                                <th></th>
                                <th>Prefix</th>
                                <th>Width</th>
                                <th>Height</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><input disabled={$spriteframes.length < 1 || currSelectedRow === null} type="checkbox" name="test" id="test" checked={selectedRows.indexOf(currSelectedRow) >= 0} on:change={async (e)=>{ _handleRowClick(currSelectedRow); await drawFrameWithBox($spriteframes[currSelectedRow]); onRowChecked(e, currSelectedRow); }}></td>
                                <td>{curSprFrame && curSprFrame.animationPrefix}</td>
                                <td>{curSprFrame && curSprFrame.rect.width}</td>
                                <td>{curSprFrame && curSprFrame.rect.height}</td>
                            </tr>
                        </tbody>
                    </table>
                    <button disabled={$spriteframes.length < 1} on:click={async () => { _handleRowClick((currSelectedRow + 1) % $spriteframes.length); await drawFrameWithBox($spriteframes[currSelectedRow]); }}>Next &gt;</button>
                </div>
                <p>You have selected {selectedRows.length} frames</p>
                <button disabled={selectedRows.length < 1} on:click={() => showGroupChangeModal = true}>Modify selection</button>
            </div>

            <div class="preview-bar">
                <span class="muted">Frame preview</span>
                <label class="scale-field xml-input-cell-container" for="animation-scale">
                    Animation Scale
                    <input bind:this={_animScaleInput} type="number" name="animation-scale" id="animation-scale" min="0.01" step="0.01" inputmode="decimal" on:input={_onAnimationScaleChange}>
                </label>
            </div>

            <div class="canvas-div">
                <canvas bind:this={canvasElement} width="600px" height="500px"></canvas>
            </div>

            <div class="controls-horizontal">
                <fieldset class="group-frame">
                    <legend>Position &amp; frame</legend>
                    <label class="xmlview-input" for="frame-x">
                        Frame X
                        <input type="number" name="frame-x" id="frame-x" inputmode="numeric" on:input={onValueChange} bind:this={frameControls.frameX}>
                    </label>
                    <label class="xmlview-input" for="frame-y">
                        Frame Y
                        <input type="number" name="frame-y" id="frame-y" inputmode="numeric" on:input={onValueChange} bind:this={frameControls.frameY}>
                    </label>
                    <label class="xmlview-input" for="frame-width">
                        Frame Width
                        <input type="number" name="frame-width" id="frame-width" inputmode="numeric" on:input={onValueChange} bind:this={frameControls.frameWidth}>
                    </label>
                    <label class="xmlview-input" for="frame-height">
                        Frame Height
                        <input type="number" name="frame-height" id="frame-height" inputmode="numeric" on:input={onValueChange} bind:this={frameControls.frameHeight}>
                    </label>
                </fieldset>
                <fieldset class="group-size">
                    <legend>Scale</legend>
                    <label class="xmlview-input" for="scale-x">
                        Image Width
                        <input type="number" name="scale-x" id="scale-x" min="1" inputmode="numeric" on:input={onValueChange} bind:this={frameControls.newWidth}>
                    </label>
                    <label class="xmlview-input" for="scale-y">
                        Image Height
                        <input type="number" name="scale-y" id="scale-y" min="1" inputmode="numeric" on:input={onValueChange} bind:this={frameControls.newHeight}>
                    </label>
                </fieldset>
                <fieldset class="group-flip">
                    <legend>Flip</legend>
                    <label class="xmlview-check" for="flip-x">
                        <input type="checkbox" name="flip-x" id="flip-x" on:input={onValueChange} bind:this={frameControls.flipX}>
                        Flip X
                    </label>
                    <label class="xmlview-check" for="flip-y">
                        <input type="checkbox" name="flip-y" id="flip-y" on:input={onValueChange} bind:this={frameControls.flipY}>
                        Flip Y
                    </label>
                </fieldset>
            </div>
        </section>
    </div>
</Modal>

<Modal bind:showModal={showGroupChangeModal}>
    <h3 slot="header">Modify Selection</h3>
    <div>
        <div class="mod-grid">
            <label class="xmlview-input" for="mod-frame-x">
                Frame X
                <input bind:this={modificationControls.frameX} type="text" name="mod-frame-x" id="mod-frame-x">
            </label>
            <label class="xmlview-input" for="mod-frame-y">
                Frame Y
                <input bind:this={modificationControls.frameY} type="text" name="mod-frame-y" id="mod-frame-y">
            </label>
            <label class="xmlview-input" for="mod-frame-width">
                Frame Width
                <input bind:this={modificationControls.frameWidth} type="text" name="mod-frame-width" id="mod-frame-width">
            </label>
            <label class="xmlview-input" for="mod-frame-height">
                Frame Height
                <input bind:this={modificationControls.frameHeight} type="text" name="mod-frame-height" id="mod-frame-height">
            </label>
            <label class="xmlview-input" for="mod-scale-x">
                Image Width
                <input bind:this={modificationControls.newWidth} type="text" name="mod-scale-x" id="mod-scale-x" min="1">
            </label>
            <label class="xmlview-input" for="mod-scale-y">
                Image Height
                <input bind:this={modificationControls.newHeight} type="text" name="mod-scale-y" id="mod-scale-y" min="1">
            </label>
            <label class="xmlview-input" for="mod-flip-x">
                Flip X
                <input bind:this={modificationControls.flipX} type="text" name="mod-flip-x" id="mod-flip-x">
            </label>
            <label class="xmlview-input" for="mod-flip-y">
                Flip Y
                <input bind:this={modificationControls.flipY} type="text" name="mod-flip-y" id="mod-flip-y">
            </label>
        </div>
        <p class="note">Note: You can enter a number or an expression like <strong><code>value + 3</code></strong></p>
        <p class="note">Expressions will be applied on the current value of each cell (by substituting '<code>value</code>')</p>
        <p class="note">You can flip boolean values by using the expression: '<code><i>not</i> value</code>' (and the only values allowed are <code>true</code> and <code>false</code> )</p>
    </div>
    <button slot="accept-btn" on:click={applyModification}>Modify</button>
</Modal>

<style>
    .muted {
        color: var(--text-muted);
        font-size: 0.9rem;
    }

    /* ---------- layout: table | inspector ---------- */
    #view-container {
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
        gap: 14px;
        flex: 1 1 auto;
        min-height: 0;
    }

    /* tablet portrait / narrow windows: table on top, inspector below */
    @media screen and (max-width: 1020px) {
        #view-container {
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows: minmax(130px, 0.7fr) minmax(0, 1.5fr);
        }
    }

    #inspector {
        overflow-y: auto;
        overscroll-behavior: contain;
    }

    #table-pane,
    #inspector {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
        min-height: 0;
    }

    .table-toolbar {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
    }

    #table-div {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
    }

    /* ---------- tables ---------- */
    table {
        border-collapse: separate;
        border-spacing: 0;
        width: 100%;
        font-size: 0.9rem;
        font-variant-numeric: tabular-nums;
    }

    #table-div table {
        min-width: 760px;
    }

    th, td {
        padding: 8px 10px;
        border-bottom: 1px solid var(--border);
        text-align: right;
        white-space: nowrap;
    }

    th:first-child, td:first-child {
        text-align: center;
        width: 44px;
    }

    th.col-prefix, td.col-prefix {
        text-align: left;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    thead th {
        position: sticky;
        top: 0;
        z-index: 1;
        background: var(--surface-3);
        font-weight: 600;
        font-size: 0.8rem;
        color: var(--text-muted);
    }

    tbody tr {
        cursor: pointer;
    }

    tbody tr:hover {
        background: var(--surface-2);
    }

    tr:global(.cell-selected),
    tr:global(.cell-selected):hover {
        background-color: var(--accent-soft);
        box-shadow: inset 3px 0 0 var(--accent);
    }

    td input[type="checkbox"] {
        margin: 0;
    }

    /* ---------- inspector ---------- */
    .canvas-div {
        flex: 1 1 200px;
        min-height: 160px;
        overflow: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
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
        display: block;
    }

    .controls-horizontal {
        flex: none;
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 10px;
    }

    .controls-horizontal fieldset {
        display: grid;
        gap: 8px;
        min-width: 0;
        padding: 8px 12px 12px;
    }

    .group-frame { grid-column: span 6; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .group-size { grid-column: span 4; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .group-flip { grid-column: span 2; grid-template-columns: minmax(0, 1fr); align-content: center; gap: 0; }

    .preview-bar {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
    }

    .scale-field {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.85rem;
        color: var(--text-muted);
    }

    .scale-field input {
        width: 90px;
        color: var(--text);
    }

    /* roomier fields: the browser spin buttons ate the digits on narrow panes */
    .xmlview-input > input[type="number"],
    .scale-field input {
        -moz-appearance: textfield;
        appearance: textfield;
        padding: 0 8px;
    }
    .xmlview-input > input[type="number"]::-webkit-outer-spin-button,
    .xmlview-input > input[type="number"]::-webkit-inner-spin-button,
    .scale-field input::-webkit-outer-spin-button,
    .scale-field input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }

    .xmlview-input {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 0.8rem;
        color: var(--text-muted);
        min-width: 0;
    }

    .xmlview-input > input {
        width: 100%;
        min-width: 0;
        color: var(--text);
        font-size: 1rem;
    }

    .xmlview-check {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: var(--tap);
    }

    /* ---------- group-modify dialog ---------- */
    .mod-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
        gap: 10px;
    }

    .note {
        margin: 10px 0 0;
        font-size: 0.88rem;
        color: var(--text-muted);
    }

    /* ---------- phone layout (original behaviour: mini one-row table + prev/next) ---------- */
    #mini-table-view {
        display: none;
    }

    #mini-table-view > * > table {
        width: 60%;
    }

    .mini-controls-horizontal {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 8px;
    }

    @media screen and (max-width: 700px) {
        #table-pane {
            display: none;
        }

        #view-container {
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows: minmax(0, 1fr);
        }

        #mini-table-view {
            display: block;
        }

        .controls-horizontal {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .group-frame,
        .group-size,
        .group-flip {
            grid-column: span 2;
        }

        .group-flip {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .canvas-div {
            min-height: 140px;
        }
    }

    .not-selectable {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        -khtml-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
    }
</style>
