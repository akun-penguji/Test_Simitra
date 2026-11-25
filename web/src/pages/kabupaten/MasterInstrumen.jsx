import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useUI } from '../../ui.jsx';
import { Spinner } from '../../lib.jsx';

const JENJANG = ['TK', 'SD', 'SMP', 'SMA'];
const STRATA_LIST = ['DASAR', 'MADYA', 'UTAMA', 'PARIPURNA'];
const STRATA_LABEL_LOKAL = { DASAR: 'Dasar', MADYA: 'Madya', UTAMA: 'Utama', PARIPURNA: 'Paripurna' };

export default function MasterInstrumen() {
  const { toast, confirm } = useUI();
  const [tab, setTab] = useState('SD');
  const [komponen, setKomponen] = useState([]);
  const [indikator, setIndikator] = useState([]);
  const [loading, setLoading] = useState(true);
  const [indForm, setIndForm] = useState(null); // {id?, komponenId, jenjang, strata, pertanyaan}
  const [kompForm, setKompForm] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const [k, i] = await Promise.all([api.get('/admin/komponen'), api.get(`/admin/indikator?jenjang=${tab}`)]);
    setKomponen(k); setIndikator(i); setLoading(false);
  }
  useEffect(() => { load(); }, [tab]);

  // ---- Indikator ----
  async function saveInd() {
    if (!indForm.pertanyaan || !indForm.komponenId) { toast('Lengkapi komponen & pertanyaan.', 'error'); return; }
    setBusy(true);
    try {
      if (indForm.id) await api.put(`/admin/indikator/${indForm.id}`, indForm);
      else await api.post('/admin/indikator', indForm);
      toast('Indikator tersimpan.', 'success'); setIndForm(null); await load();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }
  async function delInd(ind) {
    const ok = await confirm({ title: 'Hapus Indikator', message: `Hapus indikator "${ind.pertanyaan.slice(0, 60)}..."?`, confirmText: 'Ya, Hapus', variant: 'danger' });
    if (!ok) return;
    try { await api.del(`/admin/indikator/${ind.id}`); toast('Indikator dihapus.', 'info'); await load(); }
    catch (e) { toast(e.message, 'error'); }
  }

  // ---- Komponen ----
  async function saveKomp() {
    setBusy(true);
    try {
      if (kompForm.id) await api.put(`/admin/komponen/${kompForm.id}`, kompForm);
      else await api.post('/admin/komponen', kompForm);
      toast('Komponen tersimpan.', 'success'); setKompForm(null); await load();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }
  async function delKomp(k) {
    const ok = await confirm({ title: 'Hapus Komponen', message: `Hapus komponen ${k.kode}. ${k.nama}?`, confirmText: 'Ya, Hapus', variant: 'danger' });
    if (!ok) return;
    try { await api.del(`/admin/komponen/${k.id}`); toast('Komponen dihapus.', 'info'); await load(); }
    catch (e) { toast(e.message, 'error'); }
  }

  const byKomp = {};
  for (const ind of indikator) (byKomp[ind.komponenId] ||= []).push(ind);

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Master Instrumen Stratifikasi</h2>
          <p>Kelola komponen & indikator penilaian per jenjang dan strata. Perubahan otomatis dipakai penilaian baru.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn secondary" onClick={() => setKompForm({ kode: '', nama: '', urutan: komponen.length })}>+ Komponen</button>
          <button className="btn" onClick={() => setIndForm({ komponenId: komponen[0]?.id || '', jenjang: tab, strata: 'DASAR', pertanyaan: '', bentukEviden: '' })}>+ Indikator</button>
        </div>
      </div>

      <div className="tabs" style={{ maxWidth: 360 }}>
        {JENJANG.map((j) => <button key={j} className={tab === j ? 'active' : ''} onClick={() => setTab(j)}>{j}</button>)}
      </div>

      {loading ? <Spinner /> : komponen.map((k) => (
        <div key={k.id} className="card">
          <div className="row-between mb">
            <h3 style={{ margin: 0 }}>{k.kode}. {k.nama} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>({(byKomp[k.id] || []).length} indikator {tab})</span></h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn sm secondary" onClick={() => setKompForm({ id: k.id, kode: k.kode, nama: k.nama, urutan: k.urutan })}>Edit</button>
              <button className="btn sm red" onClick={() => delKomp(k)}>Hapus</button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th style={{ width: 90 }}>Strata</th><th>Indikator</th><th style={{ width: 100 }}>Dipakai</th><th style={{ width: 120 }}></th></tr></thead>
              <tbody>
                {STRATA_LIST.flatMap((lv) => (byKomp[k.id] || []).filter((i) => i.strata === lv)).map((ind) => (
                  <tr key={ind.id}>
                    <td><span className={`badge strata-${ind.strata}`} style={{ fontSize: 10 }}>{STRATA_LABEL_LOKAL[ind.strata]}</span></td>
                    <td>{ind.pertanyaan}</td>
                    <td className="muted">{ind._count?.jawabanPenilaian || 0}×</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn sm secondary" onClick={() => setIndForm({ id: ind.id, komponenId: ind.komponenId, jenjang: ind.jenjang, strata: ind.strata, pertanyaan: ind.pertanyaan, bentukEviden: ind.bentukEviden || '' })}>Edit</button>
                      <button className="btn sm red" onClick={() => delInd(ind)}>Hapus</button>
                    </td>
                  </tr>
                ))}
                {!(byKomp[k.id] || []).length && <tr><td colSpan={4} className="center muted">Belum ada indikator untuk jenjang {tab}.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Modal Indikator */}
      {indForm && (
        <div className="modal-bg" onClick={(e) => { if (e.target.className === 'modal-bg') setIndForm(null); }}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="row-between mb"><h3 style={{ margin: 0 }}>{indForm.id ? 'Edit' : 'Tambah'} Indikator</h3><button className="btn sm secondary" onClick={() => setIndForm(null)}>Tutup</button></div>
            <div className="form-row">
              <div className="field"><label>Jenjang</label>
                <select value={indForm.jenjang} onChange={(e) => setIndForm({ ...indForm, jenjang: e.target.value })}>{JENJANG.map((j) => <option key={j}>{j}</option>)}</select>
              </div>
              <div className="field"><label>Strata</label>
                <select value={indForm.strata} onChange={(e) => setIndForm({ ...indForm, strata: e.target.value })}>{STRATA_LIST.map((l) => <option key={l} value={l}>{STRATA_LABEL_LOKAL[l]}</option>)}</select>
              </div>
            </div>
            <div className="field"><label>Komponen</label>
              <select value={indForm.komponenId} onChange={(e) => setIndForm({ ...indForm, komponenId: e.target.value })}>
                {komponen.map((k) => <option key={k.id} value={k.id}>{k.kode}. {k.nama}</option>)}
              </select>
            </div>
            <div className="field"><label>Pertanyaan / Indikator</label><textarea rows={3} value={indForm.pertanyaan} onChange={(e) => setIndForm({ ...indForm, pertanyaan: e.target.value })} /></div>
            <div className="field"><label>Bentuk Eviden yang Diminta</label><textarea rows={2} placeholder="mis. RPP, foto kegiatan, daftar hadir…" value={indForm.bentukEviden || ''} onChange={(e) => setIndForm({ ...indForm, bentukEviden: e.target.value })} /></div>
            <button className="btn" onClick={saveInd} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</button>
          </div>
        </div>
      )}

      {/* Modal Komponen */}
      {kompForm && (
        <div className="modal-bg" onClick={(e) => { if (e.target.className === 'modal-bg') setKompForm(null); }}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="row-between mb"><h3 style={{ margin: 0 }}>{kompForm.id ? 'Edit' : 'Tambah'} Komponen</h3><button className="btn sm secondary" onClick={() => setKompForm(null)}>Tutup</button></div>
            {!kompForm.id && <div className="field"><label>Kode (mis. A, B, E)</label><input value={kompForm.kode} onChange={(e) => setKompForm({ ...kompForm, kode: e.target.value.toUpperCase() })} /></div>}
            <div className="field"><label>Nama Komponen</label><input value={kompForm.nama} onChange={(e) => setKompForm({ ...kompForm, nama: e.target.value })} /></div>
            <div className="field"><label>Urutan</label><input type="number" value={kompForm.urutan} onChange={(e) => setKompForm({ ...kompForm, urutan: e.target.value })} /></div>
            <button className="btn" onClick={saveKomp} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</button>
          </div>
        </div>
      )}
    </>
  );
}
