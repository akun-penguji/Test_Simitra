import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { Spinner, StrataBadge, TahapBadge } from '../../lib.jsx';

export default function DataAwal() {
  const nav = useNavigate();
  const [res, setRes] = useState(null);
  const [q, setQ] = useState('');
  const [kecamatanId, setKecamatanId] = useState('');
  const [kecamatan, setKecamatan] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get('/kabupaten/kecamatan').then(setKecamatan); }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, pageSize: 20 });
    if (q) params.set('q', q);
    if (kecamatanId) params.set('kecamatanId', kecamatanId);
    const t = setTimeout(() => {
      api.get(`/kabupaten/penilaian?${params}`).then((d) => { setRes(d); setLoading(false); });
    }, q ? 350 : 0); // debounce saat mengetik
    return () => clearTimeout(t);
  }, [q, kecamatanId, page]);

  useEffect(() => { setPage(1); }, [q, kecamatanId]);

  if (!res) return <Spinner />;

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Data Awal Strata</h2>
          <p>Langkah 3 — Hasil penilaian mandiri satuan pendidikan sebagai data awal strata kabupaten. Total {res.total} satuan.</p>
        </div>
        <button className="btn secondary" onClick={() => api.download('/kabupaten/export/penilaian.csv', 'data-penilaian-uksm.csv')}>⬇️ Export Excel/CSV</button>
      </div>

      <div className="card">
        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="field" style={{ margin: 0 }}><input placeholder="Cari nama sekolah / NPSN..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="field" style={{ margin: 0 }}>
            <select value={kecamatanId} onChange={(e) => setKecamatanId(e.target.value)}>
              <option value="">Semua Kecamatan</option>
              {kecamatan.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
            </select>
          </div>
        </div>
        <div className="table-wrap" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity .2s' }}>
          <table>
            <thead><tr><th>Satuan Pendidikan</th><th>Kecamatan</th><th>Puskesmas</th><th>Jenjang</th><th>Tahap</th><th>Strata Mandiri</th><th>Strata Verifikasi</th><th></th></tr></thead>
            <tbody>
              {res.data.map((s) => {
                const p = s.penilaian[0];
                return (
                  <tr key={s.id}>
                    <td><b>{s.nama}</b></td>
                    <td>{s.kecamatan?.nama}</td>
                    <td>{s.puskesmas?.nama || '-'}</td>
                    <td>{s.jenjang}</td>
                    <td><TahapBadge tahap={s.tahap} /></td>
                    <td>{p?.skorMandiri != null ? `${p.skorMandiri} ` : ''}<StrataBadge strata={p?.strataMandiri} /></td>
                    <td>{p?.skorVerifikasi != null ? `${p.skorVerifikasi} ` : ''}<StrataBadge strata={p?.strataVerifikasi} /></td>
                    <td><button className="btn sm secondary" onClick={() => nav(`/infografis/${s.id}`)}>📊 Infografis</button></td>
                  </tr>
                );
              })}
              {!res.data.length && <tr><td colSpan={8} className="center muted">Tidak ada data.</td></tr>}
            </tbody>
          </table>
        </div>

        {res.totalPages > 1 && (
          <div className="row-between mt" style={{ alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 13 }}>Halaman {res.page} dari {res.totalPages}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn sm secondary" disabled={res.page <= 1} onClick={() => setPage(res.page - 1)}>← Sebelumnya</button>
              <button className="btn sm secondary" disabled={res.page >= res.totalPages} onClick={() => setPage(res.page + 1)}>Berikutnya →</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
