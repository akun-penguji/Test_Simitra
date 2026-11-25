import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useUI } from '../../ui.jsx';
import { Spinner, Paginasi, TombolUnduhPdf, fmtDate } from '../../lib.jsx';

// Surat rekomendasi satuan pendidikan yang diunggah TP UKS/M Kecamatan (rapat akhir
// Okt 2026). Berkas disajikan lewat endpoint berotorisasi, tidak lewat /uploads.
const ukuranBaca = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function SuratRekomendasiKecamatan() {
  const { toast } = useUI();
  const [res, setRes] = useState(null);
  const [hal, setHal] = useState({ page: 1, pageSize: 25 });
  const [kecamatanId, setKecamatanId] = useState('');
  const [kecamatan, setKecamatan] = useState([]);
  const [cari, setCari] = useState('');
  const [kataCari, setKataCari] = useState('');

  async function load() {
    const q = new URLSearchParams({ page: hal.page, pageSize: hal.pageSize });
    if (kecamatanId) q.set('kecamatanId', kecamatanId);
    if (kataCari) q.set('q', kataCari);
    try { setRes(await api.get(`/surat-rekomendasi?${q}`)); } catch (e) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, [hal.page, hal.pageSize, kecamatanId, kataCari]);
  useEffect(() => { api.get('/kabupaten/kecamatan').then(setKecamatan).catch(() => {}); }, []);

  if (!res) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <h2>Surat Rekomendasi Kecamatan</h2>
        <p>Surat rekomendasi satuan pendidikan yang diunggah Koordinator TP UKS/M Kecamatan.</p>
      </div>

      <div className="card" style={{ padding: '12px 16px' }}>
        <div className="form-row">
          <div className="field" style={{ margin: 0 }}>
            <select value={kecamatanId} onChange={(e) => { setKecamatanId(e.target.value); setHal({ ...hal, page: 1 }); }}>
              <option value="">Semua Kecamatan</option>
              {kecamatan.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
            </select>
          </div>
          <form className="field" style={{ margin: 0, display: 'flex', gap: 8 }}
            onSubmit={(e) => { e.preventDefault(); setKataCari(cari.trim()); setHal({ ...hal, page: 1 }); }}>
            <input placeholder="Cari nomor surat / perihal..." value={cari} onChange={(e) => setCari(e.target.value)} />
            <button className="btn sm secondary" type="submit">Cari</button>
            {kataCari && <button className="btn sm secondary" type="button" onClick={() => { setCari(''); setKataCari(''); }}>Reset</button>}
          </form>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Kecamatan</th><th>Nomor Surat</th><th>Tanggal Surat</th><th>Perihal</th><th>Berkas</th><th>Diunggah</th><th></th>
            </tr></thead>
            <tbody>
              {res.data.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.kecamatan?.nama}</b></td>
                  <td>{s.nomorSurat || '-'}</td>
                  <td>{s.tanggalSurat ? fmtDate(s.tanggalSurat) : '-'}</td>
                  <td style={{ maxWidth: 260 }}>{s.perihal || '-'}</td>
                  <td>{s.namaBerkas}<div className="muted" style={{ fontSize: 11 }}>{ukuranBaca(s.ukuran)}</div></td>
                  <td>{fmtDate(s.createdAt)}<div className="muted" style={{ fontSize: 11 }}>{s.diunggahOleh}</div></td>
                  <td><TombolUnduhPdf path={`/surat-rekomendasi/${s.id}/berkas`} nama={s.namaBerkas} label="Unduh" onError={(e) => toast(e.message, 'error')} /></td>
                </tr>
              ))}
              {!res.data.length && (
                <tr><td colSpan={7} className="center muted">{kecamatanId || kataCari ? 'Tidak ada surat yang sesuai saringan.' : 'Belum ada surat rekomendasi yang diunggah kecamatan.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Paginasi res={res} label="surat" onPage={(p) => setHal({ ...hal, page: p })} onPageSize={(n) => setHal({ page: 1, pageSize: n })} />
      </div>
    </>
  );
}
