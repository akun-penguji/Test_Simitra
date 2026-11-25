import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Stepper, TahapBadge, StrataBadge, Spinner, TAHAP_LABEL, TAHAP_ORDER } from '../../lib.jsx';
import { RadialProgress, BarList } from '../../charts.jsx';

const NEXT_ACTION = {
  REGISTRASI: { text: 'Lengkapi profil satuan pendidikan Anda.', to: '/profil', btn: 'Isi Profil' },
  PENILAIAN_MANDIRI: { text: 'Isi instrumen penilaian mandiri lalu submit.', to: '/penilaian', btn: 'Isi Penilaian' },
  MENUNGGU_VERIFIKASI: { text: 'Penilaian mandiri sedang diverifikasi TP UKS/M Kecamatan.', to: '/hasil-strata', btn: 'Lihat Status' },
  HASIL_STRATA: { text: 'Hasil strata penilaian mandiri sudah tersedia.', to: '/hasil-strata', btn: 'Lihat Hasil' },
  DIREKOMENDASIKAN: { text: 'Selamat! Anda direkomendasikan. Isi eviden stratifikasi.', to: '/eviden', btn: 'Isi Eviden' },
  PENGISIAN_EVIDEN: { text: 'Perbaiki eviden yang berstatus revisi lalu ajukan ulang.', to: '/eviden', btn: 'Perbaiki Eviden' },
  REVIEW_EVIDEN: { text: 'Eviden Anda sedang direview Tim Stratifikasi.', to: '/eviden', btn: 'Lihat Eviden' },
  EVIDEN_DISETUJUI: { text: 'Seluruh eviden disetujui. Anda otomatis masuk Seleksi Administrasi Tim Stratifikasi.', to: '/dokumen', btn: 'Lihat Dokumen' },
  BERSERTIFIKAT: { text: 'Sertifikat telah terbit.', to: '/dokumen', btn: 'Lihat Sertifikat' },
  TERDAFTAR_SELEKSI: { text: 'Eviden disetujui. Menunggu Seleksi Administrasi dan rekomendasi Kunjungan Lapangan oleh Tim Stratifikasi.', to: '/dokumen', btn: 'Lihat Status' },
  SELEKSI_ADMINISTRASI: { text: 'Sedang dalam seleksi administrasi oleh Tim Stratifikasi.', to: '/dokumen', btn: 'Lihat Status' },
  KUNJUNGAN_LAPANGAN: { text: 'Terjadwal / dalam proses peninjauan lapangan.', to: '/dokumen', btn: 'Lihat Status' },
  FINAL: { text: 'Hasil Pleno telah diproses. Sertifikat Penghargaan tersedia setelah digenerate Tim Stratifikasi.', to: '/dokumen', btn: 'Lihat Sertifikat' },
};

const STRATA_COLOR = { PARIPURNA: '#1a7a3c', UTAMA: '#1e5aa8', MADYA: '#b8860b', DASAR: '#c0392b' };

