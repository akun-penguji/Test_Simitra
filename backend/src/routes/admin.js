import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { jenjangDariBentuk } from '../lib/scoring.js';
import { authRequired, requireAdmin, audit } from '../lib/auth.js';
import { paging, halaman } from '../lib/paginasi.js';
import { tglWIB } from '../lib/jadwal.js';
import { kunciNama } from '../lib/juara.js';

const r = Router();
// Seluruh master data & pengaturan khusus Admin/Koordinator Kabupaten
r.use(authRequired, requireAdmin);

// ============================================================
// MASTER DATA SEKOLAH (per jenjang) — admin
// ============================================================
r.get('/sekolah', async (req, res) => {
  const { jenjang, kecamatanId, q } = req.query;
  const where = {
    ...(jenjang ? { jenjang } : {}),
    ...(kecamatanId ? { kecamatanId } : {}),
    ...(q ? { OR: [{ nama: { contains: q, mode: 'insensitive' } }, { npsn: { contains: q } }] } : {}),
  };
  const { page, pageSize, skip, take } = paging(req, { bawaan: 25 });
  const [total, list, perJenjang] = await Promise.all([
    prisma.satuanPendidikan.count({ where }),
    prisma.satuanPendidikan.findMany({
      where,
      orderBy: [{ jenjang: 'asc' }, { nama: 'asc' }],
      include: {
        kecamatan: { select: { nama: true } },
        puskesmas: { select: { nama: true } },
        user: { select: { username: true, aktif: true } },
        penilaian: { orderBy: { createdAt: 'desc' }, take: 1, select: { strataVerifikasi: true, strataMandiri: true } },
      },
      skip, take,
    }),
    prisma.satuanPendidikan.groupBy({ by: ['jenjang'], _count: true }),
  ]);
  res.json({
    ...halaman(list.map((s) => ({
      id: s.id, nama: s.nama, npsn: s.npsn, jenjang: s.jenjang, tahap: s.tahap,
      kecamatan: s.kecamatan?.nama, kecamatanId: s.kecamatanId, puskesmas: s.puskesmas?.nama, puskesmasId: s.puskesmasId,
      kepalaSekolah: s.kepalaSekolah, username: s.user?.username, aktif: s.user?.aktif,
      strata: s.penilaian[0]?.strataVerifikasi || s.penilaian[0]?.strataMandiri || null,
    })), total, page, pageSize),
    perJenjang: Object.fromEntries(perJenjang.map((g) => [g.jenjang, g._count])),
  });
});

r.post('/sekolah', async (req, res) => {
  const { nama, npsn, jenjang, kecamatanId, puskesmasId, kepalaSekolah, username, password } = req.body;
  if (!nama || !jenjang || !kecamatanId || !username || !password) return res.status(400).json({ error: 'Nama, jenjang, kecamatan, username & password wajib diisi' });
  const exist = await prisma.user.findUnique({ where: { username } });
  if (exist) return res.status(409).json({ error: 'Username sudah digunakan' });
  if (npsn) {
    const npsnExist = await prisma.satuanPendidikan.findUnique({ where: { npsn } });
    if (npsnExist) return res.status(409).json({ error: 'NPSN sudah terdaftar' });
  }
  const user = await prisma.user.create({
    data: {
      username, password: bcrypt.hashSync(password, 10), nama: `Operator ${nama}`, role: 'SATUAN_PENDIDIKAN',
      satuanPendidikan: {
        create: {
          nama, npsn: npsn || null, jenjang, kecamatanId, puskesmasId: puskesmasId || null,
          kepalaSekolah: kepalaSekolah || null, tahap: 'REGISTRASI',
          profilLengkap: Boolean(nama && npsn && jenjang && kecamatanId && kepalaSekolah),
        },
      },
    },
    include: { satuanPendidikan: true },
  });
  await audit(req.user.nama, 'BUAT_SEKOLAH', { satuanId: user.satuanPendidikan.id, entitas: 'SatuanPendidikan', detail: `${nama} (${username})` });
  res.json({ id: user.satuanPendidikan.id });
});

