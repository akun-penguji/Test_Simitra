import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { authRequired, requireRole, requireAdmin, audit } from '../lib/auth.js';
import { jenjangGrup, JENJANG_GRUP } from '../lib/scoring.js';
import { lanjutkanKeSeleksi, TAHAP_SEBELUM_SELEKSI } from '../lib/alur.js';
import { Galat, bungkus } from '../lib/galat.js';
import { koreksiNilaiLapangan, segarkanPlenoBilaAda, pastikanBelumDiproses } from '../lib/pleno.js';
import { notifySatuan, notifyKecamatan } from '../lib/notify.js';
import { buildInfografis } from './satuan.js';
import { dec } from '../lib/crypto.js';
import {
  komponenBerwenang, saringIndikatorBerwenang, ringkasKlasifikasi,
  adaPernyataan, PESAN_PERNYATAAN, simpanKlasifikasi,
} from '../lib/aturan.js';
import { diagramStrata } from '../lib/diagram.js';
import { petaPuskesmas, ubahLokasiPuskesmas } from '../lib/puskesmas.js';
import { paging, halaman, mintaSemua } from '../lib/paginasi.js';
import { pastikanPengaturanNomor, renderNomor, PENANDA, JENIS_NOMOR } from '../lib/nomor.js';

// Sembilan jenjang yang ditampilkan terpisah pada dasbor dan laporan (rapat final Okt 2026)
const JENJANG_9 = ['TK', 'RA', 'SD', 'MI', 'SMP', 'MTs', 'SMA', 'SMK', 'MA'];
const jenjang9 = (j) => { const u = String(j || '').toUpperCase(); return u === 'MTS' ? 'MTs' : (JENJANG_9.includes(u) ? u : null); };

const r = Router();
r.use(authRequired, requireRole('TIM_KABUPATEN'));

// Cakupan pendaftaran SIMITRA terhadap jumlah sekolah sebenarnya (acuan Dapodik).
// Dipakai Tim Pembina untuk melihat kecamatan mana yang sekolahnya belum terdaftar.
r.get('/cakupan', async (req, res) => {
  const [kecamatan, terdaftar] = await Promise.all([
    prisma.kecamatan.findMany({ orderBy: { nama: 'asc' } }),
    prisma.satuanPendidikan.groupBy({ by: ['kecamatanId'], _count: true }),
  ]);
  const jml = Object.fromEntries(terdaftar.map((t) => [t.kecamatanId, t._count]));
  const baris = kecamatan.map((k) => {
    const daftar = jml[k.id] || 0;
    const acuan = k.sekolahDapodik || 0;
    return {
      id: k.id, nama: k.nama, sekolahDapodik: acuan, pesertaDidik: k.pesertaDidik, gtk: k.gtk,
      terdaftar: daftar, belum: Math.max(0, acuan - daftar),
      persen: acuan ? Math.round((daftar / acuan) * 1000) / 10 : null,
    };
  });
  const totalAcuan = baris.reduce((a, b) => a + b.sekolahDapodik, 0);
  const totalDaftar = baris.reduce((a, b) => a + b.terdaftar, 0);
  res.json({
    baris,
    total: {
      sekolahDapodik: totalAcuan, terdaftar: totalDaftar, belum: Math.max(0, totalAcuan - totalDaftar),
      persen: totalAcuan ? Math.round((totalDaftar / totalAcuan) * 1000) / 10 : null,
      dapodikPer: kecamatan.find((k) => k.dapodikPer)?.dapodikPer || null,
    },
  });
});

// ---------- KLASIFIKASI PENILAI (hak akses penilaian tim kabupaten) ----------
// Penilai kabupaten hanya berwenang menilai komponen yang ditugaskan kepadanya.
r.get('/klasifikasi-saya', async (req, res) => {
  res.json(await ringkasKlasifikasi(req.user));
});

// ---------- DASHBOARD & DATA AWAL STRATA (LANGKAH 3) ----------
r.get('/dashboard', async (req, res) => {
  const periodeId = req.query.periodeId || undefined;
  const pWhere = periodeId ? { periodeId } : {};
  const [totalSatuan, totalKecamatan, penilaianSubmitted, rekomendasi, peraih] = await Promise.all([
    prisma.satuanPendidikan.count(),
    prisma.kecamatan.count(),
    prisma.penilaian.count({ where: { status: { in: ['SUBMITTED', 'DIVERIFIKASI'] }, ...pWhere } }),
    prisma.rekomendasi.count({ where: { ...pWhere } }),
    prisma.hasilFinal.count({ where: { peraih: true, ...pWhere } }),
  ]);
  const perTahap = await prisma.satuanPendidikan.groupBy({ by: ['tahap'], _count: true });
  const perStrata = await prisma.penilaian.groupBy({
    by: ['strataVerifikasi'], _count: true, where: { strataVerifikasi: { not: null }, ...pWhere },
  });

  // Tabel lengkap (rapat final Okt 2026): satuan pendidikan per kecamatan × 9 jenjang,
  // dan sebaran strata per jenjang (TK, RA, SD, MI, SMP, MTs, SMA, SMK, MA dipisah).
  const [kecamatan, satuan] = await Promise.all([
    prisma.kecamatan.findMany({ orderBy: { nama: 'asc' }, select: { id: true, nama: true } }),
    prisma.satuanPendidikan.findMany({
      select: {
        jenjang: true, kecamatanId: true,
        penilaian: { where: pWhere, orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, strataVerifikasi: true } },
      },
    }),
  ]);
  const kosongJ = () => Object.fromEntries(JENJANG_9.map((j) => [j, 0]));
  const perKecamatan = new Map(kecamatan.map((k) => [k.id, { kecamatan: k.nama, ...kosongJ(), total: 0 }]));
  const perJenjang = Object.fromEntries(JENJANG_9.map((j) => [j, { jenjang: j, total: 0, DASAR: 0, MADYA: 0, UTAMA: 0, PARIPURNA: 0, belum: 0 }]));
  for (const s of satuan) {
    const j = jenjang9(s.jenjang);
    if (!j) continue;
    const kk = perKecamatan.get(s.kecamatanId);
    if (kk) { kk[j]++; kk.total++; }
    const pj = perJenjang[j];
    pj.total++;
    const strata = s.penilaian[0]?.strataVerifikasi;
    if (strata) pj[strata]++; else pj.belum++;
  }
  res.json({
    totalSatuan, totalKecamatan, penilaianSubmitted, rekomendasi, peraih, perTahap, perStrata,
    jenjang: JENJANG_9,
    perKecamatanJenjang: [...perKecamatan.values()],
    strataPerJenjang: JENJANG_9.map((j) => perJenjang[j]),
  });
});

