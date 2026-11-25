import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Spinner, StrataBadge, Alert, STRATA_LABEL, TombolUnduhPdf } from '../../lib.jsx';
import { cetakAtau, ttd, STRATA_LABEL as P_STRATA } from '../../print.js';
import { useUI } from '../../ui.jsx';

const STRATA_LABEL_LOKAL = { DASAR: 'Dasar', MADYA: 'Madya', UTAMA: 'Utama', PARIPURNA: 'Paripurna' };
const YN = (v) => (v === 1 ? 'Ya' : v === 0 ? 'Tidak' : '-');

export default function HasilStrata() {
  const { toast } = useUI();
  const [komponen, setKomponen] = useState([]);
  const [penilaian, setPenilaian] = useState(null);
  const [sekolah, setSekolah] = useState(null);

  useEffect(() => {
    api.get('/instrumen').then((d) => setKomponen(d.komponen));
    api.get('/penilaian/mine').then((d) => setPenilaian(d.penilaian || d));
    api.get('/satuan/me').then(setSekolah);
  }, []);
  if (!penilaian) return <Spinner />;

  const jwMap = {};
  for (const j of penilaian.jawaban || []) jwMap[j.indikatorId] = j;
  const allInd = komponen.flatMap((k) => k.indikator.map((i) => ({ ...i, komp: k })));

  if (penilaian.status === 'DRAFT') {
    return (<>
      <div className="page-head"><h2>Hasil Strata</h2></div>
      <Alert type="info">Anda belum mengirim penilaian mandiri. Silakan isi terlebih dahulu.</Alert>
    </>);
  }
  const diver = penilaian.status === 'DIVERIFIKASI';
  const strataNow = diver ? penilaian.strataVerifikasi : penilaian.strataMandiri;

  function cetakHasil() {
    const rows = allInd.map((ind) => {
      const j = jwMap[ind.id];
      return `<tr><td>${ind.komp.kode}</td><td>${STRATA_LABEL_LOKAL[ind.strata]}</td><td>${ind.pertanyaan}</td><td class="center">${YN(j?.nilaiMandiri)}</td>${diver ? `<td class="center">${YN(j?.nilaiVerifikasi ?? j?.nilaiMandiri)}</td>` : ''}</tr>`;
    }).join('');
    cetakAtau(toast, 'Hasil Penilaian Mandiri', `
      <div class="doc-title">Hasil Penilaian Mandiri Stratifikasi UKS/M</div>
      <table class="meta">
        <tr><td>Nama Satuan Pendidikan</td><td>: ${sekolah?.nama || '-'}</td></tr>
        <tr><td>NPSN</td><td>: ${sekolah?.npsn || '-'}</td></tr>
        <tr><td>Kecamatan</td><td>: ${sekolah?.kecamatan?.nama || '-'}</td></tr>
        <tr><td>Puskesmas Binaan</td><td>: ${sekolah?.puskesmas?.nama || '-'}</td></tr>
      </table>
      <table class="meta" style="margin-top:10px">
        <tr><td>Nilai Penilaian Mandiri</td><td>: ${penilaian.skorMandiri ?? '-'} / 100 (${penilaian.strataMandiri ? P_STRATA[penilaian.strataMandiri] : 'Belum Mencapai Dasar'})</td></tr>
        ${diver ? `<tr><td>Nilai Hasil Verifikasi</td><td>: ${penilaian.skorVerifikasi} / 100 (Strata <b>${penilaian.strataVerifikasi ? P_STRATA[penilaian.strataVerifikasi] : 'Belum Mencapai Dasar'}</b>)</td></tr>` : ''}
      </table>
      <table><thead><tr><th>Komp</th><th>Strata</th><th>Indikator</th><th class="center">Mandiri</th>${diver ? '<th class="center">Verifikasi</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>
      ${ttd('Cikarang', 'Kepala ' + (sekolah?.nama || 'Satuan Pendidikan'))}`);
  }

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Hasil Strata Penilaian Mandiri</h2>
          <p>Hasil verifikasi & validasi dari TP UKS/M Kecamatan.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn secondary" onClick={cetakHasil}>🖨️ Cetak Hasil</button>
          {penilaian.satuanId && (
            <TombolUnduhPdf path={`/cetak/penilaian/${penilaian.satuanId}.pdf`} nama="Hasil-Scoring-Stratifikasi.pdf" label="Unduh PDF" kelas="btn" onError={(e) => toast(e.message, 'error')} />
          )}
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card center">
          <div className="muted">Nilai Penilaian Mandiri</div>
          <div style={{ fontSize: 34, fontWeight: 700, color: '#1a7a3c' }}>{penilaian.skorMandiri ?? '-'}<span style={{ fontSize: 16 }}>/100</span></div>
          {penilaian.strataMandiri ? <StrataBadge strata={penilaian.strataMandiri} /> : <span className="badge red">Belum Mencapai Dasar</span>}
        </div>
        <div className="card center">
          <div className="muted">Nilai Hasil Verifikasi Kecamatan</div>
          {diver ? (<>
            <div style={{ fontSize: 34, fontWeight: 700, color: '#1e5aa8' }}>{penilaian.skorVerifikasi}<span style={{ fontSize: 16 }}>/100</span></div>
            {penilaian.strataVerifikasi ? <StrataBadge strata={penilaian.strataVerifikasi} /> : <span className="badge red">Belum Mencapai Dasar</span>}
          </>) : (<div className="mt"><span className="badge amber">Menunggu verifikasi kecamatan</span></div>)}
        </div>
      </div>

      {diver && penilaian.catatanVerifikasi && <Alert type="info"><b>Catatan verifikator:</b> {penilaian.catatanVerifikasi}</Alert>}

      <div className="card">
        <h3>Rincian Penilaian per Indikator</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Komp</th><th>Strata</th><th>Indikator</th><th>Mandiri</th>{diver && <th>Verifikasi</th>}</tr></thead>
            <tbody>
              {allInd.map((ind) => {
                const j = jwMap[ind.id];
                return (
                  <tr key={ind.id}>
                    <td>{ind.komp.kode}</td>
                    <td><span className={`badge strata-${ind.strata}`} style={{ fontSize: 10 }}>{STRATA_LABEL_LOKAL[ind.strata]}</span></td>
                    <td>{ind.pertanyaan}</td>
                    <td>{YN(j?.nilaiMandiri)}</td>
                    {diver && <td><b>{YN(j?.nilaiVerifikasi ?? j?.nilaiMandiri)}</b></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
