import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../lib/auth.js';
import { dec } from '../lib/crypto.js';
import { paging, halaman } from '../lib/paginasi.js';

const r = Router();
r.use(authRequired);

// Daftar notifikasi + jumlah belum dibaca
r.get('/notifikasi', async (req, res) => {
  const { page, pageSize, skip, take } = paging(req, { bawaan: 20, maks: 100 });
  const where = { userId: req.user.id };
  const [total, items, unread] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.notification.count({ where: { userId: req.user.id, dibaca: false } }),
  ]);
  res.json({ ...halaman(items, total, page, pageSize), items, unread });
});

r.post('/notifikasi/:id/baca', async (req, res) => {
  // Penyaring userId memastikan notifikasi milik orang lain tidak tersentuh;
  // balasan 404 agar pemanggil tahu tidak ada yang diubah.
  const { count } = await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user.id }, data: { dibaca: true },
  });
  if (!count) return res.status(404).json({ error: 'Notifikasi tidak ditemukan' });
  res.json({ ok: true });
});

r.post('/notifikasi/baca-semua', async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user.id, dibaca: false }, data: { dibaca: true } });
  res.json({ ok: true });
});

// ---------- RIWAYAT (timeline audit) ----------
r.get('/riwayat', async (req, res) => {
  const role = req.user.role;
  let where = {};
  if (role === 'SATUAN_PENDIDIKAN') {
    const s = await prisma.satuanPendidikan.findUnique({ where: { userId: req.user.id }, select: { id: true } });
    where = { satuanId: s?.id || '__none__' };
  } else if (role === 'TP_KECAMATAN') {
    const list = await prisma.satuanPendidikan.findMany({ where: { kecamatanId: req.user.kecamatanId }, select: { id: true } });
    const ids = list.map((x) => x.id);
    // filter satuanId hanya boleh untuk satuan di kecamatan sendiri (cegah lihat wilayah lain)
    if (req.query.satuanId && ids.includes(req.query.satuanId)) where = { satuanId: req.query.satuanId };
    else where = { satuanId: { in: ids.length ? ids : ['__none__'] } };
  } else {
    // TIM_KABUPATEN: semua, opsional filter satuanId
    where = req.query.satuanId ? { satuanId: req.query.satuanId } : {};
  }
  // Timeline domain: hanya aktivitas yang terkait satuan (bukan seluruh request GET)
  where.satuanId = where.satuanId || { not: null };
  const { page, pageSize, skip, take } = paging(req, { bawaan: 25, maks: 100 });
  const baris = (l) => ({
    id: l.id, aksi: l.aksi, detail: dec(l.detail), aktor: dec(l.aktor),
    satuanId: l.satuanId, createdAt: l.createdAt,
  });

  // Ruas detail & aktor tersimpan terenkripsi sehingga tak dapat dicari di basis
  // data; pencarian dilakukan setelah dekripsi atas 2.000 catatan terbaru.
  const q = (req.query.q || '').trim().toLowerCase();
  if (q) {
    const semua = (await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 2000 })).map(baris);
    const cocok = semua.filter((d) => [d.aksi, d.detail, d.aktor].some((x) => (x || '').toLowerCase().includes(q)));
    return res.json(halaman(cocok.slice(skip, skip + take), cocok.length, page, pageSize));
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
  ]);
  res.json(halaman(logs.map(baris), total, page, pageSize));
});

export default r;
