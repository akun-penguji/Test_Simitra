// Hasil Pleno: perhitungan, proses (penguncian), dan penerbitan Sertifikat
// Kepesertaan. Menggantikan "Hasil Final & SK Bupati" — SK Bupati kini dibuat di
// luar sistem (rapat akhir Okt 2026).
import { prisma } from './prisma.js';
import { Galat } from './galat.js';
import { strataDariNilaiPleno, nilaiEfektifItem, AMBANG_NILAI_TERPENUHI } from './scoring.js';
import { nomorDariPola } from './nomor.js';
import { notifySatuan, notifyKecamatan } from './notify.js';

export const KUNCI_TANPA_PERIODE = 'TANPA_PERIODE';
export const JUMLAH_PERAIH = 12;
export const PERIHAL_SERTIFIKAT = 'Sertifikat Kepesertaan Seleksi Penghargaan Stratifikasi UKS/M';

export async function konteksPleno() {
  const periode = await prisma.periode.findFirst({ where: { aktif: true } });
  return { periode, periodeId: periode?.id ?? null, kunci: periode?.id ?? KUNCI_TANPA_PERIODE };
}

export async function statusProses() {
  const { kunci } = await konteksPleno();
  return prisma.prosesPleno.findUnique({ where: { kunci } });
}

// Dipakai semua aksi yang mengubah nilai: setelah diproses, hasil terkunci.
export async function pastikanBelumDiproses() {
  if (await statusProses()) {
    throw new Galat(409, 'Hasil Pleno sudah diproses dan dikunci. Buka kembali Hasil Pleno terlebih dahulu bila nilai perlu diubah.');
  }
}

export const versiAktif = () =>
  prisma.versiSertifikat.findFirst({ where: { aktif: true }, orderBy: { createdAt: 'desc' } });

// ---------------------------------------------------------------------------
// HITUNG HASIL PLENO
// Populasi: seluruh satdik yang kunjungan lapangannya sudah disubmit pada periode
// aktif. Nilai pleno = rata-rata nilai efektif indikator (nilai lapangan bila ada,
// kalau tidak skor administrasi) dibagi 3. Strata akhir dihitung SISTEM (lihat
// strataDariNilaiPleno), bukan lagi ditetapkan manual.
// ---------------------------------------------------------------------------
export async function hitungPleno(pemicu = 'Sistem') {
  await pastikanBelumDiproses();
  const { periode, periodeId } = await konteksPleno();

  const daftar = await prisma.satuanPendidikan.findMany({
    where: {
      kunjungan: { selesai: true },
      ...(periode ? { penilaian: { some: { periodeId: periode.id } } } : {}),
    },
    include: {
      eviden: { include: { items: { include: { indikator: { select: { komponenId: true, strata: true } } } } } },
      penilaian: { orderBy: { createdAt: 'desc' }, take: 1, select: { strataVerifikasi: true } },
      kunjungan: true,
    },
  });

  const hasil = daftar.map((s) => {
    const items = s.eviden?.items || [];
    const jumlahNilai = items.reduce((a, i) => a + nilaiEfektifItem(i), 0);
    const skorFinal = items.length ? Math.round((jumlahNilai / (items.length * 3)) * 10000) / 100 : 0;
    const st = strataDariNilaiPleno(items);
    return {
      satuanId: s.id, nama: s.nama, skorFinal,
      strataFinal: st.strata, terpenuhi: st.terpenuhi, jumlahIndikator: st.total,
      strataAwal: s.penilaian[0]?.strataVerifikasi || null,
      awalKunjungan: s.kunjungan?.strataAwal || null,
    };
  });
  // nilai terbesar dulu; nilai sama diurut nama agar peringkat deterministik
  hasil.sort((a, b) => (b.skorFinal - a.skorFinal) || a.nama.localeCompare(b.nama, 'id'));

  const sekarang = new Date();
  const tahun = periode?.tahun || sekarang.getFullYear();
  const idSekarang = hasil.map((h) => h.satuanId);
  const ops = [];

  // satuan yang tidak lagi memenuhi syarat (mis. kunjungan dibuka lagi) dikeluarkan
  ops.push(prisma.hasilFinal.deleteMany({ where: { periodeId, satuanId: { notIn: idSekarang } } }));

  hasil.forEach((h, i) => {
    const data = {
      skorFinal: h.skorFinal, strataFinal: h.strataFinal, peraih: i < JUMLAH_PERAIH,
      peringkat: i + 1, periodeId,
    };
    ops.push(prisma.hasilFinal.upsert({
      where: { satuanId: h.satuanId }, update: data, create: { satuanId: h.satuanId, ...data },
    }));
    ops.push(prisma.kunjunganLapangan.update({
      where: { satuanId: h.satuanId },
      data: {
        strataAwal: h.awalKunjungan || h.strataAwal,
        strataAkhir: h.strataFinal,
        catatanAkhir: `Dihitung sistem dari nilai pleno: ${h.terpenuhi} dari ${h.jumlahIndikator} indikator terpenuhi `
          + `(nilai ≥ ${AMBANG_NILAI_TERPENUHI}), skor pleno ${h.skorFinal}%`,
        ditetapkanOleh: `Sistem (dipicu ${pemicu})`,
        ditetapkanPada: sekarang,
      },
    }));
  });

  // Juara 1/2/3 dicatat untuk larangan penilaian mandiri periode berikutnya.
  // Dicatat ULANG tiap perhitungan (hapus lalu tulis) supaya peringkat yang
  // berubah setelah Review Ulang tidak meninggalkan catatan juara yang usang.
  ops.push(prisma.riwayatJuara.deleteMany({ where: { periodeId } }));
  hasil.slice(0, 3).forEach((h, i) => {
    ops.push(prisma.riwayatJuara.create({
      data: { satuanId: h.satuanId, periodeId, tahun, peringkat: i + 1, strata: h.strataFinal },
    }));
  });

  await prisma.$transaction(ops);
  return { total: hasil.length, peraih: Math.min(JUMLAH_PERAIH, hasil.length), hasil };
}

