// Menu Informasi & Berita seputar Stratifikasi UKS/M Kabupaten Bekasi (notulen Sep 2026).
// Baca: publik (juga tampil di halaman login). Tulis: Admin/Koordinator Kabupaten.
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/prisma.js';
import { authRequired, requireAdmin, audit } from '../lib/auth.js';
import { paging, halaman } from '../lib/paginasi.js';

const r = Router();

export const KATEGORI_BERITA = ['INFORMASI', 'BERITA', 'KEGIATAN', 'PENGUMUMAN'];

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const DIR = path.join(UPLOAD_DIR, 'berita');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

const DIR_PDF = path.join(UPLOAD_DIR, 'berita-pdf');
if (!fs.existsSync(DIR_PDF)) fs.mkdirSync(DIR_PDF, { recursive: true });
const MAKS_GAMBAR = 5 * 1024 * 1024;
const MAKS_PDF = 30 * 1024 * 1024; // cukup untuk buku panduan bergambar
const EXT_GAMBAR = ['.jpg', '.jpeg', '.png', '.webp'];
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, file.fieldname === 'lampiran' ? DIR_PDF : DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: MAKS_PDF, files: 2 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'lampiran') {
      if (ext === '.pdf') cb(null, true); else cb(new Error('Lampiran harus berformat PDF.'));
    } else if (EXT_GAMBAR.includes(ext)) cb(null, true);
    else cb(new Error('Gambar harus JPG, JPEG, PNG, atau WEBP.'));
  },
});
const hapusBerkas = (nama) => { if (nama) { try { fs.unlinkSync(path.join(DIR, nama)); } catch { /* sudah hilang */ } } };
const hapusPdf = (nama) => { if (nama) { try { fs.unlinkSync(path.join(DIR_PDF, nama)); } catch { /* sudah hilang */ } } };
function bersihkanUnggahan(req) {
  hapusBerkas(req.files?.gambar?.[0]?.filename); hapusPdf(req.files?.lampiran?.[0]?.filename);
}
// Unggahan gambar sampul (maks 5 MB) dan lampiran PDF (maks 30 MB). Isi PDF diperiksa
// dari tanda berkasnya (%PDF), bukan hanya dari ekstensi.
function unggahBerkas(req, res, next) {
  upload.fields([{ name: 'gambar', maxCount: 1 }, { name: 'lampiran', maxCount: 1 }])(req, res, (err) => {
    if (err) {
      bersihkanUnggahan(req);
      return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran berkas terlalu besar (gambar maks 5 MB, PDF maks 30 MB).' : err.message });
    }
    const g = req.files?.gambar?.[0];
    if (g && g.size > MAKS_GAMBAR) { bersihkanUnggahan(req); return res.status(400).json({ error: 'Ukuran gambar maksimal 5 MB.' }); }
    const l = req.files?.lampiran?.[0];
    if (l) {
      const kepala = Buffer.alloc(5);
      try { const fd = fs.openSync(l.path, 'r'); fs.readSync(fd, kepala, 0, 5, 0); fs.closeSync(fd); } catch { /* dianggap tidak sah */ }
      if (kepala.toString('latin1') !== '%PDF-') { bersihkanUnggahan(req); return res.status(400).json({ error: 'Berkas lampiran bukan PDF yang sah.' }); }
    }
    next();
  });
}

const ringkasDari = (b) => b.ringkasan || (b.isi || '').replace(/\s+/g, ' ').trim().slice(0, 180) + ((b.isi || '').length > 180 ? '…' : '');
const bentuk = (b, penuh = false) => ({
  id: b.id, judul: b.judul, kategori: b.kategori, ringkasan: ringkasDari(b),
  gambarUrl: b.gambar ? `/uploads/berita/${b.gambar}` : null,
  lampiranNama: b.lampiran ? (b.lampiranNama || 'lampiran.pdf') : null, lampiranUkuran: b.lampiran ? b.lampiranUkuran : null,
  terbit: b.terbit, disematkan: b.disematkan, penulis: b.penulis,
  terbitPada: b.terbitPada, createdAt: b.createdAt, updatedAt: b.updatedAt,
  ...(penuh ? { isi: b.isi, ringkasanAsli: b.ringkasan } : {}),
});

function whereDaftar(req, publik) {
  const { kategori, q } = req.query;
  return {
    ...(publik ? { terbit: true } : {}),
    ...(kategori && KATEGORI_BERITA.includes(kategori) ? { kategori } : {}),
    ...(q ? { OR: [{ judul: { contains: q, mode: 'insensitive' } }, { isi: { contains: q, mode: 'insensitive' } }] } : {}),
  };
}
const URUTAN = [{ disematkan: 'desc' }, { terbitPada: 'desc' }, { createdAt: 'desc' }];

// ---------- PENGELOLAAN (admin) — didefinisikan sebelum /:id ----------
r.get('/kelola/daftar', authRequired, requireAdmin, async (req, res) => {
  const where = whereDaftar(req, false);
  const { page, pageSize, skip, take } = paging(req, { bawaan: 25 });
  const [total, list] = await Promise.all([
    prisma.berita.count({ where }),
    prisma.berita.findMany({ where, orderBy: URUTAN, skip, take }),
  ]);
  res.json(halaman(list.map((b) => bentuk(b)), total, page, pageSize));
});

r.get('/kelola/:id', authRequired, requireAdmin, async (req, res) => {
  const b = await prisma.berita.findUnique({ where: { id: req.params.id } });
  if (!b) return res.status(404).json({ error: 'Berita tidak ditemukan' });
  res.json(bentuk(b, true));
});

