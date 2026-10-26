// ZIP import: everything happens in memory (nothing is ever written to a file system path),
// entries are inspected before they are inflated, and images are inflated in small batches.
import { unzipSync, type Unzipped } from 'fflate';
import { comparePaths, isPngBytes, yieldToUI } from './importutils';

export const ZIP_LIMITS = {
    maxZipBytes: 150 * 1024 * 1024,        // size of the .zip file itself
    maxEntries: 5000,                      // entries scanned in the central directory
    maxImages: 1000,                       // PNG frames accepted from one zip
    maxImageBytes: 25 * 1024 * 1024,       // one inflated PNG
    maxTotalBytes: 600 * 1024 * 1024,      // all inflated PNGs together
    maxXmlBytes: 5 * 1024 * 1024,
    batchSize: 8,
};

export type ZipImage = { path: string; name: string; file: File };
export type ZipXml = { path: string; name: string; text: string };
export type ZipImportResult = {
    images: ZipImage[];          // sorted by path (natural numeric)
    xmls: ZipXml[];
    skipped: string[];           // human readable reasons
    warnings: string[];
};

export class ZipImportError extends Error {}

function cleanPath(raw: string): string | null
{
    const p = raw.replace(/\\/g, '/');
    if(p.endsWith('/')) return null;                          // directory entry
    if(p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return null; // absolute path
    const parts = p.split('/');
    if(parts.some((s) => s === '..' || s === '')) return null; // traversal / empty segment
    if(parts[0] === '__MACOSX') return null;                  // macOS resource forks
    const base = parts[parts.length - 1];
    if(base.startsWith('.') || base === 'Thumbs.db') return null;
    return parts.join('/');
}

export async function readZip(zipFile: File, onProgress: (msg: string) => void): Promise<ZipImportResult>
{
    const L = ZIP_LIMITS;
    if(zipFile.size === 0) throw new ZipImportError('The ZIP file is empty.');
    if(zipFile.size > L.maxZipBytes)
        throw new ZipImportError(`The ZIP is too large (${(zipFile.size / 1048576).toFixed(0)} MB). The limit is ${L.maxZipBytes / 1048576} MB.`);

    onProgress('Reading ZIP...');
    const data = new Uint8Array(await zipFile.arrayBuffer());
    if(!(data[0] === 0x50 && data[1] === 0x4b))
        throw new ZipImportError('This file is not a valid ZIP archive.');

    // 1) list the entries WITHOUT inflating anything (filter returns false)
    const entries: { path: string; size: number; kind: 'png' | 'xml' }[] = [];
    const skipped: string[] = [];
    const warnings: string[] = [];
    const seen = new Set<string>();
    let scanned = 0;
    try {
        unzipSync(data, {
            filter: (f) => {
                scanned++;
                if(scanned > L.maxEntries) return false;
                const path = cleanPath(f.name);
                if(path === null) return false;
                const lower = path.toLowerCase();
                const kind = lower.endsWith('.png') ? 'png' : (lower.endsWith('.xml') ? 'xml' : null);
                if(kind === null)
                {
                    skipped.push(`${path} (unsupported file type)`);
                    return false;
                }
                if(seen.has(path))
                {
                    warnings.push(`Duplicate entry "${path}" ignored (first one kept).`);
                    return false;
                }
                seen.add(path);
                entries.push({ path, size: f.originalSize, kind });
                return false;
            }
        });
    } catch (e) {
        throw new ZipImportError('The ZIP file is damaged or uses an unsupported format.');
    }
    if(scanned > L.maxEntries)
        throw new ZipImportError(`The ZIP has too many entries (more than ${L.maxEntries}).`);

    const pngEntries = entries.filter((e) => e.kind === 'png').sort((a, b) => comparePaths(a.path, b.path));
    const xmlEntries = entries.filter((e) => e.kind === 'xml').sort((a, b) => comparePaths(a.path, b.path));
    if(pngEntries.length === 0)
        throw new ZipImportError('No PNG images were found in this ZIP.');
    if(pngEntries.length > L.maxImages)
        throw new ZipImportError(`The ZIP contains ${pngEntries.length} images. The limit is ${L.maxImages} per import.`);

    let total = 0;
    for(const e of pngEntries)
    {
        if(e.size > L.maxImageBytes)
            throw new ZipImportError(`"${e.path}" is too large (${(e.size / 1048576).toFixed(0)} MB, limit ${L.maxImageBytes / 1048576} MB).`);
        total += e.size;
    }
    if(total > L.maxTotalBytes)
        throw new ZipImportError(`The images inside this ZIP are too big in total (${(total / 1048576).toFixed(0)} MB, limit ${L.maxTotalBytes / 1048576} MB).`);

    // 2) inflate in small batches so the UI keeps responding and memory stays bounded
    const images: ZipImage[] = [];
    for(let i = 0; i < pngEntries.length; i += L.batchSize)
    {
        const batch = pngEntries.slice(i, i + L.batchSize);
        const wanted = new Set(batch.map((b) => b.path));
        let out: Unzipped;
        try {
            out = unzipSync(data, { filter: (f) => wanted.has(f.name.replace(/\\/g, '/')) });
        } catch (e) {
            throw new ZipImportError('The ZIP file is damaged: could not extract some images.');
        }
        for(const ent of batch)
        {
            const key = Object.keys(out).find((k) => k.replace(/\\/g, '/') === ent.path);
            const bytes = key !== undefined ? out[key] : undefined;
            if(!bytes || !isPngBytes(bytes))
            {
                skipped.push(`${ent.path} (not a valid PNG - file may be damaged)`);
                continue;
            }
            const name = ent.path.substring(ent.path.lastIndexOf('/') + 1);
            images.push({ path: ent.path, name, file: new File([bytes], name, { type: 'image/png' }) });
        }
        onProgress(`Extracting images ${Math.min(i + L.batchSize, pngEntries.length)} / ${pngEntries.length}`);
        await yieldToUI();
    }

    const xmls: ZipXml[] = [];
    for(const x of xmlEntries)
    {
        if(x.size > L.maxXmlBytes) { skipped.push(`${x.path} (XML too large)`); continue; }
        try {
            const out = unzipSync(data, { filter: (f) => f.name.replace(/\\/g, '/') === x.path });
            const key = Object.keys(out)[0];
            const text = new TextDecoder('utf-8').decode(out[key]);
            xmls.push({ path: x.path, name: x.path.substring(x.path.lastIndexOf('/') + 1), text });
        } catch (e) {
            skipped.push(`${x.path} (could not read XML)`);
        }
    }

    if(images.length === 0)
        throw new ZipImportError('None of the images in this ZIP could be read (damaged or not PNG).');

    return { images, xmls, skipped, warnings };
}

/**
 * Looks at an XML (Sparrow / TextureAtlas) from the zip and finds the PNG it describes.
 * Returns null when the XML is not a usable atlas or points at an image that is not in the zip.
 */
export function matchAtlas(xml: ZipXml, images: ZipImage[]): ZipImage | null
{
    let doc: Document;
    try {
        doc = new DOMParser().parseFromString(xml.text, 'text/xml');
    } catch (e) { return null; }
    if(doc.getElementsByTagName('parsererror').length > 0) return null;
    const root = doc.getElementsByTagName('TextureAtlas')[0];
    if(!root || doc.getElementsByTagName('SubTexture').length === 0) return null;

    const imagePath = (root.getAttribute('imagePath') || '').replace(/\\/g, '/');
    const wantedBase = imagePath.substring(imagePath.lastIndexOf('/') + 1).toLowerCase();
    const xmlDir = xml.path.includes('/') ? xml.path.substring(0, xml.path.lastIndexOf('/') + 1) : '';

    // prefer the image next to the XML, then any image with that file name
    const candidates = images.filter((im) => im.name.toLowerCase() === wantedBase);
    const near = candidates.find((im) => im.path.startsWith(xmlDir) && !im.path.substring(xmlDir.length).includes('/'));
    return near || candidates[0] || null;
}
