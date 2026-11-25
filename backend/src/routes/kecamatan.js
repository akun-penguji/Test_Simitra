import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { authRequired, requireRole, audit } from '../lib/auth.js';
import { hitungStratifikasi, jenjangGrup, JENJANG_GRUP, LABEL_GRUP } from '../lib/scoring.js';

// Kuota rekomendasi per tingkat satuan pendidikan di setiap kecamatan
const KUOTA_TINGKAT = 2;
import { notify, notifySatuan } from '../lib/notify.js';
import {
  adaPernyataan, PESAN_PERNYATAAN, komponenBerwenang, ringkasKlasifikasi,
  wajibKoordinatorKecamatan, simpanKlasifikasi, cekLaranganJuara,
} from '../lib/aturan.js';

// Sekolah yang pernah menjadi peraih (database sekolah peraih penghargaan / hasil final
// periode lalu) tidak boleh direkomendasikan kecamatan (rapat final Okt 2026).
function pesanLaranganRekomendasi(l) {
  return `Satuan pendidikan ini tercatat sebagai peraih Peringkat ${l.peringkat} Penghargaan Stratifikasi UKS/M tahun ${l.tahun} `
    + 'pada database sekolah peraih penghargaan, sehingga tidak dapat direkomendasikan.';
}
import { diagramStrata } from '../lib/diagram.js';
import { petaPuskesmas, ubahLokasiPuskesmas } from '../lib/puskesmas.js';
import { salinLampiranKeEviden } from '../lib/eviden-salin.js';
import { paging, halaman, mintaSemua } from '../lib/paginasi.js';

const r = Router();
r.use(authRequired, requireRole('TP_KECAMATAN'));

// Klasifikasi akun yang login: koordinator (seluruh komponen) atau penilai komponen tertentu
r.get('/klasifikasi-saya', async (req, res) => {
  res.json(await ringkasKlasifikasi(req.user));
});

// Komponen yang belum dinilai penilai → dicatat diverifikasi oleh `user` (koordinator)
async function lengkapiVerifikasiKomponen(penilaianId, komponenIds, user, keterangan) {
  const ada = await prisma.verifikasiKomponen.findMany({ where: { penilaianId }, select: { komponenId: true } });
  const sudah = new Set(ada.map((a) => a.komponenId));
  const baru = [...komponenIds].filter((k) => !sudah.has(k)).map((komponenId) => ({
    penilaianId, komponenId, userId: user.id, namaPenilai: user.nama, catatan: keterangan, pernyataanFakta: true,
  }));
  if (baru.length) await prisma.verifikasiKomponen.createMany({ data: baru, skipDuplicates: true });
}

// Daftar satuan pendidikan di kecamatan ini (LANGKAH 4 antrian verifikasi + monitoring)
r.get('/satuan', async (req, res) => {
  const { q, status, layak } = req.query;
  const where = {
    kecamatanId: req.user.kecamatanId,
    ...(q ? { OR: [{ nama: { contains: q, mode: 'insensitive' } }, { npsn: { contains: q } }] } : {}),
    ...(status ? { penilaian: { some: { status: { in: String(status).split(',').filter(Boolean) } } } } : {}),
    // kandidat rekomendasi: sudah diverifikasi, strata minimal Madya, belum direkomendasikan
    ...(layak === '1' ? {
      penilaian: { some: { status: 'DIVERIFIKASI', strataVerifikasi: { in: ['MADYA', 'UTAMA', 'PARIPURNA'] } } },
      rekomendasi: { is: null },
    } : {}),
  };
  const sertakan = {
    penilaian: { orderBy: { createdAt: 'desc' }, take: 1, include: { _count: { select: { verifikasiKomponen: true } } } },
    rekomendasi: true,
  };
  // Dasbor kecamatan memerlukan seluruh baris untuk menghitung rekapitulasi
  if (mintaSemua(req)) {
    return res.json(await prisma.satuanPendidikan.findMany({ where, orderBy: { nama: 'asc' }, include: sertakan }));
  }
  const { page, pageSize, skip, take } = paging(req, { bawaan: 25 });
  const [total, list] = await Promise.all([
    prisma.satuanPendidikan.count({ where }),
    prisma.satuanPendidikan.findMany({ where, orderBy: { nama: 'asc' }, include: sertakan, skip, take }),
  ]);
  // Kandidat rekomendasi: tandai sekolah peraih penghargaan agar tidak dapat dipilih
  if (layak === '1') {
    const periodeAktif = await prisma.periode.findFirst({ where: { aktif: true } });
    for (const s of list) {
      const l = await cekLaranganJuara(s.id, periodeAktif?.id);
      s.larangan = l ? { peringkat: l.peringkat, tahun: l.tahun, alasan: pesanLaranganRekomendasi(l) } : null;
    }
  }
  res.json(halaman(list, total, page, pageSize));
});

