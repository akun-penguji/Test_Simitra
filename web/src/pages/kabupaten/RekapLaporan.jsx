import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Spinner, STRATA_LABEL, fmtDate } from '../../lib.jsx';
import { BarList, StatCard } from '../../charts.jsx';
import { cetakAtau, ttd } from '../../print.js';
import { useUI } from '../../ui.jsx';

const STRATA = ['PARIPURNA', 'UTAMA', 'MADYA', 'DASAR'];
const SC = { PARIPURNA: '#1a7a3c', UTAMA: '#1e5aa8', MADYA: '#b8860b', DASAR: '#c0392b' };

function StrataTable({ rows, labelHead }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>{labelHead}</th>{STRATA.map((s) => <th key={s} className="center">{STRATA_LABEL[s]}</th>)}<th className="center">Total</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.nama}>
              <td><b>{r.nama}</b></td>
              {STRATA.map((s) => <td key={s} className="center">{r[s] || 0}</td>)}
              <td className="center"><b>{r.total}</b></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={6} className="center muted">Belum ada data.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// Laporan strata tiga tahap (rapat final Okt 2026): 1) penilaian mandiri, 2) hasil verifikasi
// kecamatan, 3) hasil pleno Tim Kabupaten (hanya satdik yang masuk daftar kunjungan).
const KOLOM = ['DASAR', 'MADYA', 'UTAMA', 'PARIPURNA', 'BELUM'];
const labelKolom = (k) => (k === 'BELUM' ? 'Belum Mencapai Dasar' : STRATA_LABEL[k]);
function gabung(baris, per, urutan) {
  const m = new Map();
  for (const b of baris) {
    const kunci = per === 'jenjang' ? b.jenjang : b.kecamatan;
    const r = m.get(kunci) || { nama: kunci, DASAR: 0, MADYA: 0, UTAMA: 0, PARIPURNA: 0, BELUM: 0, total: 0 };
    r[b.strata] += b.n; r.total += b.n; m.set(kunci, r);
  }
  const hasil = [...m.values()];
  if (per === 'jenjang') return urutan.map((j) => m.get(j) || { nama: j, DASAR: 0, MADYA: 0, UTAMA: 0, PARIPURNA: 0, BELUM: 0, total: 0 });
  return hasil.sort((a, b) => a.nama.localeCompare(b.nama));
}

