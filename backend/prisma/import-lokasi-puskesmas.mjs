// Memuat koordinat puskesmas hasil geokode OpenStreetMap (data/puskesmas-koordinat.json).
// Hanya mengisi puskesmas yang BELUM berkoordinat — lokasi yang sudah diatur manual
// oleh koordinator kecamatan/admin tidak pernah ditimpa.
//   node prisma/import-lokasi-puskesmas.mjs [--uji]
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const prisma = new PrismaClient();
const UJI = process.argv.includes('--uji');
const dir = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(path.join(dir, 'data/puskesmas-koordinat.json'), 'utf8')).filter((d) => d.lat != null);

let isi = 0; let lewat = 0; let tidakAda = 0;
for (const d of data) {
  const p = await prisma.puskesmas.findUnique({ where: { nama: d.nama } });
  if (!p) { tidakAda += 1; console.log(`   · tidak ada di basis data: ${d.nama}`); continue; }
  if (p.latitude != null) { lewat += 1; continue; }
  if (!UJI) await prisma.puskesmas.update({ where: { id: p.id }, data: { latitude: d.lat, longitude: d.lng, sumberLokasi: d.sumber } });
  isi += 1;
}
const total = await prisma.puskesmas.count();
const berkoordinat = UJI ? null : await prisma.puskesmas.count({ where: { latitude: { not: null } } });
console.log(`✅ ${isi} puskesmas diisi koordinat${UJI ? ' (uji — tidak disimpan)' : ''}, ${lewat} sudah berkoordinat (dilewati), ${tidakAda} nama tidak cocok.`);
if (berkoordinat != null) console.log(`   ${berkoordinat}/${total} puskesmas kini memiliki titik di peta.`);
await prisma.$disconnect();
