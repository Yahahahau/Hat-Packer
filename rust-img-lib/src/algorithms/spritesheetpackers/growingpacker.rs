use std::{collections::HashMap, io::{self, Write}};

use wasm_bindgen::prelude::*;

use crate::{utils::{PackError, encode_image_as_png, self, transform_image, pad_image_uniform, PrefixCounter}, algorithms::{PackingRectangle, Packer, FitRect}, textureatlas_format::{self, SubTexture}};
use image::{imageops, DynamicImage};
use super::helpers;

// use super::{PackingRectangle, Packer, FitRect, growingpack_fns};

pub struct TransformInfo
{
    pub new_width: u32,
    pub new_height: u32,
    pub flip_x: bool,
    pub flip_y: bool
}

struct FrameRectInfo
{
    frame_x: i64,
    frame_y: i64,
    frame_width: u64,
    frame_height: u64
}

struct FrameInfo
{
    // spr_id: String,
    // img_data: Vec<u8>,
    // img_cache_id: u64,
    animation_prefix: String,
    frame_rect: FrameRectInfo,
    _index: usize
}

struct ImageCache
{
    cache: HashMap<u64, DynamicImage>,
    _empty_img_hash: Option<u64>
}

impl ImageCache {
    pub fn new() -> Self
    {
        Self { cache: HashMap::new(), _empty_img_hash: None }
    }

    pub fn add_image(&mut self, img: DynamicImage, padding: u32, clip_to_bounding_box: bool) -> (u64, (i32, i32, u32, u32))
    {
        let bounds_opt = utils::get_bounding_box(&img, None);
        match bounds_opt {
            Some((left, top, right, bottom)) => {
                let mut cropped_img = img;
                // When the image is not cropped, its pixels still start at the frame origin, so the
                // frame offset must not be shifted by the (unused) bounding box position.
                let (left, top) = if clip_to_bounding_box { (left, top) } else { (0, 0) };
                if clip_to_bounding_box {
                    cropped_img = cropped_img.crop_imm(left, top, right - left, bottom - top);
                }
                cropped_img = pad_image_uniform(cropped_img, padding);
                let imghash = utils::get_hash_from_image_bytes(cropped_img.as_bytes());
                if !self.cache.contains_key(&imghash)
                {
                    self.cache.insert(imghash, cropped_img);
                }
                return (imghash, ((left as i32 - padding as i32), (top as i32 - padding as i32), right + padding, bottom + padding));
            }
            None => {
                match self._empty_img_hash {
                    None => {
                        let img = image::DynamicImage::new_rgba8(4, 4);
                        let empty_img_hash = utils::get_hash_from_image_bytes(img.as_bytes());
                        if !self.cache.contains_key(&empty_img_hash)
                        {
                            self.cache.insert(empty_img_hash, img);
                        }
                        self._empty_img_hash = Some(empty_img_hash);
                        return (empty_img_hash, (0, 0, 4, 4));
                    },
                    Some(hash) => {
                        return (hash, (0, 0, 4, 4));
                    }
                }
            }
        }
    }
}

#[wasm_bindgen]
pub struct GrowingPacker
{
    character_name: String,
    img_padding: u32,
    frame_image_cache: ImageCache,
    frames: HashMap<u64, Vec<FrameInfo>>,
    _spritesheet_store: HashMap<String, image::DynamicImage>,
    _frame_count: usize
}

#[wasm_bindgen]
impl GrowingPacker
{
    pub fn new(charname: String, padding: u32) -> Self
    {
        Self {
            character_name: charname,
            img_padding: padding,
            frame_image_cache: ImageCache::new(),
            frames: HashMap::new(),
            _spritesheet_store: HashMap::new(),
            _frame_count: 0
        }
    }

    pub fn add_image_to_store(&mut self, img_key: String, img_data: Vec<u8>)
    {
        self._spritesheet_store.insert(img_key, image::load_from_memory(&img_data).expect("Expected valid image. Got invalid image!"));
    }

