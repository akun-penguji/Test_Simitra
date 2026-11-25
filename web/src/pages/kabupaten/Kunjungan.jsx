import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useUI } from '../../ui.jsx';
import {
  Spinner, Alert, StrataBadge, fmtDate, konfirmasiFakta, TombolUnduhPdf, Paginasi,
  LegendaSkor, PilihSkor, KertasKerjaMenu, TEKS_PERNYATAAN,
} from '../../lib.jsx';

const SARINGAN = [
  { id: '', label: 'Semua' },
  { id: 'belum', label: 'Belum disubmit' },
  { id: 'terkunci', label: 'Sudah disubmit' },
];
const StrataAkhirBadge = ({ k }) => (
  !k.ditetapkanPada ? <span className="badge gray">Belum dihitung</span>
    : k.strataAkhir ? <StrataBadge strata={k.strataAkhir} /> : <span className="badge red">Belum Mencapai Dasar</span>
);

export default function Kunjungan() {
  const [list, setList] = useState(null);
  const [hal, setHal] = useState({ page: 1, pageSize: 25 });
  const [saring, setSaring] = useState('');
  const [sel, setSel] = useState(null);       // baris kunjungan
  const [eviden, setEviden] = useState(null); // detail eviden untuk validasi faktual
  const [form, setForm] = useState({ tanggal: '', petugas: '', temuan: '', selesai: false });
  const [skorLap, setSkorLap] = useState({}); // itemId -> skor
  const [catatanLap, setCatatanLap] = useState({}); // itemId -> catatan temuan per indikator
  const { toast, confirm } = useUI();
  const setMsg = (o) => { if (o) toast(o.m, o.t); };
  const [busy, setBusy] = useState(false);
  const [klasifikasi, setKlasifikasi] = useState(null); // komponen yang boleh dinilai
  const [posisi, setPosisi] = useState(null);           // titik lokasi saat submit lapangan
  const [revisi, setRevisi] = useState(null); // null = hanya lihat; { alasan, setuju } = mode Revisi Nilai

  async function load() {
    const q = new URLSearchParams({ page: hal.page, pageSize: hal.pageSize });
    if (saring) q.set('status', saring);
    setList(await api.get(`/kabupaten/kunjungan?${q}`));
  }
  useEffect(() => { load(); }, [hal.page, hal.pageSize, saring]);
  useEffect(() => { api.get('/kabupaten/klasifikasi-saya').then(setKlasifikasi).catch(() => {}); }, []);

  // Indikator di luar klasifikasi penilai tidak dapat diisi
  const bolehKomponen = (komponenId) =>
    !klasifikasi || klasifikasi.seluruhKomponen || klasifikasi.komponen.some((k) => k.id === komponenId);

  async function open(row) {
    setMsg(null);
    setSel(row);
    setForm({
      tanggal: row.tanggal ? row.tanggal.slice(0, 10) : '',
      petugas: row.petugas || '',
      temuan: row.temuan || '',
      selesai: row.selesai,
    });
    setRevisi(null);
    let ev;
    try { ev = await api.get(`/kabupaten/eviden/${row.satuanId}`); } catch (e) { toast(e.message, 'error'); setSel(null); return; }
    setEviden(ev);
    const s = {}; const c = {};
    for (const it of ev.items) { s[it.id] = it.skorLapangan ?? it.skor ?? 3; c[it.id] = it.catatanLapangan || ''; }
    setSkorLap(s); setCatatanLap(c);
  }
  function tutup() { setSel(null); setEviden(null); setPosisi(null); setRevisi(null); }

  // Kumpulkan skor & catatan hanya untuk indikator dalam klasifikasi penilai
  function skorTerkirim() {
    const idBoleh = new Set((eviden?.items || []).filter((it) => bolehKomponen(it.indikator.komponenId)).map((it) => it.id));
    return Object.entries(skorLap)
      .filter(([itemId]) => idBoleh.has(itemId))
      .map(([itemId, v]) => ({ itemId, skor: Number(v), catatan: (catatanLap[itemId] || '').trim() || null }));
  }

  async function simpan() {
    setBusy(true); setMsg(null);
    try {
      await api.post(`/kabupaten/kunjungan/${sel.satuanId}`, { ...form, skorLapangan: skorTerkirim() });
      setMsg({ t: 'success', m: 'Draf hasil kunjungan lapangan tersimpan.' });
      tutup();
      await load();
    } catch (e) { setMsg({ t: 'error', m: e.message }); }
    finally { setBusy(false); }
  }

  // Ambil titik lokasi perangkat sebagai bukti kehadiran di lapangan (opsional)
  function ambilLokasi() {
    if (!navigator.geolocation) { toast('Perangkat tidak mendukung penentuan lokasi.', 'error'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setPosisi({ lat: p.coords.latitude, lon: p.coords.longitude }); toast('Titik lokasi terekam.', 'success'); },
      () => toast('Tidak dapat mengambil lokasi. Izinkan akses lokasi pada peramban.', 'error'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  // SUBMIT hasil verifikasi langsung dari lapangan — wajib pernyataan sesuai fakta,
  // setelah disubmit hasil terkunci.
  async function submitLapangan() {
    const ok = await konfirmasiFakta(confirm, {
      title: 'Submit Hasil Verifikasi Lapangan',
      message: `Hasil peninjauan lapangan ${sel.satuan.nama} akan dikunci dan tidak dapat diubah setelah disubmit.`,
      confirmText: 'Ya, Submit Hasil',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/kabupaten/kunjungan/${sel.satuanId}/submit`, {
        temuan: form.temuan,
        pernyataanFakta: true,
        latitude: posisi?.lat, longitude: posisi?.lon,
        skorLapangan: skorTerkirim(),
      });
      toast('Hasil verifikasi lapangan berhasil disubmit dan dikunci.', 'success');
      tutup();
      await load();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  // Revisi nilai lapangan SETELAH disubmit: hasil tetap terkunci; perubahan hanya lewat
  // jalur ini dengan alasan dan pernyataan, dan tercatat nilai lama → baru.
  async function simpanRevisi() {
    if (!revisi.alasan.trim()) { toast('Alasan revisi wajib diisi.', 'error'); return; }
    if (!revisi.setuju) { toast('Centang pernyataan terlebih dahulu.', 'error'); return; }
    setBusy(true);
    try {
      const r = await api.post(`/kabupaten/kunjungan/${sel.satuanId}/revisi`, {
        alasan: revisi.alasan.trim(), pernyataanFakta: true, skorLapangan: skorTerkirim(),
      });
      toast(`Revisi tersimpan — ${r.diubah} nilai diubah${r.diabaikan ? `, ${r.diabaikan} di luar klasifikasi diabaikan` : ''}.`
        + (r.plenoDisegarkan ? ' Hasil Pleno ikut disegarkan.' : ''), 'success');
      tutup(); await load();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  if (!list) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <h2>Peninjauan Lapangan</h2>
        <p>Langkah 12 — Validasi faktual eviden di lokasi dan catat temuan per indikator. Strata akhir dihitung sistem pada Hasil Pleno.</p>
      </div>

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
              <th>Satuan Pendidikan</th><th>Kecamatan</th><th>Tanggal</th><th>Petugas</th>
              <th>Strata Awal</th><th>Strata Akhir</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {list.data.map((k) => (
                <tr key={k.id}>
                  <td><b>{k.satuan.nama}</b></td>
                  <td>{k.satuan.kecamatan?.nama}</td>
                  <td>{fmtDate(k.tanggal)}</td>
                  <td>{k.petugas || '-'}</td>
                  <td>{k.strataAwal ? <StrataBadge strata={k.strataAwal} /> : '-'}</td>
                  <td><StrataAkhirBadge k={k} /></td>
                  <td>
                    {k.terkunci
                      ? <span className="badge green">Disubmit &amp; Terkunci</span>
                      : k.selesai ? <span className="badge blue">Selesai (draf)</span> : <span className="badge amber">Terjadwal</span>}
                  </td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn sm" onClick={() => open(k)}>{k.terkunci ? 'Lihat / Revisi' : 'Input Hasil'}</button>
                    <KertasKerjaMenu satuanId={k.satuanId} namaSatuan={k.satuan.nama} onError={(e) => toast(e.message, 'error')} />
                    <TombolUnduhPdf path={`/cetak/seleksi/${k.satuanId}.pdf`} nama={`Laporan-Lapangan-${k.satuan.nama}.pdf`} label="Laporan PDF" onError={(e) => toast(e.message, 'error')} />
                  </td>
                </tr>
              ))}
              {!list.data.length && <tr><td colSpan={8} className="center muted">Belum ada satuan yang lolos ke kunjungan lapangan.</td></tr>}
            </tbody>
          </table>
        </div>
        <Paginasi res={list} label="kunjungan" onPage={(p) => setHal({ ...hal, page: p })} onPageSize={(n) => setHal({ page: 1, pageSize: n })} />
      </div>

      {sel && (
        <div className="modal-bg" onClick={(e) => { if (e.target.className === 'modal-bg') tutup(); }}>
          <div className="modal" style={{ maxWidth: 1040 }}>
            <div className="row-between mb">
              <h3 style={{ margin: 0 }}>Kunjungan — {sel.satuan.nama}</h3>
              <button className="btn sm secondary" onClick={tutup}>Tutup</button>
            </div>
            <div className="form-row">
              <div className="field"><label>Tanggal Kunjungan</label><input type="date" value={form.tanggal} disabled={sel.terkunci} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} /></div>
              <div className="field"><label>Petugas</label><input value={form.petugas} disabled={sel.terkunci} onChange={(e) => setForm({ ...form, petugas: e.target.value })} /></div>
            </div>
            <div className="field"><label>Temuan Lapangan (umum)</label><textarea rows={3} value={form.temuan} disabled={sel.terkunci} onChange={(e) => setForm({ ...form, temuan: e.target.value })} /></div>

            {klasifikasi && !klasifikasi.seluruhKomponen && (
              <div className="klasifikasi-bar">
                <span className="kb-label">Klasifikasi penilaian Anda:</span>
                {klasifikasi.komponen.length
                  ? klasifikasi.komponen.map((k) => <span key={k.id} className="badge blue">{k.kode} · {k.nama}</span>)
                  : <span className="badge red">Belum ditetapkan — hubungi koordinator Tim Stratifikasi</span>}
                <span className="muted">Indikator di luar klasifikasi ditampilkan sebagai rujukan dan tidak dapat dinilai.</span>
              </div>
            )}
            {sel.terkunci && (
              <Alert type="success">
                Hasil sudah disubmit oleh <b>{sel.disubmitOleh || '-'}</b> pada {fmtDate(sel.disubmitPada)} dan dinyatakan sesuai fakta lapangan. Data terkunci;
                nilai tetap dapat dikoreksi lewat <b>Revisi Nilai</b> (dengan alasan dan jejak perubahan).
                {sel.jumlahRevisi > 0 && <> Sudah direvisi {sel.jumlahRevisi}× — terakhir oleh <b>{sel.revisiOleh}</b> ({fmtDate(sel.revisiPada)}): {sel.revisiAlasan}.</>}
              </Alert>
            )}
            {sel.terkunci && (
              <p className="muted" style={{ margin: '4px 0 8px', fontSize: 12.5 }}>
                Strata awal: <b>{sel.strataAwal ? <StrataBadge strata={sel.strataAwal} /> : '-'}</b> · Strata akhir (dihitung sistem): <StrataAkhirBadge k={sel} />
              </p>
            )}

            <div className="comp-title">Validasi Faktual &amp; Catatan Temuan per Indikator</div>
            <LegendaSkor />
            {eviden ? (
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th style={{ width: 60 }}>Kode</th><th>Indikator</th>
                    <th style={{ width: 70 }}>Skor Adm.</th>
                    <th style={{ width: 230 }}>Nilai Lapangan</th>
                    <th style={{ minWidth: 260 }}>Catatan Temuan Lapangan</th>
                  </tr></thead>
                  <tbody>
                    {eviden.items.map((it) => {
                      const boleh = bolehKomponen(it.indikator.komponenId);
                      return (
                        <tr key={it.id} className={boleh ? '' : 'row-luar'}>
                          <td>{it.indikator.kode}</td>
                          <td style={{ maxWidth: 300 }}>{it.indikator.pertanyaan}</td>
                          <td className="center">{it.skor ?? '-'}</td>
                          <td>
                            <PilihSkor nilai={skorLap[it.id]} disabled={!boleh || (sel.terkunci && !revisi)}
                              title={boleh ? '' : 'Di luar klasifikasi penilaian Anda'}
                              onChange={(v) => setSkorLap({ ...skorLap, [it.id]: v })} />
                          </td>
                          <td>
                            {/* Catatan temuan dicatat per indikator, bukan hanya satu catatan umum */}
                            <textarea className="catatan-lapangan" rows={2}
                              placeholder="Catatan temuan untuk indikator ini…"
                              value={catatanLap[it.id] || ''} disabled={!boleh || (sel.terkunci && !revisi)}
                              onChange={(e) => setCatatanLap({ ...catatanLap, [it.id]: e.target.value })} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <Spinner />}

            {!sel.terkunci && (
              <>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontWeight: 500 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={form.selesai} onChange={(e) => setForm({ ...form, selesai: e.target.checked })} />
                  Tandai kunjungan selesai (data siap diolah untuk Hasil Pleno)
                </label>
                <div className="row-between mt" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn sm secondary" type="button" onClick={ambilLokasi}>
                    📍 {posisi ? `Lokasi terekam (${posisi.lat.toFixed(5)}, ${posisi.lon.toFixed(5)})` : 'Rekam titik lokasi'}
                  </button>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn secondary" onClick={simpan} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Draf'}</button>
                    <button className="btn" onClick={submitLapangan} disabled={busy}>{busy ? 'Mengirim...' : 'Submit Hasil Verifikasi'}</button>
                  </div>
                </div>
                <p className="muted" style={{ marginTop: 8, marginBottom: 0, fontSize: 12.5 }}>
                  Submit dilakukan langsung dari lokasi. Setelah disubmit, hasil dikunci dan tercatat atas nama Anda beserta waktu dan titik lokasinya.
                </p>
              </>
            )}

            {/* Revisi Nilai setelah disubmit (temuan rapat akhir): hanya komponen dalam klasifikasi penilai */}
            {sel.terkunci && !revisi && (
              <div className="row-between mt">
                <span className="muted" style={{ fontSize: 12.5 }}>Nilai terkunci setelah submit. Gunakan Revisi Nilai bila ada koreksi.</span>
                <button className="btn amber" onClick={() => setRevisi({ alasan: '', setuju: false })}>Revisi Nilai</button>
              </div>
            )}
            {sel.terkunci && revisi && (
              <div className="card" style={{ marginTop: 14, background: 'var(--bg)' }}>
                <div className="comp-title" style={{ marginTop: 0 }}>Revisi Nilai Lapangan</div>
                <div className="field">
                  <label>Alasan Revisi *</label>
                  <textarea rows={2} value={revisi.alasan} onChange={(e) => setRevisi({ ...revisi, alasan: e.target.value })}
                    placeholder="mis. bukti indikator dasar setelah diperiksa ulang kurang memadai" />
                </div>
                <label className="pernyataan-kotak">
                  <input type="checkbox" checked={revisi.setuju} onChange={(e) => setRevisi({ ...revisi, setuju: e.target.checked })} />
                  <span>{TEKS_PERNYATAAN}</span>
                </label>
                <div className="row-between mt">
                  <span className="muted" style={{ fontSize: 12.5 }}>Ubah nilai/catatan pada tabel di atas, lalu simpan. Nilai lama tercatat di log audit.</span>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn secondary" onClick={() => setRevisi(null)} disabled={busy}>Batal</button>
                    <button className="btn" onClick={simpanRevisi} disabled={busy || !revisi.alasan.trim() || !revisi.setuju}>{busy ? 'Menyimpan...' : 'Simpan Revisi'}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
