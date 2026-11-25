import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useUI } from '../../ui.jsx';
import { Spinner, TahapBadge, TombolUnduhPdf, Paginasi, TINGKAT_PILIHAN } from '../../lib.jsx';
import FilePreview from '../../components/FilePreview.jsx';

function ReviewBadge({ status }) {
  if (status === 'DISETUJUI') return <span className="badge green">Disetujui</span>;
  if (status === 'REVISI') return <span className="badge red">Revisi</span>;
  return <span className="badge gray">Belum</span>;
}

export default function ReviewEviden() {
  const { toast, confirm } = useUI();
  const [klasifikasi, setKlasifikasi] = useState(null);
  useEffect(() => { api.get('/kabupaten/klasifikasi-saya').then(setKlasifikasi).catch(() => {}); }, []);
  const bolehKomponen = (komponenId) =>
    !klasifikasi || klasifikasi.seluruhKomponen || klasifikasi.komponen.some((k) => k.id === komponenId);
  const setMsg = (o) => { if (o) toast(o.m, o.t); };
  const [rekom, setRekom] = useState(null);
  const [sel, setSel] = useState(null); // eviden detail
  const [busy, setBusy] = useState(false);
  const [catatan, setCatatan] = useState({}); // itemId -> catatan revisi
  const [preview, setPreview] = useState(null); // {path,url,name}

  async function setujuiSemua() {
    const ok = await confirm({ title: 'Setujui Semua Eviden', message: `Setujui SELURUH indikator eviden ${sel.satuan.nama} sekaligus?`, confirmText: 'Ya, Setujui Semua', variant: 'success' });
    if (!ok) return;
    setBusy(true);
    try { await api.post(`/kabupaten/eviden/${sel.satuanId}/setujui-semua`); toast('Semua eviden disetujui.', 'success'); const ev = await api.get(`/kabupaten/eviden/${sel.satuanId}`); setSel(ev); await load(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  const [hal, setHal] = useState({ page: 1, pageSize: 25 });
  const [tingkat, setTingkat] = useState('');
  const [kecamatanId, setKecamatanId] = useState('');
  const [kecamatan, setKecamatan] = useState([]);
  const [cari, setCari] = useState('');
  const [kataCari, setKataCari] = useState('');
  async function load() {
    // adaEviden=1 + saringan tingkat/kecamatan/pencarian dikerjakan di server agar tidak
    // ada baris yang hilang karena penyaringan dilakukan setelah pemenggalan halaman.
    const q = new URLSearchParams({ adaEviden: 1, page: hal.page, pageSize: hal.pageSize });
    if (tingkat) q.set('tingkat', tingkat);
    if (kecamatanId) q.set('kecamatanId', kecamatanId);
    if (kataCari) q.set('q', kataCari);
    setRekom(await api.get(`/kabupaten/rekomendasi?${q}`));
  }
  useEffect(() => { load(); }, [hal.page, hal.pageSize, tingkat, kecamatanId, kataCari]);
  useEffect(() => { api.get('/kabupaten/kecamatan').then(setKecamatan).catch(() => {}); }, []);

  async function open(satuanId) {
    setMsg(null);
    let ev;
    try { ev = await api.get(`/kabupaten/eviden/${satuanId}`); } catch (e) { toast(e.message, 'error'); return; }
    setSel(ev);
    const c = {};
    for (const it of ev.items) c[it.id] = it.catatanReview || '';
    setCatatan(c);
  }

  async function review(itemId, status) {
    if (status === 'REVISI' && !catatan[itemId]) { setMsg({ t: 'error', m: 'Isi keterangan perbaikan untuk status revisi.' }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post(`/kabupaten/eviden/item/${itemId}/review`, { status, catatan: catatan[itemId] });
      const ev = await api.get(`/kabupaten/eviden/${sel.satuanId}`);
      setSel(ev);
      await load();
    } catch (e) { setMsg({ t: 'error', m: e.message }); }
    finally { setBusy(false); }
  }

  if (!rekom) return <Spinner />;

  const peserta = rekom.data;

  return (
    <>
      <div className="page-head">
        <h2>Review Eviden</h2>
        <p>Review tiap indikator (Disetujui/Revisi). Begitu seluruh indikator disetujui, sekolah <b>otomatis masuk Seleksi Administrasi</b>.</p>
      </div>

      <div className="card" style={{ padding: '12px 16px' }}>
        <div className="form-row">
          <div className="field" style={{ margin: 0 }}>
            <select value={tingkat} onChange={(e) => { setTingkat(e.target.value); setHal({ ...hal, page: 1 }); }}>
              <option value="">Semua Jenjang</option>
              {TINGKAT_PILIHAN.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <select value={kecamatanId} onChange={(e) => { setKecamatanId(e.target.value); setHal({ ...hal, page: 1 }); }}>
              <option value="">Semua Kecamatan</option>
              {kecamatan.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
            </select>
          </div>
          <form className="field" style={{ margin: 0, display: 'flex', gap: 8 }}
            onSubmit={(e) => { e.preventDefault(); setKataCari(cari.trim()); setHal({ ...hal, page: 1 }); }}>
            <input placeholder="Cari nama / NPSN..." value={cari} onChange={(e) => setCari(e.target.value)} />
            <button className="btn sm secondary" type="submit">Cari</button>
            {kataCari && <button className="btn sm secondary" type="button" onClick={() => { setCari(''); setKataCari(''); }}>Reset</button>}
          </form>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Satuan Pendidikan</th><th>Kecamatan</th><th>Status Eviden</th><th>Tahap</th><th></th></tr></thead>
            <tbody>
              {peserta.map((r) => {
                const ev = r.satuan.eviden;
                const items = ev?.items || [];
                const semuaDisetujui = items.length > 0 && items.every((i) => i.statusReview === 'DISETUJUI');
                return (
                  <tr key={r.id}>
                    <td><b>{r.satuan.nama}</b></td>
                    <td>{r.satuan.kecamatan?.nama}</td>
                    <td>
                      <span className={`badge ${ev.status === 'DIAJUKAN' ? 'blue' : 'gray'}`}>{ev.status === 'DIAJUKAN' ? 'Diajukan' : 'Draft'}</span>
                      {semuaDisetujui && <span className="badge green" style={{ marginLeft: 6 }}>Semua Disetujui</span>}
                    </td>
                    <td><TahapBadge tahap={r.satuan.tahap} /></td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn sm" onClick={() => open(r.satuanId)}>Review</button>
                    </td>
                  </tr>
                );
              })}
              {!peserta.length && <tr><td colSpan={5} className="center muted">{tingkat || kecamatanId || kataCari ? 'Tidak ada eviden yang sesuai saringan.' : 'Belum ada eviden yang diajukan peserta.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <Paginasi res={rekom} label="satuan" onPage={(p) => setHal({ ...hal, page: p })} onPageSize={(n) => setHal({ page: 1, pageSize: n })} />
      </div>

      {sel && (
        <div className="modal-bg" onClick={(e) => { if (e.target.className === 'modal-bg') setSel(null); }}>
          <div className="modal" style={{ maxWidth: 760 }}>
            <div className="row-between mb">
              <h3 style={{ margin: 0 }}>Review Eviden — {sel.satuan.nama}</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn sm" onClick={setujuiSemua} disabled={busy}>✅ Setujui Semua{klasifikasi && !klasifikasi.seluruhKomponen ? ' (komponen saya)' : ''}</button>
                <TombolUnduhPdf path={`/cetak/seleksi/${sel.satuanId}.pdf`} nama={`Rekap-Eviden-${sel.satuan.nama}.pdf`} label="PDF" onError={(e) => toast(e.message, 'error')} />
                <button className="btn sm secondary" onClick={() => setSel(null)}>Tutup</button>
              </div>
            </div>
            {klasifikasi && !klasifikasi.seluruhKomponen && (
              <div className="klasifikasi-bar">
                <span className="kb-label">Klasifikasi penilaian Anda:</span>
                {klasifikasi.komponen.length
                  ? klasifikasi.komponen.map((k) => <span key={k.id} className="badge blue">{k.kode} · {k.nama}</span>)
                  : <span className="badge red">Belum ditetapkan — hubungi koordinator Tim Stratifikasi</span>}
                <span className="muted">Indikator komponen lain hanya dapat dilihat.</span>
              </div>
            )}
            {sel.items.map((it) => {
              const boleh = bolehKomponen(it.indikator.komponenId);
              return (
              <div key={it.id} className={`field ${boleh ? '' : 'row-luar'}`} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <div className="row-between">
                  <label style={{ fontWeight: 500 }}>{it.indikator.kode} — {it.indikator.pertanyaan}</label>
                  <ReviewBadge status={it.statusReview} />
                </div>
                <div className="muted" style={{ fontSize: 13, margin: '4px 0' }}>{it.deskripsi || <i>tanpa deskripsi</i>}</div>
                {it.berkas?.length > 0 ? (
                  <div className="lampiran-list">
                    {it.berkas.map((b) => (
                      <div key={b.id} className="lampiran">
                        <span className="lampiran-ic">{b.jenis === 'TAUTAN' ? '🔗' : '📎'}</span>
                        <a className="lampiran-nm" title={b.fileName || b.fileUrl}
                          onClick={() => setPreview(b.jenis === 'TAUTAN' ? { url: b.fileUrl, name: b.fileUrl } : { path: b.filePath, name: b.fileName })}>
                          {b.fileName || b.fileUrl}
                        </a>
                        {b.jenis === 'TAUTAN' && <a href={b.fileUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>buka ↗</a>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: 12 }}>Belum ada lampiran.</div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <input placeholder="Keterangan perbaikan (untuk revisi)" value={catatan[it.id] || ''} onChange={(e) => setCatatan({ ...catatan, [it.id]: e.target.value })} style={{ flex: 1 }} />
                  <button className="btn sm" onClick={() => review(it.id, 'DISETUJUI')} disabled={busy || !boleh} title={boleh ? '' : 'Di luar klasifikasi penilaian Anda'}>Setujui</button>
                  <button className="btn sm amber" onClick={() => review(it.id, 'REVISI')} disabled={busy || !boleh} title={boleh ? '' : 'Di luar klasifikasi penilaian Anda'}>Revisi</button>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {preview && <FilePreview {...preview} onClose={() => setPreview(null)} />}
    </>
  );
}
