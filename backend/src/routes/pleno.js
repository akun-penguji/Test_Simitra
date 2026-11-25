// Hasil Pleno + Pengaturan Sertifikat Kepesertaan — KHUSUS super admin.
// Dipasang di /api/pleno (BUKAN /api/kabupaten) karena memakai requireAdmin di tingkat router.
// (Koordinator Tim Stratifikasi Kabupaten). Menggantikan "Hasil Final & SK Bupati":
// SK Bupati kini dibuat di luar sistem (rapat akhir Okt 2026).
import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma.js';
import { authRequired, requireRole, requireAdmin, audit } from '../lib/auth.js';
import { adaPernyataan, PESAN_PERNYATAAN } from '../lib/aturan.js';
import { paging, halaman, mintaSemua } from '../lib/paginasi.js';
import { Galat, bungkus } from '../lib/galat.js';
import { AMBANG_NILAI_TERPENUHI } from '../lib/scoring.js';
import {
  konteksPleno, statusProses, versiAktif, hitungPleno, prosesPleno, bukaKembaliPleno,
  generateSertifikat, generatePiagamPeserta, koreksiNilaiLapangan, pastikanBelumDiproses,
} from '../lib/pleno.js';

const r = Router();
r.use(authRequired, requireRole('TIM_KABUPATEN'), requireAdmin);

// ---------------------------------------------------------------------------
// DAFTAR HASIL PLENO
// ---------------------------------------------------------------------------
const sertakanHasil = {
  satuan: {
    include: {
      kecamatan: true,
      kunjungan: {
        select: {
          strataAwal: true, strataAkhir: true, catatanAkhir: true, terkunci: true,
          reviewUlangOleh: true, reviewUlangPada: true, reviewUlangAlasan: true, jumlahReviewUlang: true,
          revisiOleh: true, revisiPada: true, jumlahRevisi: true,
        },
      },
      sertifikat: { select: { nomor: true, tanggal: true, versiId: true } },
    },
  },
};

r.get('/', bungkus(async (req, res) => {
  const { periodeId } = await konteksPleno();
  const where = { periodeId };
  const urut = [{ skorFinal: 'desc' }, { peringkat: 'asc' }];

  // nilai yang sama ditandai agar Tim dapat memeriksanya saat Review Ulang
  const kembar = await prisma.hasilFinal.groupBy({ by: ['skorFinal'], where, _count: { _all: true } });
  const skorKembar = new Set(kembar.filter((g) => g._count._all > 1).map((g) => g.skorFinal));
  const tandai = (h) => ({ ...h, nilaiSama: skorKembar.has(h.skorFinal) });

  const [proses, versi, jumlahHasil] = await Promise.all([
    statusProses(), versiAktif(), prisma.hasilFinal.count({ where }),
  ]);
  const jumlahSertifikat = await prisma.sertifikat.count({ where: { satuan: { hasilFinal: { periodeId } } } });
  const ringkas = {
    proses: proses && {
      diprosesOleh: proses.diprosesOleh, diprosesPada: proses.diprosesPada,
      jumlahSatdik: proses.jumlahSatdik, jumlahPeraih: proses.jumlahPeraih,
      sertifikatPada: proses.sertifikatPada, sertifikatOleh: proses.sertifikatOleh,
    },
    jumlahSertifikat, jumlahHasil,
    jumlahRekomendasi: await prisma.rekomendasi.count({ where: periodeId ? { periodeId } : {} }),
    jumlahPiagamPeserta: await prisma.piagamPeserta.count({ where: { satuan: { rekomendasi: { is: periodeId ? { periodeId } : {} } } } }),
    penandatanganSiap: !!(versi?.namaPejabat && versi?.ttdMime),
    penandatangan: versi?.namaPejabat || null,
    jumlahNilaiSama: skorKembar.size,
    ambang: AMBANG_NILAI_TERPENUHI,
    // bawaan isian generate sertifikat (admin tetap harus mengisi/menegaskan sebelum generate)
    isianSertifikat: {
      nomorRubrikasi: (await prisma.pengaturanNomor.findUnique({ where: { jenis: 'SERTIFIKAT' } }))?.pola || '',
      tahun: (await prisma.periode.findUnique({ where: { id: periodeId } }))?.tahun || new Date().getFullYear(),
    },
  };

  if (mintaSemua(req)) {
    const semua = await prisma.hasilFinal.findMany({ where, include: sertakanHasil, orderBy: urut });
    return res.json({ data: semua.map(tandai), ...ringkas });
  }
  const { page, pageSize, skip, take } = paging(req, { bawaan: 25 });
  const list = await prisma.hasilFinal.findMany({ where, include: sertakanHasil, orderBy: urut, skip, take });
  res.json({ ...halaman(list.map(tandai), jumlahHasil, page, pageSize), ...ringkas });
}));

