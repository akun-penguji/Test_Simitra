// Alur otomatis setelah eviden stratifikasi disetujui.
//
// Temuan rapat akhir: setelah eviden disetujui, data sekolah "nyangkut" di Review
// Eviden karena kelanjutannya bergantung pada dua langkah manual yang terpisah
// (penerbitan sertifikat oleh kabupaten, lalu pendaftaran seleksi oleh kecamatan).
// Kini begitu SELURUH indikator disetujui, sekolah otomatis masuk Seleksi
// Administrasi: pendaftaran peserta dibuatkan sistem dan tahapnya dimajukan.
import { prisma } from './prisma.js';
import { nomorBerikut } from './nomor.js';
import { notifySatuan, notifyKabupaten, notifyKecamatan } from './notify.js';

// Tahap yang boleh dimajukan otomatis. Sekolah yang sudah di Seleksi
// Administrasi / Kunjungan / Final tidak pernah ditarik mundur oleh fungsi ini.
export const TAHAP_SEBELUM_SELEKSI = ['PENGISIAN_EVIDEN', 'REVIEW_EVIDEN', 'EVIDEN_DISETUJUI', 'BERSERTIFIKAT'];

export async function lanjutkanKeSeleksi(satuanId, pemicu = 'Sistem') {
  const s = await prisma.satuanPendidikan.findUnique({
    where: { id: satuanId }, include: { pendaftaranSeleksi: true },
  });
  if (!s) return { dilanjutkan: false, alasan: 'satuan tidak ditemukan' };
  if (!TAHAP_SEBELUM_SELEKSI.includes(s.tahap)) {
    return { dilanjutkan: false, alasan: `sudah berada di tahap ${s.tahap}` };
  }

  let nomorDaftar = s.pendaftaranSeleksi?.nomorDaftar || null;
  if (!s.pendaftaranSeleksi) {
    const periodeAktif = await prisma.periode.findFirst({ where: { aktif: true } });
    nomorDaftar = await nomorBerikut('PENDAFTARAN_SELEKSI', {
      sudahAda: await prisma.pendaftaranSeleksi.count(),
      cekTerpakai: (n) => prisma.pendaftaranSeleksi.findUnique({ where: { nomorDaftar: n } }).then(Boolean),
    });
    await prisma.pendaftaranSeleksi.create({
      data: {
        satuanId, kecamatanId: s.kecamatanId, nomorDaftar, periodeId: periodeAktif?.id || null,
        didaftarkanOleh: 'Sistem (otomatis setelah eviden disetujui)',
        catatan: `Dimajukan otomatis; pemicu: ${pemicu}`,
      },
    });
  }
  await prisma.satuanPendidikan.update({ where: { id: satuanId }, data: { tahap: 'TERDAFTAR_SELEKSI' } });

  await notifySatuan(satuanId, {
    judul: 'Eviden disetujui — masuk Seleksi Administrasi',
    pesan: `Seluruh eviden Anda telah disetujui. Sekolah Anda otomatis masuk Seleksi Administrasi (${nomorDaftar}).`,
    tipe: 'success', link: '/dokumen',
  });
  await notifyKecamatan(s.kecamatanId, {
    judul: 'Eviden sekolah disetujui', pesan: `${s.nama} lolos review eviden dan masuk Seleksi Administrasi.`,
    tipe: 'info', link: '/', satuanId,
  });
  await notifyKabupaten({
    judul: 'Peserta baru Seleksi Administrasi', pesan: `${s.nama} masuk Seleksi Administrasi (eviden disetujui).`,
    tipe: 'info', link: '/seleksi', satuanId,
  });
  return { dilanjutkan: true, nomorDaftar };
}

// Apakah seluruh item eviden sebuah satuan sudah berstatus DISETUJUI?
export async function semuaEvidenDisetujui(satuanId) {
  const eviden = await prisma.eviden.findUnique({
    where: { satuanId }, include: { items: { select: { statusReview: true } } },
  });
  return !!eviden && eviden.items.length > 0 && eviden.items.every((i) => i.statusReview === 'DISETUJUI');
}
