// Unduhan hasil scoring dalam format PDF berkop surat resmi.
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../lib/prisma.js';
import { authRequired, audit } from '../lib/auth.js';
import { hitungStratifikasi, STRATA_LABEL, strataLabel, STRATA_URUTAN, jenjangGrup } from '../lib/scoring.js';
import {
  mulaiPdf, selesaiPdf, kopSurat, kopSuratKecamatan, judul, subJudul, meta, tabel,
  tandaTangan, tandaTanganGanda, tandaTanganPejabat, legendaSkor, legendaSkorRingkas, LEGENDA_SKOR, fmtTgl, angka,
} from '../lib/pdf.js';
import { Galat, bungkus } from '../lib/galat.js';
import { konteksPleno, versiAktif } from '../lib/pleno.js';
import { AMBANG_NILAI_TERPENUHI } from '../lib/scoring.js';

const labelStrata = (st) => (st ? STRATA_LABEL[st] : 'Belum Mencapai Dasar');

const r = Router();
r.use(authRequired);

// Hak akses berkas satuan: sekolah hanya miliknya, kecamatan hanya wilayahnya,
// tim kabupaten seluruhnya.
async function bolehAkses(user, satuanId) {
  const s = await prisma.satuanPendidikan.findUnique({
    where: { id: satuanId }, include: { kecamatan: true, puskesmas: true },
  });
  if (!s) return 'TIDAK_ADA';
  if (user.role === 'TIM_KABUPATEN') return s;
  if (user.role === 'TP_KECAMATAN') return s.kecamatanId === user.kecamatanId ? s : null;
  const milik = await prisma.satuanPendidikan.findUnique({ where: { userId: user.id }, select: { id: true } });
  return milik?.id === satuanId ? s : null;
}
const aman = (t) => String(t || 'dokumen').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// ---------------------------------------------------------------------------
// Hasil scoring penilaian mandiri / verifikasi kecamatan
// ---------------------------------------------------------------------------
r.get('/penilaian/:satuanId.pdf', async (req, res) => {
  const s = await bolehAkses(req.user, req.params.satuanId);
  if (s === 'TIDAK_ADA') return res.status(404).json({ error: 'Satuan pendidikan tidak ditemukan' });
  if (!s) return res.status(403).json({ error: 'Tidak berwenang mengakses dokumen ini' });

  const penilaian = await prisma.penilaian.findFirst({
    where: { satuanId: s.id }, orderBy: { createdAt: 'desc' },
    include: { jawaban: { include: { indikator: { include: { komponen: true } } } }, periode: true },
  });
  if (!penilaian || penilaian.status === 'DRAFT') {
    return res.status(400).json({ error: 'Penilaian belum disubmit, hasil scoring belum tersedia.' });
  }

  const diverifikasi = penilaian.status === 'DIVERIFIKASI';
  const kunci = diverifikasi ? 'nilaiVerifikasi' : 'nilaiMandiri';
  const input = penilaian.jawaban.map((j) => ({
    nilai: j[kunci] ?? j.nilaiMandiri, komponenId: j.indikator.komponenId, strata: j.indikator.strata,
  }));
  const hasil = hitungStratifikasi(input);

  // Laporan hasil penilaian diterbitkan di tingkat kecamatan, sehingga kop
  // suratnya memakai nama kecamatan satuan pendidikan bersangkutan.
  const doc = mulaiPdf(res, `Hasil-Scoring-${aman(s.nama)}.pdf`);
  if (s.kecamatan?.nama) kopSuratKecamatan(doc, s.kecamatan.nama); else kopSurat(doc);
  judul(doc, diverifikasi ? 'Hasil Penilaian Stratifikasi UKS/M' : 'Hasil Penilaian Mandiri Stratifikasi UKS/M',
    diverifikasi ? 'Terverifikasi Tim Pembina UKS/M Kecamatan' : 'Belum diverifikasi Tim Pembina UKS/M Kecamatan');

  meta(doc, [
    ['Nama Satuan Pendidikan', s.nama],
    ['NPSN', s.npsn],
    ['Jenjang', s.jenjang],
    ['Kecamatan', s.kecamatan?.nama],
    ['Puskesmas Binaan', s.puskesmas?.nama],
    ['Periode', penilaian.periode?.nama],
    ['Tanggal Pengisian', fmtTgl(penilaian.submittedAt)],
    ['Tanggal Verifikasi', diverifikasi ? fmtTgl(penilaian.verifiedAt) : '-'],
  ]);

  // Rekapitulasi per komponen
  const komp = {};
  for (const j of penilaian.jawaban) {
    komp[j.indikator.komponenId] = { kode: j.indikator.komponen.kode, nama: j.indikator.komponen.nama };
  }
  subJudul(doc, 'A. Capaian per Komponen');
  tabel(doc,
    [{ judul: 'Komponen', lebar: 34 }, { judul: 'Dasar', lebar: 11, align: 'center' },
     { judul: 'Madya', lebar: 11, align: 'center' }, { judul: 'Utama', lebar: 11, align: 'center' },
     { judul: 'Paripurna', lebar: 12, align: 'center' }, { judul: 'Terpenuhi', lebar: 11, align: 'center' },
     { judul: 'Jumlah', lebar: 10, align: 'right' }],
    Object.entries(hasil.perKomponen)
      .sort((a, b) => (komp[a[0]]?.kode || '').localeCompare(komp[b[0]]?.kode || ''))
      .map(([id, v]) => [
        `${komp[id]?.kode || ''} · ${komp[id]?.nama || ''}`,
        angka(v.DASAR), angka(v.MADYA), angka(v.UTAMA), angka(v.PARIPURNA),
        `${v.terpenuhi}/${v.jumlah}`, angka(v.total),
      ]));

  subJudul(doc, 'B. Capaian per Strata');
  tabel(doc,
    [{ judul: 'Strata', lebar: 40 }, { judul: 'Poin Diperoleh', lebar: 25, align: 'center' },
     { judul: 'Poin Maksimal', lebar: 20, align: 'center' }, { judul: 'Status', lebar: 15, align: 'center' }],
    STRATA_URUTAN.map((st) => [
      STRATA_LABEL[st], angka(hasil.perStrata[st]), '25,00',
      hasil.perStrata[st] >= 25 - 1e-6 ? 'Tercapai' : 'Belum',
    ]));

  doc.moveDown(0.3);
  subJudul(doc, 'C. Hasil Akhir');
  tabel(doc,
    [{ judul: 'Uraian', lebar: 55 }, { judul: 'Hasil', lebar: 45, align: 'center' }],
    [
      { sel: ['Nilai Akhir (0–100)', angka(hasil.nilai)], tebal: true },
      { sel: ['Strata yang Dicapai', strataLabel(hasil.strata).toUpperCase()], tebal: true, latar: '#eef4ee' },
    ]);
  if (penilaian.catatanVerifikasi) {
    doc.font('Times-Bold').fontSize(10.5).text('Catatan Verifikator: ', { continued: true })
      .font('Times-Roman').text(penilaian.catatanVerifikasi);
    doc.moveDown(0.4);
  }
  doc.font('Times-Roman').fontSize(9).fillColor('#555')
    .text('Perhitungan mengikuti format resmi stratifikasi UKS/M: setiap strata bernilai maksimal 25 poin yang dibagi rata kepada komponen yang memiliki indikator pada strata tersebut.');
  doc.fillColor('#000');

  // Nama tim yang menilai tiap komponen (temuan rapat akhir Okt 2026)
  if (diverifikasi) {
    const ver = await prisma.verifikasiKomponen.findMany({ where: { penilaianId: penilaian.id } });
    const perKomp = Object.fromEntries(ver.map((v) => [v.komponenId, v]));
    subJudul(doc, 'D. Tim Penilai per Komponen');
    tabel(doc,
      [{ judul: 'Komponen', lebar: 46 }, { judul: 'Nama Penilai', lebar: 34 }, { judul: 'Tanggal', lebar: 20, align: 'center' }],
      Object.entries(komp)
        .sort((a, b) => (a[1].kode || '').localeCompare(b[1].kode || ''))
        .map(([id, k]) => [`${k.kode} · ${k.nama}`, perKomp[id]?.namaPenilai || '-', perKomp[id] ? fmtTgl(perKomp[id].selesaiPada) : '-']));
  }

  // Tanda tangan: kepala satuan pendidikan dan Ketua Tim Pembina UKS/M Kecamatan
  const ketuaKec = `Ketua Tim Pembina UKS/M\nKecamatan ${s.kecamatan?.nama || '-'}`;
  if (diverifikasi) {
    tandaTanganGanda(doc,
      { jabatan: `Kepala ${s.nama}`, nama: s.kepalaSekolah || null },
      { jabatan: ketuaKec, nama: null });
  } else {
    tandaTangan(doc, `Kepala ${s.nama}`);
  }
  selesaiPdf(doc);
  await audit(req.user.nama, 'UNDUH_PDF_SCORING', { satuanId: s.id, entitas: 'Penilaian', detail: 'Hasil penilaian' });
});