// Peta sebaran sekolah di kecamatan ini
r.get('/peta', async (req, res) => {
  const list = await prisma.satuanPendidikan.findMany({
    where: { kecamatanId: req.user.kecamatanId, latitude: { not: null }, longitude: { not: null } },
    select: {
      id: true, nama: true, jenjang: true, latitude: true, longitude: true, tahap: true,
      puskesmas: { select: { nama: true } },
      penilaian: { orderBy: { createdAt: 'desc' }, take: 1, select: { strataVerifikasi: true, strataMandiri: true } },
    },
  });
  res.json(list.map((s) => ({
    id: s.id, nama: s.nama, jenjang: s.jenjang, lat: s.latitude, lng: s.longitude, tahap: s.tahap,
    puskesmas: s.puskesmas?.nama, strata: s.penilaian[0]?.strataVerifikasi || s.penilaian[0]?.strataMandiri || null,
  })));
});

// Detail penilaian mandiri satuan (untuk verifikasi) - LANGKAH 4
r.get('/satuan/:id/penilaian', async (req, res) => {
  const satuan = await prisma.satuanPendidikan.findFirst({
    where: { id: req.params.id, kecamatanId: req.user.kecamatanId },
  });
  if (!satuan) return res.status(404).json({ error: 'Satuan tidak ditemukan di kecamatan Anda' });
  const penilaian = await prisma.penilaian.findFirst({
    where: { satuanId: satuan.id }, orderBy: { createdAt: 'desc' },
    include: {
      jawaban: { include: { indikator: { include: { komponen: true } }, lampiran: { orderBy: { createdAt: 'asc' } } } },
      verifikasiKomponen: { include: { komponen: { select: { kode: true, nama: true } } } },
    },
  });
  res.json({ satuan, penilaian, klasifikasi: await ringkasKlasifikasi(req.user) });
});

