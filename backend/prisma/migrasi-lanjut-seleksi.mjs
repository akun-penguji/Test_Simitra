// Memajukan sekolah yang "nyangkut" di Review Eviden ke Seleksi Administrasi.
//
// Temuan rapat akhir Okt 2026: setelah seluruh indikator disetujui, sekolah tidak
// turun ke Seleksi Administrasi. Alur baru memajukannya otomatis (lib/alur.js);
// skrip ini menyusul sekolah yang SUDAH terlanjur menggantung sebelum perbaikan.
//
//   node prisma/migrasi-lanjut-seleksi.mjs --uji   # hanya melaporkan
//   node prisma/migrasi-lanjut-seleksi.mjs         # menerapkan
//
// Idempoten: sekolah yang sudah lanjut tidak disentuh lagi.
import { prisma } from '../src/lib/prisma.js';
import { lanjutkanKeSeleksi, semuaEvidenDisetujui, TAHAP_SEBELUM_SELEKSI } from '../src/lib/alur.js';

const uji = process.argv.includes('--uji');
const kandidat = await prisma.satuanPendidikan.findMany({
  where: { tahap: { in: TAHAP_SEBELUM_SELEKSI } },
  select: { id: true, nama: true, tahap: true }, orderBy: { nama: 'asc' },
});
console.log(`${kandidat.length} sekolah di tahap sebelum seleksi diperiksa${uji ? ' (MODE UJI — tidak mengubah apa pun)' : ''}`);
let maju = 0;
for (const s of kandidat) {
  if (!(await semuaEvidenDisetujui(s.id))) continue;
  if (uji) { console.log(`  akan dimajukan: ${s.nama} (${s.tahap})`); maju++; continue; }
  const hasil = await lanjutkanKeSeleksi(s.id, 'Migrasi rapat akhir Okt 2026');
  if (hasil.dilanjutkan) { console.log(`  ✓ ${s.nama}: ${s.tahap} → TERDAFTAR_SELEKSI (${hasil.nomorDaftar})`); maju++; }
}
console.log(`${uji ? 'Akan dimajukan' : 'Dimajukan'}: ${maju} sekolah`);
await prisma.$disconnect();
