// Migrasi sekali jalan (notulen Sep 2026): sebelum fitur Tim Penilai Kecamatan,
// setiap akun TP Kecamatan berwenang penuh. Agar tetap berwenang penuh, akun
// TP Kecamatan yang BELUM memiliki klasifikasi komponen dijadikan koordinator
// — hanya di kecamatan yang belum memiliki koordinator sama sekali.
//   node prisma/migrasi-koordinator-kecamatan.mjs [--uji]
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const UJI = process.argv.includes('--uji');

const akun = await prisma.user.findMany({
  where: { role: 'TP_KECAMATAN' },
  include: { kecamatan: { select: { nama: true } }, _count: { select: { klasifikasiPenilai: true } } },
});
const adaKoordinator = new Set(akun.filter((u) => u.isAdmin).map((u) => u.kecamatanId));
const naik = akun.filter((u) => !u.isAdmin && !u._count.klasifikasiPenilai && !adaKoordinator.has(u.kecamatanId));
for (const u of naik) console.log(`   ${UJI ? '(uji) ' : ''}→ koordinator: ${u.username} (${u.kecamatan?.nama || '-'})`);
if (!UJI && naik.length) await prisma.user.updateMany({ where: { id: { in: naik.map((u) => u.id) } }, data: { isAdmin: true } });
console.log(`✅ ${naik.length} akun TP Kecamatan dijadikan koordinator${UJI ? ' (uji — tidak disimpan)' : ''}; ${akun.length - naik.length} akun tidak berubah.`);
await prisma.$disconnect();