function kirimLampiran(res, b) {
  if (!b || !b.lampiran) return res.status(404).json({ error: 'Lampiran tidak ditemukan' });
  const f = path.join(DIR_PDF, b.lampiran);
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'Berkas lampiran tidak ada di penyimpanan' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(b.lampiranNama || 'lampiran.pdf')}`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.sendFile(path.resolve(f));
}
// Admin dapat membuka lampiran berita yang masih draf
r.get('/kelola/:id/lampiran', authRequired, requireAdmin, async (req, res) => {
  kirimLampiran(res, await prisma.berita.findUnique({ where: { id: req.params.id } }));
});

function dataDariBody(body) {
  const kategori = KATEGORI_BERITA.includes(body.kategori) ? body.kategori : 'INFORMASI';
  const benar = (v) => v === true || v === 'true' || v === '1' || v === 'on';
  return {
    judul: String(body.judul || '').trim(),
    kategori,
    ringkasan: String(body.ringkasan || '').trim() || null,
    isi: String(body.isi || '').trim(),
    terbit: benar(body.terbit),
    disematkan: benar(body.disematkan),
  };
}

r.post('/kelola', authRequired, requireAdmin, unggahBerkas, async (req, res) => {
  const data = dataDariBody(req.body);
  if (!data.judul || !data.isi) { bersihkanUnggahan(req); return res.status(400).json({ error: 'Judul dan isi wajib diisi' }); }
  const gbr = req.files?.gambar?.[0]; const pdf = req.files?.lampiran?.[0];
  const b = await prisma.berita.create({
    data: {
      ...data, gambar: gbr?.filename || null, penulis: req.user.nama, terbitPada: data.terbit ? new Date() : null,
      lampiran: pdf?.filename || null, lampiranNama: pdf ? Buffer.from(pdf.originalname, 'latin1').toString('utf8') : null, lampiranUkuran: pdf?.size ?? null,
    },
  });
  await audit(req.user.nama, 'BUAT_BERITA', { entitas: 'Berita', detail: `${data.judul}${data.terbit ? ' (terbit)' : ' (draf)'}` });
  res.json(bentuk(b, true));
});

r.put('/kelola/:id', authRequired, requireAdmin, unggahBerkas, async (req, res) => {
  const lama = await prisma.berita.findUnique({ where: { id: req.params.id } });
  if (!lama) { bersihkanUnggahan(req); return res.status(404).json({ error: 'Berita tidak ditemukan' }); }
  const data = dataDariBody(req.body);
  if (!data.judul || !data.isi) { bersihkanUnggahan(req); return res.status(400).json({ error: 'Judul dan isi wajib diisi' }); }
  const gbr = req.files?.gambar?.[0]; const pdf = req.files?.lampiran?.[0];
  let gambar = lama.gambar;
  if (gbr) { hapusBerkas(lama.gambar); gambar = gbr.filename; }
  else if (req.body.hapusGambar === 'true') { hapusBerkas(lama.gambar); gambar = null; }
  let { lampiran, lampiranNama, lampiranUkuran } = lama;
  if (pdf) {
    hapusPdf(lama.lampiran);
    lampiran = pdf.filename; lampiranNama = Buffer.from(pdf.originalname, 'latin1').toString('utf8'); lampiranUkuran = pdf.size;
  } else if (req.body.hapusLampiran === 'true') {
    hapusPdf(lama.lampiran); lampiran = null; lampiranNama = null; lampiranUkuran = null;
  }
  const b = await prisma.berita.update({
    where: { id: lama.id },
    data: { ...data, gambar, lampiran, lampiranNama, lampiranUkuran, terbitPada: data.terbit ? (lama.terbitPada || new Date()) : lama.terbitPada },
  });
  await audit(req.user.nama, 'UBAH_BERITA', { entitas: 'Berita', detail: data.judul });
  res.json(bentuk(b, true));
});

r.delete('/kelola/:id', authRequired, requireAdmin, async (req, res) => {
  const b = await prisma.berita.findUnique({ where: { id: req.params.id } });
  if (!b) return res.status(404).json({ error: 'Berita tidak ditemukan' });
  await prisma.berita.delete({ where: { id: b.id } });
  hapusBerkas(b.gambar); hapusPdf(b.lampiran);
  await audit(req.user.nama, 'HAPUS_BERITA', { entitas: 'Berita', detail: b.judul });
  res.json({ ok: true });
});

// ---------- PUBLIK ----------
r.get('/', async (req, res) => {
  const where = whereDaftar(req, true);
  const { page, pageSize, skip, take } = paging(req, { bawaan: 9, maks: 50 });
  const [total, list] = await Promise.all([
    prisma.berita.count({ where }),
    prisma.berita.findMany({ where, orderBy: URUTAN, skip, take }),
  ]);
  res.json(halaman(list.map((b) => bentuk(b)), total, page, pageSize));
});

// Lampiran hanya untuk berita yang sudah terbit (publik)
r.get('/:id/lampiran', async (req, res) => {
  kirimLampiran(res, await prisma.berita.findFirst({ where: { id: req.params.id, terbit: true } }));
});

r.get('/:id', async (req, res) => {
  const b = await prisma.berita.findFirst({ where: { id: req.params.id, terbit: true } });
  if (!b) return res.status(404).json({ error: 'Berita tidak ditemukan atau belum diterbitkan' });
  res.json(bentuk(b, true));
});

export default r;