r.put('/sekolah/:id', async (req, res) => {
  const { nama, npsn, jenjang, kecamatanId, puskesmasId, kepalaSekolah, aktif, password } = req.body;
  const s = await prisma.satuanPendidikan.findUnique({ where: { id: req.params.id } });
  if (!s) return res.status(404).json({ error: 'Sekolah tidak ditemukan' });
  await prisma.satuanPendidikan.update({
    where: { id: s.id },
    data: {
      nama: nama ?? s.nama, npsn: npsn !== undefined ? (npsn || null) : s.npsn, jenjang: jenjang ?? s.jenjang,
      kecamatanId: kecamatanId ?? s.kecamatanId, puskesmasId: puskesmasId !== undefined ? (puskesmasId || null) : s.puskesmasId,
      kepalaSekolah: kepalaSekolah ?? s.kepalaSekolah,
    },
  });
  const userData = {};
  if (aktif != null) userData.aktif = !!aktif;
  if (password) userData.password = bcrypt.hashSync(password, 10);
  if (Object.keys(userData).length) await prisma.user.update({ where: { id: s.userId }, data: userData });
  await audit(req.user.nama, 'UBAH_SEKOLAH', { satuanId: s.id, entitas: 'SatuanPendidikan', detail: s.nama });
  res.json({ ok: true });
});

r.delete('/sekolah/:id', async (req, res) => {
  const s = await prisma.satuanPendidikan.findUnique({ where: { id: req.params.id } });
  if (!s) return res.status(404).json({ error: 'Sekolah tidak ditemukan' });
  await prisma.user.update({ where: { id: s.userId }, data: { aktif: false } });
  await audit(req.user.nama, 'NONAKTIF_SEKOLAH', { satuanId: s.id, entitas: 'SatuanPendidikan', detail: s.nama });
  res.json({ ok: true });
});

// Referensi sekolah Dapodik (direktori) — untuk validasi/pencarian
r.get('/referensi', async (req, res) => {
  const { bp, kecamatanId, q, sumber } = req.query;
  const where = {
    ...(bp ? { bp } : {}),
    ...(kecamatanId ? { kecamatanId } : {}),
    ...(sumber ? { sumber } : {}),
    // NSM ikut dicari agar madrasah dapat ditemukan lewat nomor statistiknya
    ...(q ? {
      OR: [
        { nama: { contains: q, mode: 'insensitive' } },
        { npsn: { contains: q } },
        { nsm: { contains: q } },
      ],
    } : {}),
  };
  const { page, pageSize, skip, take } = paging(req, { bawaan: 25 });
  // Hitungan per bentuk mengikuti saringan selain `bp` sendiri, supaya angka
  // pada tombol bentuk tetap benar saat kecamatan/sumber sedang disaring.
  const whereTanpaBp = { ...where };
  delete whereTanpaBp.bp;
  const [data, perBp, perSumber, total, terdaftar] = await Promise.all([
    prisma.sekolahReferensi.findMany({
      where, orderBy: [{ nama: 'asc' }], skip, take,
      include: { kecamatan: { select: { nama: true } } },
    }),
    prisma.sekolahReferensi.groupBy({ by: ['bp'], _count: true, where: whereTanpaBp }),
    prisma.sekolahReferensi.groupBy({ by: ['sumber'], _count: true }),
    prisma.sekolahReferensi.count({ where }),
    prisma.satuanPendidikan.findMany({ where: { npsn: { not: null } }, select: { npsn: true } }),
  ]);
  const registered = new Set(terdaftar.map((x) => x.npsn));
  res.json({
    ...halaman(
      // `jenjang` = bentuk Dapodik yang sudah dipetakan ke instrumen aplikasi
      // (KB/TPA/SPS → TK, SPK SD → SD, dst). PKBM/SKB tidak punya instrumen → null.
      data.map((s) => ({
        id: s.id, npsn: s.npsn, nsm: s.nsm, nama: s.nama, bp: s.bp, jenjang: jenjangDariBentuk(s.bp),
        status: s.status, alamat: s.alamat, sumber: s.sumber,
        kecamatan: s.kecamatan?.nama, kecamatanId: s.kecamatanId,
        jmlSiswa: s.jmlSiswa, rombel: s.rombel, terdaftar: registered.has(s.npsn),
      })),
      total, page, pageSize),
    perBp: Object.fromEntries(perBp.map((g) => [g.bp || '-', g._count])),
    perSumber: Object.fromEntries(perSumber.map((g) => [g.sumber || 'LAINNYA', g._count])),
  });
});

