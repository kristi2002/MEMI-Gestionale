'use strict';

/**
 * images.js — product image processing pipeline (self-hosted)
 * ───────────────────────────────────────────────────────────
 * Takes an uploaded image buffer and produces responsive WebP variants
 * (thumb / card / full), strips metadata, auto-orients from EXIF, and writes
 * them to the uploads volume with content-hashed filenames (so re-uploading
 * the same file is idempotent and files can be cached "immutable" forever).
 *
 * Files live in UPLOADS_DIR (a Docker persistent volume) and are served by the
 * backend at /api/uploads/<file> — which rides the existing nginx /api proxy
 * on both the storefront and admin domains (no CORS, no extra nginx config).
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const sharp  = require('sharp');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
const PUBLIC_BASE = '/api/uploads';           // URL prefix (proxied to the backend)

// Responsive widths (px). Each becomes a WebP file; images are never enlarged.
// Qualities are deliberately on the higher side: product imagery must not look
// blocky/"pixelated" after conversion. The small variants matter less, the
// larger (card/full) ones are what customers actually scrutinise.
const VARIANTS = [
  { name: 'thumb', width: 400,  quality: 82 },
  { name: 'card',  width: 800,  quality: 85 },
  { name: 'full',  width: 1600, quality: 88 },
];

// Shared WebP encoder options tuned for quality over raw byte-count. The single
// biggest cause of the "pixelated"/blocky look is WebP's DEFAULT 4:2:0 chroma
// subsampling, which throws away colour resolution and smears saturated edges
// (reds, prints, fine patterns). '4:4:4' keeps full chroma so colour edges stay
// crisp; higher `effort` gives better quality-per-byte; alphaQuality keeps PNG
// transparency clean. (See sharp output docs: sharp.pixelplumbing.com/api-output)
const WEBP_OPTS = {
  chromaSubsampling: '4:4:4',  // no chroma subsampling — kills colour-edge blockiness
  effort: 6,                   // 0-6: spend more CPU for a better-looking, smaller file
  alphaQuality: 100,           // crisp transparency for PNG uploads
};

// NOTE: sharp/libvips reports AVIF images as format 'heif' (AVIF is an
// AV1-encoded payload inside the HEIF/ISOBMFF container; metadata.compression
// is 'av1'). So 'heif'/'heic' MUST be here or AVIF uploads get rejected 415
// even though the AVIF→WebP decode works fine. 'avif' is kept for forward-compat
// in case a future libvips labels it directly.
const ALLOWED = new Set(['jpeg', 'jpg', 'png', 'webp', 'gif', 'avif', 'heif', 'heic', 'tiff']);

function ensureDir() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Validate + process one image buffer into stored WebP variants.
 * @returns {Promise<{full,card,thumb,width,height}>}
 * @throws if the buffer is not a supported image.
 */
async function processAndStore(buffer) {
  ensureDir();

  // Validate it is really an image (sharp throws on garbage)
  const meta = await sharp(buffer).metadata();
  if (!meta.format || !ALLOWED.has(meta.format)) {
    const err = new Error('Formato immagine non supportato');
    err.statusCode = 415;
    throw err;
  }

  const hash = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 16);

  const result = { width: meta.width || null, height: meta.height || null };
  for (const v of VARIANTS) {
    const filename = `${hash}-${v.name}.webp`;
    const filepath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filepath)) {
      await sharp(buffer)
        .rotate()                                   // auto-orient from EXIF, then EXIF is dropped
        .resize({ width: v.width, withoutEnlargement: true, kernel: 'lanczos3' })
        .sharpen({ sigma: 0.5 })                    // gentle unsharp mask to recover detail lost when downscaling (Lanczos3 + light sharpen is the standard high-quality combo)
        .webp(Object.assign({ quality: v.quality }, WEBP_OPTS))
        .toFile(filepath);
    }
    result[v.name] = `${PUBLIC_BASE}/${filename}`;
  }
  return result;
}

/** Best-effort delete of an image's variant files (given the stored object). */
function deleteVariants(image) {
  if (!image) return;
  const urls = typeof image === 'string'
    ? [image]
    : [image.thumb, image.card, image.full].filter(Boolean);
  for (const url of urls) {
    try {
      const base = String(url).split('/').pop();
      if (!base || base.indexOf('..') !== -1) continue;
      const fp = path.join(UPLOADS_DIR, base);
      if (fp.startsWith(UPLOADS_DIR) && fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch (_) { /* best effort */ }
  }
}

module.exports = { processAndStore, deleteVariants, ensureDir, UPLOADS_DIR, PUBLIC_BASE, VARIANTS };