// 1) Hitung — nilai pleno, strata akhir (oleh sistem), peringkat, dan 12 peraih
r.post('/hitung', bungkus(async (req, res) => {
  const hasil = await hitungPleno(req.user.nama);
  await audit(req.user.nama, 'HITUNG_PLENO', {
    entitas: 'HasilFinal', detail: `${hasil.total} satdik, ${hasil.peraih} peraih, strata akhir dihitung sistem`,
  });
  res.json({ ok: true, total: hasil.total, peraih: hasil.peraih });
}));

// 2) Review Ulang — untuk SEMUA satdik di Hasil Pleno. Nilai eviden 0-3 yang sudah
// diberikan dapat dikoreksi; peringkat, peraih, dan strata akhir dihitung ulang.
r.post('/review-ulang/:satuanId', bungkus(async (req, res) => {
  const { alasan, skorLapangan } = req.body;
  if (!alasan || !String(alasan).trim()) throw new Galat(400, 'Alasan review ulang wajib diisi.');
  if (!adaPernyataan(req.body)) throw new Galat(400, PESAN_PERNYATAAN);
  await pastikanBelumDiproses();

  const { periodeId } = await konteksPleno();
  const hasil = await prisma.hasilFinal.findFirst({ where: { satuanId: req.params.satuanId, periodeId } });
  if (!hasil) throw new Galat(404, 'Satuan ini tidak ada dalam Hasil Pleno.');
  const kunjungan = await prisma.kunjunganLapangan.findUnique({ where: { satuanId: req.params.satuanId } });
  if (!kunjungan) throw new Galat(404, 'Data kunjungan lapangan tidak ditemukan.');

  const { perubahan } = await koreksiNilaiLapangan({
    satuanId: req.params.satuanId, skorLapangan, namaPenilai: req.user.nama, indikatorBoleh: null,
  });
  const waktu = new Date();
  await prisma.kunjunganLapangan.update({
    where: { satuanId: req.params.satuanId },
    data: {
      reviewUlangOleh: req.user.nama, reviewUlangPada: waktu, reviewUlangAlasan: String(alasan).trim(),
      jumlahReviewUlang: { increment: 1 },
      temuan: [kunjungan.temuan, `[Review ulang ${waktu.toLocaleDateString('id-ID')} — ${req.user.nama}] ${String(alasan).trim()}`]
        .filter(Boolean).join('\n'),
    },
  });
  await hitungPleno(req.user.nama); // peringkat, peraih & strata akhir disegarkan
  const baru = await prisma.hasilFinal.findUnique({ where: { satuanId: req.params.satuanId } });
  await audit(req.user.nama, 'REVIEW_ULANG_PLENO', {
    satuanId: req.params.satuanId, entitas: 'HasilFinal',
    detail: `${String(alasan).trim().slice(0, 100)} | ${perubahan.length} nilai diubah${perubahan.length ? ': ' + perubahan.slice(0, 8).join(', ') : ''}`
      + ` | skor ${baru?.skorFinal}, strata ${baru?.strataFinal || 'Belum Mencapai Dasar'}, peringkat ${baru?.peringkat}`,
  });
  res.json({
    ok: true, diubah: perubahan.length, perubahan,
    skorFinal: baru?.skorFinal, strataFinal: baru?.strataFinal ?? null, peringkat: baru?.peringkat, peraih: baru?.peraih,
  });
}));

// 3) Proses Hasil Pleno — mengunci hasil & memajukan satdik ke tahap FINAL
r.post('/proses', bungkus(async (req, res) => {
  if (!adaPernyataan(req.body)) throw new Galat(400, PESAN_PERNYATAAN);
  const hasil = await prosesPleno(req.user.nama);
  await audit(req.user.nama, 'PROSES_PLENO', { entitas: 'ProsesPleno', detail: `${hasil.jumlahSatdik} satdik, ${hasil.jumlahPeraih} peraih` });
  res.json({ ok: true, ...hasil });
}));

