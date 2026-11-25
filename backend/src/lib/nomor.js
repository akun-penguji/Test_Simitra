// Penomoran surat SIMITRA — polanya dikelola Admin Tim Stratifikasi lewat menu
// Pengaturan Nomor Surat, sehingga tidak lagi dipaku di dalam kode.
import { prisma } from './prisma.js';

const ROMAWI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// Jenis dokumen yang penomorannya dapat diatur, beserta pola bawaannya.
export const JENIS_NOMOR = [
  {
    jenis: 'SERTIFIKAT',
    nama: 'Sertifikat Kepesertaan Seleksi Penghargaan Stratifikasi UKS/M',
    pola: 'SRT/UKSM-BKS/{tahun}/{urut}',
    digit: 4,
  },
  {
    jenis: 'PENDAFTARAN_SELEKSI',
    nama: 'Nomor Pendaftaran Peserta Seleksi Penghargaan',
    pola: 'DAFTAR/{bulanRomawi}/{tahun}/{urut}',
    digit: 4,
  },
];

export const PENANDA = ['{tahun}', '{bulan}', '{bulanRomawi}', '{urut}'];

// Mengisi pengaturan bawaan bila belum ada (idempoten, aman dipanggil berulang).
// (SK Bupati dibuat di luar sistem sejak rapat akhir Okt 2026 — pengaturan lamanya,
// bila ada di basis data, dibiarkan tersimpan tetapi tidak ditampilkan.)
export async function pastikanPengaturanNomor() {
  for (const d of JENIS_NOMOR) {
    await prisma.pengaturanNomor.upsert({
      where: { jenis: d.jenis },
      // hanya LABEL yang disegarkan; pola/urutan yang sudah diatur admin tidak disentuh
      update: { nama: d.nama },
      create: { jenis: d.jenis, nama: d.nama, pola: d.pola, digit: d.digit, urutMulai: 1 },
    });
  }
  return prisma.pengaturanNomor.findMany({ orderBy: { nama: 'asc' } });
}

// Mengganti penanda pada pola menjadi nilai sebenarnya.
export function renderNomor(pola, { urut = 1, digit = 4, tanggal = new Date() } = {}) {
  const bulan = tanggal.getMonth();
  return String(pola || '')
    .replace(/\{tahun\}/g, String(tanggal.getFullYear()))
    .replace(/\{bulan\}/g, String(bulan + 1).padStart(2, '0'))
    .replace(/\{bulanRomawi\}/g, ROMAWI[bulan])
    .replace(/\{urut\}/g, String(urut).padStart(Math.max(1, Number(digit) || 1), '0'));
}

// Nomor berurutan dari POLA yang diketik admin saat generate sertifikat (rapat final Okt 2026).
// Pola wajib memuat {urut}; urutan dimulai dari 1 dan naik sampai menemukan nomor yang belum terpakai.
export async function nomorDariPola(pola, { tanggal = new Date(), digit = 3, mulai = 1, cekTerpakai = null } = {}) {
  let urut = Math.max(1, mulai);
  for (let i = 0; i < 5000; i++) {
    const nomor = renderNomor(pola, { urut, digit, tanggal });
    if (!cekTerpakai || !(await cekTerpakai(nomor))) return { nomor, urut };
    urut++;
  }
  throw new Error('Tidak menemukan nomor sertifikat yang masih kosong');
}

// Nomor berikutnya untuk satu jenis dokumen. `sudahAda` = jumlah dokumen yang
// telah terbit, dipakai sebagai dasar urutan; bila nomor hasil render sudah
// terpakai, urutan dinaikkan sampai menemukan yang bebas.
export async function nomorBerikut(jenis, { sudahAda = 0, cekTerpakai = null } = {}) {
  const bawaan = JENIS_NOMOR.find((d) => d.jenis === jenis);
  let set = await prisma.pengaturanNomor.findUnique({ where: { jenis } });
  if (!set && bawaan) {
    set = await prisma.pengaturanNomor.create({
      data: { jenis, nama: bawaan.nama, pola: bawaan.pola, digit: bawaan.digit, urutMulai: 1 },
    });
  }
  const pola = set?.pola || bawaan?.pola || '{tahun}/{urut}';
  const digit = set?.digit ?? bawaan?.digit ?? 4;
  const mulai = set?.urutMulai ?? 1;

  let urut = Math.max(mulai, mulai + sudahAda);
  for (let i = 0; i < 1000; i++) {
    const nomor = renderNomor(pola, { urut, digit });
    if (!cekTerpakai || !(await cekTerpakai(nomor))) return nomor;
    urut++;
  }
  // sangat tidak mungkin tercapai; penjaga agar tidak berputar tanpa henti
  return renderNomor(pola, { urut: Date.now() % 100000, digit });
}
