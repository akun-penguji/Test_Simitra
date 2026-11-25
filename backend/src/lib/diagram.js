// Diagram hasil strata untuk dasbor TP Kecamatan & Tim Kabupaten (notulen Sep 2026).
// Satu bentuk data untuk kedua peran; bedanya hanya pengelompokan baris:
// kabupaten per KECAMATAN, kecamatan per PUSKESMAS binaan.
import { prisma } from './prisma.js';

const GRUP_JENJANG = {
  TK: 'TK/RA', SD: 'SD/MI', MI: 'SD/MI', SMP: 'SMP/MTs', MTS: 'SMP/MTs',
  SMA: 'SMA/SMK/MA', SMK: 'SMA/SMK/MA', MA: 'SMA/SMK/MA',
};
const URUT_JENJANG = ['TK/RA', 'SD/MI', 'SMP/MTs', 'SMA/SMK/MA'];
export const KUNCI_STRATA = ['PARIPURNA', 'UTAMA', 'MADYA', 'DASAR', 'BELUM']; // BELUM = belum mencapai Dasar

const kosong = () => ({ PARIPURNA: 0, UTAMA: 0, MADYA: 0, DASAR: 0, BELUM: 0, total: 0 });
const tambah = (baris, strata) => { baris[strata || 'BELUM'] += 1; baris.total += 1; };

export async function diagramStrata({ kecamatanId = null, periodeId = null, kelompok = 'kecamatan' } = {}) {
  const periode = periodeId
    ? await prisma.periode.findUnique({ where: { id: periodeId } })
    : await prisma.periode.findFirst({ where: { aktif: true } });
  const pWhere = periode ? { periodeId: periode.id } : {};

  const [satuan, komponen, kelompokMaster] = await Promise.all([
    prisma.satuanPendidikan.findMany({
      where: kecamatanId ? { kecamatanId } : {},
      select: {
        id: true, jenjang: true, kecamatanId: true, puskesmasId: true,
        penilaian: { where: pWhere, orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, strataMandiri: true, strataVerifikasi: true } },
      },
    }),
    prisma.komponen.findMany({ orderBy: { urutan: 'asc' }, select: { id: true, kode: true, nama: true } }),
    kelompok === 'puskesmas'
      ? prisma.puskesmas.findMany({ where: kecamatanId ? { kecamatanId } : {}, orderBy: { nama: 'asc' }, select: { id: true, nama: true } })
      : prisma.kecamatan.findMany({ where: kecamatanId ? { id: kecamatanId } : {}, orderBy: { nama: 'asc' }, select: { id: true, nama: true } }),
  ]);

  // Baris pengelompokan: seluruh kecamatan/puskesmas tampil walau masih nol
  const perKelompok = new Map(kelompokMaster.map((k) => [k.id, { id: k.id, label: k.nama, ...kosong() }]));
  const TANPA = '__tanpa__';
  const perJenjang = new Map(URUT_JENJANG.map((j) => [j, { label: j, ...kosong() }]));
  const mandiri = kosong();
  const verifikasi = kosong();
  let masuk = 0; let terverifikasi = 0;

  for (const s of satuan) {
    const p = s.penilaian[0];
    if (!p || p.status === 'DRAFT') continue;
    masuk += 1;
    tambah(mandiri, p.strataMandiri);
    if (p.status !== 'DIVERIFIKASI') continue;
    terverifikasi += 1;
    tambah(verifikasi, p.strataVerifikasi);
    tambah(perJenjang.get(GRUP_JENJANG[s.jenjang] || 'SD/MI'), p.strataVerifikasi);
    const kunci = (kelompok === 'puskesmas' ? s.puskesmasId : s.kecamatanId) || TANPA;
    if (!perKelompok.has(kunci)) perKelompok.set(kunci, { id: kunci, label: 'Belum memilih puskesmas', ...kosong() });
    tambah(perKelompok.get(kunci), p.strataVerifikasi);
  }

  // Capaian indikator per komponen (hasil verifikasi) — dihitung di basis data
  const capaian = await prisma.$queryRaw`
    SELECT i."komponenId" AS "komponenId",
           SUM(CASE WHEN COALESCE(j."nilaiVerifikasi", j."nilaiMandiri") = 1 THEN 1 ELSE 0 END)::int AS terpenuhi,
           COUNT(*)::int AS jumlah
    FROM "JawabanPenilaian" j
    JOIN "Penilaian" p ON p.id = j."penilaianId"
    JOIN "SatuanPendidikan" s ON s.id = p."satuanId"
    JOIN "Indikator" i ON i.id = j."indikatorId"
    WHERE p.status::text = 'DIVERIFIKASI'
      AND (${kecamatanId}::text IS NULL OR s."kecamatanId" = ${kecamatanId}::text)
      AND (${periode?.id ?? null}::text IS NULL OR p."periodeId" = ${periode?.id ?? null}::text)
    GROUP BY i."komponenId"`;
  const capMap = Object.fromEntries(capaian.map((c) => [c.komponenId, c]));

  return {
    periode: periode ? { id: periode.id, nama: periode.nama } : null,
    kelompok,
    ringkas: { satuan: satuan.length, masuk, terverifikasi },
    perKelompok: [...perKelompok.values()],
    perJenjang: [...perJenjang.values()],
    banding: KUNCI_STRATA.map((k) => ({ strata: k, mandiri: mandiri[k], verifikasi: verifikasi[k] })),
    komponen: komponen.map((k) => {
      const c = capMap[k.id];
      return {
        kode: k.kode, nama: k.nama, terpenuhi: c?.terpenuhi || 0, jumlah: c?.jumlah || 0,
        persen: c?.jumlah ? Math.round((c.terpenuhi / c.jumlah) * 1000) / 10 : null,
      };
    }),
  };
}
