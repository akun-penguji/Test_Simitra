import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authRequired, requireRole, audit } from '../lib/auth.js';
import { hitungStratifikasi, jenjangGrup } from '../lib/scoring.js';

const r = Router();

// Hasil Pleno bersifat sementara sampai Tim Stratifikasi menekan "Proses Hasil
// Pleno". Selama itu, nilai/peringkat/strata akhir dan jejak review TIDAK
// ditampilkan kepada sekolah (hasil bisa berubah akibat Review Ulang).
const KUNCI_TANPA_PERIODE = 'TANPA_PERIODE';
async function tampilkanHasilBagiSekolah(s) {
  const hf = s.hasilFinal;
  const diproses = hf
    ? !!(await prisma.prosesPleno.findUnique({ where: { kunci: hf.periodeId ?? KUNCI_TANPA_PERIODE }, select: { id: true } }))
    : false;
  let kunjungan = s.kunjungan;
  if (kunjungan && !diproses) {
    // sisakan hanya data pelaksanaan kunjungan; hasil hitung & jejak internal disembunyikan
    const { tanggal, petugas, temuan, selesai, terkunci, disubmitPada, id, satuanId, createdAt } = kunjungan;
    kunjungan = { id, satuanId, tanggal, petugas, temuan, selesai, terkunci, disubmitPada, createdAt };
  }
  return { hasilFinal: diproses ? hf : null, kunjungan, hasilDiproses: diproses };
}

// Susun data infografis profil + pengelolaan UKS/M dari sebuah satuan
// `untukSekolah` = true bila dilihat oleh sekolah itu sendiri.
export async function buildInfografis(satuanId, { untukSekolah = false } = {}) {
  const s = await prisma.satuanPendidikan.findUnique({
    where: { id: satuanId },
    include: { kecamatan: true, puskesmas: true, sertifikat: true, piagamPeserta: true, hasilFinal: true, kunjungan: true, rekomendasi: true, pendaftaranSeleksi: true },
  });
  if (!s) return null;
  const tampil = untukSekolah
    ? await tampilkanHasilBagiSekolah(s)
    : { hasilFinal: s.hasilFinal, kunjungan: s.kunjungan, hasilDiproses: true };

  const penilaian = await prisma.penilaian.findFirst({
    where: { satuanId }, orderBy: { createdAt: 'desc' },
    include: { jawaban: { include: { indikator: { include: { komponen: true } } } } },
  });

  let rincian = null;
  if (penilaian && penilaian.status !== 'DRAFT') {
    const key = penilaian.status === 'DIVERIFIKASI' ? 'nilaiVerifikasi' : 'nilaiMandiri';
    const input = penilaian.jawaban.map((j) => ({ nilai: j[key] ?? j.nilaiMandiri, komponenId: j.indikator.komponenId, strata: j.indikator.strata }));
    const hasil = hitungStratifikasi(input);
    // nama komponen
    const komps = {};
    for (const j of penilaian.jawaban) komps[j.indikator.komponenId] = { kode: j.indikator.komponen.kode, nama: j.indikator.komponen.nama };
    const perKomponen = Object.entries(hasil.perKomponen).map(([id, v]) => ({
      kode: komps[id]?.kode, nama: komps[id]?.nama, persen: v.jumlah ? Math.round((v.terpenuhi / v.jumlah) * 100) : 0,
    })).sort((a, b) => (a.kode || '').localeCompare(b.kode || ''));
    rincian = { nilai: hasil.nilai, strata: hasil.strata, perStrata: hasil.perStrata, perKomponen };
  }

  return {
    satuan: {
      nama: s.nama, npsn: s.npsn, jenjang: s.jenjang, kecamatan: s.kecamatan?.nama, puskesmas: s.puskesmas?.nama,
      alamat: s.alamat, kepalaSekolah: s.kepalaSekolah, pembinaUks: s.pembinaUks, telepon: s.telepon, emailSekolah: s.emailSekolah,
      jumlahSiswa: s.jumlahSiswa, jumlahGuru: s.jumlahGuru, latitude: s.latitude, longitude: s.longitude, tahap: s.tahap, profilLengkap: s.profilLengkap,
    },
    rincian,
    dokumen: {
      rekomendasi: !!s.rekomendasi, sertifikat: s.sertifikat, piagamPeserta: s.piagamPeserta, pendaftaranSeleksi: s.pendaftaranSeleksi,
      hasilFinal: tampil.hasilFinal, kunjungan: tampil.kunjungan,
    },
  };
}

// Ambil profil satuan pendidikan milik user login
r.get('/me', authRequired, requireRole('SATUAN_PENDIDIKAN'), async (req, res) => {
  const s = await prisma.satuanPendidikan.findUnique({
    where: { userId: req.user.id },
    include: { kecamatan: true, puskesmas: true, sertifikat: true, piagamPeserta: true, hasilFinal: true, kunjungan: true, rekomendasi: true, pendaftaranSeleksi: true },
  });
  if (!s) return res.status(404).json({ error: 'Satuan pendidikan tidak ditemukan' });
  const tampil = await tampilkanHasilBagiSekolah(s);
  res.json({ ...s, hasilFinal: tampil.hasilFinal, kunjungan: tampil.kunjungan, hasilDiproses: tampil.hasilDiproses });
});

