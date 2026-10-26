type SpriteframeType = 'single_frame' | 'spritesheet_frame'

export class SpriteFrameData
{
    sprId: string;
    type: SpriteframeType;
    imgfileref: File;
    xmlfileref: File | null;
    selected: boolean; // refactor?
    spritesheetId: string | null;
    animationPrefix: string;
    rect: {
        x: number | null,
        y: number | null,
        width: number,
        height: number
    };
    transform: {
        newWidth: number,
        newHeight: number,
        flipX: boolean,
        flipY: boolean
    };
    frameRect: {
        frameX: number,
        frameY: number,
        frameWidth: number,
        frameHeight: number
    };
    _changed: boolean;
    // Set when the image was auto-trimmed at import: where the visible pixels start inside the
    // ORIGINAL image and how big that original is. (rect = trimmed area, frameX/frameY = -left/-top,
    // frameWidth/frameHeight = original size.) null = not trimmed at import.
    trim: { left: number, top: number, origWidth: number, origHeight: number } | null;

    constructor(id:string, type: SpriteframeType, imgfileref: File, xmlfileref: File|null, spritesheetId: string|null)
    {
        this.sprId = id;
        this.type = type;
        this.imgfileref = imgfileref;
        this.xmlfileref = xmlfileref;
        this.selected = false;
        this.spritesheetId = spritesheetId; // index into the spritesheet cache
        this.animationPrefix = '';
        this.rect = {
            x: 0,
            y: 0,
            width: null,
            height: null
        };
        this.transform = {
            newWidth: null,
            newHeight: null,
            flipX: false,
            flipY: false
        };
        this.frameRect = {
            frameX: 0,
            frameY: 0,
            frameWidth: null,
            frameHeight: null
        };
        this._changed = false;
        this.trim = null;
    }

    clone()
    {
        const clonedFrame = new SpriteFrameData(this.sprId, this.type, this.imgfileref, this.xmlfileref, this.spritesheetId);
        clonedFrame.selected = this.selected;
        clonedFrame.animationPrefix = this.animationPrefix;
        clonedFrame.rect = { ...this.rect };
        clonedFrame.transform = { ...this.transform };
        clonedFrame.frameRect = { ...this.frameRect };
        clonedFrame.trim = this.trim ? { ...this.trim } : null;
        return clonedFrame;
    }
}