import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Spinner, StrataBadge, fmtDate, Alert, TombolUnduhPdf } from '../../lib.jsx';
import { useUI } from '../../ui.jsx';

function Certificate({ title, nomor, labelNomor = 'Nomor', subtitle, tanggal, nama, extra, accent = '#1a7a3c' }) {
  return (
    <div className="card" style={{ borderTop: `4px solid ${accent}`, textAlign: 'center', padding: '28px 24px' }}>
      <div style={{ fontSize: 12, letterSpacing: 1, color: '#64748b', textTransform: 'uppercase' }}>Pemerintah Kabupaten Bekasi</div>
      <h3 style={{ margin: '8px 0 2px', color: accent }}>{title}</h3>
      <div className="muted" style={{ fontSize: 12 }}>{subtitle}</div>
      <div style={{ margin: '16px 0', fontSize: 13 }}>{labelNomor}: <b>{nomor}</b></div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{nama}</div>
      {extra}
      <div className="muted" style={{ marginTop: 14, fontSize: 12 }}>Diterbitkan {fmtDate(tanggal)}</div>
    </div>
  );
}

export default function Dokumen() {
  const { toast } = useUI();
  const [s, setS] = useState(null);
  useEffect(() => { api.get('/satuan/me').then(setS); }, []);
  if (!s) return <Spinner />;

  const sert = s.sertifikat;
  const peserta = s.piagamPeserta;
  const hf = s.hasilDiproses ? s.hasilFinal : null; // hasil pleno hanya tampil setelah diproses Tim Stratifikasi

  return (
    <>
      <div className="page-head">
        <h2>Sertifikat</h2>
        <p>Sertifikat Peserta (hasil Rekomendasi Kecamatan) dan Sertifikat Penghargaan (hasil Kunjungan Tim Stratifikasi dan Hasil Pleno).</p>
      </div>

      {!sert && !hf && !peserta && <Alert type="info">Belum ada dokumen. Sertifikat Peserta diterbitkan Tim Stratifikasi untuk satdik yang direkomendasikan kecamatan; Sertifikat Penghargaan setelah Hasil Pleno diproses.</Alert>}

      <div className="grid cols-2">
        {peserta && (
          <div>
            <Certificate
              title="Sertifikat Peserta Seleksi Penghargaan"
              subtitle="Stratifikasi UKS/M Kabupaten Bekasi"
              nomor={peserta.nomor}
              tanggal={peserta.tanggal}
              nama={s.nama}
              extra={<div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{s.kecamatan?.nama} · {s.jenjang} · Tahun {peserta.tahun}</div>}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <TombolUnduhPdf path={`/cetak/piagam-peserta/${s.id}.pdf`}
                nama={`Sertifikat-Peserta-${s.nama}.pdf`} label="Unduh Sertifikat Peserta (PDF)"
                kelas="btn secondary" onError={(e) => toast(e.message, 'error')} />
            </div>
          </div>
        )}

        {sert && (
          <div>
            <Certificate
              title="Sertifikat Penghargaan Stratifikasi UKS/M"
              subtitle="Stratifikasi UKS/M Kabupaten Bekasi"
              nomor={sert.nomor}
              tanggal={sert.tanggal}
              nama={s.nama}
              extra={<div style={{ marginTop: 8 }}>Strata: <StrataBadge strata={sert.strata} /><div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{s.kecamatan?.nama} · {s.jenjang}</div></div>}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <TombolUnduhPdf path={`/cetak/sertifikat/${s.id}.pdf`}
                nama={`Sertifikat-Penghargaan-${s.nama}.pdf`} label="Unduh Sertifikat Penghargaan (PDF)"
                kelas="btn secondary" onError={(e) => toast(e.message, 'error')} />
            </div>
          </div>
        )}

        {hf && (
          <div>
            <Certificate
              accent={hf.peraih ? '#7c3aed' : '#1e5aa8'}
              title={hf.peraih ? '🏆 Peraih Penghargaan Stratifikasi UKS/M' : 'Hasil Pleno Stratifikasi'}
              subtitle="Tingkat Kabupaten Bekasi"
              labelNomor="Peringkat"
              nomor={hf.peringkat ? `#${hf.peringkat}` : '-'}
              tanggal={hf.createdAt}
              nama={s.nama}
              extra={
                <div style={{ marginTop: 10 }}>
                  <div style={{ marginBottom: 6 }}>Strata: {hf.strataFinal ? <StrataBadge strata={hf.strataFinal} /> : <span className="badge gray">Belum Mencapai Dasar</span>}</div>
                  <div className="muted" style={{ fontSize: 13 }}>Skor akhir {hf.skorFinal}%</div>
                </div>
              }
            />
          </div>
        )}
      </div>

      {s.kunjungan && (
        <div className="card">
          <h3>Peninjauan Lapangan</h3>
          <table><tbody>
            <tr><td className="muted">Tanggal</td><td>{fmtDate(s.kunjungan.tanggal)}</td></tr>
            <tr><td className="muted">Petugas</td><td>{s.kunjungan.petugas || '-'}</td></tr>
            <tr><td className="muted">Status</td><td>{s.kunjungan.selesai ? <span className="badge green">Selesai</span> : <span className="badge amber">Terjadwal</span>}</td></tr>
            {s.kunjungan.temuan && <tr><td className="muted">Temuan</td><td>{s.kunjungan.temuan}</td></tr>}
          </tbody></table>
        </div>
      )}
    </>
  );
}
