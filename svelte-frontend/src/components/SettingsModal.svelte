<script lang="ts">
    import Modal from "./Modal.svelte";
    import { soundEnabled, playUiSound } from '../sounds';
    import { deviceChoice } from '../device';

    export let showView = false;

    export let settings = {
        padding: 2,
        prefixType: 'no-prefix',
        usePrefixOnXMLFrames: false,
        customPrefix: '',
        uniqueFramesOnly: false,
        clipToBoundingBox: true,
        autoTrim: 'import',
        sequenceFullCanvas: false,
        xmlAnimPrefixTrimChars: -1,
        importOrder: 'natural',
    };
</script>

<Modal bind:showModal={showView}>
    <h2 slot="header">Settings</h2>
    <div id="modal-content">
        <fieldset>
            <legend>
                Image
            </legend>
            <label for="padding">
                Image Padding
                <input type="number" name="padding" id="padding" bind:value={settings.padding} min="0" max="20" />
            </label>
        </fieldset>
        <fieldset>
            <legend>
                Auto-Trim transparent borders
            </legend>
            <label for="trim-import">
                <input type="radio" name="auto-trim" id="trim-import" value="import" bind:group={settings.autoTrim}>
                On import (recommended) - trim right after adding PNG / ZIP images
            </label>
            <label for="trim-generate">
                <input type="radio" name="auto-trim" id="trim-generate" value="generate" bind:group={settings.autoTrim}>
                On Generate - trim when the spritesheet is built
            </label>
            <label for="trim-off">
                <input type="radio" name="auto-trim" id="trim-off" value="off" bind:group={settings.autoTrim}>
                Off - keep the full image of every frame
            </label>
            <p class="hint">
                Active mode: <strong>{settings.autoTrim === 'import' ? 'On import' : (settings.autoTrim === 'generate' ? 'On Generate' : 'Off')}</strong>.
                Your files are never changed. Each frame keeps its own sizes: <code>width/height</code> = trimmed pixels,
                <code>frameX/frameY</code> = where the trimmed area sits (negative offset), <code>frameWidth/frameHeight</code> = original image size.
                Images are trimmed once only. The mode applies to images added afterwards; frames that are already in the list keep how they were added.
            </p>
        </fieldset>
        <fieldset>
            <legend>
                PNG sequence export
            </legend>
            <label for="seq-trimmed">
                <input type="radio" name="seq-canvas" id="seq-trimmed" value={false} bind:group={settings.sequenceFullCanvas}>
                Trimmed images (real pixel size) + offsets.csv
            </label>
            <label for="seq-full">
                <input type="radio" name="seq-canvas" id="seq-full" value={true} bind:group={settings.sequenceFullCanvas}>
                Full-size frames (original canvas, e.g. 512 &times; 512)
            </label>
        </fieldset>
        <fieldset>
            <legend>
                Device layout
            </legend>
            <label for="dev-auto"><input type="radio" name="device" id="dev-auto" value="auto" bind:group={$deviceChoice}> Automatic (match my screen)</label>
            <label for="dev-phone"><input type="radio" name="device" id="dev-phone" value="phone" bind:group={$deviceChoice}> Phone</label>
            <label for="dev-tablet"><input type="radio" name="device" id="dev-tablet" value="tablet" bind:group={$deviceChoice}> Tablet</label>
            <label for="dev-desktop"><input type="radio" name="device" id="dev-desktop" value="desktop" bind:group={$deviceChoice}> Desktop</label>
            <p class="hint">Only changes spacing and button size. All tools stay available and your project is not touched. The panel arrangement follows the real window width.</p>
        </fieldset>
        <fieldset>
            <legend>
                Sound
            </legend>
            <label for="ui-sound">
                <input type="checkbox" id="ui-sound" bind:checked={$soundEnabled} on:change={() => playUiSound('normal')}>
                Button click sounds
            </label>
        </fieldset>
        <fieldset>
            <legend>
                Import order
            </legend>
            <label for="import-order-natural">
                <input type="radio" name="import-order" id="import-order-natural" value="natural" bind:group={settings.importOrder}>
                Natural numeric order by file name (frame2 before frame10) - recommended
            </label>
            <label for="import-order-browser">
                <input type="radio" name="import-order" id="import-order-browser" value="browser" bind:group={settings.importOrder}>
                Order given by the file picker (not guaranteed by all browsers)
            </label>
            <p class="hint">New images are always added after the existing frames. Existing frames are never re-sorted; use the Order menu to rearrange them yourself. ZIP files are always read in path order (folders, then names, numbers compared numerically).</p>
        </fieldset>
        <fieldset>
            <legend>
                Animation Name Prefixing
            </legend>
            <label for="prefix-type-character-name">
                <input type="radio" name="prefix-type" id="prefix-type-character-name" value="character-name" bind:group={settings.prefixType}>
                Use character name as prefix
            </label>
            <label for="prefix-type-custom-prefix">
                <input type="radio" name="prefix-type" id="prefix-type-custom-prefix" value="custom-prefix" bind:group={settings.prefixType}>
                Use custom name as prefix
            </label>
            <label for="custom-prefix">Custom Prefix</label>
            <input type="text" id="custom-prefix" bind:value={settings.customPrefix} disabled={settings.prefixType !== 'custom-prefix'}>
            <label for="prefix-type-no-prefix">
                <input type="radio" name="prefix-type" id="prefix-type-no-prefix" value="no-prefix" bind:group={settings.prefixType}>
                Do not use a prefix
            </label>
    
            <label for="use-prefix-on-existing-xmls">
                <input bind:checked={settings.usePrefixOnXMLFrames} type="checkbox" name="use-prefix-on-existing-xmls" id="use-prefix-on-existing-xmls">
                Use Prefix even if frame is imported from existing Spritesheet
            </label>
            <label for="n-trim-chars-xml">
                <input type="number" name="n-trim-chars-xml" id="n-trim-chars-xml" min="-1" max="10" bind:value={settings.xmlAnimPrefixTrimChars}>
                Number of digits to trim from the end while importing existing spritesheets
            </label>
        </fieldset>
        <fieldset>
            <legend>
                Image Sequence Generation
            </legend>
            <label for="img-seq-gen">
                <input bind:checked={settings.uniqueFramesOnly} type="checkbox" name="img-seq-gen" id="img-seq-gen">
                Only export Unique Frames when exporting as Image Sequence
            </label>
        </fieldset>
    </div>
</Modal>

<style>
    #modal-content {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    fieldset {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    /* each option is one comfortable, tappable row */
    fieldset label {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 34px;
    }

    .hint {
        margin: 0;
        font-size: 0.85rem;
        color: var(--text-muted);
    }

    fieldset input[type="number"] {
        width: 5.5rem;
    }

    fieldset input[type="text"] {
        width: 100%;
    }
</style>
