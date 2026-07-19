'use strict';

/**
 * attachments.js — shared secure file-attachment upload (receipts / invoices).
 *
 * Used by expenses and supplier-invoices. Accepts PDF/JPG/PNG/WebP ONLY, enforced
 * by BOTH a mimetype whitelist and a magic-byte sniff (a spoofed extension/mimetype
 * can't slip past). Files are stored under UPLOADS_DIR with a content-hashed name
 * (no path traversal) and served by the existing /api/uploads static route (which
 * sends X-Content-Type-Options: nosniff). SVG/HTML are deliberately rejected so a
 * served attachment can never execute script.
 */

const multer = require('multer');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const { UPLOADS_DIR, PUBLIC_BASE, ensureDir } = require('./images');

const ATT_MAX_MB = parseInt(process.env.MAX_UPLOAD_MB, 10) || 8;
const ATT_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

const attUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: ATT_MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, ATT_MIME.has(file.mimetype)),
});

// Magic-byte sniff so a spoofed extension/mimetype can't slip past the whitelist.
function sniffKind(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf.slice(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

// Only accept an attachment URL that we minted (a hashed file under /api/uploads) —
// never an arbitrary/external/javascript: URL. undefined = leave untouched; ''/null = clear.
const ATT_URL_RE = /^\/api\/uploads\/att-[a-f0-9]{8,}\.(pdf|jpg|png|webp)$/;
function cleanAttachmentUrl(v) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  return ATT_URL_RE.test(String(v)) ? String(v) : undefined; // ignore anything unsafe
}

/**
 * Express handler for `POST …/attachment` (field name `file`). Validates + stores the
 * upload and responds `{ url }`. `onStored(kind)` is an optional best-effort callback
 * for audit logging.
 */
function uploadHandler(onStored) {
  return (req, res) => {
    attUpload.single('file')(req, res, async (err) => {
      if (err) {
        const tooBig = err.code === 'LIMIT_FILE_SIZE';
        return res.status(tooBig ? 413 : 400).json({ error: tooBig ? `File troppo grande (max ${ATT_MAX_MB} MB)` : 'Upload non valido' });
      }
      const f = req.file;
      if (!f) return res.status(400).json({ error: 'Nessun file caricato (o formato non ammesso: PDF, JPG, PNG, WebP)' });
      const kind = sniffKind(f.buffer);
      if (!kind) return res.status(415).json({ error: 'Formato non supportato (solo PDF, JPG, PNG, WebP)' });
      try {
        ensureDir();
        const hash = crypto.createHash('sha256').update(f.buffer).digest('hex').slice(0, 16);
        const filename = `att-${hash}.${kind}`;
        await fs.promises.writeFile(path.join(UPLOADS_DIR, filename), f.buffer);
        if (typeof onStored === 'function') { try { onStored(req, kind); } catch (_) {} }
        return res.json({ url: `${PUBLIC_BASE}/${filename}` });
      } catch (e) {
        console.error('attachment upload error', e);
        return res.status(500).json({ error: 'Errore server' });
      }
    });
  };
}

module.exports = { ATT_MAX_MB, sniffKind, cleanAttachmentUrl, uploadHandler };