r.post('/buka-kembali', bungkus(async (req, res) => {
  const { alasan } = req.body;
  if (!alasan || !String(alasan).trim()) throw new Galat(400, 'Alasan membuka kembali Hasil Pleno wajib diisi.');
  const hasil = await bukaKembaliPleno(req.user.nama, String(alasan).trim());
  await audit(req.user.nama, 'BUKA_KEMBALI_PLENO', { entitas: 'ProsesPleno', detail: String(alasan).trim().slice(0, 150) });
  res.json({ ok: true, ...hasil });
}));

// 4) Generate Sertifikat Kepesertaan untuk seluruh satdik di Hasil Pleno
r.post('/sertifikat/generate', bungkus(async (req, res) => {
  const { nomorRubrikasi, tanggalTerbit, tahun, terbitkanUlang } = req.body || {};
  const hasil = await generateSertifikat(req.user.nama, { nomorRubrikasi, tanggalTerbit, tahun, terbitkanUlang });
  await audit(req.user.nama, 'GENERATE_SERTIFIKAT', {
    entitas: 'Sertifikat',
    detail: `${hasil.dibuat} baru, ${hasil.diperbarui} diselaraskan/diterbitkan ulang, ${hasil.dilewati} sudah ada | pola ${String(nomorRubrikasi).slice(0, 60)}, tanggal ${tanggalTerbit}, tahun ${tahun}`,
  });
  res.json({ ok: true, ...hasil });
}));

// 4b) Piagam Peserta untuk satdik hasil Rekomendasi Kecamatan (tidak menunggu Hasil Pleno)
r.post('/piagam-peserta/generate', bungkus(async (req, res) => {
  const { nomorRubrikasi, tanggalTerbit, tahun, terbitkanUlang } = req.body || {};
  const hasil = await generatePiagamPeserta(req.user.nama, { nomorRubrikasi, tanggalTerbit, tahun, terbitkanUlang });
  await audit(req.user.nama, 'GENERATE_PIAGAM_PESERTA', {
    entitas: 'PiagamPeserta',
    detail: `${hasil.dibuat} baru, ${hasil.diperbarui} diterbitkan ulang, ${hasil.dilewati} sudah ada | pola ${String(nomorRubrikasi).slice(0, 60)}, tanggal ${tanggalTerbit}, tahun ${tahun}`,
  });
  res.json({ ok: true, ...hasil });
}));

// ---------------------------------------------------------------------------
// PENGATURAN SERTIFIKAT — penandatangan & templat (dinamis: pejabat sering berganti)
// Setiap perubahan membuat VERSI BARU; sertifikat yang sudah terbit tetap memakai
// versi saat diterbitkan. Berkas disimpan di basis data dan hanya disajikan lewat
// endpoint ini (bukan folder /uploads yang terbuka untuk umum).
// ---------------------------------------------------------------------------
const MAKS_TTD = 2 * 1024 * 1024;
const MAKS_TEMPLAT = 5 * 1024 * 1024;

const unggahGambar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAKS_TEMPLAT, files: 3 },
}).fields([{ name: 'ttd', maxCount: 1 }, { name: 'templat', maxCount: 1 }, { name: 'templatPeserta', maxCount: 1 }]);

