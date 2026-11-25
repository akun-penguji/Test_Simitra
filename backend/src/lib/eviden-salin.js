// Menyalin bukti dukung yang sudah dipilih sekolah pada PENILAIAN MANDIRI ke
// EVIDEN STRATIFIKASI, sehingga bukti yang dipilih di awal langsung muncul saat
// pengisian eviden dan saat verifikasi di kecamatan — sekolah tidak perlu
// melampirkan ulang dokumen yang sama.
import { prisma } from './prisma.js';

const kunci = (l) => `${l.jenis}|${(l.fileUrl || l.filePath || '').trim().toLowerCase()}`;

export async function salinLampiranKeEviden(satuanId, evidenId = null) {
  const eviden = evidenId
    ? await prisma.eviden.findUnique({ where: { id: evidenId } })
    : await prisma.eviden.findUnique({ where: { satuanId } });
  if (!eviden) return { disalin: 0 };

  const penilaian = await prisma.penilaian.findFirst({
    where: { satuanId }, orderBy: { createdAt: 'desc' },
    include: { jawaban: { include: { lampiran: true } } },
  });
  if (!penilaian) return { disalin: 0 };

  let disalin = 0;
  for (const jw of penilaian.jawaban) {
    if (!jw.lampiran.length) continue;

    const item = await prisma.evidenItem.upsert({
      where: { evidenId_indikatorId: { evidenId: eviden.id, indikatorId: jw.indikatorId } },
      update: {},
      create: { evidenId: eviden.id, indikatorId: jw.indikatorId },
    });
    // Indikator yang sudah disetujui tidak disentuh lagi
    if (item.statusReview === 'DISETUJUI') continue;

    const ada = new Set((await prisma.evidenBerkas.findMany({ where: { itemId: item.id } })).map(kunci));
    for (const l of jw.lampiran) {
      if (ada.has(kunci(l))) continue;
      await prisma.evidenBerkas.create({
        data: {
          itemId: item.id, jenis: l.jenis,
          filePath: l.filePath, fileName: l.fileName, fileUrl: l.fileUrl,
          ukuran: l.ukuran, mime: l.mime,
          diunggahOleh: [l.diunggahOleh, '(dari penilaian mandiri)'].filter(Boolean).join(' '),
        },
      });
      ada.add(kunci(l));
      disalin++;
    }
    // Ruas lama pada item disegarkan agar tampilan lama tetap benar
    const terakhir = await prisma.evidenBerkas.findFirst({ where: { itemId: item.id }, orderBy: { createdAt: 'desc' } });
    if (terakhir) {
      await prisma.evidenItem.update({
        where: { id: item.id },
        data: { filePath: terakhir.filePath, fileName: terakhir.fileName, fileUrl: terakhir.fileUrl },
      });
    }
  }
  return { disalin };
}
