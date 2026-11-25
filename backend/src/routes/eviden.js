import { Router } from 'express';
import { UPLOAD_DIR, unggahBerkas, daftarTautan, hapusBerkasFisik } from '../lib/unggah.js';
import { prisma } from '../lib/prisma.js';
import { authRequired, requireRole, audit } from '../lib/auth.js';
import { jenjangGrup } from '../lib/scoring.js';
import { notifyKabupaten } from '../lib/notify.js';
import { salinLampiranKeEviden } from '../lib/eviden-salin.js';

const r = Router();

// Pengaturan unggah dipakai bersama dengan lampiran penilaian mandiri (lib/unggah.js)
export { ALLOWED_EXT, MAKS_BERKAS } from '../lib/unggah.js';
const uploadFile = unggahBerkas;

async function getSatuan(userId) {
  return prisma.satuanPendidikan.findUnique({ where: { userId } });
}

// Ambil eviden milik sekolah beserta semua indikator + status review (LANGKAH 7 & 9)
r.get('/mine', authRequired, requireRole('SATUAN_PENDIDIKAN'), async (req, res) => {
  const s = await getSatuan(req.user.id);
  let eviden = await prisma.eviden.findUnique({
    where: { satuanId: s.id },
    include: {
      items: {
        include: { indikator: { include: { komponen: true } }, berkas: { orderBy: { createdAt: 'asc' } } },
      },
    },
  });
  if (!eviden) {
    // hanya dibuat bila sudah direkomendasikan
    if (!['DIREKOMENDASIKAN', 'PENGISIAN_EVIDEN', 'REVIEW_EVIDEN', 'EVIDEN_DISETUJUI', 'BERSERTIFIKAT', 'SELEKSI_ADMINISTRASI', 'KUNJUNGAN_LAPANGAN', 'FINAL'].includes(s.tahap)) {
      return res.status(403).json({ error: 'Satuan belum direkomendasikan untuk pengisian eviden' });
    }
    eviden = await prisma.eviden.create({ data: { satuanId: s.id }, include: { items: true } });
  }
  // Bukti yang sudah dipilih pada penilaian mandiri langsung ditampilkan di sini
  const { disalin } = await salinLampiranKeEviden(s.id, eviden.id);
  if (disalin) {
    eviden = await prisma.eviden.findUnique({
      where: { id: eviden.id },
      include: {
        items: {
          include: { indikator: { include: { komponen: true } }, berkas: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });
  }
  res.json(eviden);
});

// Simpan / update satu item eviden (deskripsi + file/url) - LANGKAH 7 & 9
r.post('/mine/item', authRequired, requireRole('SATUAN_PENDIDIKAN'), uploadFile, async (req, res) => {
  const s = await getSatuan(req.user.id);
  const eviden = await prisma.eviden.findUnique({ where: { satuanId: s.id } });
  if (!eviden) return res.status(404).json({ error: 'Eviden tidak ditemukan' });

  const { indikatorId, deskripsi } = req.body;
  // Validasi indikator ada & sesuai jenjang (cegah error FK / crash)
  const ind = indikatorId ? await prisma.indikator.findUnique({ where: { id: indikatorId } }) : null;
  if (!ind || ind.jenjang !== jenjangGrup(s.jenjang)) {
    return res.status(400).json({ error: 'Indikator tidak valid untuk jenjang sekolah ini.' });
  }
  const existing = await prisma.evidenItem.findUnique({
    where: { evidenId_indikatorId: { evidenId: eviden.id, indikatorId } },
  });

  const berkasBaru = req.files || [];
  const tautanBaru = daftarTautan(req.body);

  // Saat memperbaiki eviden, sekolah dapat meminta lampiran lama dihapus lebih
  // dulu supaya dokumen/tautan tidak tercatat dua kali (ganti, bukan tambah).
  const ganti = ['1', 'true', 'on'].includes(String(req.body.gantiLampiran || '').toLowerCase());
  if (ganti && existing && existing.statusReview !== 'DISETUJUI') {
    const lama = await prisma.evidenBerkas.findMany({ where: { itemId: existing.id } });
    await prisma.evidenBerkas.deleteMany({ where: { itemId: existing.id } });
    for (const b of lama) hapusBerkasFisik(b.filePath);
  }

  // Bila item sebelumnya berstatus REVISI, pengisian ulang mengembalikan ke BELUM_DIREVIEW
  const adaLampiranBaru = berkasBaru.length > 0 || tautanBaru.length > 0;
  const resetReview = existing && existing.statusReview === 'REVISI' && adaLampiranBaru
    ? { statusReview: 'BELUM_DIREVIEW', catatanReview: null }
    : {};

  const item = await prisma.evidenItem.upsert({
    where: { evidenId_indikatorId: { evidenId: eviden.id, indikatorId } },
    update: { deskripsi, ...resetReview },
    create: { evidenId: eviden.id, indikatorId, deskripsi },
  });

  // Lampiran ditambahkan (tidak menimpa lampiran sebelumnya)
  for (const f of berkasBaru) {
    await prisma.evidenBerkas.create({
      data: {
        itemId: item.id, jenis: 'BERKAS',
        filePath: f.filename, fileName: f.originalname,
        ukuran: f.size, mime: f.mimetype, diunggahOleh: req.user.nama,
      },
    });
  }
  for (const u of tautanBaru) {
    await prisma.evidenBerkas.create({
      data: { itemId: item.id, jenis: 'TAUTAN', fileUrl: u, fileName: u, diunggahOleh: req.user.nama },
    });
  }

  // Ruas lama tetap diisi lampiran terbaru agar tampilan lama tetap berfungsi
  const terakhir = await prisma.evidenBerkas.findFirst({ where: { itemId: item.id }, orderBy: { createdAt: 'desc' } });
  await prisma.evidenItem.update({
    where: { id: item.id },
    data: terakhir
      ? { filePath: terakhir.filePath, fileName: terakhir.fileName, fileUrl: terakhir.fileUrl }
      : { filePath: null, fileName: null, fileUrl: null },
  });

  const hasil = await prisma.evidenItem.findUnique({
    where: { id: item.id }, include: { berkas: { orderBy: { createdAt: 'asc' } } },
  });
  res.json(hasil);
});

// Hapus satu lampiran eviden milik sekolah sendiri
r.delete('/mine/berkas/:id', authRequired, requireRole('SATUAN_PENDIDIKAN'), async (req, res) => {
  const s = await getSatuan(req.user.id);
  const berkas = await prisma.evidenBerkas.findUnique({
    where: { id: req.params.id }, include: { item: { include: { eviden: true } } },
  });
  if (!berkas || berkas.item.eviden.satuanId !== s.id) {
    return res.status(404).json({ error: 'Lampiran tidak ditemukan' });
  }
  if (berkas.item.statusReview === 'DISETUJUI') {
    return res.status(400).json({ error: 'Indikator sudah disetujui, lampiran tidak dapat dihapus.' });
  }
  await prisma.evidenBerkas.delete({ where: { id: berkas.id } });
  hapusBerkasFisik(berkas.filePath);
  const terakhir = await prisma.evidenBerkas.findFirst({ where: { itemId: berkas.itemId }, orderBy: { createdAt: 'desc' } });
  await prisma.evidenItem.update({
    where: { id: berkas.itemId },
    data: terakhir
      ? { filePath: terakhir.filePath, fileName: terakhir.fileName, fileUrl: terakhir.fileUrl }
      : { filePath: null, fileName: null, fileUrl: null },
  });
  res.json({ ok: true });
});

// AJUKAN eviden untuk direview kabupaten (LANGKAH 7) / ajukan ulang setelah revisi (LANGKAH 9)
r.post('/mine/submit', authRequired, requireRole('SATUAN_PENDIDIKAN'), async (req, res) => {
  const s = await getSatuan(req.user.id);
  const eviden = await prisma.eviden.findUnique({
    where: { satuanId: s.id }, include: { items: { include: { berkas: true } } },
  });
  if (!eviden) return res.status(404).json({ error: 'Eviden tidak ditemukan' });

  const totalIndikator = await prisma.indikator.count({ where: { jenjang: jenjangGrup(s.jenjang) } });
  const terisi = eviden.items.filter((i) => i.berkas.length > 0 || (i.deskripsi && i.deskripsi.trim()));
  if (terisi.length < totalIndikator) {
    return res.status(400).json({ error: `Lengkapi eviden semua indikator (${terisi.length}/${totalIndikator})` });
  }
  const adaRevisi = eviden.items.some((i) => i.statusReview === 'REVISI');
  if (adaRevisi) return res.status(400).json({ error: 'Masih ada indikator berstatus REVISI yang belum diperbaiki' });

  await prisma.eviden.update({
    where: { id: eviden.id },
    data: { status: 'DIAJUKAN', submittedAt: new Date() },
  });
  await prisma.satuanPendidikan.update({ where: { id: s.id }, data: { tahap: 'REVIEW_EVIDEN' } });
  await audit(req.user.nama, 'SUBMIT_EVIDEN', { satuanId: s.id, entitas: 'Eviden' });
  await notifyKabupaten({ judul: 'Eviden menunggu review', pesan: `${s.nama} mengajukan eviden stratifikasi untuk direview.`, tipe: 'info', link: '/review', satuanId: s.id });
  res.json({ ok: true });
});

export default r;
