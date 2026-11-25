import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { PUSKESMAS } from './data/puskesmas.js';

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INSTRUMEN = JSON.parse(readFileSync(path.join(__dirname, 'data/instrumen.json'), 'utf8'));
let REFERENSI = [];
try { REFERENSI = JSON.parse(readFileSync(path.join(__dirname, 'data/sekolah-referensi.json'), 'utf8')); } catch (_) {}

// Komponen standar A-D (urutan sesuai instrumen)
// Nama komponen diambil langsung dari berkas instrumen resmi (data/instrumen.json)
// sehingga perubahan instrumen tidak perlu menyunting kode.
const KOMPONEN = (INSTRUMEN.SD || INSTRUMEN.TK).map((k, i) => ({
  kode: String.fromCharCode(65 + i), nama: k.nama,
}));

const KECAMATAN = [
  'Cikarang Utara', 'Cikarang Selatan', 'Cikarang Barat', 'Cikarang Timur', 'Cikarang Pusat',
  'Tambun Selatan', 'Tambun Utara', 'Cibitung', 'Setu', 'Serang Baru',
  'Cibarusah', 'Bojongmangu', 'Kedungwaringin', 'Pebayuran', 'Cabangbungin',
  'Sukatani', 'Sukawangi', 'Tambelang', 'Karangbahagia', 'Sukakarya',
  'Babelan', 'Tarumajaya', 'Muaragembong',
];

const norm = (s) => s.toLowerCase().replace(/\s+/g, '');
const KEC_ALIAS = { bojongmanggu: 'bojongmangu' };

