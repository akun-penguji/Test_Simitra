import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../lib/auth.js';
import { jenjangGrup } from '../lib/scoring.js';
import { jadwalProgram } from '../lib/jadwal.js';

const r = Router();

// Publik: daftar kecamatan (untuk form registrasi)
r.get('/kecamatan', async (req, res) => {
  const list = await prisma.kecamatan.findMany({ orderBy: { nama: 'asc' } });
  res.json(list);
});

// Periode aktif (untuk ditampilkan di semua role)
r.get('/periode/aktif', authRequired, async (req, res) => {
  const p = await prisma.periode.findFirst({ where: { aktif: true } });
  res.json(p);
});

// Publik: jadwal program periode aktif + tahap yang sedang berjalan.
// Ditampilkan di halaman login dan di atas setiap halaman aplikasi.
r.get('/jadwal-program', async (req, res) => {
  res.json(await jadwalProgram());
});

// Daftar periode (untuk filter laporan)
r.get('/periode', authRequired, async (req, res) => {
  const list = await prisma.periode.findMany({ orderBy: [{ tahun: 'desc' }, { createdAt: 'desc' }] });
  res.json(list);
});

// Publik: daftar puskesmas (opsional filter kecamatanId)
r.get('/puskesmas', async (req, res) => {
  const where = {};
  if (req.query.kecamatanId) where.kecamatanId = req.query.kecamatanId;
  const list = await prisma.puskesmas.findMany({ where, orderBy: { nama: 'asc' } });
  res.json(list);
});

// Instrumen (komponen + indikator) untuk jenjang tertentu.
// jenjang diambil dari query, atau dari satuan pendidikan milik user login.
r.get('/instrumen', authRequired, async (req, res) => {
  let grup = req.query.jenjang ? jenjangGrup(req.query.jenjang) : null;
  if (!grup && req.user.satuanPendidikan) grup = jenjangGrup(req.user.satuanPendidikan.jenjang);
  if (!grup) grup = 'SD';

  const komponen = await prisma.komponen.findMany({
    orderBy: { urutan: 'asc' },
    include: {
      indikator: {
        where: { jenjang: grup },
        orderBy: [{ strata: 'asc' }, { urutan: 'asc' }],
      },
    },
  });
  res.json({ jenjang: grup, komponen });
});

// Catatan: endpoint /audit lama dihapus (potensi kebocoran & tak terenkripsi).
// Gunakan /api/kabupaten/audit (khusus admin, terdekripsi) & /api/riwayat (timeline per peran).

export default r;