    pub fn add_single_frame(
        &mut self,
        // spr_id: String,
        img_data: Vec<u8>,
        animation_prefix: String,
        new_width: u32,
        new_height: u32,
        flip_x: bool,
        flip_y: bool,
        frame_x: i64,
        frame_y: i64,
        frame_width: u64,
        frame_height: u64,
        clip_to_bbox: bool
    )
    {
        self._add_frame(
            image::load_from_memory(&img_data).expect("Should be valid image"), 
            TransformInfo { new_width, new_height, flip_x, flip_y }, 
            animation_prefix, 
            FrameRectInfo { 
                frame_x, 
                frame_y, 
                frame_width, 
                frame_height
            },
            clip_to_bbox
        );
    }

    /// Same as `add_single_frame`, but only the pixels inside the given rectangle of the image are used.
    /// This lets the front-end hand over an image that it already trimmed (auto-trim on import) without
    /// re-encoding anything: the PNG bytes stay untouched and only the crop rectangle is sent.
    pub fn add_single_frame_cropped(
        &mut self,
        img_data: Vec<u8>,
        animation_prefix: String,
        rect_x: u32,
        rect_y: u32,
        rect_width: u32,
        rect_height: u32,
        new_width: u32,
        new_height: u32,
        flip_x: bool,
        flip_y: bool,
        frame_x: i64,
        frame_y: i64,
        frame_width: u64,
        frame_height: u64,
        clip_to_bbox: bool
    )
    {
        let full = image::load_from_memory(&img_data).expect("Should be valid image");
        // never read outside the image, whatever the caller sent
        let x = rect_x.min(full.width().saturating_sub(1));
        let y = rect_y.min(full.height().saturating_sub(1));
        let w = rect_width.min(full.width() - x).max(1);
        let h = rect_height.min(full.height() - y).max(1);
        self._add_frame(
            full.crop_imm(x, y, w, h),
            TransformInfo { new_width, new_height, flip_x, flip_y },
            animation_prefix,
            FrameRectInfo { frame_x, frame_y, frame_width, frame_height },
            clip_to_bbox
        );
    }

    pub fn add_spritesheet_frame(
        &mut self,
        // spr_id: String,
        spritesheet_id: String,
        animation_prefix: String,
        rect_x: u32,
        rect_y: u32,
        rect_width: u32,
        rect_height: u32,
        new_width: u32,
        new_height: u32,
        flip_x: bool,
        flip_y: bool,
        frame_x: i64,
        frame_y: i64,
        frame_width: u64,
        frame_height: u64,
        clip_to_bbox: bool
    )
    {
        let pre_img = self._spritesheet_store
            .get(&spritesheet_id)
            .expect("Key not in map!")
            .crop_imm(rect_x, rect_y, rect_width, rect_height);

        self._add_frame(
            pre_img, 
            TransformInfo { 
                new_width, 
                new_height, 
                flip_x, 
                flip_y 
            }, 
            animation_prefix, 
            FrameRectInfo { 
                frame_x, 
                frame_y, 
                frame_width, 
                frame_height 
            },
            clip_to_bbox
        );
    }

    fn _add_frame(
        &mut self,
        frame_img: DynamicImage,
        transform: TransformInfo,
        animation_prefix: String,
        raw_frame_rect: FrameRectInfo,
        clip_to_bbox: bool
    )
    {
        let true_img = transform_image(frame_img, transform);
        let (imghash, (left, top, _right, _bottom)) = self.frame_image_cache.add_image(
            true_img,
            self.img_padding,
            clip_to_bbox
        );

        let cur_frameinfo = FrameInfo {
            // spr_id,
            // img_cache_id: imghash,
            animation_prefix,
            frame_rect: FrameRectInfo {
                frame_x: raw_frame_rect.frame_x - (left as i64), 
                frame_y: raw_frame_rect.frame_y - (top as i64), 
                frame_width: raw_frame_rect.frame_width, 
                frame_height: raw_frame_rect.frame_height
            },
            _index: self._frame_count
        };
        self._frame_count += 1;
        
        let imgframes = self.frames.get_mut(&imghash);
        match imgframes {
            Some(frames) => {
                frames.push(cur_frameinfo);
            }
            None => {
                self.frames.insert(imghash, vec![ cur_frameinfo ]);
            }
        }
    }