async function main() {
  console.log('🌱 Seeding UKS/M Stratifikasi Kabupaten Bekasi (data asli)...');

  // Reset data transaksional
  await prisma.hasilFinal.deleteMany();
  await prisma.sKBupati.deleteMany();
  await prisma.kunjunganLapangan.deleteMany();
  await prisma.pendaftaranSeleksi.deleteMany();
  await prisma.sertifikat.deleteMany();
  await prisma.evidenItem.deleteMany();
  await prisma.eviden.deleteMany();
  await prisma.rekomendasi.deleteMany();
  await prisma.jawabanPenilaian.deleteMany();
  await prisma.penilaian.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.satuanPendidikan.updateMany({ data: { tahap: 'REGISTRASI' } });
  console.log('   ✓ reset data transaksional');

  // --- Kecamatan ---
  const kecMap = {};
  for (let i = 0; i < KECAMATAN.length; i++) {
    const k = await prisma.kecamatan.upsert({
      where: { nama: KECAMATAN[i] },
      update: {},
      create: { nama: KECAMATAN[i], kode: String(i + 1).padStart(2, '0') },
    });
    kecMap[KECAMATAN[i]] = k.id;
    kecMap[norm(KECAMATAN[i])] = k.id;
  }
  console.log(`   ✓ ${KECAMATAN.length} kecamatan`);

  // --- Periode aktif default ---
  const tahun = 2026;
  const existPeriode = await prisma.periode.findFirst({ where: { aktif: true } });
  if (!existPeriode) {
    await prisma.periode.upsert({
      where: { nama: `Stratifikasi UKS/M ${tahun}` },
      update: { aktif: true },
      create: { nama: `Stratifikasi UKS/M ${tahun}`, tahun, aktif: true, keterangan: 'Periode aktif' },
    });
  }
  console.log('   ✓ periode aktif');

  // --- Puskesmas (data asli) ---
  let puskCount = 0;
  const puskMap = {};
  for (const [kecNama, puskNama] of PUSKESMAS) {
    let kecId = kecMap[norm(kecNama)] || kecMap[KEC_ALIAS[norm(kecNama)]];
    const p = await prisma.puskesmas.upsert({
      where: { nama: puskNama },
      update: { kecamatanId: kecId || null },
      create: { nama: puskNama, kecamatanId: kecId || null },
    });
    puskMap[puskNama] = p.id;
    puskCount++;
  }
  console.log(`   ✓ ${puskCount} puskesmas binaan`);

  // --- Referensi sekolah Dapodik ---
  let refCount = 0;
  for (const s of REFERENSI) {
    const kecId = kecMap[norm(s.kecamatan)] || kecMap[KEC_ALIAS[norm(s.kecamatan)]] || null;
    await prisma.sekolahReferensi.upsert({
      where: { npsn: s.npsn },
      update: { nama: s.nama, bp: s.bp || null, status: s.status || null, kecamatanId: kecId, jmlSiswa: s.pd ?? null, rombel: s.rombel ?? null },
      create: { npsn: s.npsn, nama: s.nama, bp: s.bp || null, status: s.status || null, kecamatanId: kecId, jmlSiswa: s.pd ?? null, rombel: s.rombel ?? null },
    });
    refCount++;
  }
  if (refCount) console.log(`   ✓ ${refCount} referensi sekolah (Dapodik)`);

  // --- Komponen ---
  const kompMap = {};
  for (let i = 0; i < KOMPONEN.length; i++) {
    const k = await prisma.komponen.upsert({
      where: { kode: KOMPONEN[i].kode },
      update: { nama: KOMPONEN[i].nama, urutan: i },
      create: { kode: KOMPONEN[i].kode, nama: KOMPONEN[i].nama, urutan: i },
    });
    kompMap[KOMPONEN[i].kode] = k.id;
  }

  // --- Indikator per jenjang (data asli) ---
  // Hapus indikator lama agar bersih dari template sebelumnya
  await prisma.jawabanPenilaian.deleteMany();
  await prisma.evidenItem.deleteMany();
  await prisma.indikator.deleteMany();

  let totalInd = 0;
  const perJenjang = {};
  for (const jenjang of ['TK', 'SD', 'SMP', 'SMA']) {
    const komps = INSTRUMEN[jenjang];
    let n = 0;
    for (let ci = 0; ci < komps.length; ci++) {
      const kompKode = KOMPONEN[ci].kode;
      const komponenId = kompMap[kompKode];
      for (const ind of komps[ci].indikator) {
        const kode = `${jenjang}-${kompKode}-${ind.no}`;
        await prisma.indikator.create({
          data: {
            kode, jenjang, komponenId,
            strata: ind.strata,
            pertanyaan: ind.teks,
            bentukEviden: ind.eviden || null,
            urutan: n++,
            bobot: 1,
          },
        });
        totalInd++;
      }
    }
    perJenjang[jenjang] = n;
  }
  console.log(`   ✓ ${totalInd} indikator (${JSON.stringify(perJenjang)})`);

  // --- Users ---
  const hash = (p) => bcrypt.hashSync(p, 10);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { isAdmin: true },
    create: { username: 'admin', password: hash('admin123'), nama: 'Admin/Koordinator Stratifikasi Kabupaten', email: 'kabupaten@uksm-bekasi.id', role: 'TIM_KABUPATEN', isAdmin: true },
  });
  // Petugas Tim Kabupaten (bukan admin) — hanya menu operasional
  await prisma.user.upsert({
    where: { username: 'petugas_kab' },
    update: {},
    create: { username: 'petugas_kab', password: hash('petugas123'), nama: 'Petugas Tim Stratifikasi Kabupaten', email: 'petugas@uksm-bekasi.id', role: 'TIM_KABUPATEN', isAdmin: false },
  });
  const kecAkun = ['Cikarang Utara', 'Tambun Selatan', 'Cibitung'];
  for (const nama of kecAkun) {
    const uname = 'kec_' + nama.toLowerCase().replace(/\s+/g, '');
    await prisma.user.upsert({
      where: { username: uname },
      update: {},
      // akun bawaan kecamatan = koordinator (dapat memfinalkan verifikasi & menambah penilai komponen)
      create: { username: uname, password: hash('kecamatan123'), nama: `TP UKS/M Kecamatan ${nama}`, email: `${uname}@uksm-bekasi.id`, role: 'TP_KECAMATAN', kecamatanId: kecMap[nama], isAdmin: true },
    });
  }
  console.log(`   ✓ 1 admin + 1 petugas kabupaten + ${kecAkun.length} akun kecamatan`);

  const demoUser = await prisma.user.upsert({
    where: { username: 'sekolah_demo' },
    update: {},
    create: { username: 'sekolah_demo', password: hash('sekolah123'), nama: 'Operator SDN Demo', email: 'demo@sekolah.id', role: 'SATUAN_PENDIDIKAN' },
  });
  const existSatuan = await prisma.satuanPendidikan.findUnique({ where: { userId: demoUser.id } });
  if (!existSatuan) {
    await prisma.satuanPendidikan.create({
      data: {
        userId: demoUser.id, nama: 'SDN Cikarang Utara 01', npsn: '20250001', jenjang: 'SD',
        kecamatanId: kecMap['Cikarang Utara'], puskesmasId: puskMap['Cikarang'],
        alamat: 'Jl. Raya Industri No. 1, Cikarang Utara', kepalaSekolah: 'Dra. Siti Aminah',
        pembinaUks: 'Budi Santoso, S.Pd', jumlahSiswa: 480, jumlahGuru: 24,
        telepon: '021-8900001', emailSekolah: 'sdn.cikut01@sekolah.id', profilLengkap: true, tahap: 'REGISTRASI',
      },
    });
  }
  console.log('   ✓ 1 sekolah demo');

  console.log('\n✅ Seed selesai.\n   • Kabupaten: admin/admin123  • Kecamatan: kec_cikarangutara/kecamatan123  • Sekolah: sekolah_demo/sekolah123');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