// ============================================================
// PERIODE (master)
// ============================================================
r.get('/periode', async (req, res) => {
  const list = await prisma.periode.findMany({
    orderBy: [{ tahun: 'desc' }, { createdAt: 'desc' }],
    include: { _count: { select: { penilaian: true, sertifikat: true, hasilFinal: true, jadwal: true } } },
  });
  res.json(list);
});

r.post('/periode', async (req, res) => {
  const { nama, tahun, keterangan, mulai, selesai, aktif } = req.body;
  if (!nama || !tahun) return res.status(400).json({ error: 'Nama & tahun wajib diisi' });
  const exist = await prisma.periode.findUnique({ where: { nama } });
  if (exist) return res.status(409).json({ error: 'Nama periode sudah ada' });
  if (aktif) await prisma.periode.updateMany({ data: { aktif: false } });
  const p = await prisma.periode.create({
    data: { nama, tahun: Number(tahun), keterangan, aktif: !!aktif,
      mulai: tglWIB(mulai), selesai: tglWIB(selesai, true) },
  });
  await audit(req.user.nama, 'BUAT_PERIODE', { entitas: 'Periode', detail: nama });
  res.json(p);
});

r.put('/periode/:id', async (req, res) => {
  const { nama, tahun, keterangan, mulai, selesai } = req.body;
  const p = await prisma.periode.findUnique({ where: { id: req.params.id } });
  if (!p) return res.status(404).json({ error: 'Periode tidak ditemukan' });
  const updated = await prisma.periode.update({
    where: { id: p.id },
    data: { nama: nama ?? p.nama, tahun: tahun != null ? Number(tahun) : p.tahun, keterangan: keterangan ?? p.keterangan,
      mulai: mulai !== undefined ? tglWIB(mulai) : p.mulai,
      selesai: selesai !== undefined ? tglWIB(selesai, true) : p.selesai },
  });
  res.json(updated);
});

// Jadwal tahapan program per periode (notulen Sep 2026) — disimpan sekaligus
r.get('/periode/:id/jadwal', async (req, res) => {
  res.json(await prisma.jadwalTahap.findMany({ where: { periodeId: req.params.id }, orderBy: [{ urutan: 'asc' }, { mulai: 'asc' }] }));
});

r.put('/periode/:id/jadwal', async (req, res) => {
  const p = await prisma.periode.findUnique({ where: { id: req.params.id } });
  if (!p) return res.status(404).json({ error: 'Periode tidak ditemukan' });
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const data = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const nama = String(it.nama || '').trim();
    if (!nama) return res.status(400).json({ error: `Baris ${i + 1}: nama tahapan wajib diisi` });
    const mulai = tglWIB(it.mulai); const selesai = tglWIB(it.selesai, true);
    if (!mulai || !selesai) return res.status(400).json({ error: `"${nama}": tanggal mulai & selesai wajib diisi` });
    if (selesai < mulai) return res.status(400).json({ error: `"${nama}": tanggal selesai mendahului tanggal mulai` });
    data.push({ periodeId: p.id, nama, keterangan: String(it.keterangan || '').trim() || null, pelaksana: it.pelaksana || null, mulai, selesai, urutan: i });
  }
  await prisma.$transaction([
    prisma.jadwalTahap.deleteMany({ where: { periodeId: p.id } }),
    ...(data.length ? [prisma.jadwalTahap.createMany({ data })] : []),
  ]);
  await audit(req.user.nama, 'ATUR_JADWAL', { entitas: 'Periode', detail: `${p.nama}: ${data.length} tahapan` });
  res.json(await prisma.jadwalTahap.findMany({ where: { periodeId: p.id }, orderBy: { urutan: 'asc' } }));
});

r.post('/periode/:id/aktifkan', async (req, res) => {
  const p = await prisma.periode.findUnique({ where: { id: req.params.id } });
  if (!p) return res.status(404).json({ error: 'Periode tidak ditemukan' });
  await prisma.periode.updateMany({ data: { aktif: false } });
  await prisma.periode.update({ where: { id: p.id }, data: { aktif: true } });
  await audit(req.user.nama, 'AKTIFKAN_PERIODE', { entitas: 'Periode', detail: p.nama });
  res.json({ ok: true });
});

r.delete('/periode/:id', async (req, res) => {
  const p = await prisma.periode.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { penilaian: true } } },
  });
  if (!p) return res.status(404).json({ error: 'Periode tidak ditemukan' });
  if (p.aktif) return res.status(400).json({ error: 'Tidak dapat menghapus periode aktif' });
  if (p._count.penilaian > 0) return res.status(400).json({ error: 'Periode sudah memiliki data penilaian, tidak dapat dihapus' });
  await prisma.periode.delete({ where: { id: p.id } });
  res.json({ ok: true });
});

