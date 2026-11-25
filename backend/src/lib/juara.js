// Daftar peraih penghargaan Stratifikasi UKS/M Kabupaten Bekasi (sumber: berkas
// "Daftar Sekolah Penghargaan Stratifikasi UKSM" dari Bagian Kesra).
// Dipakai untuk aturan notulen: sekolah peraih Peringkat I/II/III tidak
// diperkenankan mengikuti penilaian mandiri kembali.
import { prisma } from './prisma.js';

export const KECAMATAN_BEKASI = [
  'Cikarang Utara', 'Cikarang Selatan', 'Cikarang Barat', 'Cikarang Timur', 'Cikarang Pusat',
  'Tambun Selatan', 'Tambun Utara', 'Cibitung', 'Setu', 'Serang Baru',
  'Cibarusah', 'Bojongmangu', 'Kedungwaringin', 'Pebayuran', 'Cabangbungin',
  'Sukatani', 'Sukawangi', 'Tambelang', 'Karangbahagia', 'Sukakarya',
  'Babelan', 'Tarumajaya', 'Muaragembong',
];

// Penyeragaman penulisan agar "SD NEGERI X" = "SDN X", tanda baca diabaikan.
function seragam(nama) {
  let s = String(nama || '').toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, ' ');
  s = s.replace(/\bsekolah dasar\b/g, 'sd');
  s = s.replace(/\b(sd|smp|sma|smk|tk|mi|mts|ma|ra|kb|sdit|smpit|smait)\s+negeri\b/g, '$1n');
  s = s.replace(/\bnegeri\b/g, 'n');
  return s.replace(/\s+/g, ' ').trim();
}

// Membuang nama kecamatan yang menempel di AKHIR nama sekolah (pola berkas Kesra):
// "SDN CIBUNTU 01 CIBITUNG" → "SDN CIBUNTU 01". Kecamatan di tengah nama dibiarkan
// agar sekolah seperti "SDN SETU 01" tidak kehilangan identitasnya.
export function pisahKecamatan(nama) {
  const s = seragam(nama);
  for (const k of [...KECAMATAN_BEKASI].sort((a, b) => b.length - a.length)) {
    const pola = new RegExp(`\\s*${seragam(k).replace(/\s+/g, '\\s*')}\\s*$`);
    if (pola.test(s)) return { inti: s.replace(pola, '').trim(), kecamatan: k };
  }
  return { inti: s, kecamatan: null };
}

// Kunci pencocokan: tanpa spasi & tanpa kecamatan di akhir nama.
export const kunciNama = (nama) => pisahKecamatan(nama).inti.replace(/[^a-z0-9]/g, '');
// Kunci alternatif: nama utuh (untuk sekolah yang memang memuat nama kecamatan)
export const kunciUtuh = (nama) => seragam(nama).replace(/[^a-z0-9]/g, '');

// Mencari baris peraih penghargaan untuk sebuah satuan pendidikan.
// Urutan: tautan manual/tersimpan → kecocokan nama (wajib sekecamatan bila
// kedua data memiliki kecamatan) → null.
export async function cariPeraih(satuan) {
  if (!satuan) return [];
  const tertaut = await prisma.peraihPenghargaan.findMany({
    where: { satuanId: satuan.id }, orderBy: [{ tahun: 'desc' }, { peringkat: 'asc' }],
  });
  if (tertaut.length) return tertaut;

  const kunci = [...new Set([kunciNama(satuan.nama), kunciUtuh(satuan.nama)])].filter((k) => k.length >= 5);
  if (!kunci.length) return [];
  const calon = await prisma.peraihPenghargaan.findMany({
    where: { namaKunci: { in: kunci }, satuanId: null },
    orderBy: [{ tahun: 'desc' }, { peringkat: 'asc' }],
  });
  // Bila keduanya mencantumkan kecamatan, kecamatannya harus sama.
  return calon.filter((c) => !c.kecamatanId || !satuan.kecamatanId || c.kecamatanId === satuan.kecamatanId);
}

// Menyimpan tautan hasil pencocokan agar tidak dihitung ulang & dapat ditinjau admin.
export async function tautkanPeraih(satuanId, barisIds) {
  if (!satuanId || !barisIds?.length) return 0;
  const r = await prisma.peraihPenghargaan.updateMany({
    where: { id: { in: barisIds }, satuanId: null }, data: { satuanId },
  });
  return r.count;
}