// ---------------------------------------------------------------------------
// KOREKSI NILAI LAPANGAN — dipakai Revisi Nilai (halaman Kunjungan, terbatas pada
// komponen penilai) dan Review Ulang (Hasil Pleno, super admin, semua komponen).
// Hanya item milik satuan ini yang disentuh; perubahan dicatat lama→baru.
// ---------------------------------------------------------------------------
export async function koreksiNilaiLapangan({ satuanId, skorLapangan, namaPenilai, indikatorBoleh = null }) {
  const eviden = await prisma.eviden.findUnique({
    where: { satuanId },
    include: { items: { include: { indikator: { select: { kode: true } } } } },
  });
  if (!eviden) throw new Galat(404, 'Eviden satuan ini tidak ditemukan.');
  const itemSatuan = new Map(eviden.items.map((i) => [i.id, i]));
  const perubahan = [];
  let diabaikan = 0;
  for (const sl of skorLapangan || []) {
    const lama = itemSatuan.get(sl.itemId);
    if (!lama || (indikatorBoleh && !indikatorBoleh.has(lama.indikatorId))) { diabaikan++; continue; }
    const nilaiBaru = sl.skor != null && sl.skor !== '' ? Math.max(0, Math.min(3, Number(sl.skor) || 0)) : null;
    const catatanBaru = sl.catatan != null ? (String(sl.catatan).trim() || null) : lama.catatanLapangan;
    const nilaiLama = lama.skorLapangan;
    if (nilaiBaru === nilaiLama && catatanBaru === lama.catatanLapangan) continue;
    await prisma.evidenItem.update({
      where: { id: lama.id },
      data: { skorLapangan: nilaiBaru, catatanLapangan: catatanBaru, skorLapanganOleh: namaPenilai },
    });
    if (nilaiBaru !== nilaiLama) {
      perubahan.push(`${lama.indikator.kode}: ${nilaiLama ?? (lama.skor ?? '-')}→${nilaiBaru ?? '-'}`);
    }
  }
  return { perubahan, diabaikan };
}

