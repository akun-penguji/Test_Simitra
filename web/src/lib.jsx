import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useUI } from './ui.jsx';
// Konstanta & komponen kecil bersama

export const TAHAP_ORDER = [
  'REGISTRASI',
  'PENILAIAN_MANDIRI',
  'MENUNGGU_VERIFIKASI',
  'HASIL_STRATA',
  'DIREKOMENDASIKAN',
  'PENGISIAN_EVIDEN',
  'REVIEW_EVIDEN',
  'EVIDEN_DISETUJUI',
  'BERSERTIFIKAT',
  'TERDAFTAR_SELEKSI',
  'SELEKSI_ADMINISTRASI',
  'KUNJUNGAN_LAPANGAN',
  'FINAL',
];

export const TAHAP_LABEL = {
  REGISTRASI: 'Registrasi & Profil',
  PENILAIAN_MANDIRI: 'Penilaian Mandiri',
  MENUNGGU_VERIFIKASI: 'Menunggu Verifikasi',
  HASIL_STRATA: 'Hasil Strata',
  DIREKOMENDASIKAN: 'Direkomendasikan',
  PENGISIAN_EVIDEN: 'Pengisian Eviden',
  REVIEW_EVIDEN: 'Review Eviden',
  EVIDEN_DISETUJUI: 'Eviden Disetujui',
  BERSERTIFIKAT: 'Bersertifikat (alur lama)',
  TERDAFTAR_SELEKSI: 'Menunggu Seleksi Administrasi',
  SELEKSI_ADMINISTRASI: 'Seleksi Administrasi',
  KUNJUNGAN_LAPANGAN: 'Kunjungan Lapangan',
  FINAL: 'Hasil Pleno',
};

export const STRATA_LABEL = {
  DASAR: 'Dasar',
  MADYA: 'Madya',
  UTAMA: 'Utama',
  PARIPURNA: 'Paripurna',
};

export const NILAI_LABEL = ['Tidak Ada', 'Dasar', 'Madya', 'Utama'];

// Pilihan jenjang satuan pendidikan. RA/MI/MTs/MA adalah madrasah (Kemenag)
// yang instrumennya disetarakan dengan TK/SD/SMP/SMA.
// Tingkat untuk saringan daftar: nilai dikirim ke server (?tingkat=) yang memetakannya
// ke seluruh jenjang setara (TK→TK/RA, SD→SD/MI, SMP→SMP/MTs, SMA→SMA/SMK/MA).
export const TINGKAT_PILIHAN = [
  { id: 'TK', label: 'TK / RA' },
  { id: 'SD', label: 'SD / MI' },
  { id: 'SMP', label: 'SMP / MTs' },
  { id: 'SMA', label: 'SMA / SMK / MA' },
];

export const JENJANG_PILIHAN = ['TK', 'RA', 'SD', 'MI', 'SMP', 'MTS', 'SMA', 'SMK', 'MA'];

// Teks pernyataan wajib pada pop-up konfirmasi penilaian (notulen rapat Tim Pembina):
// setiap penilaian harus dinyatakan sesuai fakta di lapangan.
export const TEKS_PERNYATAAN =
  'Saya menyatakan bahwa penilaian ini dilakukan sesuai fakta yang sebenarnya di lapangan ' +
  'dan dapat dipertanggungjawabkan.';

// Pembungkus konfirmasi berpernyataan — dipakai seluruh titik penilaian.
export async function konfirmasiFakta(confirm, opsi = {}) {
  return confirm({
    title: opsi.title || 'Konfirmasi Penilaian',
    message: opsi.message || 'Pastikan seluruh isian telah sesuai keadaan sebenarnya sebelum dikirim.',
    confirmText: opsi.confirmText || 'Ya, Kirim',
    variant: opsi.variant || 'warning',
    pernyataan: opsi.pernyataan || TEKS_PERNYATAAN,
  });
}

// Pernyataan ketersediaan bukti untuk indikator yang dijawab Ya.
export const TEKS_PERNYATAAN_EVIDEN =
  'Bukti dukung indikator ini tersedia dan dapat ditunjukkan saat verifikasi.';

