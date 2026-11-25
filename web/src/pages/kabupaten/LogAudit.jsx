import { useEffect, useState, useRef } from 'react';
import { api } from '../../api.js';
import { Spinner } from '../../lib.jsx';

const ROLE_LABEL = { SATUAN_PENDIDIKAN: 'Sekolah', TP_KECAMATAN: 'Kecamatan', TIM_KABUPATEN: 'Kabupaten', ANONIM: 'Anonim' };
const ROLE_COLOR = { SATUAN_PENDIDIKAN: 'green', TP_KECAMATAN: 'blue', TIM_KABUPATEN: 'purple', ANONIM: 'gray' };
const METHOD_COLOR = { GET: 'gray', POST: 'green', PUT: 'amber', DELETE: 'red' };

function fmt(d) { return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

export default function LogAudit() {
  const [res, setRes] = useState(null);
  const [role, setRole] = useState('');
  const [method, setMethod] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [auto, setAuto] = useState(true);
  const timer = useRef(null);

  async function load() {
    const p = new URLSearchParams({ page, pageSize: 40 });
    if (role) p.set('role', role);
    if (method) p.set('method', method);
    if (q) p.set('q', q);
    setRes(await api.get(`/kabupaten/audit?${p}`));
  }
  useEffect(() => { load(); }, [role, method, q, page]);
  useEffect(() => {
    if (auto) { timer.current = setInterval(() => { if (page === 1) load(); }, 5000); }
    return () => clearInterval(timer.current);
  }, [auto, role, method, q, page]);
  useEffect(() => { setPage(1); }, [role, method, q]);

  if (!res) return <Spinner />;

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Log Audit Keamanan</h2>
          <p>Rekaman seluruh aktivitas real-time: pengguna, peran, IP, waktu, & aksi. Field sensitif (IP, username, URL, detail) terenkripsi di database.</p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <span className={auto ? '' : 'muted'}>{auto ? '🟢 Real-time (5s)' : '⏸️ Jeda'}</span>
        </label>
      </div>

      <div className="card" style={{ padding: '12px 16px' }}>
        <div className="form-row" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
          <div className="field" style={{ margin: 0 }}><input placeholder="Cari username / IP / URL / aksi / detail..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="field" style={{ margin: 0 }}>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Semua Peran</option>
              {Object.keys(ROLE_LABEL).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">Semua Method</option>
              {['GET', 'POST', 'PUT', 'DELETE'].map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Waktu</th><th>Pengguna</th><th>Peran</th><th>IP</th><th>Aksi</th><th>Method</th><th>Status</th></tr></thead>
            <tbody>
              {res.data.map((l) => (
                <tr key={l.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmt(l.waktu)}</td>
                  <td><b>{l.username || '-'}</b>{l.aktor && l.aktor !== l.username && <div className="muted" style={{ fontSize: 11 }}>{l.aktor}</div>}</td>
                  <td><span className={`badge ${ROLE_COLOR[l.role] || 'gray'}`}>{ROLE_LABEL[l.role] || l.role}</span></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{l.ip || '-'}</td>
                  <td>{l.aksi}{l.detail ? <div className="muted" style={{ fontSize: 11 }}>{l.detail}</div> : null}<div className="muted" style={{ fontSize: 10.5, fontFamily: 'monospace' }}>{l.path}</div></td>
                  <td><span className={`badge ${METHOD_COLOR[l.method] || 'gray'}`}>{l.method}</span></td>
                  <td><span className={`badge ${l.statusCode >= 400 ? 'red' : 'green'}`}>{l.statusCode}</span></td>
                </tr>
              ))}
              {!res.data.length && <tr><td colSpan={7} className="center muted">Belum ada aktivitas.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="row-between mt" style={{ alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12 }}>Total {res.total} aktivitas · Halaman {res.page}/{res.totalPages}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn sm secondary" disabled={res.page <= 1} onClick={() => setPage(res.page - 1)}>← Sebelumnya</button>
            <button className="btn sm secondary" disabled={res.page >= res.totalPages} onClick={() => setPage(res.page + 1)}>Berikutnya →</button>
          </div>
        </div>
      </div>
    </>
  );
}