// ---------------------------------------------------------------------------
// Hasil scoring Seleksi Penghargaan (administrasi + peninjauan lapangan)
// ---------------------------------------------------------------------------
r.get('/seleksi/:satuanId.pdf', async (req, res) => {
  const s = await bolehAkses(req.user, req.params.satuanId);
  if (s === 'TIDAK_ADA') return res.status(404).json({ error: 'Satuan pendidikan tidak ditemukan' });
  if (!s) return res.status(403).json({ error: 'Tidak berwenang mengakses dokumen ini' });

  const eviden = await prisma.eviden.findUnique({
    where: { satuanId: s.id },
    include: { items: { include: { indikator: { include: { komponen: true } } } } },
  });
  if (!eviden) return res.status(400).json({ error: 'Eviden belum tersedia untuk satuan ini.' });
  const kunjungan = await prisma.kunjunganLapangan.findUnique({ where: { satuanId: s.id } });
  const pendaftaran = await prisma.pendaftaranSeleksi.findUnique({ where: { satuanId: s.id }, include: { periode: true } });

  const items = eviden.items.sort((a, b) =>
    (a.indikator.komponen.urutan - b.indikator.komponen.urutan) || (a.indikator.urutan - b.indikator.urutan));

  const doc = mulaiPdf(res, `Rekap-Penilaian-Seleksi-${aman(s.nama)}.pdf`);
  kopSurat(doc);
  judul(doc, 'Rekapitulasi Penilaian Seleksi Penghargaan Stratifikasi UKS/M',
    'Seleksi Administrasi dan Peninjauan Lapangan');
  meta(doc, [
    ['Nama Satuan Pendidikan', s.nama],
    ['NPSN', s.npsn],
    ['Jenjang', s.jenjang],
    ['Kecamatan', s.kecamatan?.nama],
    ['Nomor Pendaftaran', pendaftaran?.nomorDaftar],
    ['Periode', pendaftaran?.periode?.nama],
    ['Tanggal Peninjauan Lapangan', fmtTgl(kunjungan?.tanggal)],
    ['Petugas Peninjau', kunjungan?.disubmitOleh || kunjungan?.petugas],
  ]);

  // Kolom Catatan Laporan Lapangan diperluas agar temuan per indikator terbaca
  subJudul(doc, 'A. Penilaian per Indikator');
  tabel(doc,
    [{ judul: 'Kode', lebar: 8 }, { judul: 'Indikator', lebar: 34 },
     { judul: 'Skor Adm.', lebar: 9, align: 'center' },
     { judul: 'Skor Lap.', lebar: 9, align: 'center' },
     { judul: 'Catatan Laporan Lapangan', lebar: 40 }],
    items.map((i) => [
      i.indikator.kode, i.indikator.pertanyaan,
      i.skor != null ? angka(i.skor, 0) : '-',
      i.skorLapangan != null ? angka(i.skorLapangan, 0) : '-',
      i.catatanLapangan || '-',
    ]), { fontSize: 8.5 });

  legendaSkor(doc, 'B. Legenda Nilai Skoring Eviden');
  subJudul(doc, 'C. Rekapitulasi Nilai');

  const adm = items.filter((i) => i.skor != null);
  const lap = items.filter((i) => i.skorLapangan != null);
  const rata = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length) : 0);
  const nilaiAkhir = items.length
    ? (items.reduce((a, i) => a + (i.skorLapangan != null ? i.skorLapangan : (i.skor ?? 0)), 0) / (items.length * 3)) * 100
    : 0;

  tabel(doc,
    [{ judul: 'Uraian', lebar: 60 }, { judul: 'Hasil', lebar: 40, align: 'center' }],
    [
      ['Rata-rata skor seleksi administrasi (skala 0–3)', angka(rata(adm.map((i) => i.skor)))],
      ['Rata-rata skor peninjauan lapangan (skala 0–3)', lap.length ? angka(rata(lap.map((i) => i.skorLapangan))) : '-'],
      { sel: ['Nilai akhir seleksi (0–100)', angka(nilaiAkhir)], tebal: true, latar: '#eef4ee' },
      ['Status seleksi administrasi', eviden.lolosSeleksi == null ? 'Belum ditetapkan' : (eviden.lolosSeleksi ? 'LOLOS ke peninjauan lapangan' : 'Tidak lolos')],
    ]);

  if (kunjungan?.strataAkhir || kunjungan?.ditetapkanPada) {
    subJudul(doc, 'D. Strata Akhir (dihitung sistem dari Hasil Pleno)');
    tabel(doc,
      [{ judul: 'Uraian', lebar: 40 }, { judul: 'Keterangan', lebar: 60 }],
      [
        ['Strata awal (hasil sertifikasi)', kunjungan.strataAwal ? STRATA_LABEL[kunjungan.strataAwal] : '-'],
        { sel: ['Strata akhir', labelStrata(kunjungan.strataAkhir)], tebal: true, latar: '#eef4ee' },
        ['Dasar perhitungan', kunjungan.catatanAkhir || '-'],
        ['Dihitung', `${kunjungan.ditetapkanOleh || '-'} · ${fmtTgl(kunjungan.ditetapkanPada)}`],
      ]);
  }

  // Tim penilai per komponen: kecamatan (verifikasi) + kabupaten (review, seleksi, lapangan)
  {
    const penilaianAkhir = await prisma.penilaian.findFirst({ where: { satuanId: s.id }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    const ver = penilaianAkhir ? await prisma.verifikasiKomponen.findMany({ where: { penilaianId: penilaianAkhir.id } }) : [];
    const idPeninjau = [...new Set(items.map((i) => i.reviewerId).filter(Boolean))];
    const peninjau = idPeninjau.length ? await prisma.user.findMany({ where: { id: { in: idPeninjau } }, select: { id: true, nama: true } }) : [];
    const namaPeninjau = Object.fromEntries(peninjau.map((u) => [u.id, u.nama]));
    const gabung = (daftar) => [...new Set(daftar.filter(Boolean))].join(', ') || '-';

    const perKomp = new Map();
    for (const it of items) {
      const k = it.indikator.komponen;
      if (!perKomp.has(k.id)) perKomp.set(k.id, { k, review: [], seleksi: [], lapangan: [] });
      const e = perKomp.get(k.id);
      e.review.push(namaPeninjau[it.reviewerId]);
      e.seleksi.push(it.skorOleh);
      e.lapangan.push(it.skorLapanganOleh);
    }
    subJudul(doc, 'E. Tim Penilai per Komponen');
    tabel(doc,
      [{ judul: 'Komponen', lebar: 22 }, { judul: 'Verifikasi Kecamatan', lebar: 20 }, { judul: 'Review Eviden', lebar: 20 },
       { judul: 'Seleksi Administrasi', lebar: 19 }, { judul: 'Peninjauan Lapangan', lebar: 19 }],
      [...perKomp.values()].sort((a, b) => a.k.urutan - b.k.urutan).map((e) => [
        `${e.k.kode} · ${e.k.nama}`,
        gabung(ver.filter((v) => v.komponenId === e.k.id).map((v) => v.namaPenilai)),
        gabung(e.review), gabung(e.seleksi), gabung(e.lapangan),
      ]), { fontSize: 8.5 });
  }

  if (kunjungan?.temuan) {
    subJudul(doc, 'Temuan Lapangan');
    doc.font('Times-Roman').fontSize(10).text(kunjungan.temuan, { align: 'justify' });
    doc.moveDown(0.5);
  }
  if (kunjungan?.pernyataanFakta) {
    doc.font('Times-Roman').fontSize(9).fillColor('#555').text(
      `Hasil peninjauan lapangan disubmit oleh ${kunjungan.disubmitOleh || '-'} pada ${fmtTgl(kunjungan.disubmitPada)} ` +
      `dan dinyatakan telah dinilai sesuai fakta di lapangan.` +
      (kunjungan.latitude != null ? ` Titik lokasi submit: ${kunjungan.latitude}, ${kunjungan.longitude}.` : ''),
      { align: 'justify' });
    doc.fillColor('#000');
  }

  tandaTanganGanda(doc,
    { jabatan: `Ketua Tim Pembina UKS/M\nKecamatan ${s.kecamatan?.nama || '-'}`, nama: null },
    { jabatan: 'Ketua Tim Stratifikasi UKS/M\nKabupaten Bekasi', nama: null });
  selesaiPdf(doc);
  await audit(req.user.nama, 'UNDUH_PDF_SCORING', { satuanId: s.id, entitas: 'Eviden', detail: 'Rekap penilaian seleksi' });
});