// ============================================================
// DAFTAR PERAIH PENGHARGAAN (dasar larangan penilaian mandiri)
// ============================================================
const bentukPeraih = (p) => ({
  id: p.id, nama: p.nama, namaKunci: p.namaKunci, jenjang: p.jenjang, tahun: p.tahun, peringkat: p.peringkat,
  kecamatanId: p.kecamatanId, kecamatan: p.kecamatan?.nama || null,
  berlakuLarangan: p.berlakuLarangan, catatan: p.catatan, sumber: p.sumber, strataAkhir: p.strataAkhir || null,
  satuanId: p.satuanId, satuan: p.satuan ? { id: p.satuan.id, nama: p.satuan.nama, kecamatan: p.satuan.kecamatan?.nama } : null,
});
const sertakanPeraih = { kecamatan: { select: { nama: true } }, satuan: { select: { id: true, nama: true, kecamatan: { select: { nama: true } } } } };

r.get('/peraih', async (req, res) => {
  const { tahun, jenjang, q, tertaut } = req.query;
  const where = {
    ...(tahun ? { tahun: Number(tahun) } : {}),
    ...(jenjang ? { jenjang } : {}),
    ...(q ? { nama: { contains: q, mode: 'insensitive' } } : {}),
    ...(tertaut === '1' ? { satuanId: { not: null } } : tertaut === '0' ? { satuanId: null } : {}),
  };
  const { page, pageSize, skip, take } = paging(req, { bawaan: 25 });
  const [total, list, semua, perTahun] = await Promise.all([
    prisma.peraihPenghargaan.count({ where }),
    prisma.peraihPenghargaan.findMany({ where, include: sertakanPeraih, orderBy: [{ tahun: 'desc' }, { jenjang: 'asc' }, { peringkat: 'asc' }], skip, take }),
    prisma.peraihPenghargaan.count(),
    prisma.peraihPenghargaan.groupBy({ by: ['tahun'], _count: true, orderBy: { tahun: 'desc' } }),
  ]);
  const tertautJml = await prisma.peraihPenghargaan.count({ where: { satuanId: { not: null } } });
  const dikecualikan = await prisma.peraihPenghargaan.count({ where: { berlakuLarangan: false } });
  res.json({
    ...halaman(list.map(bentukPeraih), total, page, pageSize),
    ringkas: { semua, tertaut: tertautJml, belumTerdaftar: semua - tertautJml, dikecualikan },
    tahun: perTahun.map((t) => ({ tahun: t.tahun, jumlah: t._count })),
  });
});

// Strata akhir peraih dipilih manual oleh Admin Kabupaten ('' / null = belum ditetapkan)
const STRATA_PERAIH = ['DASAR', 'MADYA', 'UTAMA', 'PARIPURNA'];
function strataDariBody(v) {
  if (v === undefined) return undefined;
  if (v === '' || v === null) return null;
  return STRATA_PERAIH.includes(v) ? v : false;
}

r.post('/peraih', async (req, res) => {
  const { nama, jenjang, tahun, peringkat, kecamatanId, catatan } = req.body;
  const strataAkhir = strataDariBody(req.body.strataAkhir);
  if (strataAkhir === false) return res.status(400).json({ error: 'Strata akhir tidak valid' });
  if (!nama || !jenjang || !tahun || !peringkat) return res.status(400).json({ error: 'Nama, jenjang, tahun, dan peringkat wajib diisi' });
  if (![1, 2, 3].includes(Number(peringkat))) return res.status(400).json({ error: 'Peringkat harus 1, 2, atau 3' });
  const p = await prisma.peraihPenghargaan.create({
    data: {
      nama: String(nama).trim(), namaKunci: kunciNama(nama), jenjang, tahun: Number(tahun), peringkat: Number(peringkat),
      kecamatanId: kecamatanId || null, catatan: catatan || null, sumber: `Ditambahkan manual oleh ${req.user.nama}`,
      strataAkhir: strataAkhir ?? null,
    },
    include: sertakanPeraih,
  });
  await audit(req.user.nama, 'TAMBAH_PERAIH', { entitas: 'PeraihPenghargaan', detail: `${nama} (P${peringkat} ${tahun})` });
  res.json(bentukPeraih(p));
});

