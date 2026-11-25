// ============================================================================
// Pembuat AKUN DEMO SIMITRA — satu akun untuk tiap peran dan tiap tahap alur.
//
//   node prisma/akun-demo.mjs               → buat / perbarui seluruh akun demo
//   node prisma/akun-demo.mjs --bersihkan   → hapus seluruh akun demo + datanya
//   node prisma/akun-demo.mjs --sandi=xxx   → ganti kata sandi (bawaan: demo123)
//
// Seluruh akun demo memakai awalan username `demo_` sehingga dapat dihapus
// kembali tanpa menyentuh akun sungguhan. Skrip bersifat idempoten: dijalankan
// berulang kali menghasilkan keadaan yang sama.
// ============================================================================
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { hitungStratifikasi, jenjangGrup, STRATA_URUTAN } from '../src/lib/scoring.js';

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const BERSIHKAN = argv.includes('--bersihkan');
const UJI = argv.includes('--uji'); // dengan --bersihkan: hanya hitung, tidak menghapus
const SANDI = (argv.find((a) => a.startsWith('--sandi=')) || '--sandi=demo123').split('=')[1];
const AWALAN = 'demo_';
const hash = (p) => bcrypt.hashSync(p, 10);

// ---------------------------------------------------------------------------
// Daftar akun
// ---------------------------------------------------------------------------

// Tim Kabupaten: 1 koordinator (seluruh komponen) + 1 penilai per komponen
// + 1 penilai lintas komponen, untuk memperagakan klasifikasi penilai.
const KABUPATEN = [
  { username: 'demo_koordinator', nama: 'Dr. Hendra Wijaya, M.Kes (Koordinator Tim Kabupaten)', isAdmin: true, komponen: null },
  { username: 'demo_penilai_a', nama: 'Rina Kartika, S.Pd (Penilai Komponen A)', isAdmin: false, komponen: ['A'] },
  { username: 'demo_penilai_b', nama: 'dr. Anisa Rahmawati (Penilai Komponen B)', isAdmin: false, komponen: ['B'] },
  { username: 'demo_penilai_c', nama: 'Ir. Bambang Setiawan (Penilai Komponen C)', isAdmin: false, komponen: ['C'] },
  { username: 'demo_penilai_d', nama: 'Dewi Lestari, M.M (Penilai Komponen D)', isAdmin: false, komponen: ['D'] },
  { username: 'demo_penilai_ac', nama: 'Agus Priyanto, S.KM (Penilai Komponen A & C)', isAdmin: false, komponen: ['A', 'C'] },
  { username: 'demo_penilai_baru', nama: 'Sri Handayani (Penilai Belum Ditugaskan)', isAdmin: false, komponen: [] },
];

const KECAMATAN_DEMO = ['Cikarang Utara', 'Tambun Selatan', 'Cibitung'];

// Tim Penilai Kecamatan (notulen Sep 2026): koordinator tiap kecamatan di atas +
// penilai per komponen di Kecamatan Cibitung.
const PENILAI_KECAMATAN = [
  { username: 'demo_kec_cibitung_a', nama: 'Yuli Astuti, S.Pd (Penilai Komponen A Kec. Cibitung)', kec: 'Cibitung', komponen: ['A'] },
  { username: 'demo_kec_cibitung_b', nama: 'Bidan Sri Rahayu (Penilai Komponen B Kec. Cibitung)', kec: 'Cibitung', komponen: ['B'] },
  { username: 'demo_kec_cibitung_c', nama: 'Hendro Wibowo, S.KM (Penilai Komponen C Kec. Cibitung)', kec: 'Cibitung', komponen: ['C'] },
  { username: 'demo_kec_cibitung_d', nama: 'Neneng Hasanah, M.Pd (Penilai Komponen D Kec. Cibitung)', kec: 'Cibitung', komponen: ['D'] },
];