// Penilai komponen menyimpan hasil verifikasi untuk komponen yang ditugaskan kepadanya.
// Tidak memfinalkan strata — finalisasi oleh koordinator kecamatan.
r.post('/satuan/:id/verifikasi-komponen', async (req, res) => {
  const { koreksi, catatan } = req.body;
  const satuan = await prisma.satuanPendidikan.findFirst({
    where: { id: req.params.id, kecamatanId: req.user.kecamatanId },
  });
  if (!satuan) return res.status(404).json({ error: 'Satuan tidak ditemukan di kecamatan Anda' });
  if (!adaPernyataan(req.body)) return res.status(400).json({ error: PESAN_PERNYATAAN });
  const penilaian = await prisma.penilaian.findFirst({
    where: { satuanId: satuan.id }, orderBy: { createdAt: 'desc' },
    include: { jawaban: { include: { indikator: { include: { komponen: true } } } } },
  });
  if (!penilaian || penilaian.status === 'DRAFT') return res.status(400).json({ error: 'Penilaian mandiri belum disubmit sekolah' });
  if (penilaian.status === 'DIVERIFIKASI') {
    return res.status(400).json({ error: 'Verifikasi sudah difinalkan koordinator kecamatan. Hubungi koordinator bila perlu perubahan.' });
  }
  const izin = await komponenBerwenang(req.user);
  const milik = penilaian.jawaban.filter((j) => izin === null || izin.has(j.indikator.komponenId));
  if (!milik.length) {
    return res.status(403).json({ error: 'Anda belum ditugaskan menilai komponen apa pun. Hubungi koordinator kecamatan.' });
  }
  const milikIds = new Set(milik.map((j) => j.indikatorId));
  const koreksiMap = {};
  let diabaikan = 0;
  for (const k of koreksi || []) {
    if (milikIds.has(k.indikatorId)) koreksiMap[k.indikatorId] = k; else diabaikan += 1;
  }
  for (const j of milik) {
    const k = koreksiMap[j.indikatorId];
    const nilaiVer = k && k.nilaiVerifikasi != null ? (Number(k.nilaiVerifikasi) ? 1 : 0) : (j.nilaiVerifikasi ?? j.nilaiMandiri);
    await prisma.jawabanPenilaian.update({ where: { id: j.id }, data: { nilaiVerifikasi: nilaiVer, catatan: k?.catatan ?? j.catatan } });
  }
  const kompIds = [...new Set(milik.map((j) => j.indikator.komponenId))];
  for (const komponenId of kompIds) {
    await prisma.verifikasiKomponen.upsert({
      where: { penilaianId_komponenId: { penilaianId: penilaian.id, komponenId } },
      update: { userId: req.user.id, namaPenilai: req.user.nama, catatan: catatan || null, pernyataanFakta: true, selesaiPada: new Date() },
      create: { penilaianId: penilaian.id, komponenId, userId: req.user.id, namaPenilai: req.user.nama, catatan: catatan || null, pernyataanFakta: true },
    });
  }
  const jumlahKomponen = new Set(penilaian.jawaban.map((j) => j.indikator.komponenId)).size;
  const selesai = await prisma.verifikasiKomponen.count({ where: { penilaianId: penilaian.id } });
  const kode = [...new Set(milik.map((j) => j.indikator.komponen.kode))].sort();
  await audit(req.user.nama, 'VERIFIKASI_KOMPONEN', { satuanId: satuan.id, entitas: 'Penilaian', detail: `Komponen ${kode.join(', ')} — ${selesai}/${jumlahKomponen} komponen selesai` });
  if (selesai >= jumlahKomponen) {
    const koordinator = await prisma.user.findMany({ where: { role: 'TP_KECAMATAN', kecamatanId: req.user.kecamatanId, isAdmin: true, aktif: true }, select: { id: true } });
    await Promise.all(koordinator.map((u) => notify(u.id, {
      judul: 'Seluruh komponen telah dinilai',
      pesan: `${satuan.nama}: ${jumlahKomponen} komponen selesai dinilai. Silakan finalkan verifikasi.`,
      tipe: 'info', link: '/verifikasi', satuanId: satuan.id,
    })));
  }
  res.json({ ok: true, komponen: kode, selesai, jumlahKomponen, diabaikan });
});

