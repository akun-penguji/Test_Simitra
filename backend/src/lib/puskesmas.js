// Peta Puskesmas Binaan (notulen Sep 2026): lokasi puskesmas beserta sekolah
// binaannya dan capaian strata — untuk akun TP Kecamatan & Tim Kabupaten.
import { prisma } from './prisma.js';

export async function petaPuskesmas({ kecamatanId = null } = {}) {
  const periode = await prisma.periode.findFirst({ where: { aktif: true } });
  const [puskesmas, sekolah] = await Promise.all([
    prisma.puskesmas.findMany({
      where: kecamatanId ? { kecamatanId } : {},
      orderBy: { nama: 'asc' },
      include: { kecamatan: { select: { nama: true } } },
    }),
    prisma.satuanPendidikan.findMany({
      where: kecamatanId ? { kecamatanId } : {},
      orderBy: { nama: 'asc' },
      select: {
        id: true, nama: true, jenjang: true, tahap: true, latitude: true, longitude: true, puskesmasId: true,
        kecamatan: { select: { nama: true } },
        penilaian: {
          where: periode ? { periodeId: periode.id } : {},
          orderBy: { createdAt: 'desc' }, take: 1,
          select: { status: true, strataVerifikasi: true, strataMandiri: true },
        },
      },
    }),
  ]);

  const titikSekolah = sekolah.map((s) => {
    const p = s.penilaian[0];
    const terverifikasi = p?.status === 'DIVERIFIKASI';
    return {
      id: s.id, nama: s.nama, jenjang: s.jenjang, tahap: s.tahap, kecamatan: s.kecamatan?.nama,
      lat: s.latitude, lng: s.longitude, puskesmasId: s.puskesmasId,
      strata: terverifikasi ? p.strataVerifikasi : null,
      strataMandiri: p && p.status !== 'DRAFT' ? p.strataMandiri : null,
      terverifikasi,
    };
  });

  const ringkas = (pid) => {
    const binaan = titikSekolah.filter((s) => s.puskesmasId === pid);
    const strata = { PARIPURNA: 0, UTAMA: 0, MADYA: 0, DASAR: 0 };
    let terverifikasi = 0;
    for (const s of binaan) { if (s.terverifikasi) { terverifikasi += 1; if (s.strata) strata[s.strata] += 1; } }
    return { jumlahSekolah: binaan.length, berkoordinat: binaan.filter((s) => s.lat != null).length, terverifikasi, strata };
  };

  return {
    puskesmas: puskesmas.map((p) => ({
      id: p.id, nama: p.nama, kecamatan: p.kecamatan?.nama, kecamatanId: p.kecamatanId, alamat: p.alamat,
      lat: p.latitude, lng: p.longitude, sumberLokasi: p.sumberLokasi, ...ringkas(p.id),
    })),
    sekolah: titikSekolah,
    tanpaPuskesmas: titikSekolah.filter((s) => !s.puskesmasId).length,
  };
}

// Ubah lokasi satu puskesmas (dipakai koordinator kecamatan & admin kabupaten)
export async function ubahLokasiPuskesmas(id, body, oleh) {
  const lat = body.lat === '' || body.lat == null ? null : Number(body.lat);
  const lng = body.lng === '' || body.lng == null ? null : Number(body.lng);
  if ((lat == null) !== (lng == null)) throw Object.assign(new Error('Lintang dan bujur harus diisi berpasangan'), { status: 400 });
  if (lat != null && (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -7 || lat > -5.5 || lng < 106.5 || lng > 107.7)) {
    throw Object.assign(new Error('Koordinat di luar wilayah Kabupaten Bekasi dan sekitarnya'), { status: 400 });
  }
  return prisma.puskesmas.update({
    where: { id },
    data: {
      latitude: lat, longitude: lng,
      alamat: body.alamat !== undefined ? (body.alamat || null) : undefined,
      sumberLokasi: lat != null ? `Manual (${oleh})` : null,
    },
  });
}
