<script lang="ts">
    import Modal from '../components/Modal.svelte';
    import { sortFilesNaturally, yieldToUI, naturalCompare, findOpaqueBounds } from '../importutils';
    import { readZip, matchAtlas, ZipImportError } from '../zipimport';
    import { deferTask, getImageDimensions, hashImage, isValidFilename, openFileDialog, removeNumericSuffix, saveFile, uidgen } from '../utils'
    import AnimationView from './AnimationView.svelte';
    import XmlTableView from './XMLTableView.svelte';
    import { SpriteFrameData } from '../spriteframedata';
    import { spriteframes, spritesheet_map } from '../stores';
    import { arrayBufferToBase64, base64DecToArr } from '../b64utils';
    import type { Wasm_T } from '../global';
    import SettingsModal from './SettingsModal.svelte';
    import DropUpMenu from './DropUpMenu.svelte';
    import Icon from './Icon.svelte';
    import type { GrowingPacker } from '../../../rust-img-lib/Cargo.toml';

    export let wasm: Wasm_T;
    export let charname: string;

    export let rangeSelectionMode = false;

    let imgSettings = {
        padding: 2,
        prefixType: 'no-prefix',
        usePrefixOnXMLFrames: false,
        customPrefix: '',
        uniqueFramesOnly: false,
        clipToBoundingBox: true, // derived from autoTrim below (kept because the generate code reads it)
        autoTrim: 'import',      // 'import' = trim right after import, 'generate' = trim when generating, 'off'
        xmlAnimPrefixTrimChars: -1,
        importOrder: 'natural', // 'natural' = natural numeric sort of file names, 'browser' = order given by the file picker
    };

    // ---------- importing images (PNG picker + ZIP) ----------
    const IMPORT_BATCH = 8;      // images read per slice of work before the UI gets a turn
    const MAX_PNG_PER_PICK = 1000;
    let importing = false;       // only the "Add ..." buttons are disabled while this is true

    function fileKey(f: File)
    {
        return `${f.name}|${f.size}|${f.lastModified}`;
    }

    function summarize(skipped: string[])
    {
        if(skipped.length === 0) return '';
        console.warn('[import] skipped:', skipped);
        const shown = skipped.slice(0, 3).join('; ');
        return ` Skipped ${skipped.length}: ${shown}${skipped.length > 3 ? '; ...' : ''}.`;
    }

    /**
     * Adds PNG files as frames, in the order given, appended after the existing frames.
     * Existing frames are never re-sorted or moved. Files are read in small batches so the
     * page keeps responding (important on iOS/Android with many images).
     */
    let trimmedCount = 0;
    $: imgSettings.clipToBoundingBox = imgSettings.autoTrim !== 'off';

    async function addPngFiles(files: File[], skipped: string[], skipDuplicates = true): Promise<number>
    {
        const existing = new Set($spriteframes.filter((f) => f.type === 'single_frame').map((f) => fileKey(f.imgfileref)));
        let added = 0;
        trimmedCount = 0;
        const trimOnImport = imgSettings.autoTrim === 'import';
        for(let i = 0; i < files.length; i += IMPORT_BATCH)
        {
            const addedPngs = [];
            for(const f of files.slice(i, i + IMPORT_BATCH))
            {
                // the same file picked again (name + size + modified time) is skipped, not duplicated
                if(skipDuplicates && f.lastModified > 0 && existing.has(fileKey(f)))
                {
                    skipped.push(`${f.name} (already added)`);
                    continue;
                }
                let dims: number[];
                try {
                    dims = await getImageDimensions(f);
                } catch (err) {
                    skipped.push(`${f.name} (not a readable PNG)`);
                    continue;
                }
                const [ imgWidth, imgHeight ] = dims;
                const newFrame = new SpriteFrameData(f.name + '::' + uidgen.getNewId(), 'single_frame', f, null, null);
                newFrame.rect.width = imgWidth;
                newFrame.rect.height = imgHeight;
                newFrame.transform.newWidth = imgWidth;
                newFrame.transform.newHeight = imgHeight;
                newFrame.frameRect.frameWidth = imgWidth;
                newFrame.frameRect.frameHeight = imgHeight;
                newFrame.animationPrefix = f.name.replace(/\.png$/i, '');

                // Auto-Trim on import: only the visible box is recorded (the file is never modified).
                //   rect            = trimmed area inside the original image
                //   frameX/frameY   = -left/-top  (offset that puts the trimmed area back in place)
                //   frameWidth/Height = ORIGINAL size, so every frame keeps its own anchor
                if(trimOnImport)
                {
                    const b = await findOpaqueBounds(f, imgWidth, imgHeight);
                    if(b !== null && b !== 'skip')
                    {
                        const tw = b.right - b.left;
                        const th = b.bottom - b.top;
                        newFrame.trim = { left: b.left, top: b.top, origWidth: imgWidth, origHeight: imgHeight };
                        newFrame.rect = { x: b.left, y: b.top, width: tw, height: th };
                        newFrame.transform.newWidth = tw;
                        newFrame.transform.newHeight = th;
                        newFrame.frameRect.frameX = -b.left;
                        newFrame.frameRect.frameY = -b.top;
                        if(tw !== imgWidth || th !== imgHeight) trimmedCount++;
                    }
                }

                if(f.lastModified > 0) existing.add(fileKey(f));
                addedPngs.push(newFrame);
            }
            if(addedPngs.length > 0)
            {
                spriteframes.update((prev) => [...prev, ...addedPngs]);
                added += addedPngs.length;
            }
            setStatus('info', `${trimOnImport ? 'Reading and trimming' : 'Reading'} images... ${Math.min(i + IMPORT_BATCH, files.length)} / ${files.length}`);
            await yieldToUI();
        }
        return added;
    }

    async function onPNGAdd(e: Event)
    {
        const target = e.target as HTMLInputElement;
        // snapshot the FileList right away (the picker input is discarded after the change event)
        let picked = Array.from(target.files || []);
        if(picked.length === 0) return;
        if(importing)
        {
            setStatus('error', 'An import is already running - please wait for it to finish.');
            return;
        }
        importing = true;
        try {
            const skipped: string[] = [];
            if(picked.length > MAX_PNG_PER_PICK)
            {
                skipped.push(`${picked.length - MAX_PNG_PER_PICK} files over the limit of ${MAX_PNG_PER_PICK}`);
                picked = picked.slice(0, MAX_PNG_PER_PICK);
            }
            // default: natural numeric order (frame2 before frame10), identical on every device.
            // 'browser' keeps the order handed over by the picker (not guaranteed by browsers).
            const ordered = (imgSettings.importOrder === 'browser') ? picked : sortFilesNaturally(picked);
            const n = await addPngFiles(ordered, skipped);
            setStatus(n > 0 ? 'info' : 'error', (n > 0 ? `Added ${n} image${n === 1 ? '' : 's'} at the end of the list${trimmedCount > 0 ? ` (${trimmedCount} auto-trimmed)` : ''}.` : 'No images were added.') + summarize(skipped));
        } catch (err) {
            console.error(err);
            setStatus('error', 'Could not import the images: ' + err);
        } finally {
            importing = false;
        }
    }

    async function onZipAdd(e: Event)
    {
        const zipFile = (e.target as HTMLInputElement).files?.[0];
        if(!zipFile) return;
        if(importing)
        {
            setStatus('error', 'An import is already running - please wait for it to finish.');
            return;
        }
        importing = true;
        try {
            const res = await readZip(zipFile, (m) => setStatus('info', m));
            const notes = [ ...res.warnings ];
            const skipped = [ ...res.skipped ];

            // XML files are optional: use one only when it describes an image that is in the ZIP
            const usedImages = new Set<any>();
            let atlasFrames = 0;
            for(const x of res.xmls)
            {
                const sheet = matchAtlas(x, res.images);
                if(sheet === null || usedImages.has(sheet))
                {
                    notes.push(`${x.path}: XML ignored (no matching spritesheet PNG in the ZIP).`);
                    continue;
                }
                const before = $spriteframes.length;
                const failed = await addSpritesheetAndXML(null, sheet.file, new File([x.text], x.name, { type: 'text/xml' }));
                if(failed)
                {
                    notes.push(`${x.path}: XML could not be used.`);
                    continue;
                }
                usedImages.add(sheet);
                atlasFrames += $spriteframes.length - before;
            }

            // every other PNG becomes a frame, in path order (folders first, numbers numeric)
            const singles = res.images.filter((im) => !usedImages.has(im)).map((im) => im.file);
            // ZIP entries are identified by their path, not by name/size, so no duplicate check here
            const n = await addPngFiles(singles, skipped, false);
            const parts = [];
            if(n > 0) parts.push(`${n} image${n === 1 ? '' : 's'}${trimmedCount > 0 ? ` (${trimmedCount} auto-trimmed)` : ''}`);
            if(atlasFrames > 0) parts.push(`${atlasFrames} frame${atlasFrames === 1 ? '' : 's'} from the XML spritesheet`);
            setStatus(parts.length > 0 ? 'info' : 'error',
                (parts.length > 0 ? `Imported ${parts.join(' + ')} from ${zipFile.name}.` : 'Nothing was imported from the ZIP.') + ' ' + notes.join(' ') + summarize(skipped));
        } catch (err) {
            if(err instanceof ZipImportError)
            {
                console.warn('[zip import]', err.message);
                setStatus('error', err.message);
            }
            else
            {
                console.error(err);
                setStatus('error', 'Could not import the ZIP: ' + err);
            }
        } finally {
            importing = false;
        }
    }

    // ---------- manual frame order (the list is never re-sorted automatically) ----------
    function moveSelection(mode: 'start' | 'left' | 'right' | 'end')
    {
        const arr = [ ...$spriteframes ];
        if(!arr.some((f) => f.selected)) return;
        if(mode === 'start' || mode === 'end')
        {
            const sel = arr.filter((f) => f.selected);
            const rest = arr.filter((f) => !f.selected);
            spriteframes.set(mode === 'start' ? [ ...sel, ...rest ] : [ ...rest, ...sel ]);
            return;
        }
        if(mode === 'left')
        {
            for(let i = 1; i < arr.length; i++)
            {
                if(arr[i].selected && !arr[i - 1].selected) [ arr[i - 1], arr[i] ] = [ arr[i], arr[i - 1] ];
            }
        }
        else
        {
            for(let i = arr.length - 2; i >= 0; i--)
            {
                if(arr[i].selected && !arr[i + 1].selected) [ arr[i + 1], arr[i] ] = [ arr[i], arr[i + 1] ];
            }
        }
        spriteframes.set(arr);
    }

    // explicit, user-triggered only: natural numeric sort of all frames by file / animation name
    function sortAllByName()
    {
        const nameOf = (f: SpriteFrameData) => (f.type === 'single_frame') ? f.imgfileref.name : f.animationPrefix;
        spriteframes.set([ ...$spriteframes ].sort((a, b) => naturalCompare(nameOf(a), nameOf(b))));
    }

    async function addSpritesheetAndXML(e: Event, curSpritesheet: File, curXML: File)
    {
        if(curSpritesheet == null)
        {
            spritesheetModalError = 'Please select a spritesheet (.png)';
            return true;
        }
        if(curXML == null)
        {
            spritesheetModalError = 'Please select an XML file (.xml)';
            return true;
        }

        let spshArrayBuf = await curSpritesheet.arrayBuffer();
        const imgHash = await hashImage(new Uint8Array(spshArrayBuf))
        const spshData = arrayBufferToBase64(spshArrayBuf);
        spritesheet_map.update((prev) => {
            if(!prev.has(imgHash))
            {
                prev.set(imgHash, [spshData, 0]);
            }
            return prev;
        });

        const xmlstr = await curXML.text();
        const xmlparser = new DOMParser();
        const xmldoc = xmlparser.parseFromString(xmlstr, "text/xml");
        const subtextures = xmldoc.getElementsByTagName("SubTexture");
        const addedTextures = [];
        for(let tex of subtextures)
        {
            const texname = tex.getAttribute('name');

            const newFrame = new SpriteFrameData(curSpritesheet.name + '::' + uidgen.getNewId(), 'spritesheet_frame', curSpritesheet, curXML, imgHash);
            newFrame.animationPrefix = removeNumericSuffix(texname, imgSettings.xmlAnimPrefixTrimChars);
            newFrame.rect = {
                x: parseInt(tex.getAttribute('x')),
                y: parseInt(tex.getAttribute('y')),
                width: parseInt(tex.getAttribute('width')),
                height: parseInt(tex.getAttribute('height')),
            };
            newFrame.frameRect = {
                frameX: parseInt(tex.getAttribute('frameX')) || 0,
                frameY: parseInt(tex.getAttribute('frameY')) || 0,
                frameWidth: parseInt(tex.getAttribute('frameWidth')) || newFrame.rect.width,
                frameHeight: parseInt(tex.getAttribute('frameHeight')) || newFrame.rect.height
            };
            newFrame.transform.newWidth = newFrame.rect.width;
            newFrame.transform.newHeight = newFrame.rect.height;

            addedTextures.push(newFrame);
        }

        spriteframes.update((prev) => [...prev, ...addedTextures]);
        spritesheet_map.update((prev) => {
            const [data, count] = prev.get(imgHash);
            prev.set(imgHash, [data, count + subtextures.length]);
            return prev;
        });

        curSpritesheet = null;
        curXML = null;
        spritesheetModalError = '';
        return false;
    }

    function setAnimationPrefix(prefix: string)
    {
        // for each selected, change it's animation prefix
        for(let i = 0; i < $spriteframes.length; i++)
        {
            let spr = $spriteframes[i];
            if(spr.selected)
            {
                spr.animationPrefix = prefix;
                spr.selected = false;
            }
        }
        spriteframes.set($spriteframes);
    }

    $: {
        if(selectAllCheckbox != null)
        {
            selectAllCheckbox.checked = ($spriteframes.length > 0 && $spriteframes.every((sprf) => sprf.selected)) || false;
        }
    }

    $: frameCount = $spriteframes.length;
    $: selectedCount = $spriteframes.filter((sprf) => sprf.selected).length;

    // status line shown above the bottom bar (errors / info); replaces blocking alert() popups
    let statusKind: 'error' | 'info' | '' = '';
    let statusMsg = '';
    let busy = false;
    function setStatus(kind: 'error' | 'info' | '', msg: string)
    {
        statusKind = kind;
        statusMsg = msg;
    }

    let spritesheetXMLModalShown = false;
    let animationPrefixModalShown = false;
    let settingsModalShown = false;
    let animationViewShown = false;
    let xmlViewShown = false;

    let curSpritesheet = null;
    let curXML = null;
    let spritesheetModalError = '';
    
    let animPrefixInput = null;
    let selectAllCheckbox = null;

    function onSpritesheetAdd(e)
    {
        curSpritesheet = e.target.files[0];
        spritesheetModalError = '';
    }

    function onXMLAdd(e)
    {
        curXML = e.target.files[0];
        spritesheetModalError = '';
    }

    function onSelectAll(value: boolean)
    {
        spriteframes.update((prev) => prev.map((sprf) => { sprf.selected = value; return sprf }));
    }

    function deleteSelection()
    {
        // backward iteration cuz indices get messed up if we don't do that
        for (let i = $spriteframes.length - 1; i >= 0; i--)
        {
            const elem = $spriteframes[i];

            if(elem.selected)
            {
                $spriteframes.splice(i, 1);
                if(elem.type === 'spritesheet_frame')
                {
                    const hash = elem.spritesheetId;
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
        }
        spriteframes.set($spriteframes);
    }

    function cloneSelection()
    {
        for (let i = 0; i < $spriteframes.length; i++)
        {
            const elem = $spriteframes[i];

            if(elem.selected)
            {
                const elemClone = elem.clone();
                elemClone.selected = false;
                elemClone.sprId += '-copy' + uidgen.getNewId();
                spriteframes.update((prev) => [...prev, elemClone]);
                elem.selected = false;
            }
        }
    }

    let genPercent = 0;
    let progTxt = 'Adding images: 0%';
    let progDlg: HTMLDialogElement = null;
    async function addImagesToPacker(postAdd: (gp: GrowingPacker) => void)
    {
        console.log(imgSettings);
        if(busy)
        {
            // a generation is already running - ignore repeated clicks
            return;
        }

        if(!(isValidFilename(charname) && isValidFilename(charname + '.zip')))
        {
            setStatus('error', 'Please enter a valid filename as the name of your character!');
            return;
        }

        if($spriteframes.length <= 0)
        {
            setStatus('error', 'Please add some images/spritesheets!');
            return;
        }
        setStatus('', '');
        busy = true;
        progTxt = 'Adding images: 0%';
        genPercent = 0;
        progDlg.showModal();
        const { GrowingPacker } = wasm;
        const growingpacker = GrowingPacker.new(charname, imgSettings.padding);

        const n_steps = Array.from($spritesheet_map.entries()).length + $spriteframes.length;
        let curStepNumber = 0;
        
        deferTask(()=>{
            for(const items of $spritesheet_map)
            {
                const key = items[0];
                const data = items[1][0];
                console.log("adding " + key + " to store!");
                growingpacker.add_image_to_store(key, base64DecToArr(data, null));
                curStepNumber++;
                genPercent = curStepNumber/n_steps;
                progTxt = `Adding images: ${Math.round(genPercent * 100)}%`;
            }
        });
        deferTask(async ()=>{
            let perFramePrefix = '';
            switch (imgSettings.prefixType) {
                case 'character-name':
                    perFramePrefix = charname + ' ';
                    break;
                case 'custom-prefix':
                    perFramePrefix = imgSettings.customPrefix + ' ';
                    break;
                default:
                    break;
            }
            for(const sprdat of $spriteframes)
            {
                switch (sprdat.type) {
                    case 'single_frame':
                        console.log("Reading single frame" + sprdat.sprId);
                        const abuf = await sprdat.imgfileref.arrayBuffer();
                        if(sprdat.trim !== null)
                        {
                            // already trimmed at import: hand over the crop rectangle, the packer must not trim again
                            growingpacker.add_single_frame_cropped(
                                new Uint8Array(abuf),
                                perFramePrefix + sprdat.animationPrefix,
                                sprdat.rect.x,
                                sprdat.rect.y,
                                sprdat.rect.width,
                                sprdat.rect.height,
                                sprdat.transform.newWidth,
                                sprdat.transform.newHeight,
                                sprdat.transform.flipX,
                                sprdat.transform.flipY,
                                BigInt(sprdat.frameRect.frameX),
                                BigInt(sprdat.frameRect.frameY),
                                BigInt(sprdat.frameRect.frameWidth),
                                BigInt(sprdat.frameRect.frameHeight),
                                imgSettings.clipToBoundingBox
                            );
                            break;
                        }
                        growingpacker.add_single_frame(
                            // sprdat.sprId,
                            new Uint8Array(abuf),
                            perFramePrefix + sprdat.animationPrefix,
                            sprdat.transform.newWidth,
                            sprdat.transform.newHeight,
                            sprdat.transform.flipX,
                            sprdat.transform.flipY,
                            BigInt(sprdat.frameRect.frameX),
                            BigInt(sprdat.frameRect.frameY),
                            BigInt(sprdat.frameRect.frameWidth),
                            BigInt(sprdat.frameRect.frameHeight),
                            imgSettings.clipToBoundingBox
                        );
                        break;
                    case 'spritesheet_frame':
                        console.log("Putting spritesheet frame" + sprdat.sprId);
                        deferTask(()=>{
                            growingpacker.add_spritesheet_frame(
                                // sprdat.sprId,
                                sprdat.spritesheetId,
                                ((imgSettings.usePrefixOnXMLFrames) ? perFramePrefix : '') + sprdat.animationPrefix,
                                sprdat.rect.x,
                                sprdat.rect.y,
                                sprdat.rect.width,
                                sprdat.rect.height,
                                sprdat.transform.newWidth,
                                sprdat.transform.newHeight,
                                sprdat.transform.flipX,
                                sprdat.transform.flipY,
                                BigInt(sprdat.frameRect.frameX),
                                BigInt(sprdat.frameRect.frameY),
                                BigInt(sprdat.frameRect.frameWidth),
                                BigInt(sprdat.frameRect.frameHeight),
                                imgSettings.clipToBoundingBox
                            )
                        });
                        break;
                    default:
                        break;
                }
                curStepNumber++;
                genPercent = curStepNumber/n_steps;
                progTxt = `Adding images: ${Math.round(genPercent * 100)}%`;
            }

            postAdd(growingpacker);
        });
    }

    async function generateSpritesheetXML(growingpacker: GrowingPacker)
    {
        deferTask(()=>{
            progTxt = 'Generating spritesheet and XML....';
            deferTask(()=>{
                try {
                    const finalImage = growingpacker.make_packed_image();
                    saveFile(finalImage, charname + '.zip');
                    setStatus('info', 'Done - ' + charname + '.zip was downloaded.');
                } catch (err) {
                    console.error(err);
                    setStatus('error', 'Could not generate the spritesheet: ' + err);
                } finally {
                    progDlg.close();
                    busy = false;
                }
            });
        });
    }

    async function generateImageSequence(growingpacker: GrowingPacker)
    {
        deferTask(()=>{
            progTxt = 'Zipping individual frames....';
            deferTask(()=>{
                try {
                    const finalImage = growingpacker.make_img_sequence(imgSettings.uniqueFramesOnly);
                    saveFile(finalImage, charname + '.zip');
                    setStatus('info', 'Done - ' + charname + '.zip was downloaded.');
                } catch (err) {
                    console.error(err);
                    setStatus('error', 'Could not generate the PNG sequence: ' + err);
                } finally {
                    progDlg.close();
                    busy = false;
                }
            });
        });
    }

    function activateSelectRange()
    {
        rangeSelectionMode = true;
    }
</script>

<dialog bind:this={progDlg} id="progress-dialog">
	<div class="progress-box">
        <label for="gen-progress">
            {progTxt}
        </label>
        <progress id="gen-progress" value={Math.round(genPercent * 100)} max="100">
        </progress>
	</div>
</dialog>

<Modal bind:showModal={spritesheetXMLModalShown}>
    <p slot="header">Add Spritesheet + XML</p>
    <div class="file-pick">
        <button on:click={()=>{ openFileDialog(onSpritesheetAdd, 'image/png', false) }}><Icon name="sheet" /> Spritesheet (.png)</button>
        <span class="file-name">{(curSpritesheet !== null) ? curSpritesheet.name : 'No file selected'}</span>
    </div>
    <div class="file-pick">
        <button on:click={()=>{ openFileDialog(onXMLAdd, 'text/xml', false) }}><Icon name="code" /> XML File (.xml)</button>
        <span class="file-name">{(curXML !== null) ? curXML.name : 'No file selected'}</span>
    </div>
    {#if spritesheetModalError}
        <p class="modal-error" role="alert">{spritesheetModalError}</p>
    {/if}
    <button slot="accept-btn" on:click={async (e)=>{
        let keepModal = await addSpritesheetAndXML(e, curSpritesheet, curXML);
        if(!keepModal)
            spritesheetXMLModalShown=false;
    }}>Add Spritesheet and XML</button>
</Modal>

<Modal bind:showModal={animationPrefixModalShown}>
    <p slot="header">Set animation prefix</p>
    <label class="field" for="anim-prefix-input">
        <span>Animation prefix for {selectedCount} selected frame{selectedCount === 1 ? '' : 's'}</span>
        <input bind:this={animPrefixInput} type="text" name="anim-prefix" id="anim-prefix-input" value="name"/>
    </label>
    <button slot="accept-btn" on:click={()=>{ setAnimationPrefix(animPrefixInput.value); animationPrefixModalShown=false }}>Set animation prefix</button>
</Modal>

<SettingsModal bind:showView={settingsModalShown} bind:settings={imgSettings} />
<AnimationView bind:showView={animationViewShown} />
<XmlTableView bind:showView={xmlViewShown} />

<!-- top bar: bring frames in, look at them -->
<div id="controls-top" class="bar">
    <div class="group">
        <button class="btn-primary" disabled={importing} on:click={()=>{ openFileDialog(onPNGAdd, 'image/png', true) }}><Icon name="image-plus" /> <span>Add PNGs</span></button>
        <button disabled={importing} on:click={()=>{ openFileDialog(onZipAdd, '.zip,application/zip,application/x-zip-compressed', false) }}><Icon name="archive" /> <span>Add ZIP</span></button>
        <button on:click={()=>{ spritesheetXMLModalShown = true }}><Icon name="sheet" /> <span>Add Spritesheet</span></button>
    </div>
    <div class="counts" aria-live="polite">
        <strong>{frameCount}</strong> frame{frameCount === 1 ? '' : 's'}
        <span class="dot">&middot;</span>
        <strong>{selectedCount}</strong> selected
    </div>
    <div class="group">
        <DropUpMenu buttonText="View" icon="eye" direction="down" align="right">
            <button on:click|stopPropagation={()=>{ xmlViewShown = true; }}><Icon name="code" /> View XML structure</button>
            <button on:click|stopPropagation={()=>{ animationViewShown = true; }}><Icon name="film" /> View Animation</button>
        </DropUpMenu>
        <button on:click={()=>{ settingsModalShown = true; }}><Icon name="settings" /> <span>Settings</span></button>
    </div>
</div>

{#if statusMsg}
    <div id="status-line" class="status-{statusKind}" role={statusKind === 'error' ? 'alert' : 'status'}>
        <Icon name={statusKind === 'error' ? 'alert' : 'check'} size={18} />
        <span>{statusMsg}</span>
        <button type="button" class="status-close btn-flat" aria-label="Dismiss" on:click={() => setStatus('', '')}><Icon name="x" size={16} /></button>
    </div>
{/if}

<!-- bottom bar: act on the selection, export -->
<div id="controls" class="bar">
    <div class="group">
        <label for="select-all" class="chip">
            <input bind:this={selectAllCheckbox} type="checkbox" name="select-all" id="select-all" on:change={()=>{ onSelectAll(selectAllCheckbox.checked) }} />
            Select all
        </label>
        <button disabled={selectedCount < 1} on:click={()=>{ animationPrefixModalShown = true; }}><Icon name="tag" /> <span>Set Animation Prefix</span></button>
        <DropUpMenu buttonText="Selection" icon="layers" disabled={frameCount < 1}>
            <button on:click|stopPropagation={()=>{ animationPrefixModalShown = true; }}><Icon name="tag" /> Set animation prefix</button>
            <button class="menu-danger" on:click|stopPropagation={deleteSelection}><Icon name="trash" /> Delete Selection</button>
            <button on:click|stopPropagation={cloneSelection}><Icon name="copy" /> Clone Selection</button>
            <button disabled={$spriteframes.length <= 0} on:click|stopPropagation={activateSelectRange}><Icon name="selection" /> Toggle Select on Range</button>
        </DropUpMenu>
        <DropUpMenu buttonText="Order" icon="sort" disabled={frameCount < 1}>
            <button disabled={selectedCount < 1} on:click|stopPropagation={()=>{ moveSelection('start') }}><Icon name="chevrons-left" /> Move selection to start</button>
            <button disabled={selectedCount < 1} on:click|stopPropagation={()=>{ moveSelection('left') }}><Icon name="arrow-left" /> Move selection earlier</button>
            <button disabled={selectedCount < 1} on:click|stopPropagation={()=>{ moveSelection('right') }}><Icon name="arrow-right" /> Move selection later</button>
            <button disabled={selectedCount < 1} on:click|stopPropagation={()=>{ moveSelection('end') }}><Icon name="chevrons-right" /> Move selection to end</button>
            <button on:click|stopPropagation={sortAllByName}><Icon name="sort" /> Sort all by name (1, 2, 10)</button>
        </DropUpMenu>
    </div>
    <div class="group">
        <DropUpMenu buttonText={busy ? 'Working...' : 'Generate'} icon="download" primary={true} disabled={busy} align="right">
            <button on:click={()=>{ addImagesToPacker(generateSpritesheetXML).then(()=>{}) }}><Icon name="code" /> Generate XML</button>
            <button on:click={()=>{ addImagesToPacker(generateImageSequence).then(()=>{}) }}><Icon name="film" /> Generate PNG sequence</button>
        </DropUpMenu>
    </div>
</div>

<style>
    /* `order` positions these among the frame panel (order 2) inside the pane's flex column */
    #controls-top { order: 0; }
    #status-line { order: 3; }
    #controls { order: 4; }

    .bar {
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

    .bar button,
    .group :global(.dropup > button) {
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
        white-space: nowrap;
    }

    .counts strong {
        color: var(--text);
    }

    .counts .dot {
        margin: 0 6px;
    }

    .chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 0 12px;
        white-space: nowrap;
    }

    .menu-danger {
        color: var(--danger);
    }

    #status-line {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 6px 6px 12px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--border);
        font-size: 0.92rem;
    }

    #status-line span {
        flex: 1 1 auto;
    }

    #status-line.status-error {
        background: var(--danger-soft);
        border-color: var(--danger);
        color: var(--danger);
    }

    #status-line.status-info {
        background: var(--accent-soft);
        border-color: var(--accent);
    }

    .status-close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        min-height: 36px;
        height: 36px;
        padding: 0;
        color: inherit;
    }

    dialog#progress-dialog {
        border: 1px solid var(--border-strong);
        border-radius: 14px;
        background-color: var(--surface);
        color: var(--text);
        box-shadow: var(--shadow);
        width: min(420px, calc(100vw - 32px));
        padding: 20px;
    }

    .progress-box {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .file-pick {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px 14px;
        margin-bottom: 12px;
    }

    .file-pick button {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex: none;
    }

    .file-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--text-muted);
        font-size: 0.92rem;
    }

    .modal-error {
        margin: 0;
        padding: 8px 12px;
        border-radius: var(--radius-sm);
        background: var(--danger-soft);
        color: var(--danger);
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .field span {
        font-size: 0.9rem;
        color: var(--text-muted);
    }

    /* narrow tablets / phones: let the count drop to its own row, keep buttons large */
    @media screen and (max-width: 720px) {
        .counts {
            order: 3;
            flex: 1 1 100%;
            text-align: left;
        }
    }
</style>
