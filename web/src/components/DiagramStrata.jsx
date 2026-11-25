// Diagram hasil strata — dasbor TP Kecamatan & Tim Kabupaten (notulen Sep 2026).
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { STRATA_LABEL } from '../lib.jsx';
import { StackedBars, PairBars, BarList, Legenda } from '../charts.jsx';

const KUNCI = ['PARIPURNA', 'UTAMA', 'MADYA', 'DASAR', 'BELUM'];
const WARNA = { PARIPURNA: '#1a7a3c', UTAMA: '#1e5aa8', MADYA: '#b8860b', DASAR: '#c0392b', BELUM: '#94a3b8' };
const LABEL = { ...STRATA_LABEL, BELUM: 'Belum mencapai Dasar' };
const legendaStrata = KUNCI.map((k) => ({ label: LABEL[k], color: WARNA[k] }));

export default function DiagramStrata({ path }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [tabel, setTabel] = useState(false);
  useEffect(() => { setD(null); api.get(path).then(setD).catch((e) => setErr(e.message)); }, [path]);
  if (err) return <div className="chart-kosong">Diagram tidak dapat dimuat: {err}</div>;
  if (!d) return <div className="spinner">Memuat diagram...</div>;

  const namaKelompok = d.kelompok === 'puskesmas' ? 'Puskesmas Binaan' : 'Kecamatan';
  const berisi = d.perKelompok.filter((r) => r.total > 0).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  const nol = d.perKelompok.filter((r) => r.total === 0);
  const adaData = d.ringkas.terverifikasi > 0;
  const kosong = (teks) => <div className="chart-kosong">{teks}</div>;

  return (
    <section className="diagram-strata">
      <div className="row-between diagram-head">
        <div>
          <h3>Diagram Hasil Strata</h3>
          <div className="chart-sub">
            {d.periode ? `${d.periode.nama} · ` : ''}
            <b>{d.ringkas.terverifikasi}</b> dari {d.ringkas.satuan} satuan pendidikan sudah terverifikasi
            {d.ringkas.masuk > d.ringkas.terverifikasi ? ` · ${d.ringkas.masuk - d.ringkas.terverifikasi} menunggu verifikasi` : ''}
          </div>
        </div>
        <Legenda items={legendaStrata} />
      </div>

      <div className="grid cols-2">
        <div className="chartcard">
          <div className="row-between">
            <h3>Strata per {namaKelompok}</h3>
            <button className="btn sm secondary" onClick={() => setTabel((v) => !v)}>{tabel ? 'Lihat diagram' : 'Lihat tabel'}</button>
          </div>
          <div className="chart-sub">Jumlah satuan pendidikan terverifikasi menurut strata</div>
          {tabel ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>{namaKelompok}</th>{KUNCI.map((k) => <th key={k} className="num">{LABEL[k]}</th>)}<th className="num">Jumlah</th></tr></thead>
                <tbody>
                  {[...berisi, ...nol].map((r) => (
                    <tr key={r.id}><td>{r.label}</td>{KUNCI.map((k) => <td key={k} className="num">{r[k]}</td>)}<td className="num"><b>{r.total}</b></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : berisi.length ? (
            <StackedBars rows={berisi} keys={KUNCI} colors={WARNA} labels={LABEL} />
          ) : kosong(`Belum ada satuan pendidikan terverifikasi di ${namaKelompok.toLowerCase()} mana pun.`)}
          {!tabel && berisi.length > 0 && nol.length > 0 && (
            <div className="chart-catatan">{nol.length} {namaKelompok.toLowerCase()} belum memiliki data terverifikasi: {nol.map((r) => r.label).join(', ')}.</div>
          )}
        </div>

        <div className="chartcard">
          <h3>Strata per Jenjang</h3>
          <div className="chart-sub">Komposisi strata terverifikasi menurut kelompok jenjang</div>
          <StackedBars rows={d.perJenjang} keys={KUNCI} colors={WARNA} labels={LABEL} lebarLabel={110} />
          {!adaData && kosong('Grafik terisi setelah penilaian mandiri sekolah diverifikasi kecamatan.')}
        </div>

        <div className="chartcard">
          <h3>Penilaian Mandiri vs Hasil Verifikasi</h3>
          <div className="chart-sub">Selisih strata yang diakui sekolah dengan hasil verifikasi kecamatan</div>
          <Legenda items={[{ label: 'Penilaian mandiri', color: '#cbd5e1' }, { label: 'Hasil verifikasi (warna strata)', color: '#64748b' }]} />
          <PairBars
            rows={d.banding.map((b) => ({ label: LABEL[b.strata], a: b.mandiri, b: b.verifikasi, color: WARNA[b.strata] }))}
            labelA="Penilaian mandiri" labelB="Hasil verifikasi" lebarLabel={150} />
          {d.ringkas.masuk === 0 && kosong('Belum ada penilaian mandiri yang dikirim sekolah.')}
        </div>

        <div className="chartcard">
          <h3>Capaian Indikator per Komponen</h3>
          <div className="chart-sub">Persentase indikator terpenuhi pada penilaian yang sudah diverifikasi</div>
          <BarList
            data={d.komponen.map((k) => ({ label: `${k.kode} · ${k.nama}`, value: k.persen ?? 0, raw: k }))}
            maks={100} color="#1a7a3c"
            format={(x) => (x.raw.persen == null ? '–' : `${x.raw.persen.toLocaleString('id-ID')}%`)} />
          {!adaData && kosong('Belum ada indikator terverifikasi.')}
        </div>
      </div>
    </section>
  );
}