// VERIFIKASI & VALIDASI penilaian mandiri + scoring strata - LANGKAH 4
r.post('/satuan/:id/verifikasi', wajibKoordinatorKecamatan, async (req, res) => {
  const { koreksi, catatan } = req.body; // koreksi: [{ indikatorId, nilaiVerifikasi, catatan }]
  const satuan = await prisma.satuanPendidikan.findFirst({
    where: { id: req.params.id, kecamatanId: req.user.kecamatanId },
  });
  if (!satuan) return res.status(404).json({ error: 'Satuan tidak ditemukan' });
  if (!adaPernyataan(req.body)) return res.status(400).json({ error: PESAN_PERNYATAAN });

  const penilaian = await prisma.penilaian.findFirst({
    where: { satuanId: satuan.id }, orderBy: { createdAt: 'desc' },
    include: { jawaban: { include: { indikator: true } } },
  });
  if (!penilaian || penilaian.status === 'DRAFT') {
    return res.status(400).json({ error: 'Penilaian mandiri belum disubmit sekolah' });
  }
  // Cegah verifikasi ulang bila satuan sudah lanjut ke tahap berikutnya (mencegah regresi state)
  if (!['MENUNGGU_VERIFIKASI', 'HASIL_STRATA'].includes(satuan.tahap)) {
    return res.status(400).json({ error: 'Satuan sudah lanjut ke tahap berikutnya, tidak dapat diverifikasi ulang.' });
  }

  const koreksiMap = {};
  for (const k of koreksi || []) koreksiMap[k.indikatorId] = k;

  // terapkan koreksi verifikator (default = nilai mandiri jika tidak dikoreksi). Ya=1/Tidak=0.
  for (const j of penilaian.jawaban) {
    const k = koreksiMap[j.indikatorId];
    const nilaiVer = k && k.nilaiVerifikasi != null ? (Number(k.nilaiVerifikasi) ? 1 : 0) : j.nilaiMandiri;
    await prisma.jawabanPenilaian.update({
      where: { id: j.id },
      data: { nilaiVerifikasi: nilaiVer, catatan: k?.catatan ?? j.catatan },
    });
  }

  const fresh = await prisma.jawabanPenilaian.findMany({
    where: { penilaianId: penilaian.id }, include: { indikator: true },
  });
  await lengkapiVerifikasiKomponen(penilaian.id, new Set(fresh.map((j) => j.indikator.komponenId)), req.user, 'Dinilai langsung oleh koordinator saat finalisasi');
  const input = fresh.map((j) => ({ nilai: j.nilaiVerifikasi ?? j.nilaiMandiri, komponenId: j.indikator.komponenId, strata: j.indikator.strata }));
  const { nilai: skor, strata } = hitungStratifikasi(input);

  await prisma.penilaian.update({
    where: { id: penilaian.id },
    data: {
      status: 'DIVERIFIKASI',
      skorVerifikasi: skor,
      strataVerifikasi: strata,
      catatanVerifikasi: catatan || null,
      verifikatorId: req.user.id,
      verifiedAt: new Date(),
      pernyataanVerifikasi: true,
    },
  });
  // LANGKAH 5: hasil dikirim kembali ke sekolah
  await prisma.satuanPendidikan.update({ where: { id: satuan.id }, data: { tahap: 'HASIL_STRATA' } });
  await audit(req.user.nama, 'VERIFIKASI_PENILAIAN', { satuanId: satuan.id, entitas: 'Penilaian', detail: `Strata ${strata} (${skor}%) — dinyatakan sesuai fakta lapangan` });
  await notifySatuan(satuan.id, { judul: 'Hasil verifikasi tersedia', pesan: `Penilaian Anda telah diverifikasi kecamatan. Strata: ${strata || 'Belum Mencapai Dasar'} (nilai ${skor}).`, tipe: 'success', link: '/hasil-strata' });

  res.json({ ok: true, skorVerifikasi: skor, strataVerifikasi: strata });
});

// Bulk: verifikasi banyak satuan sekaligus (memakai nilai mandiri apa adanya)
r.post('/verifikasi-massal', wajibKoordinatorKecamatan, async (req, res) => {
  const { satuanIds } = req.body;
  if (!Array.isArray(satuanIds) || !satuanIds.length) return res.status(400).json({ error: 'Pilih minimal satu satuan' });
  let n = 0;
  for (const id of satuanIds) {
    const satuan = await prisma.satuanPendidikan.findFirst({ where: { id, kecamatanId: req.user.kecamatanId } });
    if (!satuan) continue;
    const penilaian = await prisma.penilaian.findFirst({
      where: { satuanId: id, status: 'SUBMITTED' }, orderBy: { createdAt: 'desc' },
      include: { jawaban: { include: { indikator: true } } },
    });
    if (!penilaian) continue;
    for (const j of penilaian.jawaban) {
      if (j.nilaiVerifikasi == null) await prisma.jawabanPenilaian.update({ where: { id: j.id }, data: { nilaiVerifikasi: j.nilaiMandiri } });
    }
    const input = penilaian.jawaban.map((j) => ({ nilai: j.nilaiVerifikasi ?? j.nilaiMandiri, komponenId: j.indikator.komponenId, strata: j.indikator.strata }));
    const { nilai: skor, strata } = hitungStratifikasi(input);
    await prisma.penilaian.update({ where: { id: penilaian.id }, data: { status: 'DIVERIFIKASI', skorVerifikasi: skor, strataVerifikasi: strata, verifikatorId: req.user.id, verifiedAt: new Date() } });
    await lengkapiVerifikasiKomponen(penilaian.id, new Set(penilaian.jawaban.map((j) => j.indikator.komponenId)), req.user, 'Verifikasi massal (nilai mandiri)');
    await prisma.satuanPendidikan.update({ where: { id }, data: { tahap: 'HASIL_STRATA' } });
    await notifySatuan(id, { judul: 'Hasil verifikasi tersedia', pesan: `Penilaian Anda telah diverifikasi. Strata: ${strata || 'Belum Mencapai Dasar'}.`, tipe: 'success', link: '/hasil-strata' });
    n++;
  }
  await audit(req.user.nama, 'VERIFIKASI_MASSAL', { entitas: 'Penilaian', detail: `${n} satuan` });
  res.json({ ok: true, jumlah: n });
});

