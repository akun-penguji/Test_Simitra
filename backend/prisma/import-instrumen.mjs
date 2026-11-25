// Memuat ulang instrumen (komponen + indikator) dari data/instrumen.json ke basis
// data yang SUDAH berisi data — dipakai saat instrumen resmi diperbarui.
//
//   node prisma/import-instrumen.mjs           → periksa & muat bila aman
//   node prisma/import-instrumen.mjs --paksa   → tetap muat walau ada penilaian
//                                                (jawaban & eviden indikator lama ikut dihapus)
//   node prisma/import-instrumen.mjs --uji     → hanya laporan, tidak mengubah apa pun
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();
const DIR = path.dirname(fileURLToPath(import.meta.url));
const INSTRUMEN = JSON.parse(readFileSync(path.join(DIR, 'data/instrumen.json'), 'utf8'));
const PAKSA = process.argv.includes('--paksa');
const UJI = process.argv.includes('--uji');
const JENJANG = ['TK', 'SD', 'SMP', 'SMA'];

const komponenBaru = (INSTRUMEN.SD || INSTRUMEN.TK).map((k, i) => ({
  kode: String.fromCharCode(65 + i), nama: k.nama,
}));

async function main() {
  console.log('📋 Memuat instrumen dari data/instrumen.json');
  const totalBaru = JENJANG.reduce((a, j) => a + (INSTRUMEN[j] || []).reduce((b, k) => b + k.indikator.length, 0), 0);
  console.log(`   berkas: ${komponenBaru.length} komponen · ${totalBaru} indikator`);
  komponenBaru.forEach((k) => console.log(`     ${k.kode}. ${k.nama}`));

  const indikatorLama = await prisma.indikator.findMany({
    select: { id: true, kode: true, _count: { select: { jawabanPenilaian: true, evidenItems: true } } },
  });
  const jawabanTerkait = indikatorLama.reduce((a, i) => a + i._count.jawabanPenilaian, 0);
  const evidenTerkait = indikatorLama.reduce((a, i) => a + i._count.evidenItems, 0);
  console.log(`\n   basis data saat ini: ${indikatorLama.length} indikator`);
  console.log(`   terpakai pada ${jawabanTerkait} jawaban penilaian & ${evidenTerkait} butir eviden`);

  if (UJI) { console.log('\n🔎 Mode uji — tidak ada perubahan.'); return; }

  if ((jawabanTerkait > 0 || evidenTerkait > 0) && !PAKSA) {
    console.error(
      `\n❌ Dibatalkan. Instrumen lama sudah dipakai pada penilaian/eviden.\n` +
      `   Mengganti instrumen akan menghapus data tersebut.\n` +
      `   Jalankan ulang dengan --paksa bila memang dikehendaki (cadangkan basis data lebih dulu).`,
    );
    process.exitCode = 1;
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (jawabanTerkait || evidenTerkait) {
      const a = await tx.jawabanPenilaian.deleteMany({});
      const b = await tx.evidenItem.deleteMany({});
      console.log(`\n   ⚠️  dihapus: ${a.count} jawaban penilaian, ${b.count} butir eviden`);
    }
    await tx.indikator.deleteMany({});

    const petaKomponen = {};
    for (let i = 0; i < komponenBaru.length; i++) {
      const k = await tx.komponen.upsert({
        where: { kode: komponenBaru[i].kode },
        update: { nama: komponenBaru[i].nama, urutan: i },
        create: { kode: komponenBaru[i].kode, nama: komponenBaru[i].nama, urutan: i },
      });
      petaKomponen[komponenBaru[i].kode] = k.id;
    }
    // komponen berlebih dari instrumen lama (bila jumlah komponen berkurang)
    const sisa = await tx.komponen.findMany({ where: { kode: { notIn: komponenBaru.map((k) => k.kode) } } });
    for (const k of sisa) {
      await tx.komponen.delete({ where: { id: k.id } });
      console.log(`   • komponen lama dihapus: ${k.kode}. ${k.nama}`);
    }

    const rekap = {};
    for (const jenjang of JENJANG) {
      const komps = INSTRUMEN[jenjang] || [];
      let n = 0;
      for (let ci = 0; ci < komps.length; ci++) {
        const kode = String.fromCharCode(65 + ci);
        for (const ind of komps[ci].indikator) {
          await tx.indikator.create({
            data: {
              kode: `${jenjang}-${kode}-${ind.no}`,
              jenjang,
              komponenId: petaKomponen[kode],
              strata: ind.strata,
              pertanyaan: ind.teks,
              bentukEviden: ind.eviden || null,
              urutan: n++,
              bobot: 1,
            },
          });
        }
      }
      rekap[jenjang] = n;
    }
    console.log(`\n✅ Instrumen dimuat: ${JSON.stringify(rekap)} (total ${Object.values(rekap).reduce((a, b) => a + b, 0)})`);
  }, { timeout: 120000 });
}

main()
  .catch((e) => { console.error('Gagal:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