    /// Returns the final image as a PNG
    pub fn make_packed_image(&mut self) -> Vec<u8>
    {
        let (final_width, final_height, fits) = self.pack().expect("Packing error happened!!");
        let mut base = image::DynamicImage::new_rgba8(final_width, final_height);

        let mut xml_bytes = Vec::new();
        let mut texture_atlas = textureatlas_format::TextureAtlas::default();
        texture_atlas.image_path = self.character_name.clone() + ".png";
        texture_atlas.subtextures = vec![SubTexture::default(); self._frame_count];
        
        // group frames by id
        for fit in fits
        {
            imageops::overlay(&mut base, &self.frame_image_cache.cache[&fit.id], fit.x as i64, fit.y as i64);
            let frame_group = self.frames.get(&fit.id);
            if let Some(frames) = frame_group {
                for f in frames
                {
                    texture_atlas.subtextures[f._index] = SubTexture::new(
                        f.animation_prefix.clone(), 
                        fit.x, 
                        fit.y, 
                        fit.width, 
                        fit.height, 
                        Some(f.frame_rect.frame_x as i32), 
                        Some(f.frame_rect.frame_y as i32), 
                        Some(f.frame_rect.frame_width as u32), 
                        Some(f.frame_rect.frame_height as u32),
                        None, // TODO: Test if adding flipX and flipY to xml works in flixel
                        None
                    );
                }
            }
        }
        texture_atlas.write_to(&mut xml_bytes);
        
        let pngbytes = encode_image_as_png(&base);
        
        let mut zip_buf: Vec<u8> = Vec::with_capacity(pngbytes.len());
        let zipcursor = io::Cursor::new(&mut zip_buf);
        
        let mut zip_writer = zip::ZipWriter::new(zipcursor);
        let zip_opts = zip::write::FileOptions::default();
        
        zip_writer.start_file(self.character_name.clone() + ".png", zip_opts).expect("Could not write to zip!");
        zip_writer.write_all(&pngbytes).expect("Zip error!");

        zip_writer.start_file(self.character_name.clone() + ".xml", zip_opts).expect("Could not write to zip!");
        zip_writer.write_all(&xml_bytes).expect("Zip error!");

        zip_writer.finish().expect("Error finising zip!");
        drop(zip_writer);

        return zip_buf;
    }