// ---------------------------------------------------------------------------
// Rekapitulasi HASIL PLENO & peringkat (khusus super admin)
// ---------------------------------------------------------------------------
const wajibSuperAdmin = (req) => {
  if (req.user.role !== 'TIM_KABUPATEN' || !req.user.isAdmin) throw new Galat(403, 'Khusus Admin/Koordinator Kabupaten');
};

r.get('/final.pdf', bungkus(async (req, res) => {
  wajibSuperAdmin(req);
  const { periode, periodeId } = await konteksPleno();
  const list = await prisma.hasilFinal.findMany({
    where: { periodeId },
    include: { satuan: { include: { kecamatan: true, kunjungan: { select: { strataAwal: true } } } } },
    orderBy: [{ skorFinal: 'desc' }, { peringkat: 'asc' }],
  });

  const doc = mulaiPdf(res, `Rekap-Hasil-Pleno-${aman(periode?.nama || 'Stratifikasi')}.pdf`);
  kopSurat(doc);
  judul(doc, 'Rekapitulasi Hasil Pleno Stratifikasi UKS/M', periode?.nama || '');
  meta(doc, [
    ['Periode', periode?.nama],
    ['Jumlah Satdik di Hasil Pleno', String(list.length)],
    ['Jumlah Peraih Penghargaan', String(list.filter((h) => h.peraih).length)],
  ]);
  tabel(doc,
    [{ judul: 'Peringkat', lebar: 9, align: 'center' }, { judul: 'Satuan Pendidikan', lebar: 30 },
     { judul: 'Kecamatan', lebar: 17 }, { judul: 'Strata Awal', lebar: 12, align: 'center' },
     { judul: 'Strata Akhir', lebar: 14, align: 'center' }, { judul: 'Skor', lebar: 8, align: 'right' },
     { judul: 'Peraih', lebar: 10, align: 'center' }],
    list.map((h) => ({
      sel: [String(h.peringkat ?? '-'), h.satuan.nama, h.satuan.kecamatan?.nama || '-',
        h.satuan.kunjungan?.strataAwal ? STRATA_LABEL[h.satuan.kunjungan.strataAwal] : '-',
        labelStrata(h.strataFinal), angka(h.skorFinal), h.peraih ? 'Ya' : '-'],
      latar: h.peringkat <= 3 ? '#fff6e0' : null,
    })), { fontSize: 9 });
  doc.font('Times-Roman').fontSize(9).fillColor('#555')
    .text('Strata akhir dihitung sistem dari nilai pleno per indikator (terpenuhi bila nilai ≥ '
      + AMBANG_NILAI_TERPENUHI + ') dengan rumus berjenjang yang sama seperti penilaian mandiri. '
      + 'Peringkat 1, 2, dan 3 disorot. Sesuai ketentuan Tim Pembina UKS/M, satuan pendidikan peraih Juara 1, 2, dan 3 '
      + 'tingkat kabupaten tidak diperkenankan melakukan penilaian mandiri pada periode berikutnya.', { align: 'justify' });
  doc.fillColor('#000');
  tandaTangan(doc, 'Ketua Tim Stratifikasi UKS/M Kabupaten Bekasi');
  selesaiPdf(doc);
  await audit(req.user.nama, 'UNDUH_PDF_SCORING', { entitas: 'HasilFinal', detail: 'Rekap hasil pleno' });
}));