// Setelah koreksi, hasil disegarkan bila Hasil Pleno sudah pernah dihitung.
export async function segarkanPlenoBilaAda(pemicu) {
  const { periodeId } = await konteksPleno();
  const ada = await prisma.hasilFinal.count({ where: { periodeId } });
  if (!ada) return null;
  return hitungPleno(pemicu);
}

// ---------------------------------------------------------------------------
// PROSES HASIL PLENO — mengunci hasil, memajukan satdik ke tahap FINAL, dan
// memberi tahu satdik & kecamatan.
// ---------------------------------------------------------------------------
export async function prosesPleno(namaUser) {
  const { periodeId, kunci } = await konteksPleno();
  if (await prisma.prosesPleno.findUnique({ where: { kunci } })) {
    throw new Galat(409, 'Hasil Pleno periode ini sudah diproses.');
  }
  const hasil = await prisma.hasilFinal.findMany({
    where: { periodeId }, include: { satuan: { select: { id: true, nama: true, kecamatanId: true } } },
  });
  if (!hasil.length) {
    throw new Galat(400, 'Belum ada Hasil Pleno. Klik "Hitung Hasil Pleno" terlebih dahulu.');
  }
  const peraih = hasil.filter((h) => h.peraih).length;
  await prisma.$transaction([
    prisma.prosesPleno.create({
      data: { kunci, periodeId, jumlahSatdik: hasil.length, jumlahPeraih: peraih, diprosesOleh: namaUser },
    }),
    prisma.satuanPendidikan.updateMany({ where: { id: { in: hasil.map((h) => h.satuanId) } }, data: { tahap: 'FINAL' } }),
  ]);
  for (const h of hasil) {
    await notifySatuan(h.satuanId, {
      judul: 'Hasil Pleno ditetapkan',
      pesan: 'Hasil Pleno Seleksi Penghargaan Stratifikasi UKS/M telah ditetapkan. Sertifikat Kepesertaan akan tersedia setelah digenerate Tim Stratifikasi.',
      tipe: 'success', link: '/dokumen',
    });
    await notifyKecamatan(h.satuan.kecamatanId, {
      judul: 'Hasil Pleno ditetapkan', pesan: `${h.satuan.nama}: Hasil Pleno telah ditetapkan.`,
      tipe: 'info', link: '/', satuanId: h.satuanId,
    });
  }
  return { jumlahSatdik: hasil.length, jumlahPeraih: peraih };
}

export async function bukaKembaliPleno(namaUser, alasan) {
  const { periodeId, kunci } = await konteksPleno();
  const proses = await prisma.prosesPleno.findUnique({ where: { kunci } });
  if (!proses) throw new Galat(400, 'Hasil Pleno belum diproses.');
  const hasil = await prisma.hasilFinal.findMany({ where: { periodeId }, select: { satuanId: true } });
  await prisma.$transaction([
    prisma.prosesPleno.delete({ where: { kunci } }),
    prisma.satuanPendidikan.updateMany({
      where: { id: { in: hasil.map((h) => h.satuanId) }, tahap: 'FINAL' }, data: { tahap: 'KUNJUNGAN_LAPANGAN' },
    }),
  ]);
  return { dibukaOleh: namaUser, alasan, jumlahSatdik: hasil.length };
}