// Kendali paginasi bersama — dipakai seluruh tabel yang datanya bertambah.
// `res` adalah balasan berpaginasi { data, total, page, pageSize, totalPages }.
export function Paginasi({ res, onPage, onPageSize, label = 'baris' }) {
  if (!res) return null;
  const { page = 1, pageSize = 25, total = 0, totalPages = 1 } = res;
  const dari = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const sampai = Math.min(page * pageSize, total);
  return (
    <div className="paginasi">
      <span className="paginasi-info">
        {total === 0 ? `Tidak ada ${label}` : <>Menampilkan <b>{dari}–{sampai}</b> dari <b>{total}</b> {label}</>}
      </span>
      <div className="paginasi-kendali">
        {onPageSize && (
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} aria-label="Baris per halaman">
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / halaman</option>)}
          </select>
        )}
        <button className="btn sm secondary" disabled={page <= 1} onClick={() => onPage(1)} title="Halaman pertama">«</button>
        <button className="btn sm secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Sebelumnya</button>
        <span className="paginasi-hal">Hal. {page} / {totalPages}</span>
        <button className="btn sm secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Berikutnya ›</button>
        <button className="btn sm secondary" disabled={page >= totalPages} onClick={() => onPage(totalPages)} title="Halaman terakhir">»</button>
      </div>
    </div>
  );
}

// Tombol unduh PDF hasil scoring (berkop surat resmi)
export function TombolUnduhPdf({ path, nama, label = 'Unduh PDF', kelas = 'btn secondary sm', onError }) {
  const [sibuk, setSibuk] = useState(false);
  const { toast } = useUI();
  return (
    <button
      type="button"
      className={kelas}
      disabled={sibuk}
      onClick={async () => {
        setSibuk(true);
        try { await api.download(path, nama); }
        catch (e) { onError ? onError(e) : toast(e.message, 'error'); }
        finally { setSibuk(false); }
      }}
    >
      {sibuk ? 'Menyiapkan…' : `⬇ ${label}`}
    </button>
  );
}

export function StrataBadge({ strata }) {
  if (!strata) return <span className="badge gray">-</span>;
  return <span className={`badge strata-${strata}`}>{STRATA_LABEL[strata] || strata}</span>;
}

export function TahapBadge({ tahap }) {
  const idx = TAHAP_ORDER.indexOf(tahap);
  const cls = tahap === 'FINAL' ? 'green' : idx >= 8 ? 'purple' : idx >= 4 ? 'blue' : 'amber';
  return <span className={`badge ${cls}`}>{TAHAP_LABEL[tahap] || tahap}</span>;
}

// Stepper ringkas untuk satuan pendidikan
export function Stepper({ tahap }) {
  const cur = TAHAP_ORDER.indexOf(tahap);
  // Sertifikat Kepesertaan kini terbit di akhir (setelah Hasil Pleno diproses), bukan
  // di tengah alur; nomor langkah mengikuti urutan tampil agar selalu konsisten.
  const items = [
    'REGISTRASI', 'PENILAIAN_MANDIRI', 'HASIL_STRATA', 'DIREKOMENDASIKAN', 'PENGISIAN_EVIDEN',
    'SELEKSI_ADMINISTRASI', 'KUNJUNGAN_LAPANGAN', 'FINAL',
  ].map((k, n) => ({ k, n: n + 1 }));
  return (
    <div className="stepper">
      {items.map((it) => {
        const idx = TAHAP_ORDER.indexOf(it.k);
        const state = idx < cur ? 'done' : idx === cur ? 'current' : '';
        return (
          <div key={it.k} className={`step ${state}`}>
            <span className="dot">{idx < cur ? '✓' : it.n}</span>
            {TAHAP_LABEL[it.k]}
          </div>
        );
      })}
    </div>
  );
}

export function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function Spinner({ text = 'Memuat...' }) {
  return <div className="spinner">{text}</div>;
}

export function Alert({ type = 'info', children }) {
  if (!children) return null;
  return <div className={`alert ${type === 'error' ? 'err' : type === 'success' ? 'ok' : type}`}>{children}</div>;
}

// Legenda nilai skoring eviden (skala 0-3) — keputusan Tim Pembina UKS/M
export const LEGENDA_SKOR = [
  { nilai: 0, teks: 'Eviden Tidak Ada / Tidak Sesuai' },
  { nilai: 1, teks: 'Eviden Ada, Kurang Sesuai' },
  { nilai: 2, teks: 'Eviden Ada, Cukup Sesuai' },
  { nilai: 3, teks: 'Eviden Ada, Sangat Sesuai' },
];

export function LegendaSkor({ judul = 'Legenda nilai skoring eviden' }) {
  return (
    <div className="legenda-skor">
      <span className="lg-judul">{judul}:</span>
      {LEGENDA_SKOR.map((l) => (
        <span key={l.nilai} className={`lg-item lg-${l.nilai}`}>
          <b>{l.nilai}</b> {l.teks}
        </span>
      ))}
    </div>
  );
}