// LANGKAH 6: rekomendasi maksimal 8 satuan ke kabupaten
r.get('/rekomendasi', async (req, res) => {
  const where = { kecamatanId: req.user.kecamatanId };
  const sertakan = { satuan: { include: { penilaian: { orderBy: { createdAt: 'desc' }, take: 1 } } } };
  if (mintaSemua(req)) {
    return res.json(await prisma.rekomendasi.findMany({ where, include: sertakan, orderBy: { peringkat: 'asc' } }));
  }
  const { page, pageSize, skip, take } = paging(req, { bawaan: 25 });
  const [total, list] = await Promise.all([
    prisma.rekomendasi.count({ where }),
    prisma.rekomendasi.findMany({ where, include: sertakan, orderBy: { peringkat: 'asc' }, skip, take }),
  ]);
  res.json(halaman(list, total, page, pageSize));
});

r.post('/rekomendasi', wajibKoordinatorKecamatan, async (req, res) => {
  const { satuanId, catatan } = req.body;
  const satuan = await prisma.satuanPendidikan.findFirst({
    where: { id: satuanId, kecamatanId: req.user.kecamatanId },
    include: { penilaian: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!satuan) return res.status(404).json({ error: 'Satuan tidak ditemukan' });
  const p = satuan.penilaian[0];
  if (!p || p.status !== 'DIVERIFIKASI') {
    return res.status(400).json({ error: 'Satuan belum diverifikasi, tidak bisa direkomendasikan' });
  }
  // Gate: minimal strata Madya (Madya/Utama/Paripurna) untuk sertifikasi strata
  if (!['MADYA', 'UTAMA', 'PARIPURNA'].includes(p.strataVerifikasi)) {
    return res.status(400).json({ error: 'Hanya satuan dengan strata minimal Madya yang dapat direkomendasikan untuk sertifikasi strata' });
  }
  const periodeAktif = await prisma.periode.findFirst({ where: { aktif: true } });
  const larangan = await cekLaranganJuara(satuanId, periodeAktif?.id);
  if (larangan) {
    await audit(req.user.nama, 'REKOMENDASI_DITOLAK_PERAIH', { satuanId, entitas: 'Rekomendasi', detail: `Peraih P${larangan.peringkat} ${larangan.tahun}` });
    return res.status(400).json({ error: pesanLaranganRekomendasi(larangan) });
  }
  const scope = { kecamatanId: req.user.kecamatanId, ...(periodeAktif ? { periodeId: periodeAktif.id } : {}) };
  const maxRank = await prisma.rekomendasi.aggregate({ where: scope, _max: { peringkat: true } });
  const already = await prisma.rekomendasi.findUnique({ where: { satuanId } });
  if (already) return res.status(409).json({ error: 'Satuan sudah direkomendasikan' });

  // Kuota rekomendasi: 2 satuan pendidikan per TINGKAT di setiap kecamatan dan
  // tidak dicampur antar tingkatan (TK/RA, SD/MI, SMP/MTs, SMA/SMK/MA).
  const grup = jenjangGrup(satuan.jenjang);
  const terpakai = await prisma.rekomendasi.count({
    where: { ...scope, satuan: { jenjang: { in: JENJANG_GRUP[grup] } } },
  });
  if (terpakai >= KUOTA_TINGKAT) {
    return res.status(400).json({
      error: `Kuota rekomendasi tingkat ${LABEL_GRUP[grup]} sudah penuh `
        + `(maksimal ${KUOTA_TINGKAT} satuan pendidikan per tingkat di setiap kecamatan pada periode ini).`,
    });
  }

  await prisma.rekomendasi.create({
    data: {
      satuanId,
      kecamatanId: req.user.kecamatanId,
      periodeId: periodeAktif?.id || null,
      peringkat: (maxRank._max.peringkat || 0) + 1,
      catatan,
      direkomendasikanOleh: req.user.nama,
    },
  });
  // LANGKAH 6/7: satuan terpilih -> pengisian eviden; siapkan record eviden
  await prisma.satuanPendidikan.update({ where: { id: satuanId }, data: { tahap: 'DIREKOMENDASIKAN' } });
  await prisma.eviden.upsert({
    where: { satuanId },
    update: {},
    create: { satuanId, status: 'DRAFT' },
  });
  // Bukti dukung yang sudah dipilih sekolah di penilaian mandiri langsung
  // terbawa ke eviden stratifikasi (tidak perlu melampirkan ulang).
  await salinLampiranKeEviden(satuanId);
  await audit(req.user.nama, 'REKOMENDASI', { satuanId, entitas: 'Rekomendasi' });
  await notifySatuan(satuanId, { judul: 'Direkomendasikan untuk Sertifikasi', pesan: 'Sekolah Anda direkomendasikan kecamatan. Silakan isi Eviden Stratifikasi.', tipe: 'success', link: '/eviden' });
  res.json({ ok: true });
});

r.delete('/rekomendasi/:satuanId', wajibKoordinatorKecamatan, async (req, res) => {
  const rek = await prisma.rekomendasi.findFirst({
    where: { satuanId: req.params.satuanId, kecamatanId: req.user.kecamatanId },
    include: { satuan: { select: { tahap: true, eviden: { select: { id: true, status: true } } } } },
  });
  if (!rek) return res.status(404).json({ error: 'Rekomendasi tidak ditemukan' });
  // Cegah pembatalan bila satuan sudah lanjut mengisi/mengajukan eviden
  if (rek.satuan.tahap !== 'DIREKOMENDASIKAN') {
    return res.status(400).json({ error: 'Tidak dapat dibatalkan — satuan sudah lanjut ke tahap eviden/sertifikasi.' });
  }
  await prisma.rekomendasi.delete({ where: { id: rek.id } });
  // bersihkan eviden kosong yang tercipta saat rekomendasi
  if (rek.satuan.eviden && rek.satuan.eviden.status === 'DRAFT') {
    await prisma.evidenItem.deleteMany({ where: { evidenId: rek.satuan.eviden.id } });
    await prisma.eviden.delete({ where: { id: rek.satuan.eviden.id } }).catch(() => {});
  }
  await prisma.satuanPendidikan.update({ where: { id: req.params.satuanId }, data: { tahap: 'HASIL_STRATA' } });
  res.json({ ok: true });
});

// (Pendaftaran Seleksi dihapus pada rapat akhir Okt 2026: peserta kini masuk Seleksi
// Administrasi OTOMATIS begitu seluruh eviden disetujui — lihat lib/alur.js.)

// ============================================================
// TIM PENILAI KECAMATAN (notulen Sep 2026) — dikelola koordinator kecamatan
// ============================================================
const bentukAnggota = (u) => ({
  id: u.id, username: u.username, nama: u.nama, email: u.email, aktif: u.aktif, koordinator: u.isAdmin,
  klasifikasi: (u.klasifikasiPenilai || []).map((k) => ({ id: k.komponenId, kode: k.komponen.kode, nama: k.komponen.nama })),
});

r.get('/tim', async (req, res) => {
  const list = await prisma.user.findMany({
    where: { role: 'TP_KECAMATAN', kecamatanId: req.user.kecamatanId },
    include: { klasifikasiPenilai: { include: { komponen: true }, orderBy: { komponen: { urutan: 'asc' } } } },
    orderBy: [{ isAdmin: 'desc' }, { aktif: 'desc' }, { nama: 'asc' }],
  });
  const komponen = await prisma.komponen.findMany({ orderBy: { urutan: 'asc' }, select: { id: true, kode: true, nama: true } });
  // komponen yang belum punya penilai aktif (koordinator dianggap tidak menutup komponen)
  const tertutup = new Set(list.filter((u) => u.aktif && !u.isAdmin).flatMap((u) => u.klasifikasiPenilai.map((k) => k.komponenId)));
  res.json({ anggota: list.map(bentukAnggota), komponen, komponenKosong: komponen.filter((k) => !tertutup.has(k.id)) });
});

r.post('/tim', wajibKoordinatorKecamatan, async (req, res) => {
  const { username, password, nama, email, komponenIds } = req.body;
  if (!username || !password || !nama) return res.status(400).json({ error: 'Nama, username, dan kata sandi wajib diisi' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Kata sandi minimal 6 karakter' });
  if (await prisma.user.findUnique({ where: { username } })) return res.status(409).json({ error: 'Username sudah digunakan' });
  const u = await prisma.user.create({
    data: {
      username, password: bcrypt.hashSync(password, 10), nama, email: email || null,
      role: 'TP_KECAMATAN', kecamatanId: req.user.kecamatanId, isAdmin: false,
    },
  });
  await simpanKlasifikasi(u.id, komponenIds);
  await audit(req.user.nama, 'TAMBAH_PENILAI_KECAMATAN', { entitas: 'User', detail: `${username} (${nama})` });
  res.json({ id: u.id });
});

r.put('/tim/:id', wajibKoordinatorKecamatan, async (req, res) => {
  const u = await prisma.user.findFirst({ where: { id: req.params.id, role: 'TP_KECAMATAN', kecamatanId: req.user.kecamatanId } });
  if (!u) return res.status(404).json({ error: 'Anggota tim tidak ditemukan di kecamatan Anda' });
  if (u.isAdmin && u.id !== req.user.id) return res.status(403).json({ error: 'Akun koordinator lain hanya dapat diubah Admin Kabupaten' });
  const { nama, email, password, aktif, komponenIds } = req.body;
  if (u.id === req.user.id && aktif === false) return res.status(400).json({ error: 'Tidak dapat menonaktifkan akun sendiri' });
  const data = { nama: nama ?? u.nama, email: email !== undefined ? (email || null) : u.email };
  if (aktif != null) data.aktif = !!aktif;
  if (password) {
    if (String(password).length < 6) return res.status(400).json({ error: 'Kata sandi minimal 6 karakter' });
    data.password = bcrypt.hashSync(password, 10);
  }
  await prisma.user.update({ where: { id: u.id }, data });
  if (!u.isAdmin && Array.isArray(komponenIds)) await simpanKlasifikasi(u.id, komponenIds);
  await audit(req.user.nama, 'UBAH_PENILAI_KECAMATAN', { entitas: 'User', detail: u.username });
  res.json({ ok: true });
});

// ============================================================
// PETA PUSKESMAS BINAAN & DIAGRAM STRATA (notulen Sep 2026)
// ============================================================
r.get('/puskesmas-binaan', async (req, res) => {
  res.json(await petaPuskesmas({ kecamatanId: req.user.kecamatanId }));
});

r.put('/puskesmas/:id/lokasi', wajibKoordinatorKecamatan, async (req, res) => {
  const p = await prisma.puskesmas.findFirst({ where: { id: req.params.id, kecamatanId: req.user.kecamatanId } });
  if (!p) return res.status(404).json({ error: 'Puskesmas tidak ditemukan di kecamatan Anda' });
  try {
    const hasil = await ubahLokasiPuskesmas(p.id, req.body, req.user.nama);
    await audit(req.user.nama, 'UBAH_LOKASI_PUSKESMAS', { entitas: 'Puskesmas', detail: p.nama });
    res.json(hasil);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

r.get('/diagram-strata', async (req, res) => {
  res.json(await diagramStrata({ kecamatanId: req.user.kecamatanId, kelompok: 'puskesmas' }));
});

export default r;
