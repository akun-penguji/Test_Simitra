import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useUI } from '../../ui.jsx';
import {
  Spinner, TahapBadge, StrataBadge, konfirmasiFakta, TombolUnduhPdf, Paginasi,
  LegendaSkor, PilihSkor, KertasKerjaMenu,
} from '../../lib.jsx';

const SARINGAN = [
  { id: '', label: 'Semua peserta' },
  { id: 'belum', label: 'Belum diskoring', kunci: 'belumSkoring' },
  { id: 'sudah', label: 'Sudah diskoring', kunci: 'sudahSkoring' },
];

export default function Seleksi() {
  const { toast, confirm } = useUI();
  const setMsg = (o) => { if (o) toast(o.m, o.t); };
  const [res, setRes] = useState(null);
  const [sel, setSel] = useState(null);
  const [skor, setSkor] = useState({}); // itemId -> skor 0..3
  const [busy, setBusy] = useState(false);
  const [klasifikasi, setKlasifikasi] = useState(null);
  const [hal, setHal] = useState({ page: 1, pageSize: 25 });
  const [saring, setSaring] = useState('');
  const [cari, setCari] = useState('');
  const [kataCari, setKataCari] = useState('');

  async function load() {
    const q = new URLSearchParams({ page: hal.page, pageSize: hal.pageSize });
    if (saring) q.set('skoring', saring);
    if (kataCari) q.set('q', kataCari);
    setRes(await api.get(`/kabupaten/seleksi?${q}`));
  }
  useEffect(() => { load(); }, [hal.page, hal.pageSize, saring, kataCari]);
  useEffect(() => { api.get('/kabupaten/klasifikasi-saya').then(setKlasifikasi).catch(() => {}); }, []);

  // Penilai kabupaten hanya berwenang menilai komponen dalam klasifikasinya
  const bolehKomponen = (komponenId) =>
    !klasifikasi || klasifikasi.seluruhKomponen || klasifikasi.komponen.some((k) => k.id === komponenId);

  async function open(satuanId) {
    setMsg(null);
    try {
      const ev = await api.get(`/kabupaten/eviden/${satuanId}`);
      setSel(ev);
      const s = {};
      for (const it of ev.items) s[it.id] = it.skor ?? 3;
      setSkor(s);
    } catch (e) { toast(e.message, 'error'); }
  }

  // lolos === true → "Simpan & Rekomendasikan"; tanpa argumen → hanya simpan skor
  // (tidak mengubah status rekomendasi yang sudah ada).
  async function simpan(lolos) {
    const ok = await konfirmasiFakta(confirm, {
      title: lolos ? 'Simpan & Rekomendasikan ke Kunjungan Lapangan' : 'Simpan Skor Seleksi Administrasi',
      message: lolos
        ? `Skor ${sel.satuan.nama} disimpan dan sekolah direkomendasikan lanjut ke tahap peninjauan lapangan.`
        : `Skor seleksi administrasi ${sel.satuan.nama} akan disimpan.`,
      confirmText: lolos ? 'Ya, Simpan & Rekomendasikan' : 'Ya, Simpan Skor',
    });
    if (!ok) return;
    setBusy(true);
    try {
      // hanya indikator dalam klasifikasi penilai yang dikirim
      const idBoleh = new Set((sel.items || []).filter((it) => bolehKomponen(it.indikator.komponenId)).map((it) => it.id));
      const skorItems = Object.entries(skor).filter(([itemId]) => idBoleh.has(itemId)).map(([itemId, v]) => ({ itemId, skor: Number(v) }));
      const r = await api.post(`/kabupaten/seleksi/${sel.satuanId}`, { skorItems, pernyataanFakta: true, ...(lolos ? { lolos: true } : {}) });
      setMsg({ t: 'success', m: `Skor seleksi ${r.skorSeleksi} tersimpan.${lolos ? ' Direkomendasikan ke kunjungan lapangan.' : ''}` });
      setSel(null);
      await load();
    } catch (e) { setMsg({ t: 'error', m: e.message }); }
    finally { setBusy(false); }
  }

  // Tombol "Rekomendasi" di tabel: sekolah mana yang dilanjutkan (atau dibatalkan) ke
  // Kunjungan Lapangan tanpa membuka jendela scoring.
  async function rekomendasi(satuan, lolos) {
    const ok = await konfirmasiFakta(confirm, {
      title: lolos ? 'Rekomendasikan ke Kunjungan Lapangan' : 'Batalkan Rekomendasi',
      message: lolos
        ? `${satuan.nama} (skor seleksi ${satuan.eviden.skorSeleksi}) akan direkomendasikan lanjut ke tahap peninjauan lapangan.`
        : `Rekomendasi ${satuan.nama} akan dibatalkan dan sekolah kembali ke Seleksi Administrasi. Hanya dapat dibatalkan selama kunjungan lapangan belum berjalan.`,
      confirmText: lolos ? 'Ya, Rekomendasikan' : 'Ya, Batalkan',
      variant: lolos ? 'warning' : 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/kabupaten/seleksi/${satuan.id}/rekomendasi`, { lolos, pernyataanFakta: true });
      toast(lolos ? `${satuan.nama} direkomendasikan ke Kunjungan Lapangan.` : `Rekomendasi ${satuan.nama} dibatalkan.`, 'success');
      await load();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  if (!res) return <Spinner />;
  const peserta = res.data;
  const ringkas = res.ringkas || {};

  return (
    <>
      <div className="page-head">
        <h2>Seleksi Penghargaan — Seleksi Administrasi</h2>
        <p>Langkah 11 — Scoring eviden peserta seleksi, lalu rekomendasikan sekolah yang lanjut ke peninjauan lapangan.</p>
      </div>

      <div className="card">
        {/* Pemisahan data belum & sudah diskoring untuk memudahkan penetapan
            peserta yang lolos ke kunjungan lapangan. */}
        <div className="tab-saring">
          {SARINGAN.map((t) => (
            <button key={t.id} type="button" className={saring === t.id ? 'aktif' : ''}
              onClick={() => { setSaring(t.id); setHal({ ...hal, page: 1 }); }}>
              {t.label}
              {t.kunci && ringkas[t.kunci] != null && <span className="jml">({ringkas[t.kunci]})</span>}
            </button>
          ))}
        </div>
        <form className="row-between mb" style={{ gap: 8 }}
          onSubmit={(e) => { e.preventDefault(); setKataCari(cari.trim()); setHal({ ...hal, page: 1 }); }}>
          <input placeholder="Cari nama satuan pendidikan atau NPSN…" value={cari}
            onChange={(e) => setCari(e.target.value)} style={{ maxWidth: 360 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn sm secondary" type="submit">Cari</button>
            {kataCari && <button className="btn sm secondary" type="button" onClick={() => { setCari(''); setKataCari(''); }}>Reset</button>}
          </div>
        </form>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Satuan Pendidikan</th><th>Kecamatan</th><th>Strata</th><th>Tahap</th><th>Skor Seleksi</th><th>Rekomendasi</th><th></th></tr></thead>
            <tbody>
              {peserta.map((s) => {
                const ev = s.eviden;
                return (
                  <tr key={s.id}>
                    <td><b>{s.nama}</b><div className="muted" style={{ fontSize: 11 }}>{s.pendaftaranSeleksi?.nomorDaftar || s.npsn || '-'}</div></td>
                    <td>{s.kecamatan?.nama}</td>
                    <td>{s.penilaian?.[0]?.strataVerifikasi ? <StrataBadge strata={s.penilaian[0].strataVerifikasi} /> : '-'}</td>
                    <td><TahapBadge tahap={s.tahap} /></td>
                    <td>{ev?.skorSeleksi != null ? ev.skorSeleksi : <span className="badge gray">Belum</span>}</td>
                    <td>{ev?.lolosSeleksi ? <span className="badge green">Direkomendasikan</span> : ev?.lolosSeleksi === false ? <span className="badge red">Tidak direkomendasikan</span> : '-'}</td>
                    <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn sm" onClick={() => open(s.id)}>{ev?.skorSeleksi != null ? 'Ubah Skor' : 'Scoring'}</button>
                      {ev?.lolosSeleksi
                        ? <button className="btn sm secondary" disabled={busy} onClick={() => rekomendasi(s, false)}>Batalkan Rekomendasi</button>
                        : <button className="btn sm blue" disabled={busy || ev?.skorSeleksi == null} title={ev?.skorSeleksi == null ? 'Beri skor seleksi administrasi terlebih dahulu' : ''} onClick={() => rekomendasi(s, true)}>Rekomendasi</button>}
                    </td>
                  </tr>
                );
              })}
              {!peserta.length && (
                <tr><td colSpan={7} className="center muted">
                  {kataCari || saring ? 'Tidak ada peserta yang sesuai saringan.' : 'Belum ada peserta — sekolah masuk otomatis begitu seluruh eviden disetujui.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Paginasi res={res} label="peserta" onPage={(p) => setHal({ ...hal, page: p })} onPageSize={(n) => setHal({ page: 1, pageSize: n })} />
      </div>

      {sel && (
        <div className="modal-bg" onClick={(e) => { if (e.target.className === 'modal-bg') setSel(null); }}>
          <div className="modal" style={{ maxWidth: 820 }}>
            <div className="row-between mb">
              <h3 style={{ margin: 0 }}>Scoring Eviden — {sel.satuan.nama}</h3>
              <button className="btn sm secondary" onClick={() => setSel(null)}>Tutup</button>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>Beri nilai tiap indikator berdasarkan ketersediaan &amp; kesesuaian eviden.</p>
            <LegendaSkor />
            {klasifikasi && !klasifikasi.seluruhKomponen && (
              <div className="klasifikasi-bar">
                <span className="kb-label">Klasifikasi penilaian Anda:</span>
                {klasifikasi.komponen.length
                  ? klasifikasi.komponen.map((k) => <span key={k.id} className="badge blue">{k.kode} · {k.nama}</span>)
                  : <span className="badge red">Belum ditetapkan — hubungi koordinator Tim Stratifikasi</span>}
                <span className="muted">Hanya indikator pada komponen tersebut yang dapat Anda nilai.</span>
              </div>
            )}
            <div className="table-wrap">
              <table>
                <thead><tr><th>Kode</th><th>Indikator</th><th>Nilai Eviden</th></tr></thead>
                <tbody>
                  {sel.items.map((it) => {
                    const boleh = bolehKomponen(it.indikator.komponenId);
                    return (
                      <tr key={it.id} className={boleh ? '' : 'row-luar'}>
                        <td>{it.indikator.kode}</td>
                        <td style={{ maxWidth: 340 }}>{it.indikator.pertanyaan}</td>
                        <td>
                          <PilihSkor nilai={skor[it.id]} disabled={!boleh}
                            title={boleh ? '' : 'Di luar klasifikasi penilaian Anda'}
                            onChange={(v) => setSkor({ ...skor, [it.id]: v })} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn secondary" onClick={() => simpan()} disabled={busy}>Simpan Skor</button>
              <button className="btn" onClick={() => simpan(true)} disabled={busy}>Simpan & Rekomendasikan</button>
              <TombolUnduhPdf path={`/cetak/seleksi/${sel.satuanId}.pdf`} nama={`Rekap-Penilaian-Seleksi-${sel.satuan.nama}.pdf`} label="Unduh PDF Hasil Scoring" onError={(e) => toast(e.message, 'error')} />
              <KertasKerjaMenu satuanId={sel.satuanId} namaSatuan={sel.satuan.nama} onError={(e) => toast(e.message, 'error')} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
