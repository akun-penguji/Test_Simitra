import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { jenjangDariBentuk } from '../lib/scoring.js';
import { sign, authRequired, audit } from '../lib/auth.js';

const r = Router();

// LANGKAH 1: registrasi akun satuan pendidikan
r.post('/register', async (req, res) => {
  const { username, password, nama, email, namaSekolah, jenjang, kecamatanId, puskesmasId, npsn } = req.body;
  if (!username || !password || !namaSekolah || !jenjang || !kecamatanId) {
    return res.status(400).json({ error: 'Data registrasi tidak lengkap' });
  }
  const exist = await prisma.user.findUnique({ where: { username } });
  if (exist) return res.status(409).json({ error: 'Username sudah digunakan' });
  if (npsn) {
    const npsnExist = await prisma.satuanPendidikan.findUnique({ where: { npsn } });
    if (npsnExist) return res.status(409).json({ error: 'NPSN sudah terdaftar' });
  }

  const kec = await prisma.kecamatan.findUnique({ where: { id: kecamatanId } });
  if (!kec) return res.status(400).json({ error: 'Kecamatan tidak ditemukan' });

  const user = await prisma.user.create({
    data: {
      username,
      password: bcrypt.hashSync(password, 10),
      nama: nama || `Operator ${namaSekolah}`,
      email,
      role: 'SATUAN_PENDIDIKAN',
      satuanPendidikan: {
        create: {
          nama: namaSekolah,
          npsn: npsn || null,
          jenjang,
          kecamatanId,
          puskesmasId: puskesmasId || null,
          tahap: 'REGISTRASI',
        },
      },
    },
    include: { satuanPendidikan: true },
  });
  await audit(user.nama, 'REGISTRASI_AKUN', { satuanId: user.satuanPendidikan.id, entitas: 'SatuanPendidikan' });
  const token = sign(user);
  res.json({ token, user: publicUser(user) });
});

r.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await prisma.user.findUnique({
    where: { username },
    include: { satuanPendidikan: true, kecamatan: true, klasifikasiPenilai: { include: { komponen: { select: { kode: true } } } } },
  });
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Username atau password salah' });
  }
  if (!user.aktif) return res.status(403).json({ error: 'Akun dinonaktifkan' });
  const token = sign(user);
  res.json({ token, user: publicUser(user) });
});

r.get('/me', authRequired, async (req, res) => {
  const klas = await prisma.penilaiKomponen.findMany({
    where: { userId: req.user.id }, include: { komponen: { select: { kode: true } } },
  });
  res.json({ user: publicUser({ ...req.user, klasifikasiPenilai: klas }) });
});

// Ganti password mandiri (semua role)
r.post('/ubah-password', authRequired, async (req, res) => {
  const { lama, baru } = req.body;
  if (!baru || baru.length < 6) return res.status(400).json({ error: 'Password baru minimal 6 karakter' });
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!bcrypt.compareSync(lama || '', user.password)) return res.status(400).json({ error: 'Password lama salah' });
  await prisma.user.update({ where: { id: user.id }, data: { password: bcrypt.hashSync(baru, 10) } });
  res.json({ ok: true });
});

// Cari referensi sekolah Dapodik berdasarkan NPSN (publik, untuk auto-fill registrasi)
r.get('/referensi-npsn', async (req, res) => {
  const npsn = (req.query.npsn || '').trim();
  if (!npsn) return res.json(null);
  const ref = await prisma.sekolahReferensi.findUnique({
    where: { npsn }, include: { kecamatan: { select: { id: true, nama: true } } },
  });
  if (!ref) return res.json(null);
  // Bentuk pendidikan Dapodik (TK/KB/SPS/SD/SMP/…) dipetakan ke jenjang aplikasi
  const jenjang = jenjangDariBentuk(ref.bp);
  res.json({
    npsn: ref.npsn, nama: ref.nama, jenjang, bentuk: ref.bp || null,
    status: ref.status, kecamatanId: ref.kecamatanId ?? null, kecamatan: ref.kecamatan?.nama ?? null,
  });
});