// Laporan strata tiga tahap (rapat final Okt 2026): (1) penilaian mandiri, (2) hasil
// verifikasi kecamatan, (3) hasil pleno Tim Kabupaten — hanya satdik yang masuk daftar
// kunjungan. Dikirim sebagai hitungan per (kecamatan, jenjang, strata) agar ringan;
// 'BELUM' = belum mencapai Dasar.
r.get('/laporan-strata', async (req, res) => {
  const periode = req.query.periodeId
    ? await prisma.periode.findUnique({ where: { id: String(req.query.periodeId) } })
    : await prisma.periode.findFirst({ where: { aktif: true } });
  const pWhere = periode ? { periodeId: periode.id } : {};
  const [penilaian, pleno] = await Promise.all([
    prisma.penilaian.findMany({
      where: { ...pWhere, status: { in: ['SUBMITTED', 'DIVERIFIKASI'] } },
      distinct: ['satuanId'], orderBy: [{ satuanId: 'asc' }, { createdAt: 'desc' }],
      select: { status: true, strataMandiri: true, strataVerifikasi: true, satuan: { select: { jenjang: true, kecamatan: { select: { nama: true } } } } },
    }),
    prisma.hasilFinal.findMany({
      where: pWhere,
      select: { strataFinal: true, satuan: { select: { jenjang: true, kecamatan: { select: { nama: true } } } } },
    }),
  ]);
  const hitung = (baris, ambilStrata) => {
    const m = new Map();
    for (const b of baris) {
      const j = jenjang9(b.satuan?.jenjang);
      if (!j) continue;
      const kec = b.satuan?.kecamatan?.nama || '-';
      const strata = ambilStrata(b) || 'BELUM';
      const kunci = `${kec}|${j}|${strata}`;
      m.set(kunci, (m.get(kunci) || 0) + 1);
    }
    return [...m.entries()].map(([k, n]) => { const [kecamatan, jenjang, strata] = k.split('|'); return { kecamatan, jenjang, strata, n }; });
  };
  res.json({
    periode: periode ? { id: periode.id, nama: periode.nama, tahun: periode.tahun } : null,
    jenjang: JENJANG_9,
    mandiri: hitung(penilaian, (p) => p.strataMandiri),
    verifikasi: hitung(penilaian.filter((p) => p.status === 'DIVERIFIKASI'), (p) => p.strataVerifikasi),
    pleno: hitung(pleno, (h) => h.strataFinal),
  });
});

// Tren strata antar periode
r.get('/tren', async (req, res) => {
  const periodes = await prisma.periode.findMany({ orderBy: { tahun: 'asc' } });
  const grup = await prisma.penilaian.groupBy({
    by: ['periodeId', 'strataVerifikasi'],
    _count: true,
    where: { strataVerifikasi: { not: null }, periodeId: { not: null } },
  });
  const data = periodes.map((p) => {
    const row = { periode: p.nama, tahun: p.tahun, PARIPURNA: 0, UTAMA: 0, MADYA: 0, DASAR: 0 };
    for (const g of grup) if (g.periodeId === p.id) row[g.strataVerifikasi] = g._count;
    return row;
  });
  res.json(data);
});

// ---------- EXPORT CSV ----------
function csv(rows, headers) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = headers.map((h) => esc(h.label)).join(',');
  const body = rows.map((r) => headers.map((h) => esc(h.get(r))).join(',')).join('\n');
  return '﻿' + head + '\n' + body; // BOM agar Excel baca UTF-8
}
function sendCsv(res, name, content) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(content);
}

r.get('/export/penilaian.csv', async (req, res) => {
  const list = await prisma.satuanPendidikan.findMany({
    include: {
      kecamatan: { select: { nama: true } }, puskesmas: { select: { nama: true } },
      penilaian: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: [{ kecamatanId: 'asc' }, { nama: 'asc' }],
  });
  const content = csv(list, [
    { label: 'NPSN', get: (s) => s.npsn },
    { label: 'Nama Sekolah', get: (s) => s.nama },
    { label: 'Jenjang', get: (s) => s.jenjang },
    { label: 'Kecamatan', get: (s) => s.kecamatan?.nama },
    { label: 'Puskesmas', get: (s) => s.puskesmas?.nama },
    { label: 'Tahap', get: (s) => s.tahap },
    { label: 'Nilai Mandiri', get: (s) => s.penilaian[0]?.skorMandiri },
    { label: 'Strata Mandiri', get: (s) => s.penilaian[0]?.strataMandiri },
    { label: 'Nilai Verifikasi', get: (s) => s.penilaian[0]?.skorVerifikasi },
    { label: 'Strata Verifikasi', get: (s) => s.penilaian[0]?.strataVerifikasi },
  ]);
  sendCsv(res, 'data-penilaian-uksm.csv', content);
});

r.get('/export/final.csv', requireAdmin, async (req, res) => {
  const list = await prisma.hasilFinal.findMany({
    include: { satuan: { include: { kecamatan: { select: { nama: true } }, kunjungan: { select: { strataAwal: true } } } } },
    orderBy: [{ skorFinal: 'desc' }, { peringkat: 'asc' }],
  });
  const content = csv(list, [
    { label: 'Peringkat', get: (h) => h.peringkat },
    { label: 'Nama Sekolah', get: (h) => h.satuan.nama },
    { label: 'Kecamatan', get: (h) => h.satuan.kecamatan?.nama },
    { label: 'Skor Pleno (%)', get: (h) => h.skorFinal },
    { label: 'Strata Awal', get: (h) => h.satuan.kunjungan?.strataAwal || '' },
    { label: 'Strata Akhir', get: (h) => h.strataFinal || 'Belum Mencapai Dasar' },
    { label: 'Peraih', get: (h) => (h.peraih ? 'Ya' : 'Tidak') },
  ]);
  sendCsv(res, 'hasil-pleno-uksm.csv', content);
});

// ---------- LOG AUDIT KEAMANAN (menyeluruh, terdekripsi) ----------
r.get('/audit', requireAdmin, async (req, res) => {
  const { role, method, q } = req.query;
  const { page, pageSize, skip, take } = paging(req, { bawaan: 40, maks: 100 });
  const where = {
    ...(role ? { role } : {}),
    ...(method ? { method } : {}),
  };
  const toRow = (l) => ({
    id: l.id, waktu: l.createdAt, role: l.role, method: l.method, statusCode: l.statusCode,
    aksi: l.aksi, entitas: l.entitas, satuanId: l.satuanId,
    aktor: dec(l.aktor), username: dec(l.username), ip: dec(l.ip), path: dec(l.path), detail: dec(l.detail), userAgent: dec(l.userAgent),
  });

  if (q) {
    // field terenkripsi tak bisa dicari di DB → dekripsi lalu filter di memori (batas 3000 terbaru)
    const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 3000 });
    const s = q.toLowerCase();
    const filtered = logs.map(toRow).filter((d) => [d.username, d.aktor, d.ip, d.path, d.aksi, d.detail].some((x) => (x || '').toLowerCase().includes(s)));
    const total = filtered.length;
    const data = filtered.slice((page - 1) * pageSize, page * pageSize);
    return res.json(halaman(data, total, page, pageSize));
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
  ]);
  res.json(halaman(logs.map(toRow), total, page, pageSize));
});

