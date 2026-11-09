<script lang="ts">
    import Modal from '../components/Modal.svelte';
    import { fly, fade } from 'svelte/transition';
    import { cubicOut, cubicIn } from 'svelte/easing';
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
    import { layoutClass } from '../device';
    import { persisted } from '../persist';
    import { recordHistory, beginPending, endPending, undo, redo, historyState } from '../history';
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
        sequenceFullCanvas: false, // PNG sequence: false = real trimmed images (+ offsets.csv), true = original-size canvas
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
    const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    // toast / status message: soft slide-in, quick fade-out (no motion when reduced motion is on)
    const toastIn = (node: Element) => fly(node, { y: 8, duration: reducedMotion() ? 0 : 180, easing: cubicOut });
    const toastOut = (node: Element) => fade(node, { duration: reducedMotion() ? 0 : 130, easing: cubicIn });

    let trimmedCount = 0;
    $: imgSettings.clipToBoundingBox = imgSettings.autoTrim !== 'off';

    async function addPngFiles(files: File[], skipped: string[], skipDuplicates = true): Promise<number>
    {
        if(files.length > 0) recordHistory('Add images');
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
        recordHistory('Move frames');
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
        recordHistory('Sort by name');
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

        recordHistory('Add spritesheet');
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
        if(!$spriteframes.some((f) => f.selected)) return;
        recordHistory('Set animation prefix');
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
        if(!$spriteframes.some((f) => f.selected)) return;
        recordHistory('Delete frames');
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
        if(!$spriteframes.some((f) => f.selected)) return;
        recordHistory('Clone frames');
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
                    const finalImage = growingpacker.make_img_sequence(imgSettings.uniqueFramesOnly, imgSettings.sequenceFullCanvas);
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


    // ---------- phone workspace: bottom navigation + bottom sheets ----------
    let addSheet = false;
    let editSheet = false;
    let exportSheet = false;
    $: isPhone = $layoutClass === 'phone';
    // which sheet / view is open decides the highlighted nav item (remembered: the last tool panel used)
    const lastNav = persisted<string>('phoneNav', 'frames');
    function closeSheets() { addSheet = false; editSheet = false; exportSheet = false; }
    function openSheet(which: 'add' | 'edit' | 'export')
    {
        closeSheets();
        addSheet = which === 'add'; editSheet = which === 'edit'; exportSheet = which === 'export';
        lastNav.set(which);
    }
    // run an action after the sheet has closed, so dialogs never stack on top of a sheet
    function fromSheet(fn: () => void) { closeSheets(); setTimeout(fn, 0); }

    function doUndo() { const l = undo(); if(l) setStatus('info', `Undid: ${l}`); }
    function doRedo() { const l = redo(); if(l) setStatus('info', `Redid: ${l}`); }

    // edits made in the XML Inspector are one undo step (kept only if something really changed)
    let xmlWasOpen = false;
    $: {
        if(xmlViewShown && !xmlWasOpen) beginPending('Edit in XML Inspector');
        if(!xmlViewShown && xmlWasOpen) endPending();
        xmlWasOpen = xmlViewShown;
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

{#if !isPhone}
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
        <button type="button" class="btn-flat hist-btn" disabled={!$historyState.canUndo} title="Undo" aria-label="Undo" on:click={doUndo}><Icon name="undo" size={18} /></button>
        <button type="button" class="btn-flat hist-btn" disabled={!$historyState.canRedo} title="Redo" aria-label="Redo" on:click={doRedo}><Icon name="redo" size={18} /></button>
    </div>
    <div class="group">
        <DropUpMenu buttonText="View" icon="eye" direction="down" align="right">
            <button on:click|stopPropagation={()=>{ xmlViewShown = true; }}><Icon name="code" /> View XML structure</button>
            <button on:click|stopPropagation={()=>{ animationViewShown = true; }}><Icon name="film" /> View Animation</button>
        </DropUpMenu>
        <button on:click={()=>{ settingsModalShown = true; }}><Icon name="settings" /> <span>Settings</span></button>
    </div>
</div>

{/if}

{#if isPhone}
<!-- phone: one slim status row (work status + undo/redo + settings) ... -->
<div id="phone-bar" role="toolbar" aria-label="Status and history">
    <div class="counts" aria-live="polite">
        {#if busy}<span class="busy-dot" aria-hidden="true"></span>Working... {:else}
        <strong>{frameCount}</strong> frame{frameCount === 1 ? '' : 's'} <span class="dot">&middot;</span> <strong>{selectedCount}</strong> selected{/if}
    </div>
    <button type="button" class="btn-flat tool-btn" disabled={!$historyState.canUndo} aria-label="Undo{$historyState.undoLabel ? ': ' + $historyState.undoLabel : ''}" on:click={doUndo}><Icon name="undo" size={20} /></button>
    <button type="button" class="btn-flat tool-btn" disabled={!$historyState.canRedo} aria-label="Redo{$historyState.redoLabel ? ': ' + $historyState.redoLabel : ''}" on:click={doRedo}><Icon name="redo" size={20} /></button>
    <button type="button" class="btn-flat tool-btn" aria-label="Settings" on:click={()=>{ settingsModalShown = true; }}><Icon name="settings" size={20} /></button>
</div>
{/if}

{#if statusMsg}
    <div id="status-line" in:toastIn out:toastOut class="status-{statusKind}" role={statusKind === 'error' ? 'alert' : 'status'}>
        <Icon name={statusKind === 'error' ? 'alert' : 'check'} size={18} />
        <span>{statusMsg}</span>
        <button type="button" class="status-close btn-flat" aria-label="Dismiss" on:click={() => setStatus('', '')}><Icon name="x" size={16} /></button>
    </div>
{/if}

{#if !isPhone}
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

{/if}

{#if isPhone}
<!-- ... and a bottom navigation that sits IN the layout (never over the frames) -->
<nav id="phone-nav" aria-label="Main tools">
    <button type="button" class:on={addSheet} on:click={()=>{ openSheet('add') }} disabled={importing}><Icon name="plus" size={22} /><span>Add</span></button>
    <button type="button" class:on={editSheet} on:click={()=>{ openSheet('edit') }} disabled={frameCount < 1}><Icon name="edit" size={22} /><span>Edit</span></button>
    <button type="button" on:click={()=>{ closeSheets(); animationViewShown = true; }} disabled={frameCount < 1}><Icon name="play" size={22} /><span>Preview</span></button>
    <button type="button" on:click={()=>{ closeSheets(); xmlViewShown = true; }} disabled={frameCount < 1}><Icon name="code" size={22} /><span>XML</span></button>
    <button type="button" class="nav-export" class:on={exportSheet} on:click={()=>{ openSheet('export') }} disabled={busy}><Icon name="download" size={22} /><span>{busy ? 'Working' : 'Export'}</span></button>
</nav>

<!-- Asset browser: where frames come from -->
<Modal bind:showModal={addSheet} sheet>
    <p slot="header">Add frames</p>
    <div class="sheet-list">
        <button class="btn-primary" on:click={()=>{ fromSheet(()=>openFileDialog(onPNGAdd, 'image/png', true)) }}><Icon name="image-plus" /> Add PNGs</button>
        <button on:click={()=>{ fromSheet(()=>openFileDialog(onZipAdd, '.zip,application/zip,application/x-zip-compressed', false)) }}><Icon name="archive" /> Add ZIP</button>
        <button on:click={()=>{ fromSheet(()=>{ spritesheetXMLModalShown = true }) }}><Icon name="sheet" /> Add Spritesheet + XML</button>
    </div>
</Modal>

<!-- Inspector: act on the selected frames -->
<Modal bind:showModal={editSheet} sheet>
    <p slot="header">Edit frames <span class="sheet-count">{selectedCount} of {frameCount} selected</span></p>
    <div class="sheet-grid">
        <button on:click={()=>{ onSelectAll(true) }}><Icon name="check" /> Select all</button>
        <button on:click={()=>{ onSelectAll(false) }}><Icon name="x" /> Clear selection</button>
        <button disabled={selectedCount < 1} on:click={()=>{ fromSheet(()=>{ animationPrefixModalShown = true }) }}><Icon name="tag" /> Animation prefix</button>
        <button on:click={()=>{ fromSheet(activateSelectRange) }}><Icon name="selection" /> Select range</button>
        <button disabled={selectedCount < 1} on:click={cloneSelection}><Icon name="copy" /> Clone</button>
        <button class="menu-danger" disabled={selectedCount < 1} on:click={()=>{ deleteSelection(); closeSheets(); }}><Icon name="trash" /> Delete</button>
    </div>
    <p class="sheet-label">Order</p>
    <div class="sheet-grid four">
        <button disabled={selectedCount < 1} aria-label="Move selection to start" on:click={()=>{ moveSelection('start') }}><Icon name="chevrons-left" /></button>
        <button disabled={selectedCount < 1} aria-label="Move selection earlier" on:click={()=>{ moveSelection('left') }}><Icon name="arrow-left" /></button>
        <button disabled={selectedCount < 1} aria-label="Move selection later" on:click={()=>{ moveSelection('right') }}><Icon name="arrow-right" /></button>
        <button disabled={selectedCount < 1} aria-label="Move selection to end" on:click={()=>{ moveSelection('end') }}><Icon name="chevrons-right" /></button>
    </div>
    <div class="sheet-list">
        <button on:click={()=>{ sortAllByName(); closeSheets(); }}><Icon name="sort" /> Sort all by name (1, 2, 10)</button>
    </div>
</Modal>

<!-- Export options fit the screen; the heavy work starts from here -->
<Modal bind:showModal={exportSheet} sheet>
    <p slot="header">Export</p>
    <label class="field" for="export-char-name">
        <span>Character name (used for the file names)</span>
        <input id="export-char-name" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Character Name" bind:value={charname} />
    </label>
    {#if !charname || charname.trim() === ''}
        <p class="sheet-hint" role="status">Type a character name to enable export.</p>
    {/if}
    <div class="sheet-list">
        <button class="btn-primary" disabled={frameCount < 1 || busy || !charname || charname.trim() === ''} on:click={()=>{ fromSheet(()=>{ addImagesToPacker(generateSpritesheetXML).then(()=>{}) }) }}><Icon name="code" /> Generate spritesheet + XML</button>
        <button disabled={frameCount < 1 || busy || !charname || charname.trim() === ''} on:click={()=>{ fromSheet(()=>{ addImagesToPacker(generateImageSequence).then(()=>{}) }) }}><Icon name="film" /> Generate PNG sequence</button>
        <button on:click={()=>{ fromSheet(()=>{ settingsModalShown = true }) }}><Icon name="settings" /> Export settings (trim, padding, ...)</button>
    </div>
</Modal>
{/if}

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
        gap: 6px 10px;
        padding: 6px 6px 11px;
        background-color: var(--surface);
        border: 2px solid var(--outline);
        border-radius: 16px;
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


    .hist-btn { width: 32px; min-height: 32px; height: 32px; padding: 0; margin-left: 4px; display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; }
    .hist-btn:disabled { opacity: 0.35; }

    /* ----- phone workspace ----- */
    #phone-bar { order: 0; display: flex; align-items: center; gap: 2px; padding: 0 0 0 4px; min-height: 40px; flex: none; }
    #phone-bar .counts { flex: 1 1 auto; text-align: left; font-size: 0.85rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .tool-btn { width: 44px; min-height: 40px; height: 40px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
    .tool-btn:disabled { opacity: 0.35; }
    .busy-dot { display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; background: var(--accent); animation: busy-pulse 0.9s ease-in-out infinite alternate; }
    @keyframes busy-pulse { from { opacity: 0.3; } to { opacity: 1; } }

    #phone-nav {
        order: 4;
        flex: none;
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 6px;
        padding: 6px 6px 11px;
        background-color: var(--surface);
        border: 2px solid var(--outline);
        border-radius: 16px;
    }
    #phone-nav button {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 2px; min-height: 52px; padding: 4px 2px; font-size: 0.72rem; line-height: 1.1;
    }
    #phone-nav button.on :global(svg) { animation: hp-hop 0.55s var(--ease-spring); }
    #phone-nav button.on { border-color: var(--outline); color: var(--text); background-color: var(--accent-soft); }
    #phone-nav .nav-export { background: var(--accent); color: var(--accent-contrast); }

    .sheet-list { display: flex; flex-direction: column; gap: 8px; margin: 10px 0 4px; }
    .sheet-list button { display: flex; align-items: center; justify-content: flex-start; gap: 12px; min-height: 52px; font-size: 1rem; text-align: left; }
    .sheet-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 8px; }
    .sheet-grid.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .sheet-grid button { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 0 6px; font-size: 0.9rem; }
    .sheet-hint { margin: 8px 0 0; font-size: 0.85rem; color: var(--text-muted); }
    .sheet-label { margin: 10px 0 6px; font-size: 0.8rem; color: var(--text-muted); }
    .sheet-count { font-weight: 400; font-size: 0.8rem; color: var(--text-muted); margin-left: 8px; }

    /* landscape phone: tool rail on the right instead of a bottom bar (keeps the frames tall) */
    :global(html[data-layout="phone"][data-orient="landscape"]) #phone-nav {
        grid-template-columns: 1fr;
        grid-auto-rows: minmax(0, 1fr);
        padding: 4px 4px 9px;
        gap: 4px;
    }
    :global(html[data-layout="phone"][data-orient="landscape"]) #phone-nav button { min-height: 0; flex-direction: column; font-size: 0.66rem; }

    /* narrow tablets / phones: let the count drop to its own row, keep buttons large */
    @media screen and (max-width: 720px) {
        .counts {
            order: 3;
            flex: 1 1 100%;
            text-align: left;
        }
    }
</style>
