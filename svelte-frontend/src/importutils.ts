// Helpers for importing images: ordering rules and cheap PNG inspection.

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/**
 * Natural ("numeric") comparison: frame2 < frame10. A fixed 'en' locale is used so
 * every device (iOS, Android, desktop) produces the same order. Ties are broken by the
 * raw strings so the result is always deterministic.
 */
export function naturalCompare(a: string, b: string): number
{
    const c = collator.compare(a, b);
    if(c !== 0) return c;
    return a < b ? -1 : (a > b ? 1 : 0);
}

/** Compares two paths folder-by-folder, then by file name, each part naturally. */
export function comparePaths(a: string, b: string): number
{
    const pa = a.split('/');
    const pb = b.split('/');
    const n = Math.min(pa.length, pb.length);
    for(let i = 0; i < n; i++)
    {
        const last = (i === pa.length - 1) || (i === pb.length - 1);
        if(last && pa.length !== pb.length)
        {
            // a file sorts before the contents of a sibling folder with the same prefix
            return pa.length < pb.length ? -1 : 1;
        }
        const c = naturalCompare(pa[i], pb[i]);
        if(c !== 0) return c;
    }
    return pa.length - pb.length;
}

/** Sorts files by name with the natural order (returns a new array). */
export function sortFilesNaturally(files: File[]): File[]
{
    return [ ...files ].sort((x, y) => naturalCompare(x.name, y.name));
}

const PNG_SIG = [ 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a ];

export function isPngBytes(b: Uint8Array): boolean
{
    if(b.length < 33) return false;
    for(let i = 0; i < 8; i++) if(b[i] !== PNG_SIG[i]) return false;
    // first chunk must be IHDR
    return b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52;
}

/** Reads width/height straight from the PNG header (no decoding, no memory spike). */
export function readPngSize(b: Uint8Array): [number, number] | null
{
    if(!isPngBytes(b)) return null;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const w = dv.getUint32(16);
    const h = dv.getUint32(20);
    if(w === 0 || h === 0 || w > 32768 || h > 32768) return null;
    return [ w, h ];
}

export async function readPngSizeFromFile(f: File): Promise<[number, number] | null>
{
    const head = new Uint8Array(await f.slice(0, 33).arrayBuffer());
    return readPngSize(head);
}

/** Lets the browser paint / handle touches between batches of work. */
export function yieldToUI(): Promise<void>
{
    return new Promise((resolve) => setTimeout(resolve, 0));
}

export type OpaqueBounds = { left: number, top: number, right: number, bottom: number };

const STRIP_ROWS = 256;
const MAX_TRIM_SIDE = 16384;

/**
 * Finds the box that contains every pixel with alpha > 0 (same rule as the packer in Rust).
 * The image is only READ: it is scanned in horizontal strips (bounded memory, even for huge images)
 * and nothing is re-encoded, so the original file and its pixels stay untouched.
 * Returns null when the image is fully transparent, or 'skip' when it cannot be analysed here
 * (then the packer still trims it when generating).
 */
export async function findOpaqueBounds(file: File, width: number, height: number): Promise<OpaqueBounds | null | 'skip'>
{
    if(width > MAX_TRIM_SIDE || height > MAX_TRIM_SIDE) return 'skip';

    let source: ImageBitmap | HTMLImageElement;
    let objUrl: string | null = null;
    try {
        if(typeof createImageBitmap === 'function')
        {
            source = await createImageBitmap(file);
        }
        else
        {
            objUrl = URL.createObjectURL(file);
            const img = new Image();
            img.src = objUrl;
            await img.decode();
            source = img;
        }
    } catch (e) {
        if(objUrl) URL.revokeObjectURL(objUrl);
        return 'skip';
    }

    try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = Math.min(height, STRIP_ROWS);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if(!ctx) return 'skip';

        let minX = width, maxX = -1, minY = -1, maxY = -1;
        for(let y0 = 0; y0 < height; y0 += STRIP_ROWS)
        {
            const rows = Math.min(STRIP_ROWS, height - y0);
            ctx.clearRect(0, 0, width, canvas.height);
            ctx.drawImage(source, 0, y0, width, rows, 0, 0, width, rows);
            const data = ctx.getImageData(0, 0, width, rows).data;
            for(let y = 0; y < rows; y++)
            {
                const rowStart = y * width * 4;
                let first = -1, last = -1;
                for(let x = 0; x < width; x++)
                {
                    if(data[rowStart + x * 4 + 3] > 0)
                    {
                        if(first < 0) first = x;
                        last = x;
                    }
                }
                if(first >= 0)
                {
                    if(first < minX) minX = first;
                    if(last > maxX) maxX = last;
                    if(minY < 0) minY = y0 + y;
                    maxY = y0 + y;
                }
            }
        }
        if(maxX < 0) return null;
        return { left: minX, top: minY, right: maxX + 1, bottom: maxY + 1 };
    } catch (e) {
        return 'skip';
    } finally {
        if('close' in source) (source as ImageBitmap).close();
        if(objUrl) URL.revokeObjectURL(objUrl);
    }
}