// Satu sekolah untuk tiap tahap pada alur 16 langkah + satu sekolah bekas juara.
const SEKOLAH = [
  { username: 'demo_tk_registrasi', tahap: 'REGISTRASI', jenjang: 'TK', kec: 'Cikarang Utara',
    nama: 'TK Negeri Pembina Cikarang Utara', npsn: '69900101', kepala: 'Siti Nurjanah, S.Pd.AUD',
    pembina: 'Lilis Suryani, S.Pd', siswa: 120, guru: 9, strata: null },
  { username: 'demo_sd_mandiri', tahap: 'PENILAIAN_MANDIRI', jenjang: 'SD', kec: 'Tambun Selatan',
    nama: 'SD Negeri Tambun Selatan 05', npsn: '69900102', kepala: 'Drs. Ahmad Fauzi',
    pembina: 'Nia Kurniasih, S.Pd', siswa: 512, guru: 26, strata: 'DASAR' },
  { username: 'demo_smp_verifikasi', tahap: 'MENUNGGU_VERIFIKASI', jenjang: 'SMP', kec: 'Cibitung',
    nama: 'SMP Negeri 2 Cibitung', npsn: '69900103', kepala: 'Hj. Yuyun Yuningsih, M.Pd',
    pembina: 'Rizal Maulana, S.Pd', siswa: 780, guru: 42, strata: 'MADYA' },
  { username: 'demo_sma_hasil', tahap: 'HASIL_STRATA', jenjang: 'SMA', kec: 'Cikarang Utara',
    nama: 'SMA Negeri 1 Cikarang Utara', npsn: '69900104', kepala: 'Dedi Supriadi, M.Pd',
    pembina: 'Fitri Handayani, S.Pd', siswa: 940, guru: 55, strata: 'MADYA' },
  { username: 'demo_mi_rekomendasi', tahap: 'DIREKOMENDASIKAN', jenjang: 'MI', kec: 'Tambun Selatan',
    nama: 'MI Al-Hidayah Tambun Selatan', npsn: '69900105', kepala: 'H. Abdul Rohman, S.Pd.I',
    pembina: 'Umi Salamah, S.Pd.I', siswa: 285, guru: 16, strata: 'UTAMA' },
  { username: 'demo_sd_eviden', tahap: 'PENGISIAN_EVIDEN', jenjang: 'SD', kec: 'Cibitung',
    nama: 'SD Negeri Cibitung 03', npsn: '69900106', kepala: 'Endang Sulastri, S.Pd',
    pembina: 'Taufik Hidayat, S.Pd', siswa: 430, guru: 22, strata: 'UTAMA' },
  { username: 'demo_mts_review', tahap: 'REVIEW_EVIDEN', jenjang: 'MTS', kec: 'Cikarang Utara',
    nama: 'MTs Nurul Falah Cikarang Utara', npsn: '69900107', kepala: 'Ust. Syaiful Anwar, S.Ag',
    pembina: 'Nurhasanah, S.Pd', siswa: 340, guru: 21, strata: 'UTAMA' },
  { username: 'demo_smk_disetujui', tahap: 'EVIDEN_DISETUJUI', jenjang: 'SMK', kec: 'Tambun Selatan',
    nama: 'SMK Negeri 1 Tambun Selatan', npsn: '69900108', kepala: 'Drs. Iwan Setiawan, M.T',
    pembina: 'Ratna Dewi, S.KM', siswa: 1240, guru: 68, strata: 'UTAMA' },
  { username: 'demo_sd_sertifikat', tahap: 'BERSERTIFIKAT', jenjang: 'SD', kec: 'Cikarang Utara',
    nama: 'SD Negeri Cikarang Utara 04', npsn: '69900109', kepala: 'Sri Wahyuni, S.Pd',
    pembina: 'Dian Puspita, S.Pd', siswa: 468, guru: 24, strata: 'PARIPURNA' },
  { username: 'demo_smp_seleksi', tahap: 'TERDAFTAR_SELEKSI', jenjang: 'SMP', kec: 'Tambun Selatan',
    nama: 'SMP Negeri 1 Tambun Selatan', npsn: '69900110', kepala: 'H. Sutrisno, M.Pd',
    pembina: 'Wulan Sari, S.Pd', siswa: 860, guru: 47, strata: 'PARIPURNA' },
  { username: 'demo_ma_administrasi', tahap: 'SELEKSI_ADMINISTRASI', jenjang: 'MA', kec: 'Cibitung',
    nama: 'MA Darul Ulum Cibitung', npsn: '69900111', kepala: 'Drs. KH. Masykur Ali',
    pembina: 'Halimah, S.Pd.I', siswa: 410, guru: 27, strata: 'PARIPURNA' },
  { username: 'demo_sma_kunjungan', tahap: 'KUNJUNGAN_LAPANGAN', jenjang: 'SMA', kec: 'Cibitung',
    nama: 'SMA Negeri 1 Cibitung', npsn: '69900112', kepala: 'Hj. Ratih Puspitasari, M.Pd',
    pembina: 'Andi Nugroho, S.Pd', siswa: 1020, guru: 58, strata: 'PARIPURNA' },
  { username: 'demo_sd_final', tahap: 'FINAL', jenjang: 'SD', kec: 'Tambun Selatan',
    nama: 'SD Negeri Tambun Selatan 01', npsn: '69900113', kepala: 'Hj. Euis Komariah, M.Pd',
    pembina: 'Rahmat Hidayat, S.Pd', siswa: 520, guru: 28, strata: 'PARIPURNA', juaraAktif: 1 },
  { username: 'demo_sd_juara', tahap: 'REGISTRASI', jenjang: 'SD', kec: 'Cikarang Utara',
    nama: 'SD Negeri Cikarang Utara 02', npsn: '69900114', kepala: 'Maman Suherman, S.Pd',
    pembina: 'Yanti Rosmiati, S.Pd', siswa: 496, guru: 25, strata: null, juaraLalu: 1 },
];

