import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authRequired, requireRole, audit } from '../lib/auth.js';
import { hitungStratifikasi, jenjangGrup } from '../lib/scoring.js';
import { notifyKecamatan, notifyKabupaten } from '../lib/notify.js';
import { cekLaranganJuara, adaPernyataan, PESAN_PERNYATAAN } from '../lib/aturan.js';
import { daftarTautan, hapusBerkasFisik } from '../lib/unggah.js';

const r = Router();

async function getSatuan(userId) {
  return prisma.satuanPendidikan.findUnique({ where: { userId } });
}
function indikatorJenjang(jenjang) {
  return prisma.indikator.findMany({ where: { jenjang: jenjangGrup(jenjang) } });
}

// Ambil / buat penilaian mandiri aktif milik sekolah
r.get('/mine', authRequired, requireRole('SATUAN_PENDIDIKAN'), async (req, res) => {
  const s = await getSatuan(req.user.id);
  if (!s) return res.status(404).json({ error: 'Satuan tidak ditemukan' });

  let penilaian = await prisma.penilaian.findFirst({
    where: { satuanId: s.id }, orderBy: { createdAt: 'desc' },
    include: { jawaban: { include: { lampiran: { orderBy: { createdAt: 'asc' } } } } },
  });
  const periodeAktif = await prisma.periode.findFirst({ where: { aktif: true } });
  const larangan = await cekLaranganJuara(s.id, periodeAktif?.id);
  if (larangan) return res.json({ larangan, penilaian: null });

  if (!penilaian) {
    penilaian = await prisma.penilaian.create({ data: { satuanId: s.id, status: 'DRAFT' }, include: { jawaban: { include: { lampiran: true } } } });
  }
  res.json({ larangan: null, penilaian });
});