// Infografis profil (sekolah: milik sendiri)
r.get('/infografis', authRequired, requireRole('SATUAN_PENDIDIKAN'), async (req, res) => {
  const s = await prisma.satuanPendidikan.findUnique({ where: { userId: req.user.id }, select: { id: true } });
  if (!s) return res.status(404).json({ error: 'Satuan tidak ditemukan' });
  res.json(await buildInfografis(s.id, { untukSekolah: true }));
});

// LANGKAH 1: lengkapi / ubah profil satuan pendidikan
r.put('/me', authRequired, requireRole('SATUAN_PENDIDIKAN'), async (req, res) => {
  const s = await prisma.satuanPendidikan.findUnique({ where: { userId: req.user.id } });
  if (!s) return res.status(404).json({ error: 'Satuan pendidikan tidak ditemukan' });

  const f = req.body;

  // Identitas satuan (jenjang, kecamatan, NPSN) dikunci setelah penilaian dikirim:
  // jenjang menentukan instrumen yang dipakai, kecamatan menentukan siapa yang
  // memverifikasi, dan NPSN adalah identitas resmi sekolah.
  const terkirim = await prisma.penilaian.findFirst({
    where: { satuanId: s.id, status: { in: ['SUBMITTED', 'DIVERIFIKASI'] } }, select: { id: true },
  });
  if (terkirim) {
    const ubah = [];
    if (f.jenjang && f.jenjang !== s.jenjang) ubah.push('jenjang');
    if (f.kecamatanId && f.kecamatanId !== s.kecamatanId) ubah.push('kecamatan');
    if (f.npsn && f.npsn !== s.npsn) ubah.push('NPSN');
    if (ubah.length) {
      return res.status(400).json({
        error: `${ubah.join(', ').replace(/^./, (c) => c.toUpperCase())} tidak dapat diubah setelah penilaian mandiri dikirim. Hubungi Admin Tim Stratifikasi Kabupaten bila data ini keliru.`,
      });
    }
  }
  // NPSN wajib unik antar satuan pendidikan
  if (f.npsn && f.npsn !== s.npsn) {
    const dipakai = await prisma.satuanPendidikan.findUnique({ where: { npsn: f.npsn }, select: { id: true } });
    if (dipakai && dipakai.id !== s.id) return res.status(409).json({ error: 'NPSN sudah terdaftar pada satuan pendidikan lain.' });
  }
  // Kecamatan harus ada
  if (f.kecamatanId && f.kecamatanId !== s.kecamatanId) {
    const kec = await prisma.kecamatan.findUnique({ where: { id: f.kecamatanId }, select: { id: true } });
    if (!kec) return res.status(400).json({ error: 'Kecamatan tidak ditemukan' });
  }

  const data = {
    nama: f.nama ?? s.nama,
    npsn: f.npsn || s.npsn,
    jenjang: f.jenjang ?? s.jenjang,
    kecamatanId: f.kecamatanId ?? s.kecamatanId,
    puskesmasId: f.puskesmasId !== undefined ? (f.puskesmasId || null) : s.puskesmasId,
    latitude: f.latitude !== undefined ? (f.latitude === '' || f.latitude === null ? null : Number(f.latitude)) : s.latitude,
    longitude: f.longitude !== undefined ? (f.longitude === '' || f.longitude === null ? null : Number(f.longitude)) : s.longitude,
    alamat: f.alamat ?? s.alamat,
    kepalaSekolah: f.kepalaSekolah ?? s.kepalaSekolah,
    npkKepala: f.npkKepala ?? s.npkKepala,
    telepon: f.telepon ?? s.telepon,
    emailSekolah: f.emailSekolah ?? s.emailSekolah,
    pembinaUks: f.pembinaUks ?? s.pembinaUks,
    jumlahSiswa: f.jumlahSiswa != null ? Number(f.jumlahSiswa) : s.jumlahSiswa,
    jumlahGuru: f.jumlahGuru != null ? Number(f.jumlahGuru) : s.jumlahGuru,
  };
  // profil dianggap lengkap bila field wajib terisi
  data.profilLengkap = Boolean(data.nama && data.npsn && data.jenjang && data.kecamatanId && data.alamat && data.kepalaSekolah);

  // Jenjang berubah saat masih draf → jawaban lama milik instrumen jenjang
  // sebelumnya, jadi dihapus agar tidak tercampur.
  if (data.jenjang !== s.jenjang) {
    const draf = await prisma.penilaian.findFirst({ where: { satuanId: s.id, status: 'DRAFT' }, select: { id: true } });
    if (draf) await prisma.jawabanPenilaian.deleteMany({ where: { penilaianId: draf.id } });
  }

  const updated = await prisma.satuanPendidikan.update({
    where: { id: s.id },
    data,
    include: { kecamatan: true },
  });
  await audit(req.user.nama, 'UPDATE_PROFIL', { satuanId: s.id, entitas: 'SatuanPendidikan' });
  res.json(updated);
});

export default r;