export default function Dashboard() {
  const [s, setS] = useState(null);
  const [instrumen, setInstrumen] = useState([]);
  const [penilaian, setPenilaian] = useState(null);

  useEffect(() => {
    api.get('/satuan/me').then(setS);
    api.get('/instrumen').then((d) => setInstrumen(d.komponen)).catch(() => {});
    // balasan berbentuk { larangan, penilaian }
    api.get('/penilaian/mine').then((d) => setPenilaian(d?.penilaian ?? d ?? null)).catch(() => {});
  }, []);
  if (!s) return <Spinner />;

  const act = NEXT_ACTION[s.tahap];
  const strata = s.hasilFinal?.strataFinal;

  // progress 16 langkah
  const stepIdx = TAHAP_ORDER.indexOf(s.tahap);
  const progressPct = Math.round((stepIdx / (TAHAP_ORDER.length - 1)) * 100);

  // skor per komponen (dari penilaian mandiri/verifikasi)
  let komponenData = [];
  let sudahNilai = false;
  if (penilaian && penilaian.status !== 'DRAFT' && instrumen.length) {
    sudahNilai = true;
    const jwMap = {};
    for (const j of penilaian.jawaban || []) jwMap[j.indikatorId] = j;
    komponenData = instrumen.map((k) => {
      let total = 0, max = 0;
      for (const ind of k.indikator) {
        const j = jwMap[ind.id];
        const nilai = j ? (j.nilaiVerifikasi ?? j.nilaiMandiri) : 0;
        total += nilai; max += 1;
      }
      const pct = max ? Math.round((total / max) * 100) : 0;
      return { label: `${k.kode}. ${k.nama}`, value: pct, color: '#1a7a3c' };
    });
  } else if (instrumen.length) {
    // belum menilai: grafik tetap tampil dengan seluruh komponen bernilai 0
    komponenData = instrumen.map((k) => ({ label: `${k.kode}. ${k.nama}`, value: 0, color: '#1a7a3c' }));
  }

  const strataNow = penilaian?.strataVerifikasi || penilaian?.strataMandiri;

  return (
    <>
      <div className="page-head">
        <h2>Beranda</h2>
        <p>{s.nama} · {s.kecamatan?.nama} · Jenjang {s.jenjang}</p>
      </div>

      <div className="grid cols-3" style={{ marginBottom: 18, alignItems: 'stretch' }}>
        <div className="chartcard center" style={{ gridColumn: 'span 1' }}>
          <h3 style={{ marginBottom: 12 }}>Progres Anda</h3>
          <RadialProgress value={progressPct} label={TAHAP_LABEL[s.tahap]} color={strata ? STRATA_COLOR[strata] : '#1a7a3c'} />
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Tahap {stepIdx + 1} dari {TAHAP_ORDER.length}</div>
        </div>

        <div className="chartcard" style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column' }}>
          <div className="row-between">
            <h3 style={{ margin: 0 }}>Langkah Selanjutnya</h3>
            <TahapBadge tahap={s.tahap} />
          </div>
          <p className="muted" style={{ flex: 1 }}>{act?.text}</p>
          {act && <Link to={act.to}><button className="btn">{act.btn} →</button></Link>}
          {strataNow && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <span className="muted" style={{ fontSize: 12.5 }}>Strata saat ini: </span>
              <StrataBadge strata={strataNow} />
              {s.hasilFinal?.peraih && <span className="badge purple" style={{ marginLeft: 8 }}>🏆 Peraih Penghargaan</span>}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Perjalanan Stratifikasi (16 Langkah)</h3>
        <Stepper tahap={s.tahap} />
      </div>

      <div className="grid cols-2">
        <div className="chartcard">
          <h3>Skor per Komponen UKS/M</h3>
          <div className="chart-sub">Persentase pemenuhan tiap komponen (skala 0–100%)</div>
          <BarList data={komponenData} color="#1a7a3c" />
          {!sudahNilai && (
            <div className="chart-kosong">Skor muncul setelah Anda mengirim penilaian mandiri.</div>
          )}
        </div>
        <div className="chartcard">
          <h3>Ringkasan</h3>
          <table>
            <tbody>
              <tr><td className="muted">Status Profil</td><td>{s.profilLengkap ? <span className="badge green">Lengkap</span> : <span className="badge amber">Belum Lengkap</span>}</td></tr>
              <tr><td className="muted">Tahap Saat Ini</td><td>{TAHAP_LABEL[s.tahap]}</td></tr>
              <tr><td className="muted">Direkomendasikan</td><td>{s.rekomendasi ? <span className="badge green">Ya</span> : <span className="badge gray">Belum</span>}</td></tr>
              <tr><td className="muted">Sertifikat</td><td>{s.sertifikat ? <span className="badge green">Terbit</span> : <span className="badge gray">-</span>}</td></tr>
              {strata && <tr><td className="muted">Strata Final</td><td><StrataBadge strata={strata} /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