// ---------------------------------------------------------------------------
// GENERATE SERTIFIKAT KEPESERTAAN untuk seluruh satdik di Hasil Pleno.
// Hanya membuat yang BELUM ada — nomor yang sudah terbit tidak pernah diganti dan
// sertifikat yang sudah terbit tetap memakai penandatangan versi saat terbitnya.
// ---------------------------------------------------------------------------
// Nomor rubrikasi (pola), tanggal penerbitan, dan tahun sertifikat DIISI ADMIN setiap kali
// generate (rapat final Okt 2026). Sertifikat yang sudah terbit tidak diubah.
export function periksaIsianSertifikat({ nomorRubrikasi, tanggalTerbit, tahun } = {}) {
  const pola = String(nomorRubrikasi || '').trim();
  if (!pola) throw new Galat(400, 'Nomor rubrikasi sertifikat wajib diisi.');
  if (!pola.includes('{urut}')) {
    throw new Galat(400, 'Nomor rubrikasi harus memuat {urut} agar setiap sertifikat mendapat nomor yang berbeda, mis. 421.7/{urut}/Kesra/2026.');
  }
  if (pola.length > 120) throw new Galat(400, 'Nomor rubrikasi terlalu panjang (maksimal 120 karakter).');
  const tgl = /^\d{4}-\d{2}-\d{2}$/.test(String(tanggalTerbit || '')) ? new Date(`${tanggalTerbit}T12:00:00+07:00`) : null;
  if (!tgl || Number.isNaN(tgl.getTime())) throw new Galat(400, 'Tanggal penerbitan sertifikat wajib diisi.');
  const th = Number(tahun);
  if (!Number.isInteger(th) || th < 2000 || th > 2100) throw new Galat(400, 'Tahun sertifikat wajib diisi (mis. 2026).');
  return { pola, tanggal: tgl, tahun: th };
}

// Menerbitkan ULANG: nomor lama dikosongkan lebih dulu (nomor bersifat unik) agar nomor baru
// dari pola admin tidak bentrok dengan nomor lama milik satdik lain.
async function kosongkanNomor(model, ids) {
  for (const id of ids) await prisma[model].update({ where: { id }, data: { nomor: `__ulang_${id}` } });
}

// Nomor Piagam Penghargaan dan Piagam Peserta berbagi satu ruang nomor (tidak boleh kembar).
const nomorSudahDipakai = async (n) => !!(
  await prisma.sertifikat.findUnique({ where: { nomor: n }, select: { id: true } })
  || await prisma.piagamPeserta.findUnique({ where: { nomor: n }, select: { id: true } })
);

async function pastikanPenandatangan() {
  const versi = await versiAktif();
  if (!versi?.namaPejabat) {
    throw new Galat(400, 'Lengkapi Pengaturan Sertifikat (nama pejabat penandatangan) terlebih dahulu.');
  }
  if (!versi.ttd) {
    throw new Galat(400, 'Unggah pindaian tanda tangan pejabat pada Pengaturan Sertifikat terlebih dahulu.');
  }
  return versi;
}

// Piagam Peserta untuk SEMUA satdik hasil Rekomendasi Kecamatan pada periode aktif.
export async function generatePiagamPeserta(namaUser, isian) {
  const { pola, tanggal, tahun } = periksaIsianSertifikat(isian);
  const { periodeId } = await konteksPleno();
  const versi = await pastikanPenandatangan();
  const rekom = await prisma.rekomendasi.findMany({
    where: periodeId ? { periodeId } : {},
    include: { satuan: { select: { id: true, nama: true, piagamPeserta: { select: { id: true } } } } },
    orderBy: [{ kecamatanId: 'asc' }, { peringkat: 'asc' }],
  });
  if (!rekom.length) throw new Galat(400, 'Belum ada satdik yang direkomendasikan kecamatan pada periode ini.');
  let dibuat = 0, dilewati = 0, diperbarui = 0;
  const ulang = !!isian?.terbitkanUlang;
  if (ulang) await kosongkanNomor('piagamPeserta', rekom.filter((x) => x.satuan.piagamPeserta).map((x) => x.satuan.piagamPeserta.id));
  for (const rk of rekom) {
    if (rk.satuan.piagamPeserta && !ulang) { dilewati++; continue; }
    const { nomor } = await nomorDariPola(pola, { tanggal, cekTerpakai: nomorSudahDipakai });
    if (rk.satuan.piagamPeserta) {
      await prisma.piagamPeserta.update({
        where: { id: rk.satuan.piagamPeserta.id },
        data: { nomor, periodeId, tanggal, tahun, diterbitkanOleh: namaUser, versiId: versi.id },
      });
      diperbarui++; continue;
    }
    await prisma.piagamPeserta.create({
      data: { satuanId: rk.satuanId, nomor, periodeId, tanggal, tahun, diterbitkanOleh: namaUser, versiId: versi.id },
    });
    await notifySatuan(rk.satuanId, {
      judul: 'Piagam Peserta tersedia',
      pesan: 'Piagam Peserta Seleksi Penghargaan Stratifikasi UKS/M Anda sudah dapat diunduh pada menu Sertifikat.',
      tipe: 'success', link: '/dokumen',
    });
    dibuat++;
  }
  return { dibuat, diperbarui, dilewati, total: await prisma.piagamPeserta.count({ where: { satuanId: { in: rekom.map((x) => x.satuanId) } } }) };
}