// ---------------------------------------------------------------------------
// LAPORAN STRATA AKHIR — dihitung sistem dari Hasil Pleno (bukan penetapan manual)
// ---------------------------------------------------------------------------
r.get('/strata-akhir.pdf', bungkus(async (req, res) => {
  if (req.user.role !== 'TIM_KABUPATEN') throw new Galat(403, 'Tidak berwenang');
  const { periode, periodeId } = await konteksPleno();
  const list = await prisma.hasilFinal.findMany({
    where: { periodeId },
    include: { satuan: { include: { kecamatan: true, kunjungan: { select: { strataAwal: true, catatanAkhir: true } } } } },
  });
  list.sort((a, b) => (a.satuan.kecamatan?.nama || '').localeCompare(b.satuan.kecamatan?.nama || '', 'id') || a.satuan.nama.localeCompare(b.satuan.nama, 'id'));
  const urut = [null, 'DASAR', 'MADYA', 'UTAMA', 'PARIPURNA'];
  const arah = (awal, akhir) => {
    const d = urut.indexOf(akhir ?? null) - urut.indexOf(awal ?? null);
    return d > 0 ? 'Naik' : d < 0 ? 'Turun' : 'Tetap';
  };

  const doc = mulaiPdf(res, `Laporan-Strata-Akhir-${aman(periode?.nama || 'Stratifikasi')}.pdf`);
  kopSurat(doc);
  judul(doc, 'Laporan Strata Akhir Stratifikasi UKS/M', periode?.nama || '');
  doc.font('Times-Roman').fontSize(10).text(
    'Strata akhir TIDAK ditetapkan manual. Sistem menghitungnya dari nilai Hasil Pleno: setiap indikator dengan nilai pleno '
    + `≥ ${AMBANG_NILAI_TERPENUHI} (Ada, Cukup Sesuai) dianggap terpenuhi, kemudian strata ditentukan berjenjang dengan rumus yang `
    + 'sama seperti penilaian mandiri — satu indikator yang belum terpenuhi menahan kenaikan strata.', { align: 'justify' });
  doc.moveDown(0.6);
  tabel(doc,
    [{ judul: 'No', lebar: 5, align: 'center' }, { judul: 'Satuan Pendidikan', lebar: 28 }, { judul: 'Kecamatan', lebar: 16 },
     { judul: 'Strata Awal', lebar: 13, align: 'center' }, { judul: 'Strata Akhir', lebar: 15, align: 'center' },
     { judul: 'Perubahan', lebar: 11, align: 'center' }, { judul: 'Skor', lebar: 12, align: 'right' }],
    list.map((h, n) => [
      String(n + 1), h.satuan.nama, h.satuan.kecamatan?.nama || '-',
      h.satuan.kunjungan?.strataAwal ? STRATA_LABEL[h.satuan.kunjungan.strataAwal] : '-',
      labelStrata(h.strataFinal), arah(h.satuan.kunjungan?.strataAwal, h.strataFinal), angka(h.skorFinal),
    ]), { fontSize: 9 });
  tandaTangan(doc, 'Ketua Tim Stratifikasi UKS/M Kabupaten Bekasi');
  selesaiPdf(doc);
  await audit(req.user.nama, 'UNDUH_PDF_SCORING', { entitas: 'KunjunganLapangan', detail: 'Laporan strata akhir' });
}));

