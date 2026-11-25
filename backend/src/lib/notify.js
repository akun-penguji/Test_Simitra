import { prisma } from './prisma.js';

// Kirim notifikasi ke satu user
export async function notify(userId, { judul, pesan, tipe = 'info', link = null, satuanId = null }) {
  if (!userId) return;
  try {
    await prisma.notification.create({ data: { userId, judul, pesan, tipe, link, satuanId } });
  } catch (_) { /* jangan gagalkan request karena notifikasi */ }
}

// Ambil userId operator sebuah satuan pendidikan
export async function satuanUserId(satuanId) {
  const s = await prisma.satuanPendidikan.findUnique({ where: { id: satuanId }, select: { userId: true } });
  return s?.userId || null;
}

// Notifikasi ke seluruh TP Kecamatan aktif di sebuah kecamatan
export async function notifyKecamatan(kecamatanId, payload) {
  if (!kecamatanId) return;
  const users = await prisma.user.findMany({ where: { role: 'TP_KECAMATAN', kecamatanId, aktif: true }, select: { id: true } });
  await Promise.all(users.map((u) => notify(u.id, payload)));
}

// Notifikasi ke seluruh Tim Kabupaten aktif
export async function notifyKabupaten(payload) {
  const users = await prisma.user.findMany({ where: { role: 'TIM_KABUPATEN', aktif: true }, select: { id: true } });
  await Promise.all(users.map((u) => notify(u.id, payload)));
}

// Notifikasi ke operator satuan (by satuanId)
export async function notifySatuan(satuanId, payload) {
  const uid = await satuanUserId(satuanId);
  await notify(uid, { ...payload, satuanId });
}
