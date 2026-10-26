// Import helpers: natural sorting, PNG header checks and safe ZIP reading.
// Everything here works on in-memory bytes only - nothing is ever written to a file system path.
import { unzipSync } from 'fflate';

// ---------- limits (protect the browser from huge / hostile archives) ----------
export const LIMITS = {
    maxZipBytes: 200 * 1024 * 1024,        // size of the .zip file itself
    maxEntries: 5000,                       // entries listed in the archive
    maxImages: 1000,                        // PNGs imported from one archive
    maxImageBytes: 25 * 1024 * 1024,        // one PNG, uncompressed
    maxTotalImageBytes: 500 * 1024 * 1024,  // all PNGs of one archive, uncompressed
    maxXmlBytes: 5 * 1024 * 1024,
    maxPixels: 64 * 1024 * 1024,            // width * height of a single PNG
    batchSize: 8,                           // files handled per UI-yielding batch
};

export class ImportError extends Error {}

// ---------- sorting ----------
// One fixed collator => the same order on iOS, Android and desktop (no dependence on the user's locale).
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Natural order: frame2 < frame10, case-insensitive; ties are broken by plain comparison so the order is deterministic. */
export function naturalCompare(a: string, b: string): number
{
    const c = collator.compare(a, b);
    if(c !== 0) return c;
    return a < b ? -1 : a > b ? 1 : 0;
}

/** Natural order on '/'-separated paths, folder by folder. */
export function comparePaths(a: string, b: string): number
{
    const pa = a.split('/');
    const pb = b.split('/');
    const n = Math.min(pa.length, pb.length);
    for(let i = 0; i < n; i++)
    {
        const c = naturalCompare(pa[i], pb[i]);
        if(c !== 0) return c;
    }
    return pa.length - pb.length;
}

/**
 * Order files chosen in a file picker.
 * 'natural' (default): by name/path, numerically. 'picker': exactly as the browser reported them
 * (only meaningful where the browser reports the user's selection order - not guaranteed).
 * Always returns a new array; the sort is stable.
 */
export function orderFiles(files: File[], mode: 'natural' | 'picker'): File[]
{
    const copy = files.slice();
    if(mode === 'picker') return copy;
    const key = (f: File) => ((f as any).webkitRelativePath || f.name).replace(/\\/g, '/');
    return copy
        .map((f, i) => ({ f, i, k: key(f) }))
        .sort((x, y) => comparePaths(x.k, y.k) || x.i - y.i)
        .map((x) => x.f);
}

// ---------- PNG ----------
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Reads width/height from the PNG header (first 24 bytes). Returns null if it is not a PNG or the size is unusable. */
export function readPngSize(head: Uint8Array): [number, number] | null
{
    if(head.length < 24) return null;
    for(let i = 0; i < 8; i++) if(head[i] !== PNG_SIGNATURE[i]) return null;
    // chunk type at bytes 12..16 must be IHDR
    if(head[12] !== 0x49 || head[13] !== 0x48 || head[14] !== 0x44 || head[15] !== 0x52) return null;
    const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
    const w = dv.getUint32(16);
    const h = dv.getUint32(20);
    if(w === 0 || h === 0 || w * h > LIMITS.maxPixels) return null;
    return [w, h];
}

export async function readPngSizeFromFile(f: File): Promise<[number, number] | null>
{
    return readPngSize(new Uint8Array(await f.slice(0, 32).arrayBuffer()));
}

export function stripPngExt(name: string): string
{
    return name.replace(/\.png$/i, '');
}

export function baseName(path: string): string
{
    const i = path.lastIndexOf('/');
    return i >= 0 ? path.substring(i + 1) : path;
}

export const yieldToUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ---------- ZIP ----------
export type ZipImage = { path: string, file: File, width: number, height: number };
export type ZipXml = { path: string, text: string };
export type ZipContents = {
    images: ZipImage[];   // sorted by path, naturally
    xmls: ZipXml[];
    skipped: string[];    // human readable reasons
};

type Entry = { name: string, path: string, size: number };

