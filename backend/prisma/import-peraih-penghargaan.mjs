// Memuat daftar peraih penghargaan Stratifikasi UKS/M dari berkas Bagian Kesra
// (data/peraih-penghargaan.json — hasil olahan berkas Excel "Daftar Sekolah
// Penghargaan Stratifikasi UKSM"). Idempoten: baris yang sudah ada diperbarui,
// tautan ke sekolah terdaftar & pengaturan larangan TIDAK ditimpa.
//   node prisma/import-peraih-penghargaan.mjs [--uji]
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { kunciNama, cariPeraih, tautkanPeraih } from '../src/lib/juara.js';

const prisma = new PrismaClient();
const UJI = process.argv.includes('--uji');
const dir = path.dirname(fileURLToPath(import.meta.url));
const SUMBER = 'Berkas Bagian Kesra: Daftar Sekolah Penghargaan Stratifikasi UKS/M';
const data = JSON.parse(readFileSync(path.join(dir, 'data/peraih-penghargaan.json'), 'utf8'));

const kecamatan = await prisma.kecamatan.findMany({ select: { id: true, nama: true } });
const petaKec = Object.fromEntries(kecamatan.map((k) => [k.nama.toLowerCase().replace(/\s+/g, ''), k.id]));

let baru = 0; let perbarui = 0; const tanpaKec = [];
for (const d of data) {
  const kecamatanId = d.kecamatan ? petaKec[d.kecamatan.toLowerCase().replace(/\s+/g, '')] || null : null;
  if (d.kecamatan && !kecamatanId) tanpaKec.push(`${d.nama} (${d.kecamatan})`);
  const namaKunci = d.namaKunci || kunciNama(d.nama);
  const ada = await prisma.peraihPenghargaan.findFirst({ where: { namaKunci, tahun: d.tahun, kecamatanId } });
  const isi = { nama: d.nama, namaKunci, jenjang: d.jenjang, kecamatanId, tahun: d.tahun, peringkat: d.peringkat, sumber: SUMBER };
  if (ada) { if (!UJI) await prisma.peraihPenghargaan.update({ where: { id: ada.id }, data: isi }); perbarui += 1; }
  else { if (!UJI) await prisma.peraihPenghargaan.create({ data: isi }); baru += 1; }
}
console.log(`✅ ${baru} baris baru, ${perbarui} diperbarui${UJI ? ' (uji — tidak disimpan)' : ''}.`);
if (tanpaKec.length) console.log(`   ⚠ kecamatan tidak dikenali: ${tanpaKec.join(', ')}`);

// Tautkan ke sekolah yang sudah terdaftar di aplikasi
if (!UJI) {
  const sekolah = await prisma.satuanPendidikan.findMany({ select: { id: true, nama: true, kecamatanId: true } });
  let tertaut = 0; const daftar = [];
  for (const s of sekolah) {
    const cocok = (await cariPeraih(s)).filter((c) => !c.satuanId);
    if (cocok.length) { tertaut += await tautkanPeraih(s.id, cocok.map((c) => c.id)); daftar.push(`${s.nama} → ${cocok.map((c) => `P${c.peringkat} ${c.tahun}`).join(', ')}`); }
  }
  console.log(`   ${tertaut} baris tertaut ke sekolah terdaftar${daftar.length ? ': ' + daftar.join(' · ') : ' (belum ada yang cocok)'}`);
  const total = await prisma.peraihPenghargaan.count();
  const sudah = await prisma.peraihPenghargaan.count({ where: { satuanId: { not: null } } });
  console.log(`   Total daftar peraih: ${total} · tertaut ke akun sekolah: ${sudah} · belum terdaftar di aplikasi: ${total - sudah}`);
}
await prisma.$disconnect();
