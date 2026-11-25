// Perhitungan stratifikasi UKS/M sesuai format resmi (Perhitungan Stratifikasi All Jenjang).
//
// Model: komponen (A-D) x 4 strata (Dasar/Madya/Utama/Paripurna).
// Jawaban per indikator = 1 (terpenuhi) / 0 (tidak).
// Tiap STRATA bernilai maksimal 25 poin, dibagi rata ke komponen yang memiliki
// indikator pada strata itu: poin/komponen = 25 / (jumlah komponen ber-strata tsb).
//   → Bila 4 komponen punya strata itu, poin/komponen = 6,25 (sesuai format resmi).
//   → Bila hanya sebagian komponen (mis. TK strata Utama), tetap dinormalkan ke 25
//     agar strata Utama/Paripurna tetap dapat tercapai (mencegah "tak pernah naik").
// Skor komponen-strata = (terpenuhi / total indikator strata tsb) * poin/komponen.
// Total per strata = jumlah skor strata itu di seluruh komponen → maks 25.
// Nilai akhir = D + M + U + P (0..100).
// Strata (KATAGORI):
//   D < 25 → null (Belum Mencapai Dasar) · M < 25 → DASAR · U < 25 → MADYA
//   P < 25 → UTAMA · else → PARIPURNA

const STRATA_URUT = ['DASAR', 'MADYA', 'UTAMA', 'PARIPURNA'];
const EPS = 1e-6; // toleransi pembanding agar aman terhadap galat floating-point

// jawaban: array of { nilai:0|1, komponenId, strata }
export function hitungStratifikasi(jawaban) {
  // group: komponenId -> strata -> { terpenuhi, total }
  const map = {};
  for (const j of jawaban) {
    const kid = j.komponenId;
    const st = j.strata;
    (map[kid] ||= {});
    (map[kid][st] ||= { terpenuhi: 0, total: 0 });
    map[kid][st].total += 1;
    map[kid][st].terpenuhi += j.nilai ? 1 : 0;
  }

  // Jumlah komponen yang memiliki indikator pada tiap strata → poin/komponen = 25 / K
  const kompCount = { DASAR: 0, MADYA: 0, UTAMA: 0, PARIPURNA: 0 };
  for (const st of STRATA_URUT) for (const kid of Object.keys(map)) if (map[kid][st]?.total) kompCount[st]++;
  const poin = {};
  for (const st of STRATA_URUT) poin[st] = kompCount[st] ? 25 / kompCount[st] : 0;

  const raw = { DASAR: 0, MADYA: 0, UTAMA: 0, PARIPURNA: 0 }; // presisi penuh utk keputusan
  const perKomponen = {};
  for (const kid of Object.keys(map)) {
    perKomponen[kid] = { DASAR: 0, MADYA: 0, UTAMA: 0, PARIPURNA: 0, total: 0, terpenuhi: 0, jumlah: 0 };
    for (const st of STRATA_URUT) {
      const d = map[kid][st];
      const ratio = d && d.total ? d.terpenuhi / d.total : 0;
      const skor = ratio * poin[st];
      perKomponen[kid][st] = Math.round(skor * 100) / 100;
      perKomponen[kid].total += skor;
      raw[st] += skor;
      if (d) { perKomponen[kid].terpenuhi += d.terpenuhi; perKomponen[kid].jumlah += d.total; }
    }
    perKomponen[kid].total = Math.round(perKomponen[kid].total * 100) / 100;
  }

  const perStrata = {};
  for (const st of STRATA_URUT) perStrata[st] = Math.round(raw[st] * 100) / 100;
  const nilai = Math.round((raw.DASAR + raw.MADYA + raw.UTAMA + raw.PARIPURNA) * 100) / 100;

  let strata; // null = belum mencapai dasar
  if (raw.DASAR < 25 - EPS) strata = null;
  else if (raw.MADYA < 25 - EPS) strata = 'DASAR';
  else if (raw.UTAMA < 25 - EPS) strata = 'MADYA';
  else if (raw.PARIPURNA < 25 - EPS) strata = 'UTAMA';
  else strata = 'PARIPURNA';

  return { nilai, perStrata, perKomponen, strata };
}

export const STRATA_URUTAN = STRATA_URUT;