// ---------------------------------------------------------------------------
// KERTAS KERJA VERIFIKASI LAPANGAN — dibuat PER KOMPONEN per satuan pendidikan
// (rapat akhir Okt 2026): tiap komponen dipegang penilai berbeda, sehingga tiap
// komponen punya lembar sendiri dengan tanda tangan Tim Stratifikasi Kabupaten
// (tanpa tanda tangan kepala sekolah). Tanpa ?komponenId → semua komponen,
// masing-masing pada halaman terpisah.
// ---------------------------------------------------------------------------
r.get('/kertas-kerja/:satuanId.pdf', bungkus(async (req, res) => {
  if (req.user.role !== 'TIM_KABUPATEN') throw new Galat(403, 'Kertas kerja khusus Tim Stratifikasi Kabupaten.');
  const s = await bolehAkses(req.user, req.params.satuanId);
  if (s === 'TIDAK_ADA') throw new Galat(404, 'Satuan pendidikan tidak ditemukan');
  if (!s) throw new Galat(403, 'Tidak berwenang mengakses dokumen ini');

  const eviden = await prisma.eviden.findUnique({
    where: { satuanId: s.id },
    include: { items: { include: { indikator: { include: { komponen: true } } } } },
  });
  // Bila eviden belum ada, formulir tetap dapat dicetak memakai instrumen jenjang
  let baris;
  if (eviden?.items?.length) {
    baris = eviden.items.map((i) => ({ ind: i.indikator, skor: i.skor, catatan: i.catatanLapangan }));
  } else {
    const indikator = await prisma.indikator.findMany({ where: { jenjang: jenjangGrup(s.jenjang) }, include: { komponen: true } });
    baris = indikator.map((ind) => ({ ind, skor: null, catatan: null }));
  }
  if (!baris.length) throw new Galat(400, 'Instrumen indikator belum tersedia.');
  baris.sort((a, b) => (a.ind.komponen.urutan - b.ind.komponen.urutan) || (a.ind.urutan - b.ind.urutan));

  const perKomp = new Map();
  for (const b of baris) {
    if (!perKomp.has(b.ind.komponen.id)) perKomp.set(b.ind.komponen.id, { k: b.ind.komponen, baris: [] });
    perKomp.get(b.ind.komponen.id).baris.push(b);
  }
  let terpilih = [...perKomp.values()];
  if (req.query.komponenId) {
    terpilih = terpilih.filter((e) => e.k.id === req.query.komponenId);
    if (!terpilih.length) throw new Galat(404, 'Komponen tidak ditemukan untuk satuan ini.');
  }

  const kunjungan = await prisma.kunjunganLapangan.findUnique({ where: { satuanId: s.id } });
  const penilaian = await prisma.penilaian.findFirst({
    where: { satuanId: s.id }, orderBy: { createdAt: 'desc' }, select: { strataVerifikasi: true },
  });
  const berkas = terpilih.length === 1
    ? `Kertas-Kerja-Komponen-${terpilih[0].k.kode}-${aman(s.nama)}.pdf` : `Kertas-Kerja-Lapangan-${aman(s.nama)}.pdf`;

  const doc = mulaiPdf(res, berkas, { layout: 'landscape', margins: { top: 40, bottom: 60, left: 40, right: 40 } });
  terpilih.forEach((e, n) => {
    if (n > 0) { doc.addPage(); doc.y = 40; }
    kopSurat(doc);
    judul(doc, `Kertas Kerja Verifikasi Lapangan — Komponen ${e.k.kode}`, `${e.k.nama} · Seleksi Penghargaan Stratifikasi UKS/M Kabupaten Bekasi`);
    meta(doc, [
      ['Nama Satuan Pendidikan', s.nama],
      ['NPSN / Jenjang', `${s.npsn || '-'} / ${s.jenjang}`],
      ['Kecamatan', s.kecamatan?.nama],
      ['Strata Awal (hasil sertifikasi)', kunjungan?.strataAwal || penilaian?.strataVerifikasi ? STRATA_LABEL[kunjungan?.strataAwal || penilaian?.strataVerifikasi] : '-'],
      ['Tanggal Peninjauan', kunjungan?.tanggal ? fmtTgl(kunjungan.tanggal) : '.....................................'],
      ['Petugas Peninjau Komponen', '.....................................'],
    ]);
    legendaSkorRingkas(doc);
    subJudul(doc, `A. Penilaian dan Catatan Temuan — Komponen ${e.k.kode}`);
    tabel(doc,
      [{ judul: 'Kode', lebar: 6 }, { judul: 'Indikator', lebar: 28 }, { judul: 'Bentuk Eviden', lebar: 18 },
       { judul: 'Skor Adm.', lebar: 6, align: 'center' }, { judul: 'Nilai Lapangan (0/1/2/3)', lebar: 10, align: 'center' },
       { judul: 'Catatan Temuan Lapangan', lebar: 32 }],
      e.baris.map((b) => [
        b.ind.kode, b.ind.pertanyaan, b.ind.bentukEviden || '-',
        b.skor != null ? angka(b.skor, 0) : '-', '0  1  2  3', b.catatan || '',
      ]), { fontSize: 8 });
    subJudul(doc, `B. Kesimpulan Komponen ${e.k.kode}`);
    tabel(doc, [{ judul: 'Uraian', lebar: 30 }, { judul: 'Keterangan', lebar: 70 }],
      [['Temuan umum komponen', ''], ['Hal yang perlu ditindaklanjuti', '']]);
    // Hanya tanda tangan Tim Stratifikasi Kabupaten (tanpa kepala sekolah)
    tandaTangan(doc, `Petugas Peninjau Komponen ${e.k.kode}\nTim Stratifikasi UKS/M Kabupaten Bekasi`);
  });
  selesaiPdf(doc);
  await audit(req.user.nama, 'UNDUH_PDF_KERTAS_KERJA', {
    satuanId: s.id, entitas: 'KunjunganLapangan',
    detail: terpilih.length === 1 ? `Kertas kerja komponen ${terpilih[0].k.kode}` : 'Kertas kerja semua komponen',
  });
}));