// ---------------------------------------------------------------------------
// Daftar AKUN DEMO (publik) — ditampilkan di halaman login agar penguji dapat
// langsung mencoba tiap peran dan tiap tahap alur tanpa bertanya.
// Sumbernya basis data: hanya akun berawalan `demo_` yang benar-benar ada.
// Bila akun demo dihapus (prisma/akun-demo.mjs --bersihkan), panel di halaman
// login otomatis hilang.
// ---------------------------------------------------------------------------
const TAHAP_LABEL = {
  REGISTRASI: 'Registrasi',
  PENILAIAN_MANDIRI: 'Penilaian mandiri',
  MENUNGGU_VERIFIKASI: 'Menunggu verifikasi',
  HASIL_STRATA: 'Hasil strata',
  DIREKOMENDASIKAN: 'Direkomendasikan',
  PENGISIAN_EVIDEN: 'Pengisian eviden',
  REVIEW_EVIDEN: 'Review eviden',
  EVIDEN_DISETUJUI: 'Eviden disetujui',
  BERSERTIFIKAT: 'Bersertifikat',
  TERDAFTAR_SELEKSI: 'Terdaftar seleksi',
  SELEKSI_ADMINISTRASI: 'Seleksi administrasi',
  KUNJUNGAN_LAPANGAN: 'Kunjungan lapangan',
  FINAL: 'Hasil Pleno',
};
const TAHAP_URUT = Object.keys(TAHAP_LABEL);

r.get('/akun-demo', async (req, res) => {
  const users = await prisma.user.findMany({
    where: { username: { startsWith: 'demo_' }, aktif: true },
    include: {
      kecamatan: { select: { nama: true } },
      satuanPendidikan: { select: { nama: true, jenjang: true, tahap: true } },
      klasifikasiPenilai: { include: { komponen: { select: { kode: true, nama: true } } } },
    },
    orderBy: { username: 'asc' },
  });
  if (!users.length) return res.json({ ada: false, sandi: null, grup: [] });

  const kab = [], kec = [], sek = [];
  for (const u of users) {
    if (u.role === 'TIM_KABUPATEN') {
      const kode = u.klasifikasiPenilai.map((x) => x.komponen.kode).sort();
      kab.push({
        username: u.username, nama: u.nama,
        ket: u.isAdmin ? 'Koordinator — seluruh komponen & menu admin'
          : (kode.length ? `Penilai komponen ${kode.join(' & ')}` : 'Penilai belum ditugaskan komponen'),
        utama: u.isAdmin,
      });
    } else if (u.role === 'TP_KECAMATAN') {
      const kode = u.klasifikasiPenilai.map((x) => x.komponen.kode).sort();
      kec.push({
        username: u.username, nama: u.nama,
        ket: `${u.kecamatan?.nama || '-'} · ${u.isAdmin ? 'Koordinator' : (kode.length ? `Penilai komponen ${kode.join(' & ')}` : 'Penilai belum ditugaskan')}`,
        urut: `${u.kecamatan?.nama || ''}|${u.isAdmin ? 0 : 1}|${u.username}`,
      });
    } else if (u.satuanPendidikan) {
      const s = u.satuanPendidikan;
      sek.push({
        username: u.username, nama: s.nama,
        ket: `${s.jenjang} · ${TAHAP_LABEL[s.tahap] || s.tahap}`,
        urut: TAHAP_URUT.indexOf(s.tahap),
      });
    }
  }
  kab.sort((a, b) => (b.utama ? 1 : 0) - (a.utama ? 1 : 0) || a.username.localeCompare(b.username));
  sek.sort((a, b) => a.urut - b.urut || a.username.localeCompare(b.username));
  kec.sort((a, b) => a.urut.localeCompare(b.urut));

  res.json({
    ada: true,
    sandi: process.env.SANDI_DEMO || 'demo123',
    grup: [
      { judul: 'Tim Stratifikasi', akun: kab },
      { judul: 'TP UKS/M Kecamatan', akun: kec },
      { judul: 'Satuan Pendidikan (satu per tahap alur)', akun: sek },
    ].filter((g) => g.akun.length),
  });
});

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    nama: u.nama,
    email: u.email,
    role: u.role,
    isAdmin: u.isAdmin || false,
    // kode komponen yang ditugaskan (penilai kabupaten/kecamatan); kosong untuk koordinator
    klasifikasi: (u.klasifikasiPenilai || []).map((k) => k.komponen?.kode).filter(Boolean).sort(),
    kecamatan: u.kecamatan ? { id: u.kecamatan.id, nama: u.kecamatan.nama } : null,
    satuanPendidikan: u.satuanPendidikan
      ? { id: u.satuanPendidikan.id, nama: u.satuanPendidikan.nama, tahap: u.satuanPendidikan.tahap, profilLengkap: u.satuanPendidikan.profilLengkap }
      : null,
  };
}

export default r;
