import { arrayBufferToBase64, base64EncArr } from './b64utils'
import type { SpriteFrameData } from './spriteframedata';
import { get as getFromStore } from 'svelte/store';
import { spritesheet_map } from './stores';
import { readPngSizeFromFile } from './importutils';

/**
 * 
 * @param {(e: Event)=>void} onSelectFile 
 * @param {string} fileFilter 
 * @param {boolean} multpl 
 */
export function openFileDialog(onSelectFile: (e: Event)=>void, fileFilter: string, multpl:boolean = true):void
{
    let felem = document.createElement('input');
    felem.setAttribute('type', 'file');
    if(multpl)
    {
        felem.setAttribute('multiple', 'true');
    }
    // Not `display: none`: some mobile Safari versions are unreliable with hidden file inputs.
    // The input is kept off-screen and non-interactive instead, and always cleaned up afterwards.
    felem.setAttribute('style', 'position: fixed; left: -9999px; top: 0; width: 1px; height: 1px; opacity: 0; pointer-events: none;');
    felem.setAttribute('accept', fileFilter);
    felem.setAttribute('tabindex', '-1');
    felem.setAttribute('aria-hidden', 'true');

    document.body.append(felem);

    let cleaned = false;
    const cleanup = () => {
        if(cleaned) return;
        cleaned = true;
        if(felem.parentNode)
        {
            felem.parentNode.removeChild(felem);
        }
    };

    felem.onchange = (e)=>{
        onSelectFile(e);
        // the selected File objects stay valid after the input is gone; remove it a bit later anyway
        setTimeout(cleanup, 1000);
    };
    // fired by modern browsers (incl. iOS 16.4+/Android Chrome) when the picker is dismissed
    felem.addEventListener('cancel', cleanup);

    felem.click();

    // safety net: never leave an unused input behind if the browser fires neither event
    setTimeout(cleanup, 10 * 60 * 1000);
}

/**
 * 
 * @param {Uint8Array} content 
 * @param {string} name 
 */
export function saveFile(content: Uint8Array, name: string):void
{
    let contentBlob = new Blob([content]);
    let objUrl = URL.createObjectURL(contentBlob);

    let aElem = document.createElement('a');
    aElem.setAttribute('href', objUrl);
    aElem.setAttribute('download', name);
    aElem.click();
}

/**
 * Removes a contiguous sequence of digits from the end of the string, upto a limit
 * @param str The string to be processed
 * @param limit The maximum number of digits that need to be trimmed from the end of the string (a value of `-1` means to remove as many digits from the end as possible)
 */
export function removeNumericSuffix(str: string, limit:number)
{
    if(limit === -1)
    {
        let endIndex = str.length - 1;
        for(let i = str.length - 1; i >= 0; i--)
        {
            const ch = str[i];
            if(!(ch >= '0' && ch <= '9'))
            {
                endIndex = i;
                break;
            }
        }
        const result = str.substring(0, endIndex+1);
        return result;
    }
    else
    {
        let endIndex = str.length - 1;
        let nCharsChecked = 0;
        for(let i = str.length - 1; i >= 0; i--)
        {
            if(nCharsChecked >= limit)
            {
                endIndex = i;
                break;
            }
            const ch = str[i];
            if(!(ch >= '0' && ch <= '9'))
            {
                endIndex = i;
                break;
            }
            nCharsChecked++;
        }
        const result = str.substring(0, endIndex+1);
        return result;
    }
}

/**
 * 
 * @param {SpriteFrameData} frameInfo 
 * @returns {Promise<HTMLImageElement>}
 */
export async function makeImage(frameInfo: SpriteFrameData): Promise<HTMLImageElement>
{
    let imgdata: string;
    if(frameInfo.type == 'single_frame')
    {
        // object URL (no base64 copy of the whole file); revoked as soon as the image is decoded
        const objUrl = URL.createObjectURL(frameInfo.imgfileref);
        const imgelem = new Image();
        try {
            imgelem.src = objUrl;
            await imgelem.decode();
        } finally {
            URL.revokeObjectURL(objUrl);
        }
        return imgelem;
    }
    else
    {
        const spshB64 = getFromStore(spritesheet_map).get(frameInfo.spritesheetId);
        if(spshB64 !== undefined)
        {
            imgdata = 'data:image/png;base64,' + spshB64[0];
        }
        else
        {
            imgdata = 'data:image/png;base64,';
        }
    }
    const imgelem = new Image();
    imgelem.src = imgdata;
    await imgelem.decode();
    return imgelem;
}

/**
 * 
 * @param {File} imgfileref 
 * @returns {Promise<number[]>}
 */
export async function getImageDimensions(imgfileref: File): Promise<number[]>
{
    // fast path: the size is stored in the first bytes of every PNG - nothing has to be decoded
    const size = await readPngSizeFromFile(imgfileref);
    if(size !== null)
    {
        return size;
    }
    // fallback for anything unusual: decode through an object URL that is always released
    const objUrl = URL.createObjectURL(imgfileref);
    try {
        const imgelem = new Image();
        imgelem.src = objUrl;
        await imgelem.decode();
        return [ imgelem.naturalWidth, imgelem.naturalHeight ];
    } finally {
        URL.revokeObjectURL(objUrl);
    }
}

// Don't use this function for cryptography! This is only to generate image hashes for the hashmaps
export async function hashImage(imgdata: Uint8Array): Promise<string>
{
    const digest = await crypto.subtle.digest('SHA-1', imgdata)
    return base64EncArr(new Uint8Array(digest));
}


function filenameReservedRegex() {
	return /[<>:"/\\|?*\u0000-\u001F]/g;
}

function windowsReservedNameRegex() {
	return /^(con|prn|aux|nul|com\d|lpt\d)$/i;
}

// @see https://github.com/sindresorhus/valid-filename
export function isValidFilename(filename: string)
{
    if (!filename || filename.length > 255) {
		return false;
	}

	if (filenameReservedRegex().test(filename) || windowsReservedNameRegex().test(filename)) {
		return false;
	}

	if (filename === '.' || filename === '..') {
		return false;
	}

	return true;
}

export function deferTask(taskFunc: Function, delay:number = 0) {
    setTimeout(taskFunc, delay);
}

export class UIdGen{
    _val: number

    constructor()
    {
        this._val = -1;
    }

    getNewId()
    {
        this._val++;
        return this._val;
    }
}

export const uidgen = new UIdGen();