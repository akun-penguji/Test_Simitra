import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Spinner, Alert, Paginasi } from '../lib.jsx';

const AKSI = {
  REGISTRASI_AKUN: { ic: '📝', txt: 'Registrasi akun', col: '#64748b' },
  UPDATE_PROFIL: { ic: '🏫', txt: 'Perbarui profil', col: '#64748b' },
  SUBMIT_PENILAIAN_MANDIRI: { ic: '📋', txt: 'Kirim penilaian mandiri', col: '#1a7a3c' },
  VERIFIKASI_PENILAIAN: { ic: '✅', txt: 'Verifikasi penilaian (kecamatan)', col: '#1e5aa8' },
  REKOMENDASI: { ic: '📤', txt: 'Direkomendasikan (kecamatan)', col: '#1e5aa8' },
  SUBMIT_EVIDEN: { ic: '📎', txt: 'Ajukan eviden', col: '#1a7a3c' },
  TERBIT_SERTIFIKAT_STRATA: { ic: '📜', txt: 'Terbit Sertifikat', col: '#7c3aed' },
  DAFTAR_SELEKSI: { ic: '🏁', txt: 'Daftar Seleksi Penghargaan', col: '#1e5aa8' },
  SELEKSI_ADMINISTRASI: { ic: '📋', txt: 'Seleksi administrasi', col: '#7c3aed' },
  KUNJUNGAN_LAPANGAN: { ic: '📍', txt: 'Kunjungan lapangan', col: '#7c3aed' },
  HITUNG_FINAL: { ic: '🧮', txt: 'Olah hasil final', col: '#b8860b' },
  TERBIT_SK_BUPATI: { ic: '🏆', txt: 'Terbit SK Bupati (alur lama)', col: '#b8860b' },
  HITUNG_PLENO: { ic: '🧮', txt: 'Hitung Hasil Pleno', col: '#b8860b' },
  REVIEW_ULANG_PLENO: { ic: '🔁', txt: 'Review ulang Hasil Pleno', col: '#b8860b' },
  PROSES_PLENO: { ic: '🔒', txt: 'Proses Hasil Pleno', col: '#b8860b' },
  BUKA_KEMBALI_PLENO: { ic: '🔓', txt: 'Buka kembali Hasil Pleno', col: '#c0392b' },
  GENERATE_SERTIFIKAT: { ic: '📜', txt: 'Generate Sertifikat Penghargaan', col: '#7c3aed' },
  GENERATE_PIAGAM_PESERTA: { ic: '📜', txt: 'Generate Sertifikat Peserta', col: '#7c3aed' },
  REKOMENDASI_DITOLAK_PERAIH: { ic: '⛔', txt: 'Rekomendasi ditolak (sekolah peraih penghargaan)', col: '#c0392b' },
  REVISI_NILAI_LAPANGAN: { ic: '✏️', txt: 'Revisi nilai lapangan', col: '#7c3aed' },
  REKOMENDASI_KUNJUNGAN: { ic: '📍', txt: 'Rekomendasi ke Kunjungan Lapangan', col: '#7c3aed' },
  BATAL_REKOMENDASI_KUNJUNGAN: { ic: '↩️', txt: 'Batal rekomendasi Kunjungan Lapangan', col: '#64748b' },
  UNGGAH_SURAT_REKOMENDASI: { ic: '📨', txt: 'Unggah surat rekomendasi kecamatan', col: '#1e5aa8' },
  HAPUS_SURAT_REKOMENDASI: { ic: '🗑️', txt: 'Hapus surat rekomendasi kecamatan', col: '#64748b' },
  UBAH_PENGATURAN_SERTIFIKAT: { ic: '🖋️', txt: 'Ubah pengaturan sertifikat', col: '#64748b' },
};

function fmt(d) {
  return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Riwayat() {
  const { user } = useAuth();
  const [logs, setLogs] = useState(null);
  const [q, setQ] = useState('');

  const [hal, setHal] = useState({ page: 1, pageSize: 25 });
  useEffect(() => { api.get(`/riwayat?q=${encodeURIComponent(q)}&page=${hal.page}&pageSize=${hal.pageSize}`).then(setLogs); }, [hal.page, hal.pageSize, q]);
  if (!logs) return <Spinner />;

  const shown = logs.data; // pencarian & paginasi dilakukan di server

  const sub = user.role === 'SATUAN_PENDIDIKAN' ? 'Riwayat progres stratifikasi sekolah Anda'
    : user.role === 'TP_KECAMATAN' ? `Aktivitas satuan pendidikan di kecamatan ${user.kecamatan?.nama}`
    : 'Log aktivitas seluruh proses stratifikasi';

  return (
    <>
      <div className="page-head">
        <h2>Riwayat Progres</h2>
        <p>{sub}</p>
      </div>

      {(user.role !== 'SATUAN_PENDIDIKAN') && (
        <div className="card" style={{ padding: '12px 16px' }}>
          <input placeholder="Cari aktivitas / pelaku / detail..." value={q} onChange={(e) => { setQ(e.target.value); setHal({ ...hal, page: 1 }); }} />
        </div>
      )}

      {!shown.length ? (
        <Alert type="info">{logs.total === 0 && !q ? 'Belum ada aktivitas tercatat.' : 'Tidak ada aktivitas yang cocok dengan pencarian.'}</Alert>
      ) : (
        <div className="card">
          <ul className="tl">
            {shown.map((l) => {
              const a = AKSI[l.aksi] || { ic: '•', txt: l.aksi, col: '#64748b' };
              return (
                <li key={l.id} className="tl-item">
                  <span className="tl-dot" style={{ background: a.col }}>{a.ic}</span>
                  <div className="tl-body">
                    <div className="tl-title">{a.txt}{l.detail ? <span className="tl-detail"> — {l.detail}</span> : null}</div>
                    <div className="tl-meta">{l.aktor} · {fmt(l.createdAt)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
          <Paginasi res={logs} label="aktivitas" onPage={(p) => setHal({ ...hal, page: p })} onPageSize={(n) => setHal({ page: 1, pageSize: n })} />
        </div>
      )}
    </>
  );
}