// Simpan jawaban (Ya=1 / Tidak=0)
r.put('/mine', authRequired, requireRole('SATUAN_PENDIDIKAN'), async (req, res) => {
  const s = await getSatuan(req.user.id);
  const { jawaban } = req.body;
  const periodeAktif0 = await prisma.periode.findFirst({ where: { aktif: true } });
  const larangan0 = await cekLaranganJuara(s.id, periodeAktif0?.id);
  if (larangan0) return res.status(403).json({ error: larangan0.alasan, larangan: larangan0 });

  // Draf dibuat di sini bila belum ada, sehingga penyimpanan jawaban tidak
  // bergantung pada halaman penilaian sempat dibuka lebih dulu.
  let penilaian = await prisma.penilaian.findFirst({ where: { satuanId: s.id }, orderBy: { createdAt: 'desc' } });
  if (!penilaian) penilaian = await prisma.penilaian.create({ data: { satuanId: s.id, status: 'DRAFT' } });
  // Setelah dikirim, jawaban terkunci: kecamatan memverifikasi data yang sama
  // dengan yang disetujui sekolah saat mengirim (bukan yang diubah belakangan).
  if (penilaian.status !== 'DRAFT') {
    return res.status(400).json({
      error: penilaian.status === 'DIVERIFIKASI'
        ? 'Penilaian sudah diverifikasi dan tidak dapat diubah.'
        : 'Penilaian mandiri sudah dikirim dan tidak dapat diubah. Hubungi TP UKS/M Kecamatan bila ada koreksi.',
    });
  }

  for (const j of jawaban || []) {
    const nilai = j.nilaiMandiri ? 1 : 0;
    // Pernyataan bukti hanya berlaku untuk jawaban Ya; jawaban Tidak selalu false.
    const pernyataanEviden = nilai === 1 ? Boolean(j.pernyataanEviden) : false;
    await prisma.jawabanPenilaian.upsert({
      where: { penilaianId_indikatorId: { penilaianId: penilaian.id, indikatorId: j.indikatorId } },
      update: { nilaiMandiri: nilai, pernyataanEviden },
      create: { penilaianId: penilaian.id, indikatorId: j.indikatorId, nilaiMandiri: nilai, pernyataanEviden },
    });
  }
  // Tandai tahap sedang mengisi penilaian mandiri (bila masih di REGISTRASI)
  await prisma.satuanPendidikan.updateMany({ where: { id: s.id, tahap: 'REGISTRASI' }, data: { tahap: 'PENILAIAN_MANDIRI' } });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// BUKTI DUKUNG PADA PENILAIAN MANDIRI — TAUTAN SAJA (OPSIONAL)
// Sesuai keputusan Tim Pembina, pada tahap penilaian mandiri bukti dukung
// dikirim berupa TAUTAN per berkas sesuai indikator (bukan unggahan berkas dan
// bukan tautan folder). Unggahan berkas dilakukan pada tahap Eviden
// Stratifikasi setelah satuan direkomendasikan.
// ---------------------------------------------------------------------------
const POLA_FOLDER = [
  /drive\.google\.com\/drive\/folders/i,
  /drive\.google\.com\/folderview/i,
  /onedrive\.live\.com\/.*(cid=|folder)/i,
  /dropbox\.com\/(home|scl\/fo)/i,
];

export const MAKS_TAUTAN = 2;

function periksaTautan(u) {
  let url;
  try { url = new URL(u); } catch { return 'Tautan tidak valid. Awali dengan http:// atau https://'; }
  if (!['http:', 'https:'].includes(url.protocol)) return 'Tautan harus memakai http:// atau https://';
  if (POLA_FOLDER.some((p) => p.test(u))) {
    return 'Tautan folder tidak diterima. Kirim tautan per berkas sesuai indikator.';
  }
  return null;
}

r.post('/mine/lampiran', authRequired, requireRole('SATUAN_PENDIDIKAN'), async (req, res) => {
  const s = await getSatuan(req.user.id);
  const tautanBaru = daftarTautan(req.body);
  if (!tautanBaru.length) return res.status(400).json({ error: 'Isi tautan bukti dukung terlebih dahulu.' });
  for (const u of tautanBaru) {
    const galat = periksaTautan(u);
    if (galat) return res.status(400).json({ error: galat });
  }

  const { indikatorId } = req.body;
  const ind = indikatorId ? await prisma.indikator.findUnique({ where: { id: indikatorId } }) : null;
  if (!ind || ind.jenjang !== jenjangGrup(s.jenjang)) {
    return res.status(400).json({ error: 'Indikator tidak valid untuk jenjang sekolah ini.' });
  }

  let penilaian = await prisma.penilaian.findFirst({ where: { satuanId: s.id }, orderBy: { createdAt: 'desc' } });
  if (!penilaian) penilaian = await prisma.penilaian.create({ data: { satuanId: s.id, status: 'DRAFT' } });
  if (penilaian.status !== 'DRAFT') {
    return res.status(400).json({ error: 'Penilaian mandiri sudah dikirim — bukti dukung tidak dapat diubah.' });
  }

  const jawaban = await prisma.jawabanPenilaian.upsert({
    where: { penilaianId_indikatorId: { penilaianId: penilaian.id, indikatorId } },
    update: {},
    create: { penilaianId: penilaian.id, indikatorId, nilaiMandiri: 0 },
  });
  // Tautan yang sama tidak dicatat dua kali
  const sudahAda = new Set(
    (await prisma.lampiranJawaban.findMany({ where: { jawabanId: jawaban.id }, select: { fileUrl: true } }))
      .map((l) => (l.fileUrl || '').trim().toLowerCase()),
  );
  const yangBaru = [...new Map(tautanBaru.filter((u) => !sudahAda.has(u.toLowerCase())).map((u) => [u.toLowerCase(), u])).values()];
  // Rapat akhir Okt 2026: satu indikator maksimal MAKS_TAUTAN tautan bukti
  if (sudahAda.size + yangBaru.length > MAKS_TAUTAN) {
    const sisa = Math.max(0, MAKS_TAUTAN - sudahAda.size);
    return res.status(400).json({
      error: sisa === 0
        ? `Maksimal ${MAKS_TAUTAN} tautan bukti per indikator sudah tercapai. Hapus salah satu tautan bila ingin menggantinya.`
        : `Maksimal ${MAKS_TAUTAN} tautan bukti per indikator — tersisa ${sisa} tempat.`,
    });
  }
  let ditambah = 0;
  for (const u of yangBaru) {
    await prisma.lampiranJawaban.create({
      data: { jawabanId: jawaban.id, jenis: 'TAUTAN', fileUrl: u, fileName: u, diunggahOleh: req.user.nama },
    });
    ditambah++;
  }
  const hasil = await prisma.jawabanPenilaian.findUnique({
    where: { id: jawaban.id }, include: { lampiran: { orderBy: { createdAt: 'asc' } } },
  });
  await audit(req.user.nama, 'LAMPIRAN_PENILAIAN_MANDIRI', { satuanId: s.id, entitas: 'JawabanPenilaian', detail: `${ind.kode}: +${ditambah} tautan` });
  res.json(hasil);
});

r.delete('/mine/lampiran/:id', authRequired, requireRole('SATUAN_PENDIDIKAN'), async (req, res) => {
  const s = await getSatuan(req.user.id);
  const lampiran = await prisma.lampiranJawaban.findUnique({
    where: { id: req.params.id }, include: { jawaban: { include: { penilaian: true } } },
  });
  if (!lampiran || lampiran.jawaban.penilaian.satuanId !== s.id) {
    return res.status(404).json({ error: 'Lampiran tidak ditemukan' });
  }
  if (lampiran.jawaban.penilaian.status !== 'DRAFT') {
    return res.status(400).json({ error: 'Penilaian mandiri sudah dikirim — bukti dukung tidak dapat dihapus.' });
  }
  await prisma.lampiranJawaban.delete({ where: { id: lampiran.id } });
  hapusBerkasFisik(lampiran.filePath);
  res.json({ ok: true });
});

// SUBMIT penilaian mandiri
r.post('/mine/submit', authRequired, requireRole('SATUAN_PENDIDIKAN'), async (req, res) => {
  const s = await getSatuan(req.user.id);
  // Larangan peraih penghargaan diperiksa paling awal agar pesannya tepat
  const periodeCek = await prisma.periode.findFirst({ where: { aktif: true } });
  const larangan = await cekLaranganJuara(s.id, periodeCek?.id);
  if (larangan) return res.status(403).json({ error: larangan.alasan, larangan });

  if (!s.profilLengkap) return res.status(400).json({ error: 'Lengkapi profil satuan pendidikan terlebih dahulu' });
  if (!adaPernyataan(req.body)) return res.status(400).json({ error: PESAN_PERNYATAAN });

  const penilaian = await prisma.penilaian.findFirst({
    where: { satuanId: s.id }, orderBy: { createdAt: 'desc' },
    include: { jawaban: { include: { indikator: true } } },
  });
  if (!penilaian) return res.status(404).json({ error: 'Penilaian tidak ditemukan' });
  if (penilaian.status !== 'DRAFT') return res.status(400).json({ error: 'Penilaian mandiri sudah dikirim dan tidak dapat dikirim ulang.' });

  const indikator = await indikatorJenjang(s.jenjang);
  if (penilaian.jawaban.length < indikator.length) {
    return res.status(400).json({ error: `Isi semua indikator (${penilaian.jawaban.length}/${indikator.length})` });
  }

  // Setiap indikator yang dijawab Ya wajib disertai pernyataan bahwa bukti
  // dukungnya tersedia — tidak boleh ada klaim terpenuhi tanpa bukti.
  const tanpaPernyataan = penilaian.jawaban.filter((j) => j.nilaiMandiri === 1 && !j.pernyataanEviden);
  if (tanpaPernyataan.length) {
    const kode = tanpaPernyataan.slice(0, 5).map((j) => j.indikator?.kode).filter(Boolean);
    return res.status(400).json({
      error: `${tanpaPernyataan.length} indikator dijawab Ya tetapi belum disertai pernyataan ketersediaan bukti dukung`
        + (kode.length ? ` (mis. ${kode.join(', ')}${tanpaPernyataan.length > kode.length ? ', …' : ''})` : '')
        + '. Centang pernyataan bukti pada indikator tersebut.',
      indikatorBelumBerpernyataan: tanpaPernyataan.map((j) => j.indikatorId),
    });
  }

  const input = penilaian.jawaban.map((j) => ({ nilai: j.nilaiMandiri, komponenId: j.indikator.komponenId, strata: j.indikator.strata }));
  const { nilai, strata } = hitungStratifikasi(input);

  const periodeAktif = await prisma.periode.findFirst({ where: { aktif: true } });
  await prisma.penilaian.update({
    where: { id: penilaian.id },
    data: { status: 'SUBMITTED', skorMandiri: nilai, strataMandiri: strata, submittedAt: new Date(), periodeId: periodeAktif?.id || null, pernyataanMandiri: true },
  });
  await prisma.satuanPendidikan.update({ where: { id: s.id }, data: { tahap: 'MENUNGGU_VERIFIKASI' } });
  await audit(req.user.nama, 'SUBMIT_PENILAIAN_MANDIRI', { satuanId: s.id, entitas: 'Penilaian', detail: `Nilai ${nilai} (${strata || 'Belum Mencapai Dasar'}) — dinyatakan sesuai fakta lapangan` });
  await notifyKecamatan(s.kecamatanId, { judul: 'Penilaian mandiri baru', pesan: `${s.nama} mengirim penilaian mandiri untuk diverifikasi.`, tipe: 'info', link: '/verifikasi', satuanId: s.id });
  await notifyKabupaten({ judul: 'Data awal strata bertambah', pesan: `${s.nama} mengirim penilaian mandiri (nilai ${nilai}).`, tipe: 'info', link: '/data-awal', satuanId: s.id });

  res.json({ ok: true, skorMandiri: nilai, strataMandiri: strata });
});

export default r;
