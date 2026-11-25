import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useUI } from '../../ui.jsx';
import { Spinner, StrataBadge, Alert, fmtDate, TombolUnduhPdf, Paginasi } from '../../lib.jsx';

// Laporan strata akhir satdik yang dikunjungi. Strata akhir TIDAK ditetapkan manual:
// dihitung sistem dari Hasil Pleno (rapat akhir Okt 2026) — halaman ini hanya membaca.
const SARINGAN = [
  { id: 'belum-dihitung', label: 'Belum dihitung' },
  { id: 'dihitung', label: 'Sudah dihitung' },
  { id: '', label: 'Semua yang dikunjungi' },
];
const URUT = [null, 'DASAR', 'MADYA', 'UTAMA', 'PARIPURNA'];
const arah = (awal, akhir) => {
  const d = URUT.indexOf(akhir ?? null) - URUT.indexOf(awal ?? null);
  return d > 0 ? <span className="badge green">Naik</span> : d < 0 ? <span className="badge red">Turun</span> : <span className="badge gray">Tetap</span>;
};

export default function StrataAkhir() {
  const { toast } = useUI();
  const [list, setList] = useState(null);
  const [hal, setHal] = useState({ page: 1, pageSize: 25 });
  const [saring, setSaring] = useState('dihitung');

  async function load() {
    const q = new URLSearchParams({ page: hal.page, pageSize: hal.pageSize });
    if (saring) q.set('status', saring);
    setList(await api.get(`/kabupaten/kunjungan?${q}`));
  }
  useEffect(() => { load(); }, [hal.page, hal.pageSize, saring]);

  if (!list) return <Spinner />;

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Finalisasi Strata Akhir</h2>
          <p>Laporan strata akhir satdik yang telah dikunjungi — dihitung sistem dari Hasil Pleno.</p>
        </div>
        <TombolUnduhPdf path="/cetak/strata-akhir.pdf" nama="Laporan-Strata-Akhir.pdf" label="Unduh PDF Laporan" onError={(e) => toast(e.message, 'error')} />
      </div>

      <Alert type="info">
        Strata akhir <b>tidak ditetapkan manual</b>. Sistem menghitungnya saat <b>Hitung Hasil Pleno</b>: indikator dengan nilai pleno ≥ 2 (Ada, Cukup Sesuai)
        dianggap terpenuhi, lalu strata ditentukan berjenjang seperti penilaian mandiri — satu indikator yang belum terpenuhi menahan kenaikan strata.
        Untuk mengubah hasilnya, koreksi nilai lewat <b>Review Ulang</b> di menu Hasil Pleno.
      </Alert>

      <div className="card">
        <div className="tab-saring">
          {SARINGAN.map((t) => (
            <button key={t.id} type="button" className={saring === t.id ? 'aktif' : ''}
              onClick={() => { setSaring(t.id); setHal({ ...hal, page: 1 }); }}>{t.label}</button>
          ))}
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Satuan Pendidikan</th><th>Kecamatan</th><th>Strata Awal</th><th>Strata Akhir</th>
              <th>Perubahan</th><th>Skor Pleno</th><th>Dasar Perhitungan</th>
            </tr></thead>
            <tbody>
              {list.data.map((k) => {
                const dihitung = !!k.ditetapkanPada;
                return (
                  <tr key={k.id}>
                    <td><b>{k.satuan.nama}</b><div className="muted" style={{ fontSize: 11 }}>{k.satuan.jenjang} · {k.satuan.npsn || '-'}</div></td>
                    <td>{k.satuan.kecamatan?.nama}</td>
                    <td>{k.strataAwal ? <StrataBadge strata={k.strataAwal} /> : '-'}</td>
                    <td>
                      {!dihitung
                        ? <span className="badge gray">Belum dihitung</span>
                        : k.strataAkhir ? <StrataBadge strata={k.strataAkhir} /> : <span className="badge red">Belum Mencapai Dasar</span>}
                    </td>
                    <td>{dihitung ? arah(k.strataAwal, k.strataAkhir) : '-'}</td>
                    <td>{k.satuan.hasilFinal ? `${k.satuan.hasilFinal.skorFinal}%` : '-'}</td>
                    <td style={{ maxWidth: 300, fontSize: 12 }}>
                      {dihitung ? k.catatanAkhir : (k.terkunci ? 'Menunggu Hitung Hasil Pleno' : 'Hasil lapangan belum disubmit')}
                      {dihitung && <div className="muted" style={{ fontSize: 11 }}>{fmtDate(k.ditetapkanPada)}</div>}
                    </td>
                  </tr>
                );
              })}
              {!list.data.length && (
                <tr><td colSpan={7} className="center muted">
                  {saring === 'belum-dihitung' ? 'Semua satdik yang disubmit sudah dihitung.' : 'Belum ada data.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Paginasi res={list} label="satdik" onPage={(p) => setHal({ ...hal, page: p })} onPageSize={(n) => setHal({ page: 1, pageSize: n })} />
      </div>
    </>
  );
}