// Jenis gambar ditentukan dari ISI berkas (bukan dari ekstensi / header klien)
function jenisGambar(buf) {
  if (buf?.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf?.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}

const metaVersi = (v) => v && {
  id: v.id, namaPejabat: v.namaPejabat, jabatan: v.jabatan, nip: v.nip, kota: v.kota,
  adaTtd: !!v.ttdMime, adaTemplat: !!v.templatMime, adaTemplatPeserta: !!v.templatPesertaMime, aktif: v.aktif, dibuatOleh: v.dibuatOleh, createdAt: v.createdAt,
};
const pilihMeta = {
  id: true, namaPejabat: true, jabatan: true, nip: true, kota: true, ttdMime: true, templatMime: true, templatPesertaMime: true,
  aktif: true, dibuatOleh: true, createdAt: true,
};

r.get('/pengaturan-sertifikat', bungkus(async (req, res) => {
  const aktif = await prisma.versiSertifikat.findFirst({ where: { aktif: true }, orderBy: { createdAt: 'desc' }, select: pilihMeta });
  const riwayat = await prisma.versiSertifikat.findMany({ orderBy: { createdAt: 'desc' }, take: 10, select: pilihMeta });
  res.json({ aktif: metaVersi(aktif), riwayat: riwayat.map(metaVersi) });
}));

r.get('/pengaturan-sertifikat/:id/:jenis(ttd|templat|templatPeserta)', bungkus(async (req, res) => {
  const v = await prisma.versiSertifikat.findUnique({ where: { id: req.params.id } });
  const isi = req.params.jenis === 'ttd' ? v?.ttd : req.params.jenis === 'templat' ? v?.templat : v?.templatPeserta;
  const mime = req.params.jenis === 'ttd' ? v?.ttdMime : req.params.jenis === 'templat' ? v?.templatMime : v?.templatPesertaMime;
  if (!v || !isi) throw new Galat(404, 'Berkas tidak ada.');
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(Buffer.from(isi));
}));

r.put('/pengaturan-sertifikat', (req, res, next) => {
  unggahGambar(req, res, (err) => {
    if (err) return next(new Galat(400, err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran gambar melebihi batas (tanda tangan 2 MB, templat 5 MB).' : err.message));
    next();
  });
}, bungkus(async (req, res) => {
  const namaPejabat = String(req.body.namaPejabat || '').trim();
  if (!namaPejabat) throw new Galat(400, 'Nama pejabat penandatangan wajib diisi.');
  const jabatan = String(req.body.jabatan || '').trim() || 'Asisten Pemerintahan dan Kesejahteraan Rakyat Sekretariat Daerah Kabupaten Bekasi';
  const nip = String(req.body.nip || '').trim() || null;
  const kota = String(req.body.kota || '').trim() || 'Cikarang Pusat';

  const berkas = (nama, maks, etiket) => {
    const f = req.files?.[nama]?.[0];
    if (!f) return null;
    if (f.size > maks) throw new Galat(400, `${etiket} melebihi ${maks / 1024 / 1024} MB.`);
    const mime = jenisGambar(f.buffer);
    if (!mime) throw new Galat(400, `${etiket} harus berupa gambar PNG atau JPG yang valid.`);
    return { isi: f.buffer, mime };
  };
  const ttdBaru = berkas('ttd', MAKS_TTD, 'Pindaian tanda tangan');
  const templatBaru = berkas('templat', MAKS_TEMPLAT, 'Gambar templat');
  const hapusTemplat = ['1', 'true'].includes(String(req.body.hapusTemplat || ''));
  const templatPesertaBaru = berkas('templatPeserta', MAKS_TEMPLAT, 'Gambar templat Piagam Peserta');
  const hapusTemplatPeserta = ['1', 'true'].includes(String(req.body.hapusTemplatPeserta || ''));

  const lama = await versiAktif();
  const ttd = ttdBaru || (lama?.ttd ? { isi: lama.ttd, mime: lama.ttdMime } : null);
  const templat = hapusTemplat ? null : (templatBaru || (lama?.templat ? { isi: lama.templat, mime: lama.templatMime } : null));

  const templatPeserta = hapusTemplatPeserta ? null : (templatPesertaBaru || (lama?.templatPeserta ? { isi: lama.templatPeserta, mime: lama.templatPesertaMime } : null));

  const sama = lama && lama.namaPejabat === namaPejabat && lama.jabatan === jabatan && (lama.nip || null) === nip
    && lama.kota === kota && !ttdBaru && !templatBaru && !hapusTemplat && !templatPesertaBaru && !hapusTemplatPeserta;
  if (sama) return res.json({ ok: true, berubah: false, aktif: metaVersi(lama) });

  const baru = await prisma.$transaction(async (tx) => {
    await tx.versiSertifikat.updateMany({ where: { aktif: true }, data: { aktif: false } });
    return tx.versiSertifikat.create({
      data: {
        namaPejabat, jabatan, nip, kota, aktif: true, dibuatOleh: req.user.nama,
        ttd: ttd?.isi, ttdMime: ttd?.mime, templat: templat?.isi, templatMime: templat?.mime,
        templatPeserta: templatPeserta?.isi, templatPesertaMime: templatPeserta?.mime,
      },
    });
  });
  await audit(req.user.nama, 'UBAH_PENGATURAN_SERTIFIKAT', {
    entitas: 'VersiSertifikat', detail: `${namaPejabat}${ttdBaru ? ' · tanda tangan baru' : ''}${templatBaru ? ' · templat baru' : ''}${hapusTemplat ? ' · templat dihapus' : ''}${templatPesertaBaru ? ' · templat peserta baru' : ''}${hapusTemplatPeserta ? ' · templat peserta dihapus' : ''}`,
  });
  res.json({ ok: true, berubah: true, aktif: metaVersi(baru) });
}));

export default r;