// Infografis profil sebuah satuan (untuk kabupaten)
r.get('/infografis/:satuanId', async (req, res) => {
  const data = await buildInfografis(req.params.satuanId);
  if (!data) return res.status(404).json({ error: 'Satuan tidak ditemukan' });
  res.json(data);
});

// Peta sebaran sekolah (yang punya koordinat)
r.get('/peta', async (req, res) => {
  const list = await prisma.satuanPendidikan.findMany({
    where: { latitude: { not: null }, longitude: { not: null } },
    select: {
      id: true, nama: true, jenjang: true, latitude: true, longitude: true, tahap: true,
      kecamatan: { select: { nama: true } },
      puskesmas: { select: { nama: true } },
      penilaian: { orderBy: { createdAt: 'desc' }, take: 1, select: { strataVerifikasi: true, strataMandiri: true } },
    },
  });
  res.json(list.map((s) => ({
    id: s.id, nama: s.nama, jenjang: s.jenjang, lat: s.latitude, lng: s.longitude, tahap: s.tahap,
    kecamatan: s.kecamatan?.nama, puskesmas: s.puskesmas?.nama,
    strata: s.penilaian[0]?.strataVerifikasi || s.penilaian[0]?.strataMandiri || null,
  })));
});

// LANGKAH 3: data awal strata dari penilaian mandiri semua satuan (paginasi + cari)
r.get('/penilaian', async (req, res) => {
  const { page, pageSize, skip, take } = paging(req, { bawaan: 20, maks: 100 });
  const q = (req.query.q || '').trim();
  const kecamatanId = req.query.kecamatanId || undefined;

  const where = {
    penilaian: { some: { status: { in: ['SUBMITTED', 'DIVERIFIKASI'] } } },
    ...(kecamatanId ? { kecamatanId } : {}),
    ...(q ? { OR: [{ nama: { contains: q, mode: 'insensitive' } }, { npsn: { contains: q } }] } : {}),
  };
  const [total, list] = await Promise.all([
    prisma.satuanPendidikan.count({ where }),
    prisma.satuanPendidikan.findMany({
      where,
      include: { kecamatan: true, puskesmas: true, penilaian: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { nama: 'asc' },
      skip, take,
    }),
  ]);
  res.json(halaman(list, total, page, pageSize));
});

// ---------- REKOMENDASI KECAMATAN (peserta seleksi) ----------
r.get('/rekomendasi', async (req, res) => {
  const { page, pageSize, skip, take } = paging(req, { bawaan: 25 });
  // ?adaEviden=1 → hanya yang sudah membuat eviden (dipakai halaman Review Eviden).
  // Disaring di server supaya tidak ada baris yang hilang akibat penyaringan
  // dilakukan setelah pemenggalan halaman.
  const { kecamatanId, tingkat } = req.query;
  const q = (req.query.q || '').trim();
  const saringSatuan = {
    ...(req.query.adaEviden === '1' ? { eviden: { isNot: null } } : {}),
    ...(kecamatanId ? { kecamatanId } : {}),
    // tingkat = TK | SD | SMP | SMA → seluruh jenjang setara (RA, MI, MTs, SMK, …)
    ...(tingkat && JENJANG_GRUP[tingkat] ? { jenjang: { in: JENJANG_GRUP[tingkat] } } : {}),
    ...(q ? { OR: [{ nama: { contains: q, mode: 'insensitive' } }, { npsn: { contains: q } }] } : {}),
  };
  const where = Object.keys(saringSatuan).length ? { satuan: saringSatuan } : {};
  const [total, list] = await Promise.all([
    prisma.rekomendasi.count({ where }),
    prisma.rekomendasi.findMany({
    where,
    include: {
      satuan: {
        include: {
          kecamatan: true,
          penilaian: { orderBy: { createdAt: 'desc' }, take: 1 },
          eviden: { include: { items: true } },
          sertifikat: true,
          pendaftaranSeleksi: true,
        },
      },
    },
    orderBy: [{ kecamatanId: 'asc' }, { peringkat: 'asc' }],
      skip, take,
    }),
  ]);
  res.json(halaman(list, total, page, pageSize));
});

// ---------- DAFTAR PESERTA SELEKSI ADMINISTRASI (LANGKAH 12) ----------
// Penyaringan dilakukan di server agar peserta tidak hilang dari halaman hanya
// karena tersaring setelah pemenggalan halaman (bug: satuan yang sudah direview
// tidak muncul di menu Seleksi Administrasi).
r.get('/seleksi', async (req, res) => {
  const { page, pageSize, skip, take } = paging(req, { bawaan: 25 });
  const q = (req.query.q || '').trim();
  const kecamatanId = req.query.kecamatanId || undefined;
  const skoring = req.query.skoring; // 'belum' | 'sudah' | kosong = semua

  const where = {
    AND: [
      // peserta = sudah didaftarkan kecamatan, atau sudah berjalan di tahap seleksi
      {
        OR: [
          { pendaftaranSeleksi: { isNot: null } },
          { tahap: { in: ['SELEKSI_ADMINISTRASI', 'KUNJUNGAN_LAPANGAN', 'FINAL'] } },
        ],
      },
      ...(kecamatanId ? [{ kecamatanId }] : []),
      ...(q ? [{ OR: [{ nama: { contains: q, mode: 'insensitive' } }, { npsn: { contains: q } }] }] : []),
      // Pemisahan belum / sudah skoring seleksi administrasi
      ...(skoring === 'sudah' ? [{ eviden: { skorSeleksi: { not: null } } }] : []),
      ...(skoring === 'belum'
        ? [{ OR: [{ eviden: { is: null } }, { eviden: { skorSeleksi: null } }] }]
        : []),
    ],
  };
  const sertakan = {
    kecamatan: true,
    pendaftaranSeleksi: true,
    sertifikat: true,
    eviden: { select: { id: true, status: true, skorSeleksi: true, lolosSeleksi: true } },
    penilaian: { orderBy: { createdAt: 'desc' }, take: 1, select: { strataVerifikasi: true } },
  };
  const [total, list, belum, sudah] = await Promise.all([
    prisma.satuanPendidikan.count({ where }),
    prisma.satuanPendidikan.findMany({
      where, include: sertakan,
      orderBy: [{ kecamatan: { nama: 'asc' } }, { nama: 'asc' }],
      skip, take,
    }),
    prisma.satuanPendidikan.count({
      where: {
        AND: [
          { OR: [{ pendaftaranSeleksi: { isNot: null } }, { tahap: { in: ['SELEKSI_ADMINISTRASI', 'KUNJUNGAN_LAPANGAN', 'FINAL'] } }] },
          { OR: [{ eviden: { is: null } }, { eviden: { skorSeleksi: null } }] },
        ],
      },
    }),
    prisma.satuanPendidikan.count({
      where: {
        AND: [
          { OR: [{ pendaftaranSeleksi: { isNot: null } }, { tahap: { in: ['SELEKSI_ADMINISTRASI', 'KUNJUNGAN_LAPANGAN', 'FINAL'] } }] },
          { eviden: { skorSeleksi: { not: null } } },
        ],
      },
    }),
  ]);
  res.json({ ...halaman(list, total, page, pageSize), ringkas: { belumSkoring: belum, sudahSkoring: sudah } });
});

// ---------- LANGKAH 8: REVIEW KESESUAIAN EVIDEN ----------
r.get('/eviden/:satuanId', async (req, res) => {
  const eviden = await prisma.eviden.findUnique({
    where: { satuanId: req.params.satuanId },
    include: {
      satuan: { include: { kecamatan: true } },
      items: {
        include: { indikator: { include: { komponen: true } }, berkas: { orderBy: { createdAt: 'asc' } } },
        // Urutan dipaku pada komponen & indikator agar tidak berpindah-pindah
        // setiap kali status review satu indikator diubah.
        orderBy: [
          { indikator: { komponen: { urutan: 'asc' } } },
          { indikator: { strata: 'asc' } },
          { indikator: { urutan: 'asc' } },
          { indikator: { kode: 'asc' } },
        ],
      },
    },
  });
  if (!eviden) return res.status(404).json({ error: 'Eviden tidak ditemukan' });
  res.json(eviden);
});

// Review per item: Disetujui / Revisi (+catatan) - LANGKAH 8
r.post('/eviden/item/:itemId/review', async (req, res) => {
  const { status, catatan } = req.body; // status: DISETUJUI | REVISI
  if (!['DISETUJUI', 'REVISI'].includes(status)) return res.status(400).json({ error: 'Status tidak valid' });
  if (status === 'REVISI' && !catatan) return res.status(400).json({ error: 'Keterangan perbaikan wajib diisi untuk status revisi' });

  const exists = await prisma.evidenItem.findUnique({
    where: { id: req.params.itemId }, include: { indikator: { select: { komponenId: true } } },
  });
  if (!exists) return res.status(404).json({ error: 'Item eviden tidak ditemukan' });
  const izinKomp = await komponenBerwenang(req.user);
  if (izinKomp !== null && !izinKomp.has(exists.indikator.komponenId)) {
    return res.status(403).json({ error: 'Indikator ini di luar klasifikasi penilaian Anda.' });
  }
  const item = await prisma.evidenItem.update({
    where: { id: req.params.itemId },
    data: { statusReview: status, catatanReview: status === 'REVISI' ? catatan : null, reviewerId: req.user.id, reviewedAt: new Date() },
    include: { eviden: true },
  });

  // Jika ada revisi -> sekolah kembali ke pengisian eviden (LANGKAH 9)
  const items = await prisma.evidenItem.findMany({ where: { evidenId: item.evidenId } });
  const semuaDisetujui = items.length > 0 && items.every((i) => i.statusReview === 'DISETUJUI');
  const adaRevisi = items.some((i) => i.statusReview === 'REVISI');

  let lanjut = null;
  if (adaRevisi) {
    // Hanya menarik sekolah kembali ke pengisian eviden bila belum jauh di tahap seleksi;
    // sekolah yang sudah diskoring / dikunjungi tidak dimundurkan tahapnya.
    const { tahap } = await prisma.satuanPendidikan.findUnique({ where: { id: item.eviden.satuanId }, select: { tahap: true } });
    if ([...TAHAP_SEBELUM_SELEKSI, 'TERDAFTAR_SELEKSI'].includes(tahap)) {
      await prisma.satuanPendidikan.update({ where: { id: item.eviden.satuanId }, data: { tahap: 'PENGISIAN_EVIDEN' } });
    }
    if (status === 'REVISI') await notifySatuan(item.eviden.satuanId, { judul: 'Eviden perlu revisi', pesan: `Ada indikator eviden yang diminta revisi: ${catatan || 'lihat detail'}`, tipe: 'warning', link: '/eviden' });
  } else if (semuaDisetujui) {
    // Seluruh indikator disetujui → otomatis masuk Seleksi Administrasi
    lanjut = await lanjutkanKeSeleksi(item.eviden.satuanId, req.user.nama);
  }
  res.json({ ok: true, item, semuaDisetujui, adaRevisi, lanjutKeSeleksi: !!lanjut?.dilanjutkan });
});

// Bulk: setujui semua indikator eviden satuan sekaligus
r.post('/eviden/:satuanId/setujui-semua', async (req, res) => {
  const eviden = await prisma.eviden.findUnique({
    where: { satuanId: req.params.satuanId },
    include: { items: { include: { indikator: { select: { komponenId: true } } } } },
  });
  if (!eviden || !eviden.items.length) return res.status(404).json({ error: 'Eviden tidak ditemukan' });

  // hanya menyetujui item pada komponen yang menjadi klasifikasi penilai
  const izinKomp = await komponenBerwenang(req.user);
  const target = izinKomp === null ? eviden.items : eviden.items.filter((i) => izinKomp.has(i.indikator.komponenId));
  if (!target.length) return res.status(403).json({ error: 'Tidak ada indikator pada klasifikasi penilaian Anda.' });

  await prisma.evidenItem.updateMany({
    where: { id: { in: target.map((i) => i.id) } },
    data: { statusReview: 'DISETUJUI', catatanReview: null, reviewerId: req.user.id, reviewedAt: new Date() },
  });
  const semua = await prisma.evidenItem.findMany({ where: { evidenId: eviden.id }, select: { statusReview: true } });
  const semuaDisetujui = semua.every((i) => i.statusReview === 'DISETUJUI');
  let lanjut = null;
  if (semuaDisetujui) lanjut = await lanjutkanKeSeleksi(req.params.satuanId, req.user.nama);
  await audit(req.user.nama, 'SETUJUI_EVIDEN_MASSAL', { satuanId: req.params.satuanId, entitas: 'Eviden', detail: `${target.length} indikator${lanjut?.dilanjutkan ? ' · masuk Seleksi Administrasi' : ''}` });
  res.json({ ok: true, disetujui: target.length, semuaDisetujui, lanjutKeSeleksi: !!lanjut?.dilanjutkan });
});

// ---------- LANGKAH 12: SELEKSI ADMINISTRASI (scoring eviden) ----------
// Menandai sekolah lolos / tidak lolos ke Kunjungan Lapangan. Dipakai bersama oleh
// "Simpan & Rekomendasikan" di jendela scoring dan tombol "Rekomendasi" pada tabel.
async function tandaiRekomendasi(satuanId, lolos) {
  if (lolos) {
    await prisma.eviden.update({ where: { satuanId }, data: { lolosSeleksi: true } });
    await prisma.satuanPendidikan.update({ where: { id: satuanId }, data: { tahap: 'KUNJUNGAN_LAPANGAN' } });
    // Strata awal (hasil sertifikasi) dicatat agar perubahannya setelah
    // peninjauan lapangan terlihat jelas di menu kunjungan.
    const penilaianAwal = await prisma.penilaian.findFirst({
      where: { satuanId }, orderBy: { createdAt: 'desc' }, select: { strataVerifikasi: true },
    });
    await prisma.kunjunganLapangan.upsert({
      where: { satuanId },
      update: { strataAwal: penilaianAwal?.strataVerifikasi ?? undefined },
      create: { satuanId, strataAwal: penilaianAwal?.strataVerifikasi ?? null },
    });
    await notifySatuan(satuanId, { judul: 'Direkomendasikan ke Kunjungan Lapangan', pesan: 'Selamat! Sekolah Anda lolos Seleksi Administrasi dan direkomendasikan ke tahap Peninjauan Lapangan.', tipe: 'success', link: '/dokumen' });
  } else {
    await prisma.eviden.update({ where: { satuanId }, data: { lolosSeleksi: false } });
    await prisma.satuanPendidikan.updateMany({
      where: { id: satuanId, tahap: { in: ['TERDAFTAR_SELEKSI', 'KUNJUNGAN_LAPANGAN'] } }, data: { tahap: 'SELEKSI_ADMINISTRASI' },
    });
  }
}

r.post('/seleksi/:satuanId', bungkus(async (req, res) => {
  // `lolos` HANYA diterapkan bila dikirim eksplisit. Menyimpan skor tanpa `lolos`
  // tidak lagi membatalkan rekomendasi yang sudah diberikan.
  const { skorItems, lolos } = req.body; // skorItems: [{ itemId, skor }]
  const eviden = await prisma.eviden.findUnique({ where: { satuanId: req.params.satuanId }, include: { items: true } });
  if (!eviden) throw new Galat(404, 'Eviden tidak ditemukan');
  // Gate: satuan harus sudah menjadi peserta Seleksi Penghargaan (didaftarkan otomatis
  // oleh sistem begitu seluruh eviden disetujui)
  const pendaftaran = await prisma.pendaftaranSeleksi.findUnique({ where: { satuanId: req.params.satuanId } });
  if (!pendaftaran) throw new Galat(400, 'Satuan belum menjadi peserta Seleksi Penghargaan — seluruh eviden harus disetujui terlebih dahulu.');
  if (!adaPernyataan(req.body)) throw new Galat(400, PESAN_PERNYATAAN);

  // hanya indikator pada komponen yang menjadi klasifikasi penilai yang boleh diskor
  const { boleh } = await saringIndikatorBerwenang(req.user, eviden.items.map((i) => i.indikatorId));
  const itemBoleh = new Set(eviden.items.filter((i) => boleh.has(i.indikatorId)).map((i) => i.id));

  let ditolak = 0;
  for (const si of skorItems || []) {
    if (!itemBoleh.has(si.itemId)) { ditolak++; continue; } // di luar eviden ini / di luar klasifikasi
    const skor = Math.max(0, Math.min(3, Number(si.skor) || 0)); // skala 0..3
    await prisma.evidenItem.update({ where: { id: si.itemId }, data: { skor, skorOleh: req.user.nama } });
  }
  // skor seleksi dihitung dari SELURUH item eviden (lintas komponen), bukan hanya yang baru diisi
  const semuaItem = await prisma.evidenItem.findMany({ where: { evidenId: eviden.id }, select: { skor: true } });
  const terisi = semuaItem.filter((i) => i.skor != null);
  const skorSeleksi = terisi.length ? Math.round((terisi.reduce((a, i) => a + i.skor, 0) / terisi.length) * 100) / 100 : 0;
  await prisma.eviden.update({ where: { id: eviden.id }, data: { skorSeleksi, pernyataanSeleksi: true } });

  if (lolos === true) await tandaiRekomendasi(req.params.satuanId, true);
  else {
    // sudah diskoring tapi belum direkomendasikan → status "Seleksi Administrasi"
    await prisma.satuanPendidikan.updateMany({ where: { id: req.params.satuanId, tahap: 'TERDAFTAR_SELEKSI' }, data: { tahap: 'SELEKSI_ADMINISTRASI' } });
    if (lolos === false) await tandaiRekomendasi(req.params.satuanId, false);
  }
  await audit(req.user.nama, 'SELEKSI_ADMINISTRASI', { satuanId: req.params.satuanId, entitas: 'Eviden', detail: `Skor ${skorSeleksi}${lolos === true ? ', direkomendasikan' : ''}${ditolak ? `, ${ditolak} item di luar klasifikasi diabaikan` : ''}` });
  res.json({ ok: true, skorSeleksi, diabaikan: ditolak });
}));

// Tombol "Rekomendasi" di tabel Seleksi Administrasi: sekolah mana yang dilanjutkan
// (atau tidak) ke Kunjungan Lapangan, tanpa membuka jendela scoring.
r.post('/seleksi/:satuanId/rekomendasi', bungkus(async (req, res) => {
  const { lolos } = req.body;
  if (typeof lolos !== 'boolean') throw new Galat(400, 'Pilihan rekomendasi (lolos/tidak) wajib dikirim.');
  if (!adaPernyataan(req.body)) throw new Galat(400, PESAN_PERNYATAAN);
  const eviden = await prisma.eviden.findUnique({ where: { satuanId: req.params.satuanId }, include: { satuan: { select: { nama: true } } } });
  if (!eviden) throw new Galat(404, 'Eviden tidak ditemukan');
  const pendaftaran = await prisma.pendaftaranSeleksi.findUnique({ where: { satuanId: req.params.satuanId } });
  if (!pendaftaran) throw new Galat(400, 'Satuan belum menjadi peserta Seleksi Penghargaan.');
  if (eviden.skorSeleksi == null) {
    throw new Galat(400, 'Beri skor seleksi administrasi terlebih dahulu sebelum merekomendasikan.');
  }
  if (!lolos) {
    // pembatalan hanya selama Kunjungan Lapangan belum berjalan
    const k = await prisma.kunjunganLapangan.findUnique({ where: { satuanId: req.params.satuanId } });
    if (k && (k.terkunci || k.selesai || k.tanggal || k.temuan)) {
      throw new Galat(400, 'Kunjungan lapangan sudah berjalan — rekomendasi tidak dapat dibatalkan.');
    }
    if (k) await prisma.kunjunganLapangan.delete({ where: { satuanId: req.params.satuanId } });
  }
  await tandaiRekomendasi(req.params.satuanId, lolos);
  await audit(req.user.nama, lolos ? 'REKOMENDASI_KUNJUNGAN' : 'BATAL_REKOMENDASI_KUNJUNGAN', {
    satuanId: req.params.satuanId, entitas: 'Eviden', detail: `${eviden.satuan.nama} · skor ${eviden.skorSeleksi}`,
  });
  res.json({ ok: true, lolos });
}));

// ---------- LANGKAH 13: KUNJUNGAN LAPANGAN ----------
r.get('/kunjungan', async (req, res) => {
  const sertakan = {
    satuan: {
      include: {
        kecamatan: true, eviden: true,
        penilaian: { orderBy: { createdAt: 'desc' }, take: 1, select: { strataVerifikasi: true } },
        hasilFinal: { select: { strataFinal: true, skorFinal: true, peringkat: true } },
      },
    },
  };
  const { page, pageSize, skip, take } = paging(req, { bawaan: 25 });
  // belum = belum disubmit · terkunci = sudah disubmit · belum-dihitung = sudah disubmit
  // tetapi strata akhirnya belum dihitung sistem · dihitung = strata akhir sudah dihitung.
  // Penanda "dihitung" adalah ditetapkanPada, bukan strataAkhir: hasil "Belum Mencapai
  // Dasar" memang bernilai kosong.
  const status = req.query.status;
  const where = {
    ...(status === 'belum' ? { terkunci: false } : {}),
    ...(status === 'terkunci' ? { terkunci: true } : {}),
    ...(status === 'belum-dihitung' ? { terkunci: true, ditetapkanPada: null } : {}),
    ...(status === 'dihitung' ? { ditetapkanPada: { not: null } } : {}),
  };
  const [total, list] = await Promise.all([
    prisma.kunjunganLapangan.count({ where }),
    prisma.kunjunganLapangan.findMany({
      where, include: sertakan,
      orderBy: [{ satuan: { kecamatan: { nama: 'asc' } } }, { satuan: { nama: 'asc' } }],
      skip, take,
    }),
  ]);
  // strataAwal pada data lama belum terisi → diambil dari hasil verifikasi
  const data = list.map((k) => ({
    ...k,
    strataAwal: k.strataAwal || k.satuan.penilaian[0]?.strataVerifikasi || null,
  }));
  res.json(halaman(data, total, page, pageSize));
});

r.post('/kunjungan/:satuanId', async (req, res) => {
  const { tanggal, petugas, temuan, selesai, skorLapangan } = req.body;
  // skorLapangan: [{ itemId, skor, catatan }] hasil validasi faktual
  const lama = await prisma.kunjunganLapangan.findUnique({ where: { satuanId: req.params.satuanId } });
  if (lama?.terkunci) return res.status(400).json({ error: 'Hasil verifikasi lapangan sudah disubmit dan terkunci.' });
  const kunjungan = await prisma.kunjunganLapangan.upsert({
    where: { satuanId: req.params.satuanId },
    update: {
      tanggal: tanggal ? new Date(tanggal) : undefined,
      petugas, temuan, selesai: !!selesai,
    },
    create: { satuanId: req.params.satuanId, tanggal: tanggal ? new Date(tanggal) : null, petugas, temuan, selesai: !!selesai },
  });
  // hanya perbarui item milik eviden satuan ini, skor diclamp 0..3 (anti-crash & anti-nilai liar)
  const evidenSatuan = await prisma.eviden.findUnique({ where: { satuanId: req.params.satuanId }, select: { id: true } });
  const itemsSatuan = await prisma.evidenItem.findMany({ where: { evidenId: evidenSatuan?.id || '__none__' }, select: { id: true, indikatorId: true } });
  const { boleh: bolehInd } = await saringIndikatorBerwenang(req.user, itemsSatuan.map((x) => x.indikatorId));
  const validItems = new Set(itemsSatuan.filter((x) => bolehInd.has(x.indikatorId)).map((x) => x.id));
  for (const sl of skorLapangan || []) {
    if (!validItems.has(sl.itemId)) continue;
    const skorLap = sl.skor != null ? Math.max(0, Math.min(3, Number(sl.skor) || 0)) : undefined;
    await prisma.evidenItem.update({ where: { id: sl.itemId }, data: { skorLapangan: skorLap, catatanLapangan: sl.catatan, skorLapanganOleh: req.user.nama } });
  }
  await audit(req.user.nama, 'KUNJUNGAN_LAPANGAN', { satuanId: req.params.satuanId, entitas: 'KunjunganLapangan' });
  if (selesai) await notifySatuan(req.params.satuanId, { judul: 'Kunjungan lapangan selesai', pesan: 'Hasil peninjauan lapangan telah dicatat. Menunggu Hasil Pleno.', tipe: 'info', link: '/dokumen' });
  res.json({ ok: true, kunjungan });
});

// Submit hasil verifikasi langsung dari lapangan oleh tim penilai.
// Wajib disertai pernyataan bahwa penilaian sesuai fakta di lapangan; setelah
// disubmit hasil dikunci agar tidak dapat diubah tanpa jejak.
r.post('/kunjungan/:satuanId/submit', async (req, res) => {
  const { temuan, latitude, longitude, skorLapangan } = req.body;
  if (!adaPernyataan(req.body)) return res.status(400).json({ error: PESAN_PERNYATAAN });

  const kunjungan = await prisma.kunjunganLapangan.findUnique({ where: { satuanId: req.params.satuanId } });
  if (!kunjungan) return res.status(404).json({ error: 'Data kunjungan lapangan belum dibuat.' });
  if (kunjungan.terkunci) return res.status(400).json({ error: 'Hasil verifikasi lapangan sudah disubmit sebelumnya.' });

  const evidenSatuan = await prisma.eviden.findUnique({ where: { satuanId: req.params.satuanId }, select: { id: true } });
  const itemsSatuan = await prisma.evidenItem.findMany({
    where: { evidenId: evidenSatuan?.id || '__none__' }, select: { id: true, indikatorId: true },
  });
  const { boleh: bolehInd, izin } = await saringIndikatorBerwenang(req.user, itemsSatuan.map((x) => x.indikatorId));
  const validItems = new Set(itemsSatuan.filter((x) => bolehInd.has(x.indikatorId)).map((x) => x.id));
  if (izin !== null && !validItems.size) {
    return res.status(403).json({ error: 'Tidak ada indikator pada klasifikasi penilaian Anda untuk satuan ini.' });
  }

  let terisi = 0;
  for (const sl of skorLapangan || []) {
    if (!validItems.has(sl.itemId)) continue;
    const skorLap = sl.skor != null ? Math.max(0, Math.min(3, Number(sl.skor) || 0)) : undefined;
    await prisma.evidenItem.update({ where: { id: sl.itemId }, data: { skorLapangan: skorLap, catatanLapangan: sl.catatan, skorLapanganOleh: req.user.nama } });
    terisi++;
  }

  const updated = await prisma.kunjunganLapangan.update({
    where: { satuanId: req.params.satuanId },
    data: {
      temuan: temuan ?? kunjungan.temuan,
      selesai: true,
      terkunci: true,
      pernyataanFakta: true,
      disubmitOleh: req.user.nama,
      disubmitPada: new Date(),
      petugas: kunjungan.petugas || req.user.nama,
      tanggal: kunjungan.tanggal || new Date(),
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
    },
  });
  await audit(req.user.nama, 'SUBMIT_VERIFIKASI_LAPANGAN', {
    satuanId: req.params.satuanId, entitas: 'KunjunganLapangan',
    detail: `${terisi} indikator dinilai di lapangan, dinyatakan sesuai fakta${latitude != null ? ` @${latitude},${longitude}` : ''}`,
  });
  await notifySatuan(req.params.satuanId, { judul: 'Peninjauan lapangan selesai', pesan: 'Tim penilai telah menyubmit hasil verifikasi lapangan. Menunggu Hasil Pleno.', tipe: 'info', link: '/dokumen' });
  res.json({ ok: true, kunjungan: updated, dinilai: terisi });
});

// Revisi nilai lapangan SETELAH disubmit (temuan rapat akhir: nilai di laporan
// kunjungan lapangan harus dapat diubah). Hasil tetap terkunci; perubahan hanya lewat
// jalur ini dengan alasan, pernyataan, dan jejak nilai lama→baru. Penilai hanya dapat
// merevisi komponen dalam klasifikasinya. Terhenti bila Hasil Pleno sudah diproses.
r.post('/kunjungan/:satuanId/revisi', bungkus(async (req, res) => {
  const { alasan, skorLapangan } = req.body;
  if (!alasan || !String(alasan).trim()) throw new Galat(400, 'Alasan revisi wajib diisi.');
  if (!adaPernyataan(req.body)) throw new Galat(400, PESAN_PERNYATAAN);
  const kunjungan = await prisma.kunjunganLapangan.findUnique({ where: { satuanId: req.params.satuanId } });
  if (!kunjungan) throw new Galat(404, 'Data kunjungan lapangan tidak ditemukan.');
  if (!kunjungan.terkunci) throw new Galat(400, 'Hasil lapangan belum disubmit — gunakan "Simpan Draf" atau "Submit".');
  await pastikanBelumDiproses();

  const eviden = await prisma.eviden.findUnique({
    where: { satuanId: req.params.satuanId }, include: { items: { select: { id: true, indikatorId: true } } },
  });
  if (!eviden) throw new Galat(404, 'Eviden tidak ditemukan.');
  const { boleh, izin } = await saringIndikatorBerwenang(req.user, eviden.items.map((i) => i.indikatorId));
  if (izin !== null && !eviden.items.some((i) => boleh.has(i.indikatorId))) {
    throw new Galat(403, 'Tidak ada indikator pada klasifikasi penilaian Anda untuk satuan ini.');
  }
  const { perubahan, diabaikan } = await koreksiNilaiLapangan({
    satuanId: req.params.satuanId, skorLapangan, namaPenilai: req.user.nama, indikatorBoleh: boleh,
  });
  const waktu = new Date();
  await prisma.kunjunganLapangan.update({
    where: { satuanId: req.params.satuanId },
    data: {
      revisiOleh: req.user.nama, revisiPada: waktu, revisiAlasan: String(alasan).trim(),
      jumlahRevisi: { increment: 1 },
      temuan: [kunjungan.temuan, `[Revisi nilai ${waktu.toLocaleDateString('id-ID')} — ${req.user.nama}] ${String(alasan).trim()}`]
        .filter(Boolean).join('\n'),
    },
  });
  // bila Hasil Pleno sudah dihitung, nilai & strata akhir disegarkan otomatis
  const pleno = await segarkanPlenoBilaAda(req.user.nama);
  await audit(req.user.nama, 'REVISI_NILAI_LAPANGAN', {
    satuanId: req.params.satuanId, entitas: 'KunjunganLapangan',
    detail: `${String(alasan).trim().slice(0, 100)} | ${perubahan.length} nilai diubah${perubahan.length ? ': ' + perubahan.slice(0, 8).join(', ') : ''}`,
  });
  res.json({ ok: true, diubah: perubahan.length, perubahan, diabaikan, plenoDisegarkan: !!pleno });
}));

// ============================================================
// REKAP ANALITIK: strata per kecamatan / per komponen / per puskesmas
// ============================================================
r.get('/rekap', async (req, res) => {
  const STRATA = ['PARIPURNA', 'UTAMA', 'MADYA', 'DASAR'];
  const empty = () => ({ PARIPURNA: 0, UTAMA: 0, MADYA: 0, DASAR: 0, total: 0 });

  // ambil satuan + penilaian terakhir + kecamatan + puskesmas
  const satuan = await prisma.satuanPendidikan.findMany({
    include: {
      kecamatan: true,
      puskesmas: true,
      penilaian: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  // per kecamatan
  const perKecamatan = {};
  const perPuskesmas = {};
  for (const s of satuan) {
    const strata = s.penilaian[0]?.strataVerifikasi;
    if (!strata) continue;
    const kNama = s.kecamatan?.nama || '-';
    (perKecamatan[kNama] ||= empty());
    perKecamatan[kNama][strata]++; perKecamatan[kNama].total++;
    const pNama = s.puskesmas?.nama || '(belum ditentukan)';
    (perPuskesmas[pNama] ||= empty());
    perPuskesmas[pNama][strata]++; perPuskesmas[pNama].total++;
  }

  // per komponen: rata-rata pemenuhan (%) dari penilaian terverifikasi
  const komponen = await prisma.komponen.findMany({ orderBy: { urutan: 'asc' }, include: { indikator: true } });
  const penilaianVer = await prisma.penilaian.findMany({
    where: { status: 'DIVERIFIKASI' },
    include: { jawaban: { include: { indikator: true } } },
  });
  const perKomponen = komponen.map((k) => {
    const indIds = new Set(k.indikator.map((i) => i.id));
    let total = 0, max = 0;
    for (const p of penilaianVer) {
      for (const j of p.jawaban) {
        if (!indIds.has(j.indikatorId)) continue;
        total += (j.nilaiVerifikasi ?? j.nilaiMandiri ?? 0);
        max += 1;
      }
    }
    return { kode: k.kode, nama: k.nama, rataPersen: max ? Math.round((total / max) * 1000) / 10 : 0 };
  });

  res.json({
    strata: STRATA,
    perKecamatan: Object.entries(perKecamatan).map(([nama, v]) => ({ nama, ...v })).sort((a, b) => b.total - a.total),
    perPuskesmas: Object.entries(perPuskesmas).map(([nama, v]) => ({ nama, ...v })).sort((a, b) => b.total - a.total),
    perKomponen,
    totalTerverifikasi: penilaianVer.length,
  });
});

// ============================================================
// MANAJEMEN AKUN TP (Kecamatan & Kabupaten) — admin
// ============================================================
// Menyimpan klasifikasi penilai (komponen yang boleh dinilai) untuk satu akun.
// Daftar komponen untuk pilihan klasifikasi penilai
r.get('/komponen', async (req, res) => {
  res.json(await prisma.komponen.findMany({ orderBy: { urutan: 'asc' } }));
});

r.get('/users', requireAdmin, async (req, res) => {
  const { role, kecamatanId, q } = req.query;
  const where = {
    role: ['TP_KECAMATAN', 'TIM_KABUPATEN'].includes(role) ? role : { in: ['TP_KECAMATAN', 'TIM_KABUPATEN'] },
    ...(kecamatanId ? { kecamatanId } : {}),
    ...(q ? { OR: [{ nama: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }] } : {}),
  };
  const { page, pageSize, skip, take } = paging(req, { bawaan: 25 });
  const total = await prisma.user.count({ where });
  const users = await prisma.user.findMany({
    where,
    include: { kecamatan: true, klasifikasiPenilai: { include: { komponen: true }, orderBy: { komponen: { urutan: 'asc' } } } },
    orderBy: [{ role: 'asc' }, { kecamatan: { nama: 'asc' } }, { isAdmin: 'desc' }, { nama: 'asc' }],
    skip, take,
  });
  res.json(halaman(users.map((u) => ({
    id: u.id, username: u.username, nama: u.nama, email: u.email, role: u.role, isAdmin: u.isAdmin,
    aktif: u.aktif, kecamatan: u.kecamatan ? { id: u.kecamatan.id, nama: u.kecamatan.nama } : null,
    klasifikasi: u.klasifikasiPenilai.map((k) => ({ id: k.komponenId, kode: k.komponen.kode, nama: k.komponen.nama })),
  })), total, page, pageSize));
});

r.post('/users', requireAdmin, async (req, res) => {
  const { username, password, nama, email, role, kecamatanId, isAdmin } = req.body;
  if (!username || !password || !nama || !role) return res.status(400).json({ error: 'Data tidak lengkap' });
  if (!['TP_KECAMATAN', 'TIM_KABUPATEN'].includes(role)) return res.status(400).json({ error: 'Role tidak valid' });
  if (role === 'TP_KECAMATAN' && !kecamatanId) return res.status(400).json({ error: 'TP Kecamatan wajib memilih kecamatan' });
  const exist = await prisma.user.findUnique({ where: { username } });
  if (exist) return res.status(409).json({ error: 'Username sudah digunakan' });
  const u = await prisma.user.create({
    data: {
      username, password: bcrypt.hashSync(password, 10), nama, email,
      role, kecamatanId: role === 'TP_KECAMATAN' ? kecamatanId : null,
      // TIM_KABUPATEN: admin/koordinator kabupaten · TP_KECAMATAN: koordinator kecamatan
      isAdmin: !!isAdmin,
    },
  });
  if (!isAdmin && Array.isArray(req.body.komponenIds)) {
    await simpanKlasifikasi(u.id, req.body.komponenIds);
  }
  await audit(req.user.nama, 'BUAT_AKUN', { entitas: 'User', detail: `${username} (${role}${isAdmin ? '/admin' : ''})` });
  res.json({ id: u.id });
});

r.put('/users/:id', requireAdmin, async (req, res) => {
  const { nama, email, kecamatanId, aktif, password, isAdmin } = req.body;
  const u = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!u || !['TP_KECAMATAN', 'TIM_KABUPATEN'].includes(u.role)) return res.status(404).json({ error: 'User tidak ditemukan' });
  const data = {
    nama: nama ?? u.nama, email: email ?? u.email,
    aktif: aktif != null ? !!aktif : u.aktif,
    kecamatanId: u.role === 'TP_KECAMATAN' ? (kecamatanId ?? u.kecamatanId) : null,
    isAdmin: isAdmin != null ? !!isAdmin : u.isAdmin,
  };
  if (password) data.password = bcrypt.hashSync(password, 10);
  await prisma.user.update({ where: { id: u.id }, data });
  if (Array.isArray(req.body.komponenIds)) {
    await simpanKlasifikasi(u.id, data.isAdmin ? [] : req.body.komponenIds);
  }
  await audit(req.user.nama, 'UBAH_AKUN', { entitas: 'User', detail: u.username });
  res.json({ ok: true });
});

r.delete('/users/:id', requireAdmin, async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!u || !['TP_KECAMATAN', 'TIM_KABUPATEN'].includes(u.role)) return res.status(404).json({ error: 'User tidak ditemukan' });
  if (u.id === req.user.id) return res.status(400).json({ error: 'Tidak dapat menghapus akun sendiri' });
  await prisma.user.update({ where: { id: u.id }, data: { aktif: false } });
  await audit(req.user.nama, 'NONAKTIFKAN_AKUN', { entitas: 'User', detail: u.username });
  res.json({ ok: true });
});

// ---------- DIAGRAM STRATA & PETA PUSKESMAS BINAAN (notulen Sep 2026) ----------
r.get('/diagram-strata', async (req, res) => {
  const kecamatanId = req.query.kecamatanId || null;
  res.json(await diagramStrata({
    periodeId: req.query.periodeId || null, kecamatanId,
    kelompok: kecamatanId ? 'puskesmas' : 'kecamatan',
  }));
});

r.get('/puskesmas-binaan', async (req, res) => {
  res.json(await petaPuskesmas({ kecamatanId: req.query.kecamatanId || null }));
});

r.put('/puskesmas/:id/lokasi', requireAdmin, async (req, res) => {
  const p = await prisma.puskesmas.findUnique({ where: { id: req.params.id } });
  if (!p) return res.status(404).json({ error: 'Puskesmas tidak ditemukan' });
  try {
    const hasil = await ubahLokasiPuskesmas(p.id, req.body, req.user.nama);
    await audit(req.user.nama, 'UBAH_LOKASI_PUSKESMAS', { entitas: 'Puskesmas', detail: p.nama });
    res.json(hasil);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ---------- PENGATURAN PENOMORAN SURAT (admin) ----------
r.get('/pengaturan-nomor', requireAdmin, async (req, res) => {
  const list = (await pastikanPengaturanNomor()).filter((p) => JENIS_NOMOR.some((d) => d.jenis === p.jenis));
  res.json(list.map((p) => ({
    ...p,
    penanda: PENANDA,
    pratinjau: renderNomor(p.pola, { urut: p.urutMulai, digit: p.digit }),
  })));
});

r.put('/pengaturan-nomor/:jenis', requireAdmin, async (req, res) => {
  const { pola, urutMulai, digit } = req.body;
  const set = await prisma.pengaturanNomor.findUnique({ where: { jenis: req.params.jenis } });
  if (!set) return res.status(404).json({ error: 'Jenis penomoran tidak dikenal' });
  if (!pola || !String(pola).includes('{urut}')) {
    return res.status(400).json({ error: 'Pola wajib memuat penanda {urut} agar nomor tidak kembar.' });
  }
  const digitAngka = Math.max(1, Math.min(8, Number(digit) || set.digit));
  const mulai = Math.max(1, Number(urutMulai) || set.urutMulai);
  const pratinjau = renderNomor(String(pola), { urut: mulai, digit: digitAngka });
  const hasil = await prisma.pengaturanNomor.update({
    where: { jenis: set.jenis },
    data: { pola: String(pola).trim(), urutMulai: mulai, digit: digitAngka, contoh: pratinjau, diubahOleh: req.user.nama },
  });
  await audit(req.user.nama, 'UBAH_PENGATURAN_NOMOR', { entitas: 'PengaturanNomor', detail: `${set.jenis}: ${hasil.pola}` });
  res.json({ ...hasil, penanda: PENANDA, pratinjau });
});

// daftar kecamatan (untuk form akun)
r.get('/kecamatan', async (req, res) => {
  res.json(await prisma.kecamatan.findMany({ orderBy: { nama: 'asc' } }));
});

export default r;