const TAHAP_URUT = ['REGISTRASI', 'PENILAIAN_MANDIRI', 'MENUNGGU_VERIFIKASI', 'HASIL_STRATA',
  'DIREKOMENDASIKAN', 'PENGISIAN_EVIDEN', 'REVIEW_EVIDEN', 'EVIDEN_DISETUJUI', 'BERSERTIFIKAT',
  'TERDAFTAR_SELEKSI', 'SELEKSI_ADMINISTRASI', 'KUNJUNGAN_LAPANGAN', 'FINAL'];
const urut = (t) => TAHAP_URUT.indexOf(t);

const TAUTAN_CONTOH = 'https://drive.google.com/drive/folders/contoh-eviden-uksm-bekasi';
const PENULIS_DEMO = 'Admin SIMITRA (contoh akun demo)';

// ---------------------------------------------------------------------------
// Pembersihan
// ---------------------------------------------------------------------------
async function bersihkan() {
  const users = await prisma.user.findMany({
    where: { username: { startsWith: AWALAN } },
    include: { satuanPendidikan: true },
  });
  if (!users.length) { console.log('   • tidak ada akun demo untuk dihapus'); return 0; }
  const satuanIds = users.map((u) => u.satuanPendidikan?.id).filter(Boolean);
  const userIds = users.map((u) => u.id);

  // Berkas fisik milik eviden/lampiran demo — dikumpulkan sebelum barisnya terhapus.
  const berkasFisik = new Set();
  if (satuanIds.length) {
    const eb = await prisma.evidenBerkas.findMany({ where: { item: { eviden: { satuanId: { in: satuanIds } } } }, select: { filePath: true } });
    const ei = await prisma.evidenItem.findMany({ where: { eviden: { satuanId: { in: satuanIds } } }, select: { filePath: true } });
    const lj = await prisma.lampiranJawaban.findMany({ where: { jawaban: { penilaian: { satuanId: { in: satuanIds } } } }, select: { filePath: true } });
    for (const r of [...eb, ...ei, ...lj]) if (r.filePath) berkasFisik.add(r.filePath);
  }
  const namaDemo = users.map((u) => u.nama);
  const ringkas = {
    akun: users.length, satuan: satuanIds.length,
    peraihTertaut: satuanIds.length ? await prisma.peraihPenghargaan.count({ where: { satuanId: { in: satuanIds } } }) : 0,
    suratRekomendasi: await prisma.suratRekomendasi.count({ where: { OR: [{ satuanId: { in: satuanIds } }, { diunggahOleh: { in: namaDemo } }] } }),
    log: satuanIds.length ? await prisma.auditLog.count({ where: { satuanId: { in: satuanIds } } }) : 0,
    berkasFisik: berkasFisik.size,
  };
  console.log('   Akan dihapus:', JSON.stringify(ringkas));
  if (UJI) { console.log('   (MODE UJI — tidak ada yang dihapus)'); return users.length; }

  if (satuanIds.length) {
    const w = { satuanId: { in: satuanIds } };
    await prisma.hasilFinal.deleteMany({ where: w });
    await prisma.kunjunganLapangan.deleteMany({ where: w });
    await prisma.pendaftaranSeleksi.deleteMany({ where: w });
    await prisma.sertifikat.deleteMany({ where: w });
    const evidens = await prisma.eviden.findMany({ where: w, select: { id: true } });
    const evIds = evidens.map((e) => e.id);
    if (evIds.length) {
      const items = await prisma.evidenItem.findMany({ where: { evidenId: { in: evIds } }, select: { id: true } });
      await prisma.evidenBerkas.deleteMany({ where: { itemId: { in: items.map((i) => i.id) } } });
      await prisma.evidenItem.deleteMany({ where: { evidenId: { in: evIds } } });
      await prisma.eviden.deleteMany({ where: { id: { in: evIds } } });
    }
    await prisma.rekomendasi.deleteMany({ where: w });
    const pens = await prisma.penilaian.findMany({ where: w, select: { id: true } });
    await prisma.verifikasiKomponen.deleteMany({ where: { penilaianId: { in: pens.map((p) => p.id) } } });
    await prisma.jawabanPenilaian.deleteMany({ where: { penilaianId: { in: pens.map((p) => p.id) } } });
    await prisma.penilaian.deleteMany({ where: w });
    await prisma.riwayatJuara.deleteMany({ where: w });
    await prisma.peraihPenghargaan.updateMany({ where: w, data: { satuanId: null } }); // data larangan tetap, hanya tautannya dilepas
    await prisma.suratRekomendasi.deleteMany({ where: { satuanId: { in: satuanIds } } });
    await prisma.auditLog.deleteMany({ where: w });
    await prisma.satuanPendidikan.deleteMany({ where: { id: { in: satuanIds } } });
  }
  await prisma.suratRekomendasi.deleteMany({ where: { diunggahOleh: { in: namaDemo } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.penilaiKomponen.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  await prisma.berita.deleteMany({ where: { penulis: PENULIS_DEMO } });

  // SK & periode khusus demo
  const sk = await prisma.sKBupati.findFirst({ where: { nomor: { contains: 'DEMO' } } });
  if (sk) await prisma.sKBupati.delete({ where: { id: sk.id } });
  const p2025 = await prisma.periode.findFirst({ where: { nama: { contains: '2025 (Demo)' } } });
  if (p2025) await prisma.periode.delete({ where: { id: p2025.id } });

  // Hapus berkas fisik (hanya di dalam folder unggahan; berkas yang gagal dihapus dilewati)
  const akar = path.resolve(process.env.UPLOAD_DIR || 'uploads');
  let terhapus = 0;
  for (const f of berkasFisik) {
    const t = path.resolve(akar, f.replace(/^\/?uploads\//, ''));
    if (!t.startsWith(akar + path.sep)) continue;
    try { fs.unlinkSync(t); terhapus++; } catch { /* sudah tidak ada */ }
  }
  console.log(`   ✓ ${terhapus} berkas fisik dihapus`);
  console.log(`   ✓ ${users.length} akun demo dihapus (${satuanIds.length} satuan pendidikan)`);
  return users.length;
}

// ---------------------------------------------------------------------------
// Pengisian jawaban agar hasil hitung persis mencapai strata sasaran
// ---------------------------------------------------------------------------
function isiJawaban(indikator, sasaran) {
  const idxSasaran = sasaran ? STRATA_URUTAN.indexOf(sasaran) : -1;
  const grup = {};
  for (const i of indikator) ((grup[i.komponenId] ||= {})[i.strata] ||= []).push(i);
  const nilai = {};
  for (const kid of Object.keys(grup)) {
    for (const st of Object.keys(grup[kid])) {
      const idx = STRATA_URUTAN.indexOf(st);
      const daftar = grup[kid][st];
      let n;
      if (idx <= idxSasaran) n = daftar.length;            // seluruhnya terpenuhi
      else if (idx === idxSasaran + 1) n = Math.floor(daftar.length * 0.4); // sebagian → belum naik
      else n = 0;
      daftar.forEach((ind, k) => { nilai[ind.id] = k < n ? 1 : 0; });
    }
  }
  const jw = indikator.map((i) => ({ nilai: nilai[i.id], komponenId: i.komponenId, strata: i.strata }));
  const hasil = hitungStratifikasi(jw);
  if (hasil.strata !== (sasaran || null)) {
    console.warn(`      ⚠ strata hasil ${hasil.strata} ≠ sasaran ${sasaran} (dibiarkan apa adanya)`);
  }
  return { nilai, hasil };
}

// ---------------------------------------------------------------------------
// Utama
// ---------------------------------------------------------------------------
async function main() {
  if (BERSIHKAN) {
    console.log('🧹 Menghapus akun demo SIMITRA...');
    await bersihkan();
    console.log('\n✅ Selesai.');
    return;
  }

  console.log('👤 Menyiapkan akun demo SIMITRA...');

  const periodeAktif = await prisma.periode.findFirst({ where: { aktif: true } });
  if (!periodeAktif) throw new Error('Tidak ada periode aktif. Jalankan seed / buat periode dahulu.');
  const komponen = await prisma.komponen.findMany({ orderBy: { urutan: 'asc' } });
  if (!komponen.length) throw new Error('Master komponen kosong. Jalankan seed instrumen dahulu.');
  const kompByKode = Object.fromEntries(komponen.map((k) => [k.kode, k]));

  const kecList = await prisma.kecamatan.findMany({ where: { nama: { in: KECAMATAN_DEMO } } });
  const kecByNama = Object.fromEntries(kecList.map((k) => [k.nama, k]));
  for (const n of KECAMATAN_DEMO) if (!kecByNama[n]) throw new Error(`Kecamatan "${n}" tidak ada di basis data.`);

  // Bersihkan dahulu agar hasil selalu konsisten (idempoten)
  await bersihkan();

  // --- Periode lampau untuk memperagakan larangan juara ---
  const periodeLalu = await prisma.periode.upsert({
    where: { nama: 'Stratifikasi UKS/M 2025 (Demo)' },
    update: {},
    create: { nama: 'Stratifikasi UKS/M 2025 (Demo)', tahun: 2025, aktif: false, keterangan: 'Periode lampau — data demo' },
  });

  // --- Tim Kabupaten ---
  for (const a of KABUPATEN) {
    const u = await prisma.user.create({
      data: {
        username: a.username, password: hash(SANDI), nama: a.nama,
        email: `${a.username}@uksm-bekasi.id`, role: 'TIM_KABUPATEN', isAdmin: a.isAdmin,
      },
    });
    for (const kode of a.komponen || []) {
      const k = kompByKode[kode];
      if (k) await prisma.penilaiKomponen.create({ data: { userId: u.id, komponenId: k.id } });
    }
  }
  console.log(`   ✓ ${KABUPATEN.length} akun Tim Kabupaten (1 koordinator + 6 penilai berklasifikasi)`);

  // --- TP Kecamatan ---
  for (const nama of KECAMATAN_DEMO) {
    const uname = AWALAN + 'kec_' + nama.toLowerCase().replace(/\s+/g, '');
    await prisma.user.create({
      data: {
        username: uname, password: hash(SANDI), nama: `Koordinator TP UKS/M Kecamatan ${nama} (Demo)`,
        email: `${uname}@uksm-bekasi.id`, role: 'TP_KECAMATAN', kecamatanId: kecByNama[nama].id, isAdmin: true,
      },
    });
  }
  const penilaiKec = {};
  for (const a of PENILAI_KECAMATAN) {
    const u = await prisma.user.create({
      data: {
        username: a.username, password: hash(SANDI), nama: a.nama, email: `${a.username}@uksm-bekasi.id`,
        role: 'TP_KECAMATAN', kecamatanId: kecByNama[a.kec].id, isAdmin: false,
      },
    });
    for (const kode of a.komponen) {
      const k = kompByKode[kode];
      if (k) { await prisma.penilaiKomponen.create({ data: { userId: u.id, komponenId: k.id } }); penilaiKec[kode] = u; }
    }
  }
  console.log(`   ✓ ${KECAMATAN_DEMO.length} koordinator TP Kecamatan + ${PENILAI_KECAMATAN.length} penilai komponen (Kec. Cibitung)`);

  // --- Indikator per grup jenjang (di-cache) ---
  const indCache = {};
  const ambilIndikator = async (grup) => {
    if (!indCache[grup]) {
      indCache[grup] = await prisma.indikator.findMany({
        where: { jenjang: grup },
        select: { id: true, komponenId: true, strata: true, kode: true },
        orderBy: { urutan: 'asc' },
      });
    }
    return indCache[grup];
  };

  // --- Satuan pendidikan ---
  const ringkas = [];
  const finalUntukSk = [];
  const urutPusk = {};
  for (const s of SEKOLAH) {
    const kec = kecByNama[s.kec];
    const puskList = await prisma.puskesmas.findMany({ where: { kecamatanId: kec.id }, orderBy: { nama: 'asc' } });
    urutPusk[s.kec] = (urutPusk[s.kec] ?? -1) + 1;
    const pusk = puskList.length ? puskList[urutPusk[s.kec] % puskList.length] : null;
    const acuan = [pusk, ...puskList].find((p) => p?.latitude != null);
    const pusatTitik = acuan ? [acuan.latitude, acuan.longitude] : [-6.26, 107.13];
    const user = await prisma.user.create({
      data: {
        username: s.username, password: hash(SANDI), nama: `Operator ${s.nama}`,
        email: `${s.username}@sekolah.id`, role: 'SATUAN_PENDIDIKAN',
      },
    });
    const satuan = await prisma.satuanPendidikan.create({
      data: {
        userId: user.id, nama: s.nama, npsn: s.npsn, jenjang: s.jenjang,
        kecamatanId: kec.id, puskesmasId: pusk?.id || null,
        alamat: `Jl. Raya ${s.kec} No. ${s.npsn.slice(-2)}, ${s.kec}, Kabupaten Bekasi`,
        kepalaSekolah: s.kepala, pembinaUks: s.pembina,
        jumlahSiswa: s.siswa, jumlahGuru: s.guru,
        telepon: `021-89${s.npsn.slice(-5)}`, emailSekolah: `${s.username}@sekolah.id`,
        latitude: pusatTitik[0] + (Math.random() - 0.5) * 0.028,
        longitude: pusatTitik[1] + (Math.random() - 0.5) * 0.028,
        profilLengkap: true, tahap: s.tahap,
      },
    });

    const t = urut(s.tahap);
    let hasilHitung = null;
    let indikator = [];
    let nilaiMap = {};

    // ---- Penilaian mandiri (tahap ≥ PENILAIAN_MANDIRI) ----
    if (t >= urut('PENILAIAN_MANDIRI')) {
      indikator = await ambilIndikator(jenjangGrup(s.jenjang));
      const { nilai, hasil } = isiJawaban(indikator, s.strata);
      nilaiMap = nilai; hasilHitung = hasil;
      const sudahSubmit = t >= urut('MENUNGGU_VERIFIKASI');
      const sudahVerifikasi = t >= urut('HASIL_STRATA');
      const pen = await prisma.penilaian.create({
        data: {
          satuanId: satuan.id, periodeId: periodeAktif.id,
          status: sudahVerifikasi ? 'DIVERIFIKASI' : (sudahSubmit ? 'SUBMITTED' : 'DRAFT'),
          skorMandiri: sudahSubmit ? hasil.nilai : null,
          strataMandiri: sudahSubmit ? hasil.strata : null,
          submittedAt: sudahSubmit ? new Date() : null,
          pernyataanMandiri: sudahSubmit,
          skorVerifikasi: sudahVerifikasi ? hasil.nilai : null,
          strataVerifikasi: sudahVerifikasi ? hasil.strata : null,
          catatanVerifikasi: sudahVerifikasi ? 'Data demo — hasil penilaian mandiri sesuai bukti dukung yang diperiksa TP UKS/M Kecamatan.' : null,
          verifiedAt: sudahVerifikasi ? new Date() : null,
          pernyataanVerifikasi: sudahVerifikasi,
        },
      });
      const jawabanBaru = prisma.jawabanPenilaian.createMany({
        data: indikator.map((i) => ({
          penilaianId: pen.id, indikatorId: i.id,
          nilaiMandiri: nilaiMap[i.id],
          nilaiVerifikasi: sudahVerifikasi ? nilaiMap[i.id] : null,
        })),
      });
      await jawabanBaru;
      const komponenDipakai = [...new Set(indikator.map((i) => i.komponenId))];
      if (sudahVerifikasi) {
        // hasil verifikasi yang sudah final: seluruh komponen tercatat dinilai
        await prisma.verifikasiKomponen.createMany({
          data: komponenDipakai.map((komponenId) => ({ penilaianId: pen.id, komponenId, namaPenilai: `Koordinator TP UKS/M Kecamatan ${s.kec} (Demo)`, pernyataanFakta: true })),
        });
      } else if (s.username === 'demo_smp_verifikasi') {
        // sedang dinilai tim kecamatan: komponen A & B selesai, C & D belum
        for (const kode of ['A', 'B']) {
          const k = kompByKode[kode]; const u = penilaiKec[kode];
          if (k && u) await prisma.verifikasiKomponen.create({ data: { penilaianId: pen.id, komponenId: k.id, userId: u.id, namaPenilai: u.nama, pernyataanFakta: true, catatan: 'Data demo — komponen selesai dinilai.' } });
        }
      }
    }

    // ---- Rekomendasi kecamatan ----
    if (t >= urut('DIREKOMENDASIKAN')) {
      await prisma.rekomendasi.create({
        data: {
          satuanId: satuan.id, kecamatanId: kec.id, periodeId: periodeAktif.id,
          peringkat: 1, catatan: 'Data demo — direkomendasikan mengikuti Seleksi Penghargaan tingkat kabupaten.',
          direkomendasikanOleh: `TP UKS/M Kecamatan ${s.kec} (Demo)`,
        },
      });
    }

    // ---- Eviden ----
    if (t >= urut('PENGISIAN_EVIDEN')) {
      // Eviden diminta untuk SELURUH indikator (sesuai gerbang pengajuan), bukan
      // hanya indikator yang terpenuhi — agar alur peragaan tidak buntu.
      const sebagian = t === urut('PENGISIAN_EVIDEN');
      const dipakai = sebagian ? indikator.slice(0, Math.ceil(indikator.length / 2)) : indikator;
      const statusEviden = t >= urut('REVIEW_EVIDEN') ? 'DIAJUKAN' : 'DRAFT';
      const statusReview = t >= urut('EVIDEN_DISETUJUI') ? 'DISETUJUI' : 'BELUM_DIREVIEW';
      const adaSkorSeleksi = t >= urut('SELEKSI_ADMINISTRASI');
      const adaSkorLapangan = t >= urut('KUNJUNGAN_LAPANGAN');

      const eviden = await prisma.eviden.create({
        data: {
          satuanId: satuan.id, status: statusEviden,
          submittedAt: statusEviden === 'DIAJUKAN' ? new Date() : null,
          pernyataanSeleksi: adaSkorSeleksi,
        },
      });
      let totalSkor = 0;
      for (let k = 0; k < dipakai.length; k++) {
        const ind = dipakai[k];
        const skor = adaSkorSeleksi ? [2, 3, 3, 2, 3][k % 5] : null;
        if (skor != null) totalSkor += skor;
        const item = await prisma.evidenItem.create({
          data: {
            evidenId: eviden.id, indikatorId: ind.id,
            deskripsi: `Data demo — bukti dukung indikator ${ind.kode} tersedia dan dapat ditelusuri.`,
            fileUrl: TAUTAN_CONTOH,
            statusReview,
            catatanReview: statusReview === 'DISETUJUI' ? 'Sesuai.' : null,
            reviewerId: statusReview === 'DISETUJUI' ? 'demo' : null,
            reviewedAt: statusReview === 'DISETUJUI' ? new Date() : null,
            skor,
            skorLapangan: adaSkorLapangan ? Math.max(1, (skor ?? 2) - (k % 4 === 0 ? 1 : 0)) : null,
            catatanLapangan: adaSkorLapangan && k % 4 === 0 ? 'Data demo — bukti fisik ditemukan sebagian.' : null,
          },
        });
        // Lampiran: tautan + (pada sebagian indikator) tautan kedua, memperagakan multi-berkas
        await prisma.evidenBerkas.create({
          data: { itemId: item.id, jenis: 'TAUTAN', fileUrl: TAUTAN_CONTOH, fileName: `Bukti ${ind.kode}`, diunggahOleh: `Operator ${s.nama}` },
        });
        if (k % 3 === 0) {
          await prisma.evidenBerkas.create({
            data: { itemId: item.id, jenis: 'TAUTAN', fileUrl: `${TAUTAN_CONTOH}/dokumentasi`, fileName: `Dokumentasi foto ${ind.kode}`, diunggahOleh: `Operator ${s.nama}` },
          });
        }
      }
      if (adaSkorSeleksi && dipakai.length) {
        const skorSeleksi = Math.round((totalSkor / dipakai.length) * 100) / 100;
        await prisma.eviden.update({
          where: { id: eviden.id },
          data: { skorSeleksi, lolosSeleksi: true },
        });
      }
    }

    // ---- Sertifikat Strata ----
    if (t >= urut('BERSERTIFIKAT')) {
      await prisma.sertifikat.create({
        data: {
          satuanId: satuan.id, nomor: `SRT/UKSM-BKS/DEMO/${s.npsn.slice(-4)}`,
          strata: hasilHitung?.strata || null, periodeId: periodeAktif.id,
          diterbitkanOleh: 'Tim Stratifikasi UKS/M Kabupaten Bekasi (Demo)',
        },
      });
    }

    // ---- Pendaftaran Seleksi Penghargaan ----
    if (t >= urut('TERDAFTAR_SELEKSI')) {
      await prisma.pendaftaranSeleksi.create({
        data: {
          satuanId: satuan.id, kecamatanId: kec.id,
          nomorDaftar: `SEL/UKSM-BKS/DEMO/${s.npsn.slice(-4)}`, periodeId: periodeAktif.id,
          didaftarkanOleh: `TP UKS/M Kecamatan ${s.kec} (Demo)`,
          catatan: 'Data demo — peserta Seleksi Penghargaan tingkat kabupaten.',
        },
      });
    }

    // ---- Kunjungan lapangan ----
    if (t >= urut('KUNJUNGAN_LAPANGAN')) {
      const selesai = t >= urut('FINAL');
      await prisma.kunjunganLapangan.create({
        data: {
          satuanId: satuan.id, tanggal: new Date(),
          petugas: 'Tim Penilai Kabupaten (Demo)',
          temuan: selesai
            ? 'Data demo — seluruh komponen tervalidasi di lapangan; sarana UKS/M lengkap dan berfungsi.'
            : 'Data demo — jadwal peninjauan lapangan telah ditetapkan.',
          selesai,
          disubmitOleh: selesai ? 'Dr. Hendra Wijaya, M.Kes (Koordinator Tim Kabupaten)' : null,
          disubmitPada: selesai ? new Date() : null,
          pernyataanFakta: selesai,
          latitude: selesai ? -6.2611 : null,
          longitude: selesai ? 107.1523 : null,
          terkunci: selesai,
        },
      });
    }

    // ---- Hasil final ----
    if (t >= urut('FINAL')) {
      finalUntukSk.push({ satuanId: satuan.id, strata: hasilHitung?.strata || 'DASAR' });
    }

    // ---- Riwayat juara ----
    if (s.juaraAktif) {
      await prisma.riwayatJuara.create({
        data: { satuanId: satuan.id, periodeId: periodeAktif.id, tahun: periodeAktif.tahun, peringkat: s.juaraAktif, strata: hasilHitung?.strata || null },
      });
    }
    if (s.juaraLalu) {
      await prisma.riwayatJuara.create({
        data: { satuanId: satuan.id, periodeId: periodeLalu.id, tahun: periodeLalu.tahun, peringkat: s.juaraLalu, strata: 'PARIPURNA' },
      });
    }

    ringkas.push({ username: s.username, nama: s.nama, jenjang: s.jenjang, tahap: s.tahap, strata: hasilHitung?.strata || '—' });
  }
  console.log(`   ✓ ${SEKOLAH.length} akun satuan pendidikan (satu untuk tiap tahap alur)`);

  // --- SK Bupati + hasil final ---
  if (finalUntukSk.length) {
    const sk = await prisma.sKBupati.create({
      data: {
        nomor: `SK/BUPATI-BKS/UKSM/DEMO/${periodeAktif.tahun}`, tahun: periodeAktif.tahun,
        periodeId: periodeAktif.id, catatan: 'Data demo — penetapan peraih penghargaan Stratifikasi UKS/M.',
      },
    });
    for (let i = 0; i < finalUntukSk.length; i++) {
      const f = finalUntukSk[i];
      await prisma.hasilFinal.create({
        data: {
          satuanId: f.satuanId, skorFinal: 92.5 - i * 3, strataFinal: f.strata,
          peraih: true, peringkat: i + 1, periodeId: periodeAktif.id, skId: sk.id,
        },
      });
    }
    console.log(`   ✓ SK Bupati demo + ${finalUntukSk.length} hasil final`);
  }

  // --- Contoh Informasi & Berita (menu baru) ---
  await prisma.berita.create({
    data: {
      judul: 'Cara Menggunakan SIMITRA untuk Stratifikasi UKS/M',
      kategori: 'INFORMASI', disematkan: true, terbit: true, terbitPada: new Date(), penulis: PENULIS_DEMO,
      ringkasan: 'Contoh informasi dari akun demo — ringkasan alur penggunaan SIMITRA bagi sekolah, TP Kecamatan, dan Tim Kabupaten.',
      isi: [
        'Ini adalah contoh informasi yang dibuat bersama akun demo untuk memperlihatkan tampilan menu Informasi & Berita. Admin Kabupaten dapat menyunting atau menghapusnya, dan informasi ini ikut terhapus saat akun demo dibersihkan.',
        'Satuan pendidikan mendaftar, melengkapi profil beserta puskesmas binaannya, lalu mengisi penilaian mandiri. Setiap penilaian dikirim dengan pernyataan bahwa isian sesuai fakta di lapangan.',
        'Tim Penilai Kecamatan memverifikasi penilaian per komponen: setiap penilai menilai komponen yang ditugaskan kepadanya, kemudian koordinator kecamatan memfinalkan strata dan mengirimkannya ke sekolah.',
        'Sekolah dengan strata minimal Madya dapat direkomendasikan untuk sertifikasi strata, mengisi eviden, lalu mengikuti seleksi penghargaan hingga penetapan SK Bupati.',
      ].join('\n\n'),
    },
  });
  console.log('   ✓ 1 contoh Informasi & Berita');

  // --- Ringkasan ---
  const baris = (a, b, c) => `   ${a.padEnd(24)} ${b.padEnd(12)} ${c}`;
  console.log(`\n📋 AKUN DEMO — kata sandi seluruh akun: ${SANDI}\n`);
  console.log('   TIM KABUPATEN');
  console.log(baris('USERNAME', 'AKSES', 'KETERANGAN'));
  for (const a of KABUPATEN) {
    const akses = a.isAdmin ? 'Koordinator' : ((a.komponen && a.komponen.length) ? `Komponen ${a.komponen.join('+')}` : 'Belum ada');
    console.log(baris(a.username, akses, a.nama));
  }
  console.log('\n   TP UKS/M KECAMATAN');
  for (const n of KECAMATAN_DEMO) console.log(baris(AWALAN + 'kec_' + n.toLowerCase().replace(/\s+/g, ''), 'Koordinator', n));
  for (const a of PENILAI_KECAMATAN) console.log(baris(a.username, `Komponen ${a.komponen.join('+')}`, a.kec));
  console.log('\n   SATUAN PENDIDIKAN');
  console.log(baris('USERNAME', 'JENJANG', 'TAHAP / STRATA — NAMA'));
  for (const r of ringkas) console.log(baris(r.username, r.jenjang, `${r.tahap} / ${r.strata} — ${r.nama}`));
  console.log(`\n   Catatan: ${AWALAN}sd_juara pernah Juara 1 (${periodeLalu.nama}) → penilaian mandiri diblokir.`);
  console.log(`   Hapus kembali dengan: node prisma/akun-demo.mjs --bersihkan\n`);
  console.log('✅ Selesai.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
