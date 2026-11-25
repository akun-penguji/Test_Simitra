// Import referensi sekolah Dapodik tanpa menghapus data lain (aman di produksi).
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
const KEC_ALIAS = { bojongmanggu: 'bojongmangu' };

async function main() {
  let REF = [];
  try { REF = JSON.parse(readFileSync(path.join(__dirname, 'data/sekolah-referensi.json'), 'utf8')); }
  catch (e) { console.log('File referensi tidak ada, lewati.'); return; }

  const kecs = await prisma.kecamatan.findMany();
  const kecMap = {};
  for (const k of kecs) kecMap[norm(k.nama)] = k.id;

  let baru = 0, diperbarui = 0;
  const tanpaKecamatan = new Set();
  for (const s of REF) {
    const kunciKec = norm(s.kecamatan);
    const kecId = kecMap[kunciKec] || kecMap[KEC_ALIAS[kunciKec]] || null;
    if (s.kecamatan && !kecId) tanpaKecamatan.add(s.kecamatan);

    // Jumlah peserta didik & rombel hanya ditimpa bila berkas sumber memuatnya,
    // supaya data yang sudah ada tidak terhapus oleh berkas yang tak punya kolom itu.
    const isi = { nama: s.nama, bp: s.bp || null, status: s.status || null };
    // Kecamatan hanya ditulis bila dikenali: baris yang sumbernya tak memuat
    // kecamatan (mis. daftar SMA/SMK) tidak boleh mengosongkan yang sudah ada.
    if (kecId) isi.kecamatanId = kecId;
    if (s.nsm) isi.nsm = s.nsm;
    if (s.alamat) isi.alamat = s.alamat;
    if (s.sumber) isi.sumber = s.sumber;
    if (s.pd != null) isi.jmlSiswa = s.pd;
    if (s.rombel != null) isi.rombel = s.rombel;

    const ada = await prisma.sekolahReferensi.findUnique({ where: { npsn: s.npsn }, select: { id: true } });
    if (ada) { await prisma.sekolahReferensi.update({ where: { npsn: s.npsn }, data: isi }); diperbarui++; }
    else { await prisma.sekolahReferensi.create({ data: { npsn: s.npsn, ...isi } }); baru++; }
  }
  const total = await prisma.sekolahReferensi.count();
  console.log(`✓ referensi sekolah: ${baru} baru, ${diperbarui} diperbarui (berkas ${baru + diperbarui} baris, tabel ${total} sekolah).`);
  if (tanpaKecamatan.size) {
    console.log(`⚠️  ${tanpaKecamatan.size} nama kecamatan tidak dikenali: ${[...tanpaKecamatan].join(', ')}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