/** Returns a safe, normalised relative path, or null if the entry name is unsafe. */
export function sanitizeEntryPath(name: string): string | null
{
    if(name.indexOf('\u0000') >= 0) return null;
    const p = name.replace(/\\/g, '/');
    if(p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return null;
    const segs = p.split('/');
    for(const s of segs)
    {
        if(s === '..') return null;
    }
    return segs.filter((s) => s !== '' && s !== '.').join('/');
}

function listEntries(data: Uint8Array): { name: string, size: number, originalSize: number }[]
{
    const out: { name: string, size: number, originalSize: number }[] = [];
    unzipSync(data, {
        filter: (f) => { out.push({ name: f.name, size: f.size, originalSize: f.originalSize }); return false; }
    });
    return out;
}

function extract(data: Uint8Array, names: Set<string>): Record<string, Uint8Array>
{
    return unzipSync(data, { filter: (f) => names.has(f.name) });
}

/**
 * Reads the PNG (and XML) files of a ZIP. Files are only inflated a few at a time, sizes are checked
 * from the archive directory *before* inflating, and every image is verified by its PNG header.
 */
export async function readZip(zipFile: File, onProgress: (done: number, total: number) => void): Promise<ZipContents>
{
    if(zipFile.size > LIMITS.maxZipBytes)
        throw new ImportError(`The ZIP is too large (${Math.round(zipFile.size / 1048576)} MB). The limit is ${LIMITS.maxZipBytes / 1048576} MB.`);
    if(zipFile.size < 22)
        throw new ImportError('This file is not a valid ZIP (it is too small / empty).');

    let data: Uint8Array | null = new Uint8Array(await zipFile.arrayBuffer());
    let listing;
    try
    {
        listing = listEntries(data);
    }
    catch (e)
    {
        throw new ImportError('The ZIP is damaged, encrypted or in an unsupported format, so it could not be read.');
    }

    if(listing.length > LIMITS.maxEntries)
        throw new ImportError(`The ZIP has too many files (${listing.length}). The limit is ${LIMITS.maxEntries}.`);

    const skipped: string[] = [];
    const seen = new Set<string>();
    const imageEntries: Entry[] = [];
    const xmlEntries: Entry[] = [];
    let ignoredOther = 0;
    let unsafe = 0;

    for(const e of listing)
    {
        if(e.name.endsWith('/')) continue; // directory
        const path = sanitizeEntryPath(e.name);
        if(path === null) { unsafe++; continue; }
        const base = baseName(path);
        if(path.startsWith('__MACOSX/') || base.startsWith('.') || base === 'Thumbs.db') continue; // OS metadata
        const lower = base.toLowerCase();
        if(!(lower.endsWith('.png') || lower.endsWith('.xml'))) { ignoredOther++; continue; }
        const dupKey = path.toLowerCase();
        if(seen.has(dupKey))
        {
            skipped.push(`${path}: duplicate path in the ZIP (first one kept)`);
            continue;
        }
        seen.add(dupKey);
        const entry = { name: e.name, path, size: e.originalSize };
        if(lower.endsWith('.png')) imageEntries.push(entry); else xmlEntries.push(entry);
    }
    if(unsafe > 0) skipped.push(`${unsafe} file(s) with an unsafe path were ignored`);
    if(ignoredOther > 0) skipped.push(`${ignoredOther} non-PNG/XML file(s) ignored`);

    if(imageEntries.length === 0)
        throw new ImportError('No PNG images were found in this ZIP.');
    if(imageEntries.length > LIMITS.maxImages)
        throw new ImportError(`The ZIP contains ${imageEntries.length} images. The limit is ${LIMITS.maxImages} per import.`);

    const okImages: Entry[] = [];
    let total = 0;
    for(const e of imageEntries)
    {
        if(e.size > LIMITS.maxImageBytes) { skipped.push(`${e.path}: image is too large (${Math.round(e.size / 1048576)} MB)`); continue; }
        total += e.size;
        okImages.push(e);
    }
    if(total > LIMITS.maxTotalImageBytes)
        throw new ImportError(`The images in this ZIP are too big in total (${Math.round(total / 1048576)} MB uncompressed). The limit is ${LIMITS.maxTotalImageBytes / 1048576} MB.`);

    okImages.sort((a, b) => comparePaths(a.path, b.path));

    const images: ZipImage[] = [];
    const xmls: ZipXml[] = [];
    const totalWork = okImages.length + xmlEntries.length;
    let done = 0;

    try
    {
        for(let i = 0; i < okImages.length; i += LIMITS.batchSize)
        {
            const batch = okImages.slice(i, i + LIMITS.batchSize);
            const out = extract(data, new Set(batch.map((b) => b.name)));
            for(const e of batch)
            {
                const bytes = out[e.name];
                const size = bytes ? readPngSize(bytes) : null;
                if(!bytes || !size)
                {
                    skipped.push(`${e.path}: not a valid PNG (corrupt or a different format)`);
                }
                else
                {
                    // new File() copies the bytes, so the inflated buffer can be freed right after this batch
                    const f = new File([bytes], baseName(e.path), { type: 'image/png', lastModified: zipFile.lastModified });
                    images.push({ path: e.path, file: f, width: size[0], height: size[1] });
                }
                done++;
            }
            onProgress(done, totalWork);
            await yieldToUI();
        }

        for(const e of xmlEntries)
        {
            if(e.size > LIMITS.maxXmlBytes) { skipped.push(`${e.path}: XML is too large`); done++; continue; }
            const bytes = extract(data, new Set([e.name]))[e.name];
            if(bytes) xmls.push({ path: e.path, text: new TextDecoder('utf-8').decode(bytes) });
            done++;
            onProgress(done, totalWork);
        }
    }
    catch (err)
    {
        throw new ImportError('The ZIP is damaged or could not be fully read. Nothing was imported.');
    }
    finally
    {
        data = null; // let the archive buffer go
    }

    if(images.length === 0)
        throw new ImportError('The ZIP has no usable PNG images.' + (skipped.length ? ' (' + skipped[0] + ')' : ''));

    return { images, xmls, skipped };
}

// ---------- XML pairing ----------
export type AtlasPair = { image: ZipImage, xml: ZipXml };

/**
 * Decides which images are spritesheets described by an XML (Sparrow/TextureAtlas) and which are single frames.
 * An XML is optional: images without a matching XML are plain frames. Unusable XMLs only produce a warning.
 */
export function pairAtlases(images: ZipImage[], xmls: ZipXml[]): { pairs: AtlasPair[], singles: ZipImage[], warnings: string[] }
{
    const warnings: string[] = [];
    const pairs: AtlasPair[] = [];
    const used = new Set<ZipImage>();

    for(const x of xmls)
    {
        let doc: Document;
        try { doc = new DOMParser().parseFromString(x.text, 'text/xml'); }
        catch { warnings.push(`${x.path}: could not be parsed, ignored`); continue; }
        const root = doc.documentElement;
        if(!root || doc.getElementsByTagName('parsererror').length > 0 || root.nodeName !== 'TextureAtlas'
            || doc.getElementsByTagName('SubTexture').length === 0)
        {
            warnings.push(`${x.path}: not a spritesheet XML (TextureAtlas with SubTexture entries), ignored`);
            continue;
        }

        const folder = x.path.includes('/') ? x.path.substring(0, x.path.lastIndexOf('/') + 1) : '';
        const wanted = (root.getAttribute('imagePath') || '').replace(/\\/g, '/');
        const wantedBase = baseName(wanted).toLowerCase();
        const xmlStem = baseName(x.path).replace(/\.xml$/i, '').toLowerCase();

        const candidates = images.filter((im) => !used.has(im));
        const sameFolder = (im: ZipImage) => im.path.startsWith(folder) && !im.path.substring(folder.length).includes('/');
        const byName = (n: string) => candidates.filter((im) => baseName(im.path).toLowerCase() === n);
        let match: ZipImage | undefined;
        if(wantedBase)
        {
            const c = byName(wantedBase);
            match = c.find(sameFolder) || c[0];
        }
        if(!match)
        {
            const c = byName(xmlStem + '.png');
            match = c.find(sameFolder) || c[0];
        }
        if(!match)
        {
            warnings.push(`${x.path}: no matching PNG found in the ZIP, ignored`);
            continue;
        }
        used.add(match);
        pairs.push({ image: match, xml: x });
    }

    return { pairs, singles: images.filter((im) => !used.has(im)), warnings };
}