r.put('/peraih/:id', async (req, res) => {
  const lama = await prisma.peraihPenghargaan.findUnique({ where: { id: req.params.id } });
  if (!lama) return res.status(404).json({ error: 'Data peraih tidak ditemukan' });
  const { nama, jenjang, tahun, peringkat, kecamatanId, berlakuLarangan, catatan, satuanId } = req.body;
  const strataAkhir = strataDariBody(req.body.strataAkhir);
  if (strataAkhir === false) return res.status(400).json({ error: 'Strata akhir tidak valid' });
  if (satuanId) {
    const s = await prisma.satuanPendidikan.findUnique({ where: { id: satuanId } });
    if (!s) return res.status(400).json({ error: 'Satuan pendidikan tidak ditemukan' });
  }
  const p = await prisma.peraihPenghargaan.update({
    where: { id: lama.id },
    data: {
      nama: nama ?? lama.nama,
      namaKunci: nama ? kunciNama(nama) : lama.namaKunci,
      jenjang: jenjang ?? lama.jenjang,
      tahun: tahun != null ? Number(tahun) : lama.tahun,
      peringkat: peringkat != null ? Number(peringkat) : lama.peringkat,
      kecamatanId: kecamatanId !== undefined ? (kecamatanId || null) : lama.kecamatanId,
      berlakuLarangan: berlakuLarangan != null ? !!berlakuLarangan : lama.berlakuLarangan,
      catatan: catatan !== undefined ? (catatan || null) : lama.catatan,
      strataAkhir: strataAkhir !== undefined ? strataAkhir : lama.strataAkhir,
      satuanId: satuanId !== undefined ? (satuanId || null) : lama.satuanId,
    },
    include: sertakanPeraih,
  });
  await audit(req.user.nama, 'UBAH_PERAIH', { entitas: 'PeraihPenghargaan', detail: `${p.nama}${berlakuLarangan === false ? ' — larangan dicabut' : ''}${strataAkhir !== undefined && strataAkhir !== lama.strataAkhir ? ` — strata akhir: ${lama.strataAkhir || '-'}→${strataAkhir || '-'}` : ''}` });
  res.json(bentukPeraih(p));
});

r.delete('/peraih/:id', async (req, res) => {
  const p = await prisma.peraihPenghargaan.findUnique({ where: { id: req.params.id } });
  if (!p) return res.status(404).json({ error: 'Data peraih tidak ditemukan' });
  await prisma.peraihPenghargaan.delete({ where: { id: p.id } });
  await audit(req.user.nama, 'HAPUS_PERAIH', { entitas: 'PeraihPenghargaan', detail: p.nama });
  res.json({ ok: true });
});

// Pencarian sekolah terdaftar untuk penautan manual
r.get('/peraih-sekolah', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const list = await prisma.satuanPendidikan.findMany({
    where: { nama: { contains: q, mode: 'insensitive' } },
    select: { id: true, nama: true, jenjang: true, kecamatan: { select: { nama: true } } },
    orderBy: { nama: 'asc' }, take: 15,
  });
  res.json(list.map((s) => ({ id: s.id, nama: s.nama, jenjang: s.jenjang, kecamatan: s.kecamatan?.nama })));
});

// ============================================================
// INSTRUMEN — KOMPONEN (master)
// ============================================================
r.get('/komponen', async (req, res) => {
  const list = await prisma.komponen.findMany({
    orderBy: { urutan: 'asc' },
    include: { _count: { select: { indikator: true } } },
  });
  res.json(list);
});

r.post('/komponen', async (req, res) => {
  const { kode, nama, urutan } = req.body;
  if (!kode || !nama) return res.status(400).json({ error: 'Kode & nama wajib diisi' });
  const exist = await prisma.komponen.findUnique({ where: { kode } });
  if (exist) return res.status(409).json({ error: 'Kode komponen sudah ada' });
  const k = await prisma.komponen.create({ data: { kode, nama, urutan: Number(urutan) || 0 } });
  await audit(req.user.nama, 'BUAT_KOMPONEN', { entitas: 'Komponen', detail: `${kode} ${nama}` });
  res.json(k);
});