    /// Exports every frame as its own PNG inside a ZIP.
    ///
    /// * `full_canvas == false` (default in the UI): each PNG is the real, trimmed image (e.g. 180 x 240),
    ///   exactly the pixels that are packed into the atlas. Because trimming drops the position of the
    ///   pixels, an `offsets.csv` is added so nothing is lost (original size + offset of every frame).
    /// * `full_canvas == true`: each PNG is re-created at the original frame size (e.g. 512 x 512) with the
    ///   trimmed pixels put back at their offset (the exact frame as the engine would show it).
    pub fn make_img_sequence(&self, unique_only: bool, full_canvas: bool) -> Vec<u8>
    {
        let mut zip_buf: Vec<u8> = Vec::new();
        let zipcursor = io::Cursor::new(&mut zip_buf);
        
        let mut zip_writer = zip::ZipWriter::new(zipcursor);
        let zip_opts = zip::write::FileOptions::default();

        let mut prefix_counter = PrefixCounter::new();
        let mut offsets_csv = String::from("file,width,height,frameX,frameY,frameWidth,frameHeight\n");
        let mut any_trimmed = false;

        if !unique_only
        {
            // frames are written in the order they were added (self.frames is a HashMap, so sort by index)
            let mut ordered: Vec<(&FrameInfo, &DynamicImage)> = Vec::new();
            for (imghash, frames) in self.frames.iter()
            {
                if let Some(im) = self.frame_image_cache.cache.get(imghash) {
                    for f in frames { ordered.push((f, im)); }
                }
            }
            ordered.sort_by_key(|(f, _)| f._index);

            for (f, im) in ordered
            {
                let anim_num = prefix_counter.add_prefix(&f.animation_prefix);
                let file_name = format!("{}{}.png", f.animation_prefix, anim_num);

                let pngbytes = if full_canvas
                {
                    // re-create the exact frame as it would appear in flixel
                    let mut final_dims = (f.frame_rect.frame_width, f.frame_rect.frame_height);
                    let mut placing_position = (0, 0);
                    if f.frame_rect.frame_x > 0
                    {
                        final_dims.0 += f.frame_rect.frame_x as u64;
                    }
                    else
                    {
                        placing_position.0 = -f.frame_rect.frame_x;
                    }

                    if f.frame_rect.frame_y > 0
                    {
                        final_dims.1 += f.frame_rect.frame_y as u64;
                    }
                    else
                    {
                        placing_position.1 = -f.frame_rect.frame_y;
                    }

                    let mut final_frame = DynamicImage::new_rgba8(final_dims.0 as u32, final_dims.1 as u32);
                    imageops::overlay(&mut final_frame, im, placing_position.0, placing_position.1);
                    encode_image_as_png(&final_frame)
                }
                else
                {
                    // the real trimmed pixels, no empty canvas around them
                    if (im.width() as u64) != f.frame_rect.frame_width || (im.height() as u64) != f.frame_rect.frame_height
                        || f.frame_rect.frame_x != 0 || f.frame_rect.frame_y != 0
                    {
                        any_trimmed = true;
                    }
                    offsets_csv.push_str(&format!(
                        "{},{},{},{},{},{},{}\n",
                        file_name, im.width(), im.height(),
                        f.frame_rect.frame_x, f.frame_rect.frame_y, f.frame_rect.frame_width, f.frame_rect.frame_height
                    ));
                    encode_image_as_png(im)
                };

                zip_writer.start_file(file_name, zip_opts).expect("Error writing to zip!");
                zip_writer.write_all(&pngbytes).expect("Zipping error!");
            }

            if !full_canvas && any_trimmed
            {
                zip_writer.start_file("offsets.csv", zip_opts).expect("Error writing to zip!");
                zip_writer.write_all(offsets_csv.as_bytes()).expect("Zipping error!");
            }
        }
        else
        {
            for (imghash, img) in self.frame_image_cache.cache.iter()
            {
                let pngbytes = encode_image_as_png(img);
                zip_writer.start_file(format!("image_frame-{imghash}.png"), zip_opts).expect("Could not start file");
                zip_writer.write_all(&pngbytes).expect("Could not write png file");
            }
        }
        zip_writer.finish().expect("Error finishing zip!");
        drop(zip_writer);

        zip_buf
    }
}