// ---------------------------------------------------------------------------
// PIAGAM PENGHARGAAN — dua jenis memakai templat Kesra (rapat final Okt 2026):
//  • HASIL   : satdik hasil Kunjungan Tim Kabupaten & Hasil Final Pleno ("STRATA ...")
//  • PESERTA : satdik hasil Rekomendasi Kecamatan ("SEBAGAI PESERTA")
// Latar (bingkai, logo, judul, kalimat pembuka) berasal dari gambar templat; nomor,
// nama sekolah, strata, tanggal, tahun, dan penandatangan DICETAK oleh sistem. Pejabat
// dan templat mengikuti VERSI yang berlaku saat piagam diterbitkan, jadi pergantian
// pejabat tidak mengubah piagam yang sudah terbit. Templat bawaan dapat diganti
// lewat Pengaturan Sertifikat.
// ---------------------------------------------------------------------------
const DIR_ASET = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../assets');
const UKURAN_PIAGAM = [841.89, 557.74]; // nisbah gambar templat Kesra (2560 × 1696)
const K = 841.89 / 2000;                 // koordinat rancangan (lebar 2000) → poin PDF

function latarPiagam(jenis, versi) {
  const kustom = jenis === 'PESERTA' ? versi?.templatPeserta : versi?.templat;
  if (kustom) return Buffer.from(kustom);
  return fs.readFileSync(path.join(DIR_ASET, jenis === 'PESERTA' ? 'piagam-peserta.jpg' : 'piagam-hasil.jpg'));
}

