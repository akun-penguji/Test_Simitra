import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Spinner, TAHAP_LABEL, TAHAP_ORDER, STRATA_LABEL } from '../../lib.jsx';
import { StatCard, Donut, BarList } from '../../charts.jsx';
import DiagramStrata from '../../components/DiagramStrata.jsx';

const STRATA_URUT = ['DASAR', 'MADYA', 'UTAMA', 'PARIPURNA'];
const STRATA_COLOR = { PARIPURNA: '#1a7a3c', UTAMA: '#1e5aa8', MADYA: '#b8860b', DASAR: '#c0392b' };

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [periodes, setPeriodes] = useState([]);
  const [periodeId, setPeriodeId] = useState('');
  const [tren, setTren] = useState([]);

  useEffect(() => {
    api.get('/periode').then(setPeriodes).catch(() => {});
    api.get('/kabupaten/tren').then(setTren).catch(() => {});
  }, []);
  useEffect(() => { api.get(`/kabupaten/dashboard${periodeId ? `?periodeId=${periodeId}` : ''}`).then(setD); }, [periodeId]);
  if (!d) return <Spinner />;
  const maxTren = Math.max(1, ...tren.map((t) => t.PARIPURNA + t.UTAMA + t.MADYA + t.DASAR));

  const tahapMap = {};
  for (const t of d.perTahap) tahapMap[t.tahap] = t._count;
  const strataMap = {};
  for (const s of d.perStrata) strataMap[s.strataVerifikasi] = s._count;

  const strataData = ['PARIPURNA', 'UTAMA', 'MADYA', 'DASAR']
    .map((s) => ({ label: STRATA_LABEL[s], value: strataMap[s] || 0, color: STRATA_COLOR[s] }));

  const tahapData = TAHAP_ORDER.map((t) => ({ label: TAHAP_LABEL[t], value: tahapMap[t] || 0 }));

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Dashboard Tim Stratifikasi Kabupaten</h2>
          <p>Ringkasan proses stratifikasi UKS/M se-Kabupaten Bekasi.</p>
        </div>
        <div style={{ minWidth: 220 }}>
          <select value={periodeId} onChange={(e) => setPeriodeId(e.target.value)}>
            <option value="">Semua Periode</option>
            {periodes.map((p) => <option key={p.id} value={p.id}>{p.nama}{p.aktif ? ' (aktif)' : ''}</option>)}
          </select>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 18 }}>
        <StatCard icon="🏫" value={d.totalSatuan} label="Satuan Pendidikan" color="#1a7a3c" sub={`${d.totalKecamatan} kecamatan`} />
        <StatCard icon="📝" value={d.penilaianSubmitted} label="Penilaian Mandiri Masuk" color="#1e5aa8" />
        <StatCard icon="📤" value={d.rekomendasi} label="Peserta Rekomendasi" color="#7c3aed" />
        <StatCard icon="🏆" value={d.peraih} label="Peraih Penghargaan" color="#b8860b" />
      </div>

      <div className="grid cols-2">
        <div className="chartcard">
          <h3>Sebaran Strata</h3>
          <div className="chart-sub">Berdasarkan hasil verifikasi kecamatan</div>
          <Donut data={strataData} centerLabel="Satuan" />
          {!strataData.some((s) => s.value > 0) && (
            <div className="chart-kosong">Belum ada data strata terverifikasi — grafik terisi setelah kecamatan memverifikasi penilaian sekolah.</div>
          )}
          <p className="muted" style={{ fontSize: 11.5, marginTop: 14, marginBottom: 0 }}>
            Strata berjenjang: seluruh indikator Dasar terpenuhi → Dasar; ditambah seluruh indikator Madya → Madya; dan seterusnya hingga Paripurna.
          </p>
        </div>

        <div className="chartcard">
          <h3>Alur Proses (Funnel)</h3>
          <div className="chart-sub">Jumlah satuan pendidikan per tahap</div>
          <BarList data={tahapData} color="#1a7a3c" />
        </div>
      </div>

      {/* Tabel lengkap (rapat final Okt 2026): sekolah per kecamatan × 9 jenjang, dan strata per jenjang */}
      <div className="chartcard" style={{ marginTop: 18 }}>
        <h3>Strata per Jenjang</h3>
        <div className="chart-sub">Sembilan jenjang dipisah (TK, RA, SD, MI, SMP, MTs, SMA, SMK, MA) — berdasarkan hasil verifikasi kecamatan</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Jenjang</th><th className="num">Terdaftar</th>
                {STRATA_URUT.map((st) => <th key={st} className="num">{STRATA_LABEL[st]}</th>)}
                <th className="num">Belum Terverifikasi</th>
              </tr>
            </thead>
            <tbody>
              {d.strataPerJenjang.map((j) => (
                <tr key={j.jenjang}>
                  <td><b>{j.jenjang}</b></td>
                  <td className="num">{j.total}</td>
                  {STRATA_URUT.map((st) => <td key={st} className="num">{j[st] || <span className="muted">0</span>}</td>)}
                  <td className="num">{j.belum || <span className="muted">0</span>}</td>
                </tr>
              ))}
              <tr>
                <td><b>Total</b></td>
                <td className="num"><b>{d.strataPerJenjang.reduce((a, j) => a + j.total, 0)}</b></td>
                {STRATA_URUT.map((st) => <td key={st} className="num"><b>{d.strataPerJenjang.reduce((a, j) => a + (j[st] || 0), 0)}</b></td>)}
                <td className="num"><b>{d.strataPerJenjang.reduce((a, j) => a + j.belum, 0)}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="chartcard" style={{ marginTop: 18 }}>
        <h3>Satuan Pendidikan per Kecamatan</h3>
        <div className="chart-sub">Jumlah satuan pendidikan terdaftar di SIMITRA menurut kecamatan dan jenjang</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Kecamatan</th>{d.jenjang.map((j) => <th key={j} className="num">{j}</th>)}<th className="num">Total</th></tr>
            </thead>
            <tbody>
              {d.perKecamatanJenjang.map((k) => (
                <tr key={k.kecamatan}>
                  <td>{k.kecamatan}</td>
                  {d.jenjang.map((j) => <td key={j} className="num">{k[j] || <span className="muted">0</span>}</td>)}
                  <td className="num"><b>{k.total}</b></td>
                </tr>
              ))}
              <tr>
                <td><b>Total</b></td>
                {d.jenjang.map((j) => <td key={j} className="num"><b>{d.perKecamatanJenjang.reduce((a, k) => a + (k[j] || 0), 0)}</b></td>)}
                <td className="num"><b>{d.perKecamatanJenjang.reduce((a, k) => a + k.total, 0)}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <DiagramStrata path={`/kabupaten/diagram-strata${periodeId ? `?periodeId=${periodeId}` : ''}`} />

      {tren.length > 1 && (
        <div className="chartcard" style={{ marginTop: 18 }}>
          <h3>Tren Strata Antar Periode</h3>
          <div className="chart-sub">Perbandingan capaian strata terverifikasi tiap periode/tahun</div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap', padding: '10px 0' }}>
            {tren.map((t) => {
              const total = t.PARIPURNA + t.UTAMA + t.MADYA + t.DASAR;
              return (
                <div key={t.periode} style={{ textAlign: 'center', flex: '1 1 90px', minWidth: 90 }}>
                  <div style={{ height: 160, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 2 }}>
                    {['PARIPURNA', 'UTAMA', 'MADYA', 'DASAR'].map((s) => t[s] > 0 && (
                      <div key={s} title={`${STRATA_LABEL[s]}: ${t[s]}`} style={{ background: STRATA_COLOR[s], height: `${(t[s] / maxTren) * 150}px`, borderRadius: 3, color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t[s]}</div>
                    ))}
                    {total === 0 && <div className="muted" style={{ fontSize: 11 }}>0</div>}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>{t.tahun}</div>
                  <div className="muted" style={{ fontSize: 10.5 }}>{total} satuan</div>
                </div>
              );
            })}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              {['PARIPURNA', 'UTAMA', 'MADYA', 'DASAR'].map((s) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: STRATA_COLOR[s] }} /> {STRATA_LABEL[s]}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
