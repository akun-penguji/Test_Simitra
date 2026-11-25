// Surat Rekomendasi Kecamatan — diunggah koordinator TP UKS/M Kecamatan, dibaca
// Tim Stratifikasi Kabupaten pada menu "Surat Rekomendasi Kecamatan" (rapat akhir
// Okt 2026). Berkas disimpan di basis data dan HANYA disajikan lewat endpoint
// berotorisasi di sini — tidak lewat folder /uploads yang terbuka untuk umum.
import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma.js';
import { authRequired, requireRole, audit } from '../lib/auth.js';
import { wajibKoordinatorKecamatan } from '../lib/aturan.js';
import { paging, halaman } from '../lib/paginasi.js';
import { Galat, bungkus } from '../lib/galat.js';
import { notifyKabupaten } from '../lib/notify.js';

const r = Router();
r.use(authRequired, requireRole('TP_KECAMATAN', 'TIM_KABUPATEN'));

const MAKS_UKURAN = 10 * 1024 * 1024; // 10 MB

// Jenis berkas ditentukan dari ISI-nya: PDF, PNG, atau JPG
function jenisBerkas(buf) {
  if (!buf || buf.length < 8) return null;
  if (buf.slice(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  return null;
}

const unggah = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAKS_UKURAN, files: 1 } }).single('file');
const pilih = {
  id: true, kecamatanId: true, satuanId: true, nomorSurat: true, tanggalSurat: true, perihal: true,
  namaBerkas: true, mime: true, ukuran: true, diunggahOleh: true, createdAt: true,
  kecamatan: { select: { nama: true } }, satuan: { select: { nama: true, npsn: true } },
};

// Daftar surat. Kecamatan hanya melihat surat kecamatannya; kabupaten melihat semua.
r.get('/', bungkus(async (req, res) => {
  const { page, pageSize, skip, take } = paging(req, { bawaan: 25 });
  const q = (req.query.q || '').trim();
  const kecamatanId = req.user.role === 'TP_KECAMATAN' ? req.user.kecamatanId : (req.query.kecamatanId || undefined);
  const where = {
    ...(kecamatanId ? { kecamatanId } : {}),
    ...(q ? { OR: [
      { nomorSurat: { contains: q, mode: 'insensitive' } },
      { perihal: { contains: q, mode: 'insensitive' } },
      { namaBerkas: { contains: q, mode: 'insensitive' } },
      { satuan: { nama: { contains: q, mode: 'insensitive' } } },
    ] } : {}),
  };
  const [total, list] = await Promise.all([
    prisma.suratRekomendasi.count({ where }),
    prisma.suratRekomendasi.findMany({ where, select: pilih, orderBy: { createdAt: 'desc' }, skip, take }),
  ]);
  res.json(halaman(list, total, page, pageSize));
}));

// Sekolah milik kecamatan ini yang dapat dipilih sebagai tujuan surat (yang direkomendasikan)
r.get('/sekolah', wajibKoordinatorKecamatan, bungkus(async (req, res) => {
  const list = await prisma.satuanPendidikan.findMany({
    where: { kecamatanId: req.user.kecamatanId, rekomendasi: { isNot: null } },
    select: { id: true, nama: true, npsn: true, jenjang: true }, orderBy: { nama: 'asc' },
  });
  res.json(list);
}));

r.post('/', wajibKoordinatorKecamatan, (req, res, next) => {
  unggah(req, res, (err) => {
    if (err) return next(new Galat(400, err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran berkas melebihi 10 MB.' : err.message));
    next();
  });
}, bungkus(async (req, res) => {
  if (!req.file) throw new Galat(400, 'Pilih berkas surat (PDF, JPG, atau PNG) terlebih dahulu.');
  const jenis = jenisBerkas(req.file.buffer);
  if (!jenis) throw new Galat(400, 'Berkas harus berupa PDF, JPG, atau PNG yang valid.');

  const nomorSurat = String(req.body.nomorSurat || '').trim() || null;
  const perihal = String(req.body.perihal || '').trim() || 'Rekomendasi Satuan Pendidikan Peserta Seleksi Penghargaan Stratifikasi UKS/M';
  let tanggalSurat = null;
  if (req.body.tanggalSurat) {
    tanggalSurat = new Date(req.body.tanggalSurat);
    if (Number.isNaN(tanggalSurat.getTime())) throw new Galat(400, 'Tanggal surat tidak valid.');
  }
  let satuanId = String(req.body.satuanId || '').trim() || null;
  let namaSekolah = null;
  if (satuanId) {
    const s = await prisma.satuanPendidikan.findFirst({ where: { id: satuanId, kecamatanId: req.user.kecamatanId }, select: { id: true, nama: true } });
    if (!s) throw new Galat(404, 'Sekolah tidak ditemukan di kecamatan Anda.');
    namaSekolah = s.nama;
  }
  const periode = await prisma.periode.findFirst({ where: { aktif: true } });
  // nama berkas asli dibersihkan dari jalur direktori & karakter kontrol
  const namaBerkas = String(req.file.originalname || `surat.${jenis.ext}`).replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 150);

  const surat = await prisma.suratRekomendasi.create({
    data: {
      kecamatanId: req.user.kecamatanId, satuanId, periodeId: periode?.id || null, nomorSurat, tanggalSurat, perihal,
      namaBerkas, mime: jenis.mime, ukuran: req.file.size, isi: req.file.buffer, diunggahOleh: req.user.nama,
    },
    select: pilih,
  });
  await audit(req.user.nama, 'UNGGAH_SURAT_REKOMENDASI', {
    entitas: 'SuratRekomendasi', satuanId: satuanId || undefined, detail: `${nomorSurat || namaBerkas}${namaSekolah ? ` · ${namaSekolah}` : ''}`,
  });
  await notifyKabupaten({
    judul: 'Surat rekomendasi kecamatan baru',
    pesan: `${req.user.kecamatan?.nama || 'Kecamatan'} mengunggah surat rekomendasi${nomorSurat ? ` (${nomorSurat})` : ''}.`,
    tipe: 'info', link: '/surat-rekomendasi',
  });
  res.json(surat);
}));

r.delete('/:id', wajibKoordinatorKecamatan, bungkus(async (req, res) => {
  const s = await prisma.suratRekomendasi.findFirst({
    where: { id: req.params.id, kecamatanId: req.user.kecamatanId }, select: { id: true, nomorSurat: true, namaBerkas: true },
  });
  if (!s) throw new Galat(404, 'Surat tidak ditemukan.');
  await prisma.suratRekomendasi.delete({ where: { id: s.id } });
  await audit(req.user.nama, 'HAPUS_SURAT_REKOMENDASI', { entitas: 'SuratRekomendasi', detail: s.nomorSurat || s.namaBerkas });
  res.json({ ok: true });
}));

// Unduh / buka berkas — hanya kecamatan pemilik atau Tim Kabupaten
r.get('/:id/berkas', bungkus(async (req, res) => {
  const s = await prisma.suratRekomendasi.findUnique({ where: { id: req.params.id } });
  if (!s) throw new Galat(404, 'Surat tidak ditemukan.');
  if (req.user.role === 'TP_KECAMATAN' && s.kecamatanId !== req.user.kecamatanId) {
    throw new Galat(403, 'Tidak berwenang membuka surat ini.');
  }
  res.setHeader('Content-Type', s.mime);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(s.namaBerkas)}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(Buffer.from(s.isi));
}));

export default r;