r.put('/komponen/:id', async (req, res) => {
  const { nama, urutan } = req.body;
  const k = await prisma.komponen.findUnique({ where: { id: req.params.id } });
  if (!k) return res.status(404).json({ error: 'Komponen tidak ditemukan' });
  const updated = await prisma.komponen.update({
    where: { id: k.id }, data: { nama: nama ?? k.nama, urutan: urutan != null ? Number(urutan) : k.urutan },
  });
  res.json(updated);
});

r.delete('/komponen/:id', async (req, res) => {
  const k = await prisma.komponen.findUnique({
    where: { id: req.params.id }, include: { _count: { select: { indikator: true } } },
  });
  if (!k) return res.status(404).json({ error: 'Komponen tidak ditemukan' });
  if (k._count.indikator > 0) return res.status(400).json({ error: 'Komponen masih memiliki indikator, hapus indikatornya dahulu' });
  await prisma.komponen.delete({ where: { id: k.id } });
  res.json({ ok: true });
});

// ============================================================
// INSTRUMEN — INDIKATOR (master)
// ============================================================
r.get('/indikator', async (req, res) => {
  const where = {};
  if (req.query.jenjang) where.jenjang = req.query.jenjang;
  const list = await prisma.indikator.findMany({
    where,
    orderBy: [{ komponen: { urutan: 'asc' } }, { strata: 'asc' }, { urutan: 'asc' }],
    include: { komponen: true, _count: { select: { jawabanPenilaian: true } } },
  });
  res.json(list);
});

r.post('/indikator', async (req, res) => {
  const { komponenId, jenjang, pertanyaan, urutan, bentukEviden } = req.body;
  const strata = req.body.strata || req.body.level; // "level" diterima demi kompatibilitas lama
  if (!komponenId || !jenjang || !strata || !pertanyaan) return res.status(400).json({ error: 'Data indikator tidak lengkap' });
  const komp = await prisma.komponen.findUnique({ where: { id: komponenId } });
  if (!komp) return res.status(400).json({ error: 'Komponen tidak valid' });
  // kode otomatis unik: JENJANG-KODEKOMP-nomor
  const count = await prisma.indikator.count({ where: { jenjang, komponenId } });
  let kode = `${jenjang}-${komp.kode}-${count + 1}`;
  while (await prisma.indikator.findUnique({ where: { kode } })) kode = `${jenjang}-${komp.kode}-${Math.floor(Math.random() * 100000)}`;
  const ind = await prisma.indikator.create({
    data: { komponenId, jenjang, strata, pertanyaan, bentukEviden: bentukEviden || null, kode, urutan: Number(urutan) || count },
  });
  await audit(req.user.nama, 'BUAT_INDIKATOR', { entitas: 'Indikator', detail: kode });
  res.json(ind);
});

r.put('/indikator/:id', async (req, res) => {
  const { komponenId, jenjang, pertanyaan, urutan, bentukEviden } = req.body;
  const strata = req.body.strata || req.body.level;
  const ind = await prisma.indikator.findUnique({ where: { id: req.params.id } });
  if (!ind) return res.status(404).json({ error: 'Indikator tidak ditemukan' });
  const updated = await prisma.indikator.update({
    where: { id: ind.id },
    data: {
      komponenId: komponenId ?? ind.komponenId, jenjang: jenjang ?? ind.jenjang,
      strata: strata ?? ind.strata, pertanyaan: pertanyaan ?? ind.pertanyaan,
      bentukEviden: bentukEviden !== undefined ? (bentukEviden || null) : ind.bentukEviden,
      urutan: urutan != null ? Number(urutan) : ind.urutan,
    },
  });
  await audit(req.user.nama, 'UBAH_INDIKATOR', { entitas: 'Indikator', detail: ind.kode });
  res.json(updated);
});

r.delete('/indikator/:id', async (req, res) => {
  const ind = await prisma.indikator.findUnique({
    where: { id: req.params.id }, include: { _count: { select: { jawabanPenilaian: true } } },
  });
  if (!ind) return res.status(404).json({ error: 'Indikator tidak ditemukan' });
  if (ind._count.jawabanPenilaian > 0) return res.status(400).json({ error: 'Indikator sudah dipakai pada penilaian, tidak dapat dihapus' });
  await prisma.evidenItem.deleteMany({ where: { indikatorId: ind.id } });
  await prisma.indikator.delete({ where: { id: ind.id } });
  await audit(req.user.nama, 'HAPUS_INDIKATOR', { entitas: 'Indikator', detail: ind.kode });
  res.json({ ok: true });
});

export default r;