// ---------------------------------------------------------------------------
// STRATA AKHIR DIHITUNG SISTEM dari nilai Hasil Pleno (rapat akhir Okt 2026):
// strata akhir tidak lagi ditetapkan manual. Nilai pleno per indikator (0-3) diubah
// menjadi terpenuhi / tidak terpenuhi, lalu dihitung berjenjang dengan rumus yang
// SAMA seperti penilaian mandiri (hitungStratifikasi).
//
// AMBANG: indikator dianggap terpenuhi bila nilai pleno >= 2 ("Ada, Cukup Sesuai").
// Nilai 0 (tidak ada/tidak sesuai) dan 1 (ada, kurang sesuai) belum memenuhi.
// Mengubah ambang ini mengubah strata akhir seluruh peserta — bahas dengan Tim
// Pembina sebelum diganti.
// ---------------------------------------------------------------------------
export const AMBANG_NILAI_TERPENUHI = 2;

// Nilai efektif satu indikator: nilai lapangan bila ada, kalau tidak skor administrasi.
export const nilaiEfektifItem = (i) => (i.skorLapangan != null ? i.skorLapangan : (i.skor ?? 0));

// items: [{ skor, skorLapangan, indikator: { komponenId, strata } }]
export function strataDariNilaiPleno(items) {
  const hasil = hitungStratifikasi(items.map((i) => ({
    nilai: nilaiEfektifItem(i) >= AMBANG_NILAI_TERPENUHI ? 1 : 0,
    komponenId: i.indikator.komponenId,
    strata: i.indikator.strata,
  })));
  const terpenuhi = items.filter((i) => nilaiEfektifItem(i) >= AMBANG_NILAI_TERPENUHI).length;
  return { strata: hasil.strata, nilaiStrata: hasil.nilai, terpenuhi, total: items.length };
}

export const STRATA_LABEL = {
  DASAR: 'Dasar', MADYA: 'Madya', UTAMA: 'Utama', PARIPURNA: 'Paripurna',
};
export const strataLabel = (s) => (s ? STRATA_LABEL[s] : 'Belum Mencapai Dasar');

// Urutan strata untuk pembanding ambang (mis. minimal Madya)
export function strataMinimal(strata, ambang) {
  if (!strata) return false;
  return STRATA_URUT.indexOf(strata) >= STRATA_URUT.indexOf(ambang);
}

// Pemetaan jenjang sekolah → grup jenjang instrumen
// Jenjang yang termasuk dalam satu tingkat satuan pendidikan.
// Dipakai untuk kuota rekomendasi per tingkat (tidak dicampur antar tingkat).
export const JENJANG_GRUP = {
  TK: ['TK', 'RA', 'PAUD'],
  SD: ['SD', 'MI'],
  SMP: ['SMP', 'MTS'],
  SMA: ['SMA', 'SMK', 'MA'],
};
export const LABEL_GRUP = { TK: 'TK/RA', SD: 'SD/MI', SMP: 'SMP/MTs', SMA: 'SMA/SMK/MA' };

// Bentuk pendidikan Dapodik → nilai `jenjang` yang dipakai aplikasi.
// Seluruh bentuk PAUD (KB, TPA, SPS) disetarakan dengan TK karena instrumen
// stratifikasinya sama. Pendidikan nonformal (PKBM, SKB) tidak punya instrumen
// UKS/M sehingga dikembalikan null dan diisi manual oleh sekolah.
// Bentuk madrasah dipertahankan apa adanya (RA/MI/MTs/MA) karena aplikasi
// memang menyediakan pilihan itu; instrumennya tetap disetarakan oleh
// jenjangGrup(). Bentuk yang tidak punya pilihan sendiri disetarakan ke yang
// paling dekat.
const BENTUK_KE_JENJANG = {
  TK: 'TK', KB: 'TK', TPA: 'TK', SPS: 'TK', PAUD: 'TK', 'SPK TK': 'TK',
  RA: 'RA', BA: 'RA', TA: 'RA',
  SD: 'SD', 'SPK SD': 'SD',
  MI: 'MI',
  SMP: 'SMP', 'SPK SMP': 'SMP',
  MTS: 'MTS',
  SMA: 'SMA', SMAK: 'SMA', 'SPK SMA': 'SMA',
  SMK: 'SMK',
  MA: 'MA', MAK: 'MA',
};

export function jenjangDariBentuk(bentuk) {
  const b = String(bentuk || '').toUpperCase().replace(/\s+/g, ' ').trim();
  return BENTUK_KE_JENJANG[b] || null;
}

export function jenjangGrup(jenjang) {
  const j = String(jenjang || '').toUpperCase();
  if (['TK', 'RA', 'PAUD'].includes(j)) return 'TK';
  if (['SD', 'MI'].includes(j)) return 'SD';
  if (['SMP', 'MTS'].includes(j)) return 'SMP';
  if (['SMA', 'SMK', 'MA'].includes(j)) return 'SMA';
  return 'SD';
}
