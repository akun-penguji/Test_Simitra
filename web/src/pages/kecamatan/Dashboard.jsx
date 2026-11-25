import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Spinner, TahapBadge, StrataBadge, STRATA_LABEL } from '../../lib.jsx';
import { useAuth } from '../../auth.jsx';
import { StatCard, Donut, BarList } from '../../charts.jsx';
import DiagramStrata from '../../components/DiagramStrata.jsx';

const STRATA_COLOR = { PARIPURNA: '#1a7a3c', UTAMA: '#1e5aa8', MADYA: '#b8860b', DASAR: '#c0392b' };

export default function Dashboard() {
  const { user } = useAuth();
  const [list, setList] = useState(null);
  useEffect(() => { api.get('/kecamatan/satuan?semua=1').then(setList); }, []);
  if (!list) return <Spinner />;

  const perluVerif = list.filter((s) => s.penilaian[0]?.status === 'SUBMITTED').length;
  const diverif = list.filter((s) => s.penilaian[0]?.status === 'DIVERIFIKASI').length;
  const direkom = list.filter((s) => s.rekomendasi).length;

  // sebaran strata (hasil verifikasi) satuan di kecamatan ini
  const strataCount = { PARIPURNA: 0, UTAMA: 0, MADYA: 0, DASAR: 0 };
  for (const s of list) { const st = s.penilaian[0]?.strataVerifikasi; if (st) strataCount[st]++; }
  const strataData = Object.keys(strataCount).map((s) => ({ label: STRATA_LABEL[s], value: strataCount[s], color: STRATA_COLOR[s] }));
  const adaStrata = Object.values(strataCount).some((v) => v > 0);

  // funnel pipeline kecamatan
  const funnel = [
    { label: 'Terdaftar', value: list.length, color: '#94a3b8' },
    { label: 'Penilaian Masuk', value: list.filter((s) => ['SUBMITTED', 'DIVERIFIKASI'].includes(s.penilaian[0]?.status)).length, color: '#1e5aa8' },
    { label: 'Terverifikasi', value: diverif, color: '#0d9488' },
    { label: 'Direkomendasikan', value: direkom, color: '#7c3aed' },
  ];

  return (
    <>
      <div className="page-head">
        <h2>Beranda Kecamatan</h2>
        <p>TP UKS/M Kecamatan {user.kecamatan?.nama} — {list.length} satuan pendidikan terdaftar.</p>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 18 }}>
        <StatCard icon="🏫" value={list.length} label="Satuan Pendidikan" color="#1a7a3c" />
        <StatCard icon="⏳" value={perluVerif} label="Perlu Verifikasi" color="#b8860b" />
        <StatCard icon="✅" value={diverif} label="Terverifikasi" color="#1e5aa8" />
        <StatCard icon="📤" value={direkom} label="Direkomendasikan" color="#7c3aed" suffix="/8" />
      </div>

      <div className="grid cols-2" style={{ marginBottom: 18 }}>
        <div className="chartcard">
          <h3>Sebaran Strata</h3>
          <div className="chart-sub">Hasil verifikasi satuan di kecamatan ini</div>
          <Donut data={strataData} centerLabel="Satuan" />
          {!adaStrata && (
            <div className="chart-kosong">Belum ada satuan terverifikasi — grafik terisi setelah Anda memverifikasi penilaian mandiri sekolah.</div>
          )}
        </div>
        <div className="chartcard">
          <h3>Alur Proses Kecamatan</h3>
          <div className="chart-sub">Progres satuan pendidikan menuju rekomendasi</div>
          <BarList data={funnel} />
        </div>
      </div>

      <DiagramStrata path="/kecamatan/diagram-strata" />

      <div className="card">
        <div className="row-between mb">
          <h3 style={{ margin: 0 }}>Daftar Satuan Pendidikan</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/verifikasi"><button className="btn sm">Verifikasi</button></Link>
            <Link to="/rekomendasi"><button className="btn sm blue">Rekomendasi</button></Link>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Satuan Pendidikan</th><th>Jenjang</th><th>Tahap</th><th>Strata Mandiri</th><th>Strata Verifikasi</th></tr></thead>
            <tbody>
              {list.map((s) => {
                const p = s.penilaian[0];
                return (
                  <tr key={s.id}>
                    <td><b>{s.nama}</b></td>
                    <td>{s.jenjang}</td>
                    <td><TahapBadge tahap={s.tahap} /></td>
                    <td><StrataBadge strata={p?.strataMandiri} /></td>
                    <td><StrataBadge strata={p?.strataVerifikasi} /></td>
                  </tr>
                );
              })}
              {!list.length && <tr><td colSpan={5} className="center muted">Belum ada satuan pendidikan.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
