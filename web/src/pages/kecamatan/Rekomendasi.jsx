import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useUI } from '../../ui.jsx';
import { Spinner, StrataBadge, Paginasi, Alert } from '../../lib.jsx';

export default function Rekomendasi() {
  const { user } = useAuth();
  const koordinator = !!user.isAdmin; // aksi ini khusus koordinator kecamatan (notulen Sep 2026)
  const { toast, confirm } = useUI();
  const setMsg = (o) => { if (o) toast(o.m, o.t); };
  const [list, setList] = useState(null);
  const [rekom, setRekom] = useState([]);
  const [busy, setBusy] = useState(false);
  const [halK, setHalK] = useState({ page: 1, pageSize: 10 });

  async function load() {
    const [l, r] = await Promise.all([
      api.get(`/kecamatan/satuan?layak=1&page=${halK.page}&pageSize=${halK.pageSize}`),
      api.get('/kecamatan/rekomendasi?semua=1'),
    ]);
    setList(l); setRekom(r);
  }
  useEffect(() => { load(); }, [halK.page, halK.pageSize]);
  if (!list) return <Spinner />;

  // Kandidat sudah disaring di server: terverifikasi, strata minimal Madya,
  // dan belum direkomendasikan.
  const eligible = list.data;

  async function tambah(satuanId) {
    setBusy(true); setMsg(null);
    try { await api.post('/kecamatan/rekomendasi', { satuanId }); await load(); setMsg({ t: 'success', m: 'Satuan direkomendasikan. Sekolah dapat mulai mengisi eviden.' }); }
    catch (e) { setMsg({ t: 'error', m: e.message }); }
    finally { setBusy(false); }
  }
  async function hapus(satuanId) {
    const ok = await confirm({
      title: 'Batalkan Rekomendasi',
      message: 'Rekomendasi satuan pendidikan ini akan dibatalkan. Lanjutkan?',
      confirmText: 'Ya, Batalkan',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true); setMsg(null);
    try { await api.del(`/kecamatan/rekomendasi/${satuanId}`); await load(); }
    catch (e) { setMsg({ t: 'error', m: e.message }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="page-head">
        <h2>Rekomendasi Peserta Seleksi Kabupaten</h2>
        <p>Langkah 6 — Pilih maksimal <b>2 satuan pendidikan per tingkat</b> (TK/RA, SD/MI, SMP/MTs, SMA/SMK/MA) sebagai perwakilan kecamatan. Kuota tiap tingkat berdiri sendiri, tidak dicampur antar tingkatan.</p>
      </div>

      <Alert type="info">
        Satuan pendidikan yang tercatat sebagai <b>peraih penghargaan</b> pada database sekolah peraih penghargaan Kabupaten Bekasi
        tidak dapat direkomendasikan; sistem akan menolaknya.
      </Alert>

      <div className="card">
        <div className="row-between mb">
          <h3 style={{ margin: 0 }}>Terpilih <span className="pill-count">{rekom.length}</span></h3>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Satuan Pendidikan</th><th>Strata Verifikasi</th><th>Skor</th><th></th></tr></thead>
            <tbody>
              {rekom.map((r) => (
                <tr key={r.id}>
                  <td>{r.peringkat}</td>
                  <td><b>{r.satuan.nama}</b></td>
                  <td><StrataBadge strata={r.satuan.penilaian[0]?.strataVerifikasi} /></td>
                  <td>{r.satuan.penilaian[0]?.skorVerifikasi}%</td>
                  <td>{koordinator ? <button className="btn sm red" onClick={() => hapus(r.satuanId)} disabled={busy}>Batalkan</button> : <span className="muted" style={{ fontSize: 12 }}>Koordinator</span>}</td>
                </tr>
              ))}
              {!rekom.length && <tr><td colSpan={5} className="center muted">Belum ada satuan direkomendasikan.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Satuan Terverifikasi (dapat direkomendasikan)</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Satuan Pendidikan</th><th>Jenjang</th><th>Strata Verifikasi</th><th>Skor</th><th></th></tr></thead>
            <tbody>
              {eligible.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.nama}</b></td>
                  <td>{s.jenjang}</td>
                  <td><StrataBadge strata={s.penilaian[0]?.strataVerifikasi} /></td>
                  <td>{s.penilaian[0]?.skorVerifikasi}%</td>
                  <td>
                    {s.larangan
                      ? <span className="badge red" title={s.larangan.alasan}>Peraih Peringkat {s.larangan.peringkat} ({s.larangan.tahun}) — tidak dapat direkomendasikan</span>
                      : koordinator
                        ? <button className="btn sm" onClick={() => tambah(s.id)} disabled={busy}>+ Rekomendasikan</button>
                        : <span className="muted" style={{ fontSize: 12 }}>Koordinator</span>}
                  </td>
                </tr>
              ))}
              {!eligible.length && <tr><td colSpan={5} className="center muted">Tidak ada satuan terverifikasi yang tersedia.</td></tr>}
            </tbody>
          </table>
        </div>
        <Paginasi res={list} label="kandidat" onPage={(p) => setHalK({ ...halK, page: p })} onPageSize={(n) => setHalK({ page: 1, pageSize: n })} />
      </div>
    </>
  );
}