impl Packer for GrowingPacker
{
    fn pack(&mut self) -> Result<(u32, u32, Vec<FitRect>), PackError>
    {
        let mut rects = vec![];
        for (imghash, img) in self.frame_image_cache.cache.iter()
        {
            rects.push(PackingRectangle{
                width: img.width(),
                height: img.height(),
                id: *imghash
            });
        }
        let result = helpers::bin_pack(rects.into_iter(), |im| (im.width*im.height) as i32)?;
        
        Ok(
            (
                result.width(), 
                result.height(), 
                result.items
                .into_iter()
                .map(
                    |(i, elem)| FitRect::new(
                        elem.x as u32, elem.y as u32, 
                        elem.width as u32, elem.height as u32, 
                        i
                    )
                )
                .collect()
            )
        )
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    fn png(w: u32, h: u32, opaque: Option<(u32, u32, u32, u32)>) -> Vec<u8> {
        let mut img = DynamicImage::new_rgba8(w, h).to_rgba8();
        if let Some((x0, y0, x1, y1)) = opaque {
            for y in y0..y1 { for x in x0..x1 { img.put_pixel(x, y, image::Rgba([200, 10, 10, 255])); } }
        }
        encode_image_as_png(&DynamicImage::ImageRgba8(img))
    }

    fn xml_of(zip_bytes: Vec<u8>) -> String {
        let mut z = zip::ZipArchive::new(io::Cursor::new(zip_bytes)).unwrap();
        let mut f = z.by_name("c.xml").unwrap();
        let mut s = String::new();
        f.read_to_string(&mut s).unwrap();
        s
    }

    fn add(gp: &mut GrowingPacker, data: Vec<u8>, name: &str, w: u32, h: u32, clip: bool) {
        gp.add_single_frame(data, name.to_string(), w, h, false, false, 0, 0, w as u64, h as u64, clip);
    }

    fn png_dims(bytes: &[u8]) -> (u32, u32) {
        let im = image::load_from_memory(bytes).unwrap();
        (im.width(), im.height())
    }

    fn zip_entries(zip_bytes: Vec<u8>) -> Vec<(String, Vec<u8>)> {
        let mut z = zip::ZipArchive::new(io::Cursor::new(zip_bytes)).unwrap();
        let mut out = vec![];
        for i in 0..z.len() {
            let mut f = z.by_index(i).unwrap();
            let mut b = vec![];
            f.read_to_end(&mut b).unwrap();
            out.push((f.name().to_string(), b));
        }
        out
    }

    /// 512 x 512 image whose visible pixels are 180 x 240 at (100, 50): the exports must really be that size.
    #[test]
    fn exports_use_trimmed_pixels_not_the_original_canvas() {
        let data = png(512, 512, Some((100, 50, 280, 290)));
        for cropped_at_import in [false, true] {
            let mut gp = GrowingPacker::new("c".to_string(), 0);
            if cropped_at_import {
                gp.add_single_frame_cropped(data.clone(), "idle".into(), 100, 50, 180, 240, 180, 240, false, false, -100, -50, 512, 512, true);
            } else {
                add(&mut gp, data.clone(), "idle", 512, 512, true);
            }

            // atlas PNG is exactly the packed size, XML matches it
            let entries = zip_entries(gp.make_packed_image());
            let atlas = entries.iter().find(|(n, _)| n == "c.png").unwrap();
            assert_eq!(png_dims(&atlas.1), (180, 240), "atlas size (cropped_at_import={})", cropped_at_import);
            let xml = String::from_utf8(entries.iter().find(|(n, _)| n == "c.xml").unwrap().1.clone()).unwrap();
            assert!(xml.contains("width=\"180\"") && xml.contains("height=\"240\""), "{}", xml);
            assert!(xml.contains("frameX=\"-100\"") && xml.contains("frameY=\"-50\""), "{}", xml);
            assert!(xml.contains("frameWidth=\"512\"") && xml.contains("frameHeight=\"512\""), "{}", xml);

            // PNG sequence (default): trimmed 180 x 240 + offsets.csv that keeps the original size / offset
            let seq = zip_entries(gp.make_img_sequence(false, false));
            let frame = seq.iter().find(|(n, _)| n == "idle0.png").expect("idle0.png");
            assert_eq!(png_dims(&frame.1), (180, 240), "sequence frame size (cropped_at_import={})", cropped_at_import);
            let csv = String::from_utf8(seq.iter().find(|(n, _)| n == "offsets.csv").expect("offsets.csv").1.clone()).unwrap();
            assert!(csv.contains("idle0.png,180,240,-100,-50,512,512"), "{}", csv);

            // PNG sequence, full canvas option: the old 512 x 512 behaviour
            let full = zip_entries(gp.make_img_sequence(false, true));
            let f2 = full.iter().find(|(n, _)| n == "idle0.png").unwrap();
            assert_eq!(png_dims(&f2.1), (512, 512));
            assert!(full.iter().all(|(n, _)| n != "offsets.csv"));

            // unique frames export is the trimmed image as well
            let uniq = zip_entries(gp.make_img_sequence(true, false));
            assert_eq!(uniq.len(), 1);
            assert_eq!(png_dims(&uniq[0].1), (180, 240));
        }
    }

    #[test]
    fn sequence_of_untrimmed_images_has_no_offsets_file_and_keeps_order() {
        let mut gp = GrowingPacker::new("c".to_string(), 0);
        add(&mut gp, png(30, 20, Some((0, 0, 30, 20))), "b", 30, 20, true);
        add(&mut gp, png(31, 21, Some((0, 0, 31, 21))), "a", 31, 21, true);
        add(&mut gp, png(33, 22, Some((0, 0, 33, 22))), "b", 33, 22, true);
        let seq = zip_entries(gp.make_img_sequence(false, false));
        let names: Vec<&str> = seq.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(names, vec!["b0.png", "a0.png", "b1.png"], "added order kept");
        assert_eq!(png_dims(&seq[0].1), (30, 20));
        assert_eq!(png_dims(&seq[2].1), (33, 22));
    }

    #[test]
    fn transparent_and_solid_sequence_export_is_safe() {
        let mut gp = GrowingPacker::new("c".to_string(), 0);
        add(&mut gp, png(16, 16, None), "empty", 16, 16, true);
        add(&mut gp, png(16, 16, Some((0, 0, 16, 16))), "solid", 16, 16, true);
        let seq = zip_entries(gp.make_img_sequence(false, false));
        let pngs: Vec<_> = seq.iter().filter(|(n, _)| n.ends_with(".png")).collect();
        assert_eq!(pngs.len(), 2);
        for (_, b) in pngs { let (w, h) = png_dims(b); assert!(w >= 1 && h >= 1); }
        assert_eq!(png_dims(&seq.iter().find(|(n, _)| n == "solid0.png").unwrap().1), (16, 16));
    }

    #[test]
    fn trim_keeps_offset_and_frame_size() {
        let mut gp = GrowingPacker::new("c".to_string(), 0);
        add(&mut gp, png(20, 20, Some((5, 7, 15, 12))), "idle", 20, 20, true);
        let xml = xml_of(gp.make_packed_image());
        assert!(xml.contains("width=\"10\""), "{}", xml);
        assert!(xml.contains("height=\"5\""), "{}", xml);
        assert!(xml.contains("frameX=\"-5\""), "{}", xml);
        assert!(xml.contains("frameY=\"-7\""), "{}", xml);
        assert!(xml.contains("frameWidth=\"20\"") && xml.contains("frameHeight=\"20\""), "{}", xml);
    }

    #[test]
    fn no_trim_keeps_full_image_and_zero_offset() {
        let mut gp = GrowingPacker::new("c".to_string(), 0);
        add(&mut gp, png(20, 20, Some((5, 7, 15, 12))), "idle", 20, 20, false);
        let xml = xml_of(gp.make_packed_image());
        assert!(xml.contains("width=\"20\"") && xml.contains("height=\"20\""), "{}", xml);
        assert!(xml.contains("frameX=\"0\"") && xml.contains("frameY=\"0\""), "{}", xml);
    }

    #[test]
    fn fully_transparent_and_fully_opaque_are_safe() {
        let mut gp = GrowingPacker::new("c".to_string(), 0);
        add(&mut gp, png(16, 16, None), "empty", 16, 16, true);
        add(&mut gp, png(16, 16, Some((0, 0, 16, 16))), "solid", 16, 16, true);
        let xml = xml_of(gp.make_packed_image());
        assert!(xml.contains("empty0000") && xml.contains("solid0000"), "{}", xml);
        // solid image: nothing trimmed, offset unchanged
        let solid_line = xml.lines().find(|l| l.contains("solid0000")).unwrap();
        assert!(solid_line.contains("width=\"16\"") && solid_line.contains("frameX=\"0\""), "{}", solid_line);
    }

    #[test]
    fn xml_follows_frame_add_order() {
        let mut gp = GrowingPacker::new("c".to_string(), 0);
        for (i, n) in ["a", "b", "c1", "a"].iter().enumerate() {
            add(&mut gp, png(10 + i as u32, 10, Some((0, 0, 10, 10))), n, 10 + i as u32, 10, true);
        }
        let xml = xml_of(gp.make_packed_image());
        let names: Vec<&str> = xml.lines().filter(|l| l.contains("<SubTexture")).map(|l| l.split('"').nth(1).unwrap()).collect();
        assert_eq!(names, vec!["a0000", "b0000", "c10000", "a0001"]);
    }

    fn pixels(png_bytes: &[u8]) -> (u32, u32, Vec<u8>) {
        let im = image::load_from_memory(png_bytes).unwrap().to_rgba8();
        (im.width(), im.height(), im.into_raw())
    }

    fn seq_frames(zip_bytes: Vec<u8>) -> Vec<(u32, u32, Vec<u8>)> {
        let mut z = zip::ZipArchive::new(io::Cursor::new(zip_bytes)).unwrap();
        let mut names: Vec<String> = (0..z.len()).map(|i| z.by_index(i).unwrap().name().to_string()).collect();
        names.sort();
        names.iter().map(|n| { let mut b = Vec::new(); z.by_name(n).unwrap().read_to_end(&mut b).unwrap(); pixels(&b) }).collect()
    }

    // a distinctive sprite so any shift is noticed (alpha varies, one semi-transparent pixel)
    fn sprite(w: u32, h: u32, x0: u32, y0: u32, x1: u32, y1: u32) -> Vec<u8> {
        let mut img = DynamicImage::new_rgba8(w, h).to_rgba8();
        for y in y0..y1 { for x in x0..x1 { img.put_pixel(x, y, image::Rgba([(x * 7 % 256) as u8, (y * 11 % 256) as u8, 90, 255])); } }
        img.put_pixel(x0, y0, image::Rgba([10, 20, 30, 1])); // almost invisible, must still count as visible
        encode_image_as_png(&DynamicImage::ImageRgba8(img))
    }

    /// front-end style: bounding box found outside, crop rectangle + negative offset sent in
    fn add_pretrimmed(gp: &mut GrowingPacker, png: Vec<u8>, name: &str, w: u32, h: u32, b: (u32, u32, u32, u32)) {
        let (l, t, r, bt) = b;
        gp.add_single_frame_cropped(png, name.to_string(), l, t, r - l, bt - t, r - l, bt - t, false, false, -(l as i64), -(t as i64), w as u64, h as u64, true);
    }

    #[test]
    fn pretrimmed_frame_exports_same_xml_as_generate_time_trim() {
        let data = sprite(37, 23, 5, 7, 30, 20);
        let mut a = GrowingPacker::new("c".to_string(), 0);
        add(&mut a, data.clone(), "idle", 37, 23, true);
        let mut b = GrowingPacker::new("c".to_string(), 0);
        add_pretrimmed(&mut b, data, "idle", 37, 23, (5, 7, 30, 20));
        let (xa, xb) = (xml_of(a.make_packed_image()), xml_of(b.make_packed_image()));
        let line = |x: &str| x.lines().find(|l| l.contains("<SubTexture")).unwrap().to_string();
        assert_eq!(line(&xa), line(&xb));
        assert!(line(&xb).contains("width=\"25\"") && line(&xb).contains("frameX=\"-5\"") && line(&xb).contains("frameWidth=\"37\""), "{}", line(&xb));
    }

    #[test]
    fn frame_sizes_are_real_pixels_not_rounded_and_animation_does_not_jump() {
        // odd, non-multiple-of-16 sizes that differ per frame; every frame must be rebuilt pixel-perfect
        let specs = [(37u32, 23u32, (5u32, 7u32, 30u32, 20u32)), (50, 41, (0, 0, 50, 41)), (21, 19, (3, 2, 4, 3)), (33, 33, (10, 12, 33, 33))];
        let mut gp = GrowingPacker::new("c".to_string(), 0);
        let mut originals = Vec::new();
        for (i, (w, h, b)) in specs.iter().enumerate() {
            let data = sprite(*w, *h, b.0, b.1, b.2, b.3);
            originals.push(pixels(&data));
            add_pretrimmed(&mut gp, data, &format!("f{}", i), *w, *h, *b);
        }
        let xml = xml_of(gp.make_packed_image());
        for (i, (w, h, _)) in specs.iter().enumerate() {
            let line = xml.lines().find(|l| l.contains(&format!("name=\"f{}0000\"", i))).unwrap();
            assert!(line.contains(&format!("frameWidth=\"{}\"", w)) && line.contains(&format!("frameHeight=\"{}\"", h)), "{}", line);
        }
        let rebuilt = seq_frames(gp.make_img_sequence(false, true));
        assert_eq!(rebuilt.len(), originals.len());
        for (i, (w, h, px)) in originals.iter().enumerate() {
            let r = rebuilt.iter().find(|r| r.0 == *w && r.1 == *h).expect("frame size kept");
            assert_eq!(&r.2, px, "frame {} not reproduced exactly", i);
        }
    }

    #[test]
    fn cropped_rect_outside_image_is_clamped_not_a_panic() {
        let mut gp = GrowingPacker::new("c".to_string(), 0);
        gp.add_single_frame_cropped(sprite(10, 10, 2, 2, 8, 8), "x".to_string(), 8, 8, 50, 50, 2, 2, false, false, 0, 0, 10, 10, true);
        let _ = gp.make_packed_image();
    }
}