function TabelLaporan({ nomor, judul, ket, baris, jenjang }) {
  const [per, setPer] = useState('kecamatan');
  const rows = gabung(baris, per, jenjang);
  const jumlah = (k) => rows.reduce((a, r) => a + r[k], 0);
  return (
    <div className="chartcard" style={{ marginBottom: 18 }}>
      <div className="row-between" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>Tabel {nomor}. {judul}</h3>
          <div className="chart-sub">{ket}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={`btn sm ${per === 'kecamatan' ? '' : 'secondary'}`} onClick={() => setPer('kecamatan')}>Per Kecamatan</button>
          <button className={`btn sm ${per === 'jenjang' ? '' : 'secondary'}`} onClick={() => setPer('jenjang')}>Per Jenjang</button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{per === 'jenjang' ? 'Jenjang' : 'Kecamatan'}</th>{KOLOM.map((k) => <th key={k} className="num">{labelKolom(k)}</th>)}<th className="num">Total</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.nama}>
                <td><b>{r.nama}</b></td>
                {KOLOM.map((k) => <td key={k} className="num">{r[k] || <span className="muted">0</span>}</td>)}
                <td className="num"><b>{r.total}</b></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={KOLOM.length + 2} className="center muted">Belum ada data.</td></tr>}
            {rows.length > 0 && (
              <tr>
                <td><b>Total</b></td>
                {KOLOM.map((k) => <td key={k} className="num"><b>{jumlah(k)}</b></td>)}
                <td className="num"><b>{jumlah('total')}</b></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RekapLaporan() {
  const { toast } = useUI();
  const [rekap, setRekap] = useState(null);
  const [cakupan, setCakupan] = useState(null);
  const [dash, setDash] = useState(null);
  const [laporan, setLaporan] = useState(null);

  useEffect(() => { api.get('/kabupaten/cakupan').then(setCakupan).catch(() => {}); }, []);
  useEffect(() => {
    api.get('/kabupaten/rekap').then(setRekap);
    api.get('/kabupaten/dashboard').then(setDash);
    api.get('/kabupaten/laporan-strata').then(setLaporan).catch(() => {});
  }, []);
  if (!rekap || !dash) return <Spinner />;

  const komponenData = rekap.perKomponen.map((k) => ({ label: `${k.kode}. ${k.nama}`, value: k.rataPersen, color: '#1a7a3c' }));

  function strataTableHtml(rows, head) {
    const body = rows.map((r) => `<tr><td>${r.nama}</td>${STRATA.map((s) => `<td class="center">${r[s] || 0}</td>`).join('')}<td class="center"><b>${r.total}</b></td></tr>`).join('');
    return `<table><thead><tr><th>${head}</th>${STRATA.map((s) => `<th class="center">${STRATA_LABEL[s]}</th>`).join('')}<th class="center">Total</th></tr></thead><tbody>${body || '<tr><td colspan="6" class="center">Belum ada data</td></tr>'}</tbody></table>`;
  }

  function laporanHtml(judul, baris) {
    const rows = gabung(baris, 'kecamatan', laporan.jenjang);
    const tr = rows.map((r) => `<tr><td>${r.nama}</td>${KOLOM.map((k) => `<td class="center">${r[k]}</td>`).join('')}<td class="center"><b>${r.total}</b></td></tr>`).join('');
    return `<h3>${judul}</h3><table><thead><tr><th>Kecamatan</th>${KOLOM.map((k) => `<th class="center">${labelKolom(k)}</th>`).join('')}<th class="center">Total</th></tr></thead><tbody>${tr || '<tr><td colspan="7" class="center">Belum ada data</td></tr>'}</tbody></table>`;
  }

  function exportCsv() {
    const rows = [
      ...rekap.perKecamatan.map((r) => ({ kel: 'Kecamatan', nama: r.nama, ...r })),
      ...rekap.perPuskesmas.map((r) => ({ kel: 'Puskesmas', nama: r.nama, ...r })),
    ];
    api.downloadCsvRows('rekap-strata-uksm.csv', [
      { label: 'Kelompok', get: (r) => r.kel },
      { label: 'Nama', get: (r) => r.nama },
      { label: 'Paripurna', get: (r) => r.PARIPURNA || 0 },
      { label: 'Utama', get: (r) => r.UTAMA || 0 },
      { label: 'Madya', get: (r) => r.MADYA || 0 },
      { label: 'Dasar', get: (r) => r.DASAR || 0 },
      { label: 'Total', get: (r) => r.total || 0 },
    ], rows);
  }

  function cetakSummary() {
    const komp = `<table><thead><tr><th>Komponen</th><th class="center">Rata-rata Pemenuhan</th></tr></thead><tbody>${rekap.perKomponen.map((k) => `<tr><td>${k.kode}. ${k.nama}</td><td class="center">${k.rataPersen}%</td></tr>`).join('')}</tbody></table>`;
    cetakAtau(toast, 'Summary Report Stratifikasi UKS/M', `
      <div class="doc-title">Summary Report Database Stratifikasi UKS/M</div>
      <div class="doc-no">Kabupaten Bekasi</div>
      <table class="meta">
        <tr><td>Total Satuan Pendidikan</td><td>: ${dash.totalSatuan}</td></tr>
        <tr><td>Melaksanakan Penilaian Mandiri</td><td>: ${dash.penilaianSubmitted}</td></tr>
        <tr><td>Peserta Rekomendasi/Seleksi</td><td>: ${dash.rekomendasi}</td></tr>
        <tr><td>Peraih Penghargaan</td><td>: ${dash.peraih}</td></tr>
        <tr><td>Jumlah Kecamatan</td><td>: ${dash.totalKecamatan}</td></tr>
      </table>
      ${laporan ? laporanHtml('Tabel 1. Data Awal Penilaian Mandiri', laporan.mandiri) + laporanHtml('Tabel 2. Hasil Verifikasi Kecamatan', laporan.verifikasi) + laporanHtml('Tabel 3. Hasil Pleno Tim Kabupaten (satdik yang dikunjungi)', laporan.pleno) : ''}
      <h3>Sebaran Strata per Kecamatan</h3>${strataTableHtml(rekap.perKecamatan, 'Kecamatan')}
      <h3>Sebaran Strata per Puskesmas Binaan</h3>${strataTableHtml(rekap.perPuskesmas, 'Puskesmas')}
      <h3>Rata-rata Pemenuhan per Komponen</h3>${komp}
      ${ttd()}`);
  }

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Rekap & Laporan</h2>
          <p>Summary report database stratifikasi UKS/M — real time, dapat dicetak.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn secondary" onClick={exportCsv}>⬇️ Export CSV</button>
          <button className="btn" onClick={cetakSummary}>🖨️ Cetak Summary</button>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 18 }}>
        <StatCard icon="🏫" value={dash.totalSatuan} label="Satuan Pendidikan" color="#1a7a3c" />
        <StatCard icon="📝" value={dash.penilaianSubmitted} label="Penilaian Mandiri" color="#1e5aa8" />
        <StatCard icon="🏅" value={rekap.totalTerverifikasi} label="Terverifikasi" color="#0d9488" />
        <StatCard icon="🏆" value={dash.peraih} label="Peraih Penghargaan" color="#b8860b" />
      </div>

      {laporan && (
        <>
          <TabelLaporan nomor="1" judul="Data Awal Penilaian Mandiri" jenjang={laporan.jenjang} baris={laporan.mandiri}
            ket="Strata dari penilaian mandiri yang dikirim satuan pendidikan, sebelum diverifikasi kecamatan." />
          <TabelLaporan nomor="2" judul="Hasil Verifikasi Kecamatan" jenjang={laporan.jenjang} baris={laporan.verifikasi}
            ket="Strata setelah diverifikasi oleh TP UKS/M Kecamatan." />
          <TabelLaporan nomor="3" judul="Hasil Pleno Tim Kabupaten" jenjang={laporan.jenjang} baris={laporan.pleno}
            ket="Strata akhir hasil pleno — hanya satuan pendidikan yang masuk daftar Kunjungan Lapangan Tim Kabupaten." />
        </>
      )}

      <div className="chartcard" style={{ marginBottom: 18 }}>
        <h3>Rata-rata Pemenuhan per Komponen UKS/M</h3>
        <div className="chart-sub">Persentase rata-rata dari seluruh penilaian terverifikasi</div>
        <BarList data={komponenData} color="#1a7a3c" />
      </div>

      {cakupan && (
        <div className="chartcard" style={{ marginBottom: 18 }}>
          <h3>Cakupan Pendaftaran SIMITRA per Kecamatan</h3>
          <div className="chart-sub">
            Perbandingan sekolah yang sudah memiliki akun SIMITRA terhadap jumlah sekolah
            sebenarnya menurut Dapodik{cakupan.total.dapodikPer ? ` (data ${fmtDate(cakupan.total.dapodikPer)})` : ''}.
          </div>
          <div className="cakupan-ringkas">
            <div><span className="ck-n">{cakupan.total.terdaftar.toLocaleString('id-ID')}</span><span className="ck-l">Terdaftar di SIMITRA</span></div>
            <div><span className="ck-n">{cakupan.total.sekolahDapodik.toLocaleString('id-ID')}</span><span className="ck-l">Sekolah menurut Dapodik</span></div>
            <div><span className="ck-n">{cakupan.total.belum.toLocaleString('id-ID')}</span><span className="ck-l">Belum terdaftar</span></div>
            <div><span className="ck-n">{cakupan.total.persen ?? '-'}%</span><span className="ck-l">Cakupan</span></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Kecamatan</th><th className="num">Sekolah (Dapodik)</th><th className="num">Terdaftar</th><th className="num">Belum</th><th style={{ width: 150 }}>Cakupan</th></tr></thead>
              <tbody>
                {cakupan.baris.map((b) => (
                  <tr key={b.id}>
                    <td>{b.nama}</td>
                    <td className="num">{b.sekolahDapodik ? b.sekolahDapodik.toLocaleString('id-ID') : <span className="muted">-</span>}</td>
                    <td className="num">{b.terdaftar}</td>
                    <td className="num">{b.sekolahDapodik ? b.belum.toLocaleString('id-ID') : <span className="muted">-</span>}</td>
                    <td>
                      {b.persen == null ? <span className="muted">-</span> : (
                        <div className="ck-bar" title={`${b.persen}%`}>
                          <i style={{ width: `${Math.min(100, b.persen)}%` }} />
                          <span>{b.persen}%</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="chartcard" style={{ marginBottom: 18 }}>
        <h3>Sebaran Strata per Kecamatan</h3>
        <StrataTable rows={rekap.perKecamatan} labelHead="Kecamatan" />
      </div>

      <div className="chartcard">
        <h3>Sebaran Strata per Puskesmas Binaan</h3>
        <StrataTable rows={rekap.perPuskesmas} labelHead="Puskesmas" />
      </div>
    </>
  );
}