export async function generateSertifikat(namaUser, isian) {
  const { pola, tanggal, tahun } = periksaIsianSertifikat(isian);
  const { periodeId, kunci } = await konteksPleno();
  const proses = await prisma.prosesPleno.findUnique({ where: { kunci } });
  if (!proses) throw new Galat(400, 'Proses Hasil Pleno terlebih dahulu sebelum menggenerate sertifikat.');
  const versi = await versiAktif();
  if (!versi?.namaPejabat) {
    throw new Galat(400, 'Lengkapi Pengaturan Sertifikat (nama Ketua Umum Tim Pembina) terlebih dahulu.');
  }
  if (!versi.ttd) {
    throw new Galat(400, 'Unggah pindaian tanda tangan Ketua Umum Tim Pembina pada Pengaturan Sertifikat terlebih dahulu.');
  }
  const hasil = await prisma.hasilFinal.findMany({
    where: { periodeId }, include: { satuan: { include: { sertifikat: true } } }, orderBy: { peringkat: 'asc' },
  });
  let dibuat = 0, diperbarui = 0, dilewati = 0;
  const ulang = !!isian?.terbitkanUlang;
  if (ulang) await kosongkanNomor('sertifikat', hasil.filter((h) => h.satuan.sertifikat).map((h) => h.satuan.sertifikat.id));
  for (const h of hasil) {
    const ada = h.satuan.sertifikat;
    if (ada && ulang) {
      const { nomor } = await nomorDariPola(pola, { tanggal, cekTerpakai: nomorSudahDipakai });
      await prisma.sertifikat.update({
        where: { id: ada.id },
        data: { nomor, strata: h.strataFinal, periodeId, tanggal, tahun, perihal: PERIHAL_SERTIFIKAT, diterbitkanOleh: namaUser, versiId: versi.id },
      });
      diperbarui++;
      continue;
    }
    if (!ada) {
      const { nomor } = await nomorDariPola(pola, {
        tanggal,
        cekTerpakai: nomorSudahDipakai,
      });
      await prisma.sertifikat.create({
        data: {
          satuanId: h.satuanId, nomor, strata: h.strataFinal, periodeId, tanggal, tahun,
          perihal: PERIHAL_SERTIFIKAT, diterbitkanOleh: namaUser, versiId: versi.id,
        },
      });
      dibuat++;
    } else if (!ada.versiId) {
      // sertifikat warisan alur lama (terbit sebelum Hasil Pleno): nomor dipertahankan,
      // isinya diselaraskan dengan strata akhir dan penandatangan saat ini
      await prisma.sertifikat.update({
        where: { id: ada.id },
        data: { strata: h.strataFinal, periodeId, tanggal, tahun, perihal: PERIHAL_SERTIFIKAT, diterbitkanOleh: namaUser, versiId: versi.id },
      });
      diperbarui++;
    } else {
      dilewati++;
    }
    if (!ada || !ada.versiId) {
      await notifySatuan(h.satuanId, {
        judul: 'Sertifikat Kepesertaan tersedia',
        pesan: 'Sertifikat Kepesertaan Seleksi Penghargaan Stratifikasi UKS/M Anda sudah dapat diunduh pada menu Sertifikat.',
        tipe: 'success', link: '/dokumen',
      });
    }
  }
  const jumlah = await prisma.sertifikat.count({ where: { satuanId: { in: hasil.map((h) => h.satuanId) } } });
  await prisma.prosesPleno.update({
    where: { kunci }, data: { sertifikatPada: new Date(), sertifikatOleh: namaUser, jumlahSertifikat: jumlah },
  });
  return { dibuat, diperbarui, dilewati, total: jumlah };
}