// teks satu baris dipusatkan; ukuran huruf diperkecil agar muat pada lebar tertentu
function barisTengah(doc, teks, { y, ukuran, font = 'Times-Roman', lebar = UKURAN_PIAGAM[0] - 160, minUkuran = 9 }) {
  let u = ukuran;
  doc.font(font).fontSize(u);
  while (doc.widthOfString(teks) > lebar && u > minUkuran) { u -= 0.5; doc.fontSize(u); }
  doc.text(teks, (UKURAN_PIAGAM[0] - lebar) / 2, y, { width: lebar, align: 'center', lineBreak: false });
}

function gambarPiagam(doc, { jenis, s, nomor, tanggal, tahun, strata, versi }) {
  const [W, H] = UKURAN_PIAGAM;
  try { doc.image(latarPiagam(jenis, versi), 0, 0, { width: W, height: H }); } catch { /* templat rusak: lanjut tanpa latar */ }
  doc.fillColor('#000');

  barisTengah(doc, `Nomor: ${nomor}`, { y: 332 * K, ukuran: 15 });

  // nama sekolah di atas garis (garis pada y≈700), kecamatan kecil di bawah nama
  const nama = String(s.nama || '').toUpperCase();
  doc.font('Times-Bold').fontSize(26);
  if (doc.widthOfString(nama) > 1070 * K) {
    // nama sangat panjang: dua baris
    doc.fontSize(19);
    doc.text(nama, 480 * K, 585 * K, { width: 1070 * K, align: 'center', lineGap: 1 });
  } else {
    barisTengah(doc, nama, { y: 596 * K, ukuran: 26, font: 'Times-Bold', lebar: 1070 * K });
  }
  if (s.kecamatan?.nama) barisTengah(doc, `Kecamatan ${s.kecamatan.nama}`, { y: 648 * K, ukuran: 12.5, lebar: 1000 * K });

  const label = jenis === 'PESERTA' ? 'SEBAGAI PESERTA' : (strata ? `STRATA ${String(labelStrata(strata)).toUpperCase()}` : 'BELUM MENCAPAI STRATA DASAR');
  barisTengah(doc, label, { y: 727 * K, ukuran: 17.5, font: 'Times-Bold' });
  barisTengah(doc, jenis === 'PESERTA'
    ? 'Seleksi Penghargaan Stratifikasi Usaha Kesehatan Sekolah/Madrasah (UKS/M)'
    : 'Penetapan Stratifikasi Usaha Kesehatan Sekolah/Madrasah (UKS/M)', { y: 783 * K, ukuran: 14 });
  barisTengah(doc, `Tingkat Kabupaten Bekasi Tahun ${tahun}`, { y: 815 * K, ukuran: 14 });

  const tgl = new Date(tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
  barisTengah(doc, `${versi?.kota || 'Cikarang Pusat'}, ${tgl}`, { y: 897 * K, ukuran: 14, font: 'Times-Bold' });

  const lebarJab = 290;
  doc.font('Times-Roman').fontSize(13);
  doc.text(String(versi?.jabatan || '').toUpperCase(), (W - lebarJab) / 2, 953 * K, { width: lebarJab, align: 'center', lineGap: 0 });
  const yTtd = Math.max(doc.y + 1, 1040 * K);
  if (versi?.ttd) {
    try { doc.image(Buffer.from(versi.ttd), (W - 160) / 2, yTtd, { fit: [160, 44], align: 'center', valign: 'center' }); }
    catch { /* pindaian rusak: biarkan kosong untuk tanda tangan basah */ }
  }
  barisTengah(doc, versi?.namaPejabat || '', { y: 1152 * K, ukuran: 15, font: 'Times-Bold', lebar: 520 * K });
  if (versi?.nip) barisTengah(doc, `Nip. ${versi.nip}`, { y: 1182 * K, ukuran: 13, lebar: 520 * K });
}


async function muatPiagam(satuanId, jenis) {
  if (jenis === 'PESERTA') {
    const p = await prisma.piagamPeserta.findUnique({ where: { satuanId }, include: { versi: true } });
    if (!p) return null;
    return { jenis, nomor: p.nomor, tanggal: p.tanggal, tahun: p.tahun, strata: null, versi: p.versi || await versiAktif() };
  }
  const sert = await prisma.sertifikat.findUnique({ where: { satuanId }, include: { versi: true, periode: true } });
  if (!sert) return null;
  // sertifikat warisan alur lama tidak punya versi/tahun → pakai versi aktif & tahun periode
  return {
    jenis, nomor: sert.nomor, tanggal: sert.tanggal, tahun: sert.tahun || sert.periode?.tahun || new Date(sert.tanggal).getFullYear(),
    strata: sert.strata, versi: sert.versi || await versiAktif(),
  };
}

const opsiPiagam = { size: UKURAN_PIAGAM, margins: { top: 0, bottom: 0, left: 0, right: 0 } };

async function unduhPiagam(req, res, jenis) {
  const s = await bolehAkses(req.user, req.params.satuanId);
  if (s === 'TIDAK_ADA') throw new Galat(404, 'Satuan pendidikan tidak ditemukan');
  if (!s) throw new Galat(403, 'Tidak berwenang mengakses dokumen ini');
  const d = await muatPiagam(s.id, jenis);
  if (!d) throw new Galat(400, jenis === 'PESERTA' ? 'Piagam Peserta belum digenerate untuk satuan ini.' : 'Piagam Penghargaan belum digenerate untuk satuan ini.');
  const doc = mulaiPdf(res, `${jenis === 'PESERTA' ? 'Piagam-Peserta' : 'Piagam-Penghargaan'}-${aman(s.nama)}.pdf`, opsiPiagam);
  gambarPiagam(doc, { s, ...d });
  doc.end();
  await audit(req.user.nama, 'UNDUH_PDF_SERTIFIKAT', { satuanId: s.id, entitas: jenis === 'PESERTA' ? 'PiagamPeserta' : 'Sertifikat', detail: d.nomor });
}

// Piagam Penghargaan (hasil Kunjungan & Pleno) — rute lama /sertifikat tetap dipakai
r.get('/sertifikat/:satuanId.pdf', bungkus((req, res) => unduhPiagam(req, res, 'HASIL')));
r.get('/piagam-peserta/:satuanId.pdf', bungkus((req, res) => unduhPiagam(req, res, 'PESERTA')));

// Semua piagam periode aktif dalam satu berkas (untuk dicetak sekaligus) — super admin
async function unduhSemua(req, res, jenis) {
  wajibSuperAdmin(req);
  const { periodeId } = await konteksPleno();
  let daftar;
  if (jenis === 'PESERTA') {
    daftar = (await prisma.piagamPeserta.findMany({
      where: periodeId ? { periodeId } : {}, include: { satuan: { include: { kecamatan: true } } }, orderBy: { nomor: 'asc' },
    })).map((p) => p.satuan);
  } else {
    daftar = (await prisma.hasilFinal.findMany({
      where: { periodeId, satuan: { sertifikat: { isNot: null } } },
      include: { satuan: { include: { kecamatan: true } } }, orderBy: { peringkat: 'asc' },
    })).map((h) => h.satuan);
  }
  if (!daftar.length) throw new Galat(400, 'Belum ada piagam yang digenerate.');
  const doc = mulaiPdf(res, `${jenis === 'PESERTA' ? 'Piagam-Peserta' : 'Piagam-Penghargaan'}-Semua.pdf`, opsiPiagam);
  for (let n = 0; n < daftar.length; n++) {
    if (n > 0) doc.addPage({ size: UKURAN_PIAGAM, margins: opsiPiagam.margins });
    const d = await muatPiagam(daftar[n].id, jenis);
    gambarPiagam(doc, { s: daftar[n], ...d });
  }
  doc.end();
  await audit(req.user.nama, 'UNDUH_PDF_SERTIFIKAT', { entitas: jenis === 'PESERTA' ? 'PiagamPeserta' : 'Sertifikat', detail: `${daftar.length} piagam` });
}
r.get('/sertifikat-semua.pdf', bungkus((req, res) => unduhSemua(req, res, 'HASIL')));
r.get('/piagam-peserta-semua.pdf', bungkus((req, res) => unduhSemua(req, res, 'PESERTA')));

export default r;
