// Informasi waktu program stratifikasi (notulen Sep 2026): tampil di atas setiap
// halaman aplikasi dan di halaman login saat program berjalan.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export const fmtTgl = (d, opsi = {}) => (d ? new Date(d).toLocaleDateString('id-ID', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta', ...opsi,
}) : '-');
const pendek = (d) => fmtTgl(d, { month: 'short', year: undefined });
const STATUS_TAHAP = { LEWAT: ['Selesai', 'gray'], BERJALAN: ['Berjalan', 'green'], AKAN: ['Akan datang', 'blue'] };

export function useJadwal() {
  const [j, setJ] = useState(undefined);
  useEffect(() => { api.get('/jadwal-program').then(setJ).catch(() => setJ(null)); }, []);
  return j;
}

export function DaftarJadwal({ jadwal }) {
  if (!jadwal?.length) return <div className="muted" style={{ fontSize: 12.5 }}>Rincian tahapan belum diatur.</div>;
  return (
    <ol className="jadwal-list">
      {jadwal.map((t) => {
        const [lbl, cls] = STATUS_TAHAP[t.status];
        return (
          <li key={t.id} className={`jadwal-item ${t.status.toLowerCase()}`}>
            <span className="jadwal-titik" />
            <div className="jadwal-isi">
              <div className="jadwal-nama"><b>{t.nama}</b> <span className={`badge ${cls}`}>{lbl}</span></div>
              <div className="jadwal-tgl">
                {fmtTgl(t.mulai)} – {fmtTgl(t.selesai)}{t.pelaksana ? ` · ${t.pelaksana}` : ''}
                {t.status === 'BERJALAN' && <b> · sisa {t.sisaHari} hari</b>}
                {t.status === 'AKAN' && ` · ${t.mulaiDalamHari} hari lagi`}
              </div>
              {t.keterangan && <div className="jadwal-ket">{t.keterangan}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// Banner di atas halaman aplikasi (seluruh peran)
export default function JadwalProgram({ isAdmin = false }) {
  const j = useJadwal();
  const [buka, setBuka] = useState(false);
  if (!j) return null;

  if (j.status === 'BELUM_DIATUR') {
    if (!isAdmin) return null;
    return (
      <div className="jadwal-banner belum">
        <span>🗓️ Jadwal program <b>{j.periode.nama}</b> belum diatur — pengguna lain belum melihat informasi waktu program.</span>
        <Link to="/periode"><button className="btn sm">Atur jadwal</button></Link>
      </div>
    );
  }
  const berjalan = j.status === 'BERJALAN';
  return (
    <div className={`jadwal-banner ${j.status.toLowerCase()}`}>
      <div className="jadwal-baris">
        <span className="jadwal-ikon">🗓️</span>
        <div className="jadwal-teks">
          {berjalan && <><b>{j.periode.nama}</b> sedang berjalan · {fmtTgl(j.mulai)} – {fmtTgl(j.selesai)} · <b>sisa {j.sisaHari} hari</b></>}
          {j.status === 'BELUM_MULAI' && <><b>{j.periode.nama}</b> dimulai {fmtTgl(j.mulai)} · <b>{j.mulaiDalamHari} hari lagi</b></>}
          {j.status === 'SELESAI' && <><b>{j.periode.nama}</b> telah berakhir pada {fmtTgl(j.selesai)}.</>}
          {berjalan && (
            <div className="jadwal-kini">
              {j.berjalan.length
                ? j.berjalan.map((t) => <span key={t.id} className="jadwal-chip">▶ {t.nama} <em>s.d. {pendek(t.selesai)} · sisa {t.sisaHari} hari</em></span>)
                : <span className="jadwal-chip jeda">Tidak ada tahapan berjalan hari ini</span>}
              {j.berikutnya && <span className="jadwal-next">Berikutnya: {j.berikutnya.nama} ({pendek(j.berikutnya.mulai)})</span>}
            </div>
          )}
        </div>
        {j.jadwal.length > 0 && <button className="btn sm secondary" onClick={() => setBuka((v) => !v)}>{buka ? 'Tutup' : 'Jadwal lengkap'}</button>}
      </div>
      {berjalan && j.persen != null && (
        <div className="jadwal-progres" title={`${j.persen}% waktu program telah berjalan`}><i style={{ width: `${j.persen}%` }} /></div>
      )}
      {buka && <div className="jadwal-rinci"><DaftarJadwal jadwal={j.jadwal} /></div>}
    </div>
  );
}

// Versi ringkas untuk panel kiri halaman login
export function JadwalLogin() {
  const j = useJadwal();
  if (!j || j.status === 'BELUM_DIATUR') return null;
  return (
    <div className="jadwal-login">
      <div className="jl-judul">🗓️ {j.periode.nama}</div>
      {j.status === 'BERJALAN' && (
        <>
          <div className="jl-tgl">{fmtTgl(j.mulai)} – {fmtTgl(j.selesai)} · sisa <b>{j.sisaHari}</b> hari</div>
          {j.persen != null && <div className="jl-bar"><i style={{ width: `${j.persen}%` }} /></div>}
          {j.berjalan.map((t) => <div key={t.id} className="jl-tahap">▶ {t.nama} — s.d. {pendek(t.selesai)}</div>)}
          {j.berikutnya && <div className="jl-next">Berikutnya: {j.berikutnya.nama} ({pendek(j.berikutnya.mulai)})</div>}
        </>
      )}
      {j.status === 'BELUM_MULAI' && <div className="jl-tgl">Dimulai {fmtTgl(j.mulai)} · {j.mulaiDalamHari} hari lagi</div>}
      {j.status === 'SELESAI' && <div className="jl-tgl">Telah berakhir {fmtTgl(j.selesai)}</div>}
    </div>
  );
}