// Pilihan skor 0-3 dengan keterangan lengkap pada tiap pilihan
export function PilihSkor({ nilai, onChange, disabled, title }) {
  return (
    <select value={nilai ?? 3} disabled={disabled} title={title} onChange={(e) => onChange(e.target.value)}>
      {LEGENDA_SKOR.map((l) => <option key={l.nilai} value={l.nilai}>{l.nilai} — {l.teks}</option>)}
    </select>
  );
}

// Dropdown dengan pencarian (combobox) untuk daftar panjang seperti puskesmas.
// `pilihan` = [{ id, nama, keterangan? }]
export function PilihCari({ pilihan = [], nilai, onChange, placeholder = '-- pilih --', kosong = 'Tidak ada data', disabled }) {
  const [buka, setBuka] = useState(false);
  const [cari, setCari] = useState('');
  const wadah = useRef(null);
  const terpilih = pilihan.find((p) => p.id === nilai) || null;

  useEffect(() => {
    function luar(e) { if (wadah.current && !wadah.current.contains(e.target)) { setBuka(false); setCari(''); } }
    document.addEventListener('mousedown', luar);
    return () => document.removeEventListener('mousedown', luar);
  }, []);

  const hasil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q) return pilihan;
    return pilihan.filter((p) => `${p.nama} ${p.keterangan || ''}`.toLowerCase().includes(q));
  }, [cari, pilihan]);

  function pilih(id) { onChange(id); setBuka(false); setCari(''); }

  return (
    <div className={`pilih-cari ${disabled ? 'mati' : ''}`} ref={wadah}>
      <button type="button" className="pc-kotak" disabled={disabled}
        onClick={() => { if (!disabled) { setBuka((b) => !b); setCari(''); } }}>
        <span className={terpilih ? '' : 'pc-kosong'}>{terpilih ? terpilih.nama : placeholder}</span>
        <span className="pc-tanda">▾</span>
      </button>
      {buka && (
        <div className="pc-panel">
          <input autoFocus className="pc-cari" placeholder="Cari…" value={cari}
            onChange={(e) => setCari(e.target.value)} />
          <div className="pc-daftar">
            <button type="button" className="pc-opsi pc-netral" onClick={() => pilih('')}>{placeholder}</button>
            {hasil.map((p) => (
              <button type="button" key={p.id} className={`pc-opsi ${p.id === nilai ? 'aktif' : ''}`} onClick={() => pilih(p.id)}>
                <span>{p.nama}</span>
                {p.keterangan && <small>{p.keterangan}</small>}
              </button>
            ))}
            {!hasil.length && <div className="pc-nihil">{cari ? 'Tidak ada yang cocok.' : kosong}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// Menu "Kertas Kerja ▾": kertas kerja verifikasi lapangan dicetak PER KOMPONEN
// (tiap komponen dipegang penilai berbeda), atau semua komponen sekaligus.
let cacheKomponen = null;
export function KertasKerjaMenu({ satuanId, namaSatuan, onError }) {
  const [buka, setBuka] = useState(false);
  const [komponen, setKomponen] = useState(cacheKomponen || []);
  const wadah = useRef(null);

  useEffect(() => {
    if (cacheKomponen) return;
    api.get('/kabupaten/komponen').then((d) => { cacheKomponen = d; setKomponen(d); }).catch(() => {});
  }, []);
  useEffect(() => {
    function luar(e) { if (wadah.current && !wadah.current.contains(e.target)) setBuka(false); }
    document.addEventListener('mousedown', luar);
    return () => document.removeEventListener('mousedown', luar);
  }, []);

  const berkas = (kode) => `Kertas-Kerja-${kode}-${namaSatuan}.pdf`;
  return (
    <div className="menu-kk" ref={wadah}>
      <button type="button" className="btn sm secondary" onClick={() => setBuka((b) => !b)}>Kertas Kerja ▾</button>
      {buka && (
        <div className="pc-panel">
          <div className="pc-daftar">
            <TombolUnduhPdf kelas="pc-opsi" path={`/cetak/kertas-kerja/${satuanId}.pdf`} nama={berkas('Semua-Komponen')}
              label="Semua komponen" onError={onError} />
            {komponen.map((k) => (
              <TombolUnduhPdf key={k.id} kelas="pc-opsi" path={`/cetak/kertas-kerja/${satuanId}.pdf?komponenId=${k.id}`}
                nama={berkas(`Komponen-${k.kode}`)} label={`Komponen ${k.kode} — ${k.nama}`} onError={onError} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
