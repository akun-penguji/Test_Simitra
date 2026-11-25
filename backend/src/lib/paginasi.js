// Paginasi seragam untuk seluruh endpoint yang mengembalikan daftar.
//
// Kontrak: GET ...?page=1&pageSize=25
// Balasan: { data, total, page, pageSize, totalPages }
//
// Daftar yang JUMLAHNYA TUMBUH (satuan pendidikan, riwayat, notifikasi, jejak
// audit) wajib dipaginasi. Daftar acuan yang jumlahnya tetap dan dipakai untuk
// mengisi pilihan (kecamatan, puskesmas, komponen, periode, instrumen), titik
// peta, dan ekspor CSV sengaja dikembalikan utuh.

export function paging(req, { bawaan = 25, maks = 200 } = {}) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(maks, Math.max(1, parseInt(req.query.pageSize, 10) || bawaan));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export const halaman = (data, total, page, pageSize) => ({
  data, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

// Pemanggil yang memang memerlukan seluruh baris (rekapitulasi/agregasi
// dasbor) harus menyatakannya secara tegas dengan ?semua=1.
export const mintaSemua = (req) => req.query.semua === '1' || req.query.semua === 'true';
