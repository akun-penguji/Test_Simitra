// Memuat rekap Dapodik per kecamatan (data/rekap-dapodik-bekasi.json) sebagai
// acuan jumlah sekolah sebenarnya di tiap kecamatan.
//   node prisma/import-rekap-dapodik.mjs
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();
const DIR = path.dirname(fileURLToPath(import.meta.url));
const rekap = JSON.parse(readFileSync(path.join(DIR, 'data/rekap-dapodik-bekasi.json'), 'utf8'));

// nama di Dapodik vs nama di basis data disamakan tanpa spasi/kapital
const kunci = (s) => String(s).toLowerCase().replace(/^kec\.?\s*/, '').replace(/[^a-z]/g, '');

const kecamatan = await prisma.kecamatan.findMany();
const peta = new Map(kecamatan.map((k) => [kunci(k.nama), k]));
const tanggal = new Date(rekap.dataPer);

let cocok = 0; const tidakCocok = [];
for (const d of rekap.kecamatan) {
  const k = peta.get(kunci(d.kecamatan));
  if (!k) { tidakCocok.push(d.kecamatan); continue; }
  await prisma.kecamatan.update({
    where: { id: k.id },
    data: { sekolahDapodik: d.sekolah, pesertaDidik: d.pesertaDidik, gtk: d.gtk, dapodikPer: tanggal },
  });
  cocok++;
}
console.log(`✅ ${cocok}/${rekap.kecamatan.length} kecamatan diperbarui — total ${rekap.totalSekolah.toLocaleString('id-ID')} sekolah (data ${rekap.dataPer})`);
if (tidakCocok.length) console.log('   ⚠️  tak ditemukan di basis data:', tidakCocok.join(', '));
const belum = kecamatan.filter((k) => !peta.has(kunci(k.nama)) === false && !rekap.kecamatan.some((d) => kunci(d.kecamatan) === kunci(k.nama)));
if (belum.length) console.log('   ⚠️  kecamatan tanpa acuan Dapodik:', belum.map((k) => k.nama).join(', '));
await prisma.$disconnect();
