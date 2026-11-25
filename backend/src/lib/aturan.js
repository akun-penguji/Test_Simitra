// Aturan tambahan hasil notulen rapat Tim Pembina UKS/M Kabupaten Bekasi.
import { prisma } from './prisma.js';
import { cariPeraih, tautkanPeraih } from './juara.js';

// ---------------------------------------------------------------------------
// 1) Klasifikasi penilai Tim Kabupaten
// Seorang penilai kabupaten hanya berwenang menilai komponen yang ditugaskan
// kepadanya. Admin/koordinator (isAdmin) berwenang atas seluruh komponen.
// ---------------------------------------------------------------------------

// Mengembalikan Set berisi id komponen yang boleh dinilai user,
// atau null bila user berwenang atas seluruh komponen.
export async function komponenBerwenang(user) {
  if (!user) return new Set();
  if (user.isAdmin) return null; // koordinator: seluruh komponen
  const rows = await prisma.penilaiKomponen.findMany({
    where: { userId: user.id }, select: { komponenId: true },
  });
  // Penilai tanpa klasifikasi belum ditugaskan pada komponen mana pun.
  return new Set(rows.map((x) => x.komponenId));
}

// Menyaring daftar id indikator: hanya yang komponennya menjadi wewenang user.
export async function saringIndikatorBerwenang(user, indikatorIds) {
  const izin = await komponenBerwenang(user);
  if (izin === null) return { boleh: new Set(indikatorIds), izin };
  const inds = await prisma.indikator.findMany({
    where: { id: { in: [...new Set(indikatorIds)] } },
    select: { id: true, komponenId: true },
  });
  return { boleh: new Set(inds.filter((i) => izin.has(i.komponenId)).map((i) => i.id)), izin };
}

// Ringkasan klasifikasi untuk ditampilkan di antarmuka.
export async function ringkasKlasifikasi(user) {
  const koordinator = !!user.isAdmin;
  const jumlahKomponen = await prisma.komponen.count();
  if (user.isAdmin) return { seluruhKomponen: true, koordinator, jumlahKomponen, komponen: [] };
  const rows = await prisma.penilaiKomponen.findMany({
    where: { userId: user.id }, include: { komponen: true },
    orderBy: { komponen: { urutan: 'asc' } },
  });
  return {
    seluruhKomponen: false, koordinator, jumlahKomponen,
    komponen: rows.map((x) => ({ id: x.komponenId, kode: x.komponen.kode, nama: x.komponen.nama })),
  };
}

// ---------------------------------------------------------------------------
// 2) Larangan penilaian mandiri bagi peraih juara 1/2/3 tingkat kabupaten
// ---------------------------------------------------------------------------

// Mengembalikan data juara bila satuan tidak diperkenankan menilai mandiri.
// Dua sumber:
//   1. RiwayatJuara — juara yang ditetapkan aplikasi (hasil final periode lalu).
//      Periode yang sedang berjalan dikecualikan.
//   2. PeraihPenghargaan — daftar resmi penerima penghargaan dari Bagian Kesra,
//      berlaku untuk seluruh tahun pada daftar (dapat dicabut per sekolah oleh admin).
export async function cekLaranganJuara(satuanId, periodeAktifId) {
  const riwayat = await prisma.riwayatJuara.findMany({
    // Catatan: `NOT: { periodeId: X }` melewatkan baris ber-periodeId NULL
    // (NULL = X bernilai unknown di SQL) — karena itu dipakai OR eksplisit.
    where: {
      satuanId, peringkat: { lte: 3 },
      ...(periodeAktifId ? { OR: [{ periodeId: null }, { periodeId: { not: periodeAktifId } }] } : {}),
    },
    include: { periode: true },
    orderBy: [{ tahun: 'desc' }, { peringkat: 'asc' }],
  });

  const satuan = await prisma.satuanPendidikan.findUnique({
    where: { id: satuanId }, select: { id: true, nama: true, kecamatanId: true },
  });
  let peraih = [];
  if (satuan) {
    const cocok = await cariPeraih(satuan);
    const belum = cocok.filter((c) => !c.satuanId).map((c) => c.id);
    if (belum.length) await tautkanPeraih(satuan.id, belum); // simpan tautan agar dapat ditinjau admin
    peraih = cocok.filter((c) => c.berlakuLarangan);
  }
  if (!riwayat.length && !peraih.length) return null;

  const daftar = [
    ...peraih.map((p) => ({ tahun: p.tahun, peringkat: p.peringkat, periode: `Penghargaan Stratifikasi UKS/M ${p.tahun}`, sumber: 'Daftar penerima penghargaan Kabupaten Bekasi' })),
    ...riwayat.map((x) => ({ tahun: x.tahun, peringkat: x.peringkat, periode: x.periode?.nama || String(x.tahun), sumber: 'Penetapan hasil final aplikasi' })),
  ];
  // buang duplikat tahun+peringkat (sekolah bisa tercatat di kedua sumber)
  const unik = [...new Map(daftar.map((d) => [`${d.tahun}-${d.peringkat}`, d])).values()]
    .sort((a, b) => b.tahun - a.tahun || a.peringkat - b.peringkat);
  const t = unik[0];
  return {
    dilarang: true,
    peringkat: t.peringkat,
    tahun: t.tahun,
    periode: t.periode,
    riwayat: unik,
    alasan: `Satuan pendidikan ini tercatat sebagai peraih Peringkat ${t.peringkat} Penghargaan Stratifikasi UKS/M Tingkat Kabupaten Bekasi tahun ${t.tahun}, sehingga tidak diperkenankan melakukan penilaian mandiri kembali.`,
  };
}

// ---------------------------------------------------------------------------
// 3) Pernyataan penilaian sesuai fakta lapangan (pop-up konfirmasi)
// ---------------------------------------------------------------------------
export const PESAN_PERNYATAAN =
  'Penilaian harus dinyatakan sesuai fakta di lapangan. Centang pernyataan konfirmasi terlebih dahulu.';

// true bila body memuat pernyataan yang sah
export function adaPernyataan(body) {
  return body?.pernyataanFakta === true || body?.pernyataanFakta === 'true';
}

// ---------------------------------------------------------------------------
// 4) Tim Penilai Kecamatan (notulen Sep 2026)
// Satu kecamatan dapat memiliki beberapa akun: seorang KOORDINATOR (isAdmin)
// dan penilai-penilai komponen. Penilai hanya menilai komponen yang ditugaskan;
// koordinator memfinalkan verifikasi, rekomendasi, dan pendaftaran seleksi.
// ---------------------------------------------------------------------------
export const koordinatorKecamatan = (user) => user?.role === 'TP_KECAMATAN' && !!user.isAdmin;

export function wajibKoordinatorKecamatan(req, res, next) {
  if (!koordinatorKecamatan(req.user)) {
    return res.status(403).json({
      error: 'Khusus Koordinator TP UKS/M Kecamatan. Penilai komponen hanya dapat menilai komponen yang ditugaskan.',
    });
  }
  next();
}

// Simpan klasifikasi komponen seorang penilai (kabupaten maupun kecamatan).
export async function simpanKlasifikasi(userId, komponenIds) {
  const ids = [...new Set((komponenIds || []).filter(Boolean))];
  const valid = await prisma.komponen.findMany({ where: { id: { in: ids } }, select: { id: true } });
  await prisma.penilaiKomponen.deleteMany({ where: { userId } });
  if (valid.length) {
    await prisma.penilaiKomponen.createMany({ data: valid.map((k) => ({ userId, komponenId: k.id })) });
  }
}
