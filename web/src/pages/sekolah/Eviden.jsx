import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useUI } from '../../ui.jsx';
import { Alert, Spinner } from '../../lib.jsx';
import FilePreview from '../../components/FilePreview.jsx';

const ACCEPT = '.pdf,.doc,.docx,.rtf,.odt,.xls,.xlsx,.csv,.ods,.ppt,.pptx,.odp,.jpg,.jpeg,.png,.gif,.webp,.heic,.mp4,.mov,.avi,.mkv,.webm,.3gp,.m4v';

function ikonBerkas(b) {
  if (b.jenis === 'TAUTAN') return '🔗';
  const e = String(b.fileName || '').toLowerCase().split('.').pop();
  if (['pdf'].includes(e)) return '📕';
  if (['doc', 'docx', 'rtf', 'odt'].includes(e)) return '📘';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(e)) return '📗';
  if (['ppt', 'pptx', 'odp'].includes(e)) return '📙';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(e)) return '🖼️';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp', 'm4v'].includes(e)) return '🎬';
  return '📄';
}
const ukuranBaca = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function ReviewBadge({ status }) {
  if (status === 'DISETUJUI') return <span className="badge green">Disetujui</span>;
  if (status === 'REVISI') return <span className="badge red">Perlu Revisi</span>;
  return <span className="badge gray">Belum Direview</span>;
}

export default function Eviden() {
  const { refresh } = useAuth();
  const { toast, confirm } = useUI();
  const setMsg = (o) => { if (o) toast(o.m, o.t); };
  const [instrumen, setInstrumen] = useState([]);
  const [eviden, setEviden] = useState(null);
  const [notAllowed, setNotAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState({}); // indikatorId -> deskripsi
  const [files, setFiles] = useState({});   // indikatorId -> File[] (boleh lebih dari satu)
  const [urls, setUrls] = useState({});     // indikatorId -> tautan yang akan ditambahkan
  const [ganti, setGanti] = useState({});   // indikatorId -> hapus lampiran lama saat memperbaiki
  const [preview, setPreview] = useState(null);

  async function load() {
    try {
      const [inst, ev] = await Promise.all([api.get('/instrumen'), api.get('/eviden/mine')]);
      setInstrumen(inst.komponen);
      setEviden(ev);
      const d = {};
      for (const it of ev.items) d[it.indikatorId] = it.deskripsi || '';
      setDrafts(d); setUrls({});
    } catch (e) {
      if (String(e.message).includes('belum direkomendasikan')) setNotAllowed(true);
      else setMsg({ t: 'error', m: e.message });
    }
  }
  useEffect(() => { load(); }, []);

  if (notAllowed) {
    return (
      <>
        <div className="page-head"><h2>Eviden Stratifikasi</h2></div>
        <Alert type="info">Halaman ini terbuka setelah sekolah Anda direkomendasikan oleh TP UKS/M Kecamatan sebagai peserta Seleksi Penghargaan Stratifikasi UKS/M Tingkat Kabupaten.</Alert>
      </>
    );
  }
  if (!eviden) return <Spinner />;

  const itemMap = {};
  for (const it of eviden.items) itemMap[it.indikatorId] = it;
  const totalInd = instrumen.reduce((s, k) => s + k.indikator.length, 0);
  const terisi = eviden.items.filter((i) => (i.berkas?.length > 0) || (i.deskripsi && i.deskripsi.trim())).length;
  const adaRevisi = eviden.items.some((i) => i.statusReview === 'REVISI');
  const sedangReview = eviden.status === 'DIAJUKAN';

  async function saveItem(indId) {
    setBusy(true); setMsg(null);
    try {
      const form = new FormData();
      form.append('indikatorId', indId);
      form.append('deskripsi', drafts[indId] || '');
      for (const f of files[indId] || []) form.append('file', f);          // banyak berkas sekaligus
      const tautan = (urls[indId] || '').trim();
      if (tautan) form.append('tautan', tautan);
      // Saat memperbaiki eviden, lampiran lama dapat diminta hapus agar
      // dokumen/tautan tidak tercatat dua kali.
      if (ganti[indId]) form.append('gantiLampiran', '1');
      await api.postForm('/eviden/mine/item', form);
      setFiles({ ...files, [indId]: [] });
      setUrls({ ...urls, [indId]: '' });
      setGanti({ ...ganti, [indId]: false });
      await load();
      const n = (files[indId] || []).length;
      setMsg({ t: 'success', m: n ? `${n} berkas tersimpan.` : 'Eviden indikator tersimpan.' });
    } catch (e) { setMsg({ t: 'error', m: e.message }); }
    finally { setBusy(false); }
  }

  async function hapusBerkas(b) {
    const ok = await confirm({
      title: 'Hapus Lampiran',
      message: `Hapus ${b.jenis === 'TAUTAN' ? 'tautan' : 'berkas'} "${b.fileName || b.fileUrl}"?`,
      confirmText: 'Ya, Hapus', variant: 'danger',
    });
    if (!ok) return;
    try { await api.del(`/eviden/mine/berkas/${b.id}`); await load(); toast('Lampiran dihapus.', 'info'); }
    catch (e) { toast(e.message, 'error'); }
  }

  async function submit() {
    const ok = await confirm({
      title: 'Ajukan Eviden',
      message: 'Eviden akan diajukan untuk direview Tim Stratifikasi Kabupaten. Lanjutkan?',
      confirmText: 'Ya, Ajukan',
    });
    if (!ok) return;
    setBusy(true); setMsg(null);
    try {
      await api.post('/eviden/mine/submit');
      await refresh();
      await load();
      setMsg({ t: 'success', m: 'Eviden diajukan. Menunggu review Tim Stratifikasi.' });
    } catch (e) { setMsg({ t: 'error', m: e.message }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="page-head">
        <h2>Eviden Stratifikasi</h2>
        <p>Langkah 7 & 9 — Isi eviden tiap indikator untuk seleksi administrasi. Perbaiki indikator berstatus revisi hingga semua disetujui.</p>
      </div>

      {sedangReview && <Alert type="info">Eviden sedang direview Tim Stratifikasi. Anda dapat mengubah kembali bila ada indikator yang diminta revisi.</Alert>}
      {adaRevisi && <Alert type="error">Ada indikator berstatus <b>Revisi</b>. Perbaiki eviden lalu ajukan ulang.</Alert>}

      <div className="card">
        <div className="row-between mb">
          <span className="muted">Terisi {terisi} / {totalInd} indikator</span>
          <span className={`badge ${eviden.status === 'DIAJUKAN' ? 'blue' : 'gray'}`}>{eviden.status === 'DIAJUKAN' ? 'Diajukan' : 'Draft'}</span>
        </div>

        {instrumen.map((komp) => (
          <div key={komp.id}>
            <div className="comp-title">{komp.kode}. {komp.nama}</div>
            {komp.indikator.map((ind) => {
              const it = itemMap[ind.id];
              const revisi = it?.statusReview === 'REVISI';
              return (
                <div key={ind.id} className="field" style={{ marginBottom: 18, background: revisi ? '#fff8f7' : 'transparent', padding: revisi ? 10 : 0, borderRadius: 8 }}>
                  <div className="row-between" style={{ alignItems: 'flex-start' }}>
                    <label style={{ fontWeight: 500 }}>{ind.kode} — {ind.pertanyaan}</label>
                    <ReviewBadge status={it?.statusReview} />
                  </div>
                  {revisi && it.catatanReview && <Alert type="error"><b>Perbaikan diminta:</b> {it.catatanReview}</Alert>}
                  {ind.bentukEviden && (
                    <div className="eviden-hint">📎 <b>Bentuk eviden yang diminta:</b> {ind.bentukEviden}</div>
                  )}
                  <textarea rows={2} placeholder="Penjelasan pemenuhan indikator..." value={drafts[ind.id] || ''} onChange={(e) => setDrafts({ ...drafts, [ind.id]: e.target.value })} />
                  {it?.berkas?.length > 0 && (
                    <div className="lampiran-list">
                      {it.berkas.map((b) => (
                        <div key={b.id} className="lampiran">
                          <span className="lampiran-ic">{ikonBerkas(b)}</span>
                          {b.jenis === 'TAUTAN'
                            ? <a href={b.fileUrl} target="_blank" rel="noreferrer" className="lampiran-nm" title={b.fileUrl}>{b.fileUrl}</a>
                            : <a className="lampiran-nm" onClick={() => setPreview({ path: b.filePath, name: b.fileName })} title={b.fileName}>{b.fileName}</a>}
                          {b.ukuran ? <span className="lampiran-sz">{ukuranBaca(b.ukuran)}</span> : null}
                          {!sedangReview && it.statusReview !== 'DISETUJUI' && (
                            <button className="lampiran-x" type="button" title="Hapus lampiran" onClick={() => hapusBerkas(b)}>✕</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                    <input type="file" multiple accept={ACCEPT}
                      onChange={(e) => setFiles({ ...files, [ind.id]: Array.from(e.target.files) })} style={{ flex: '1 1 220px' }} />
                    <label className="btn sm secondary" style={{ cursor: 'pointer' }}>📷 Kamera
                      <input type="file" accept="image/*,video/*" capture="environment" multiple hidden
                        onChange={(e) => setFiles({ ...files, [ind.id]: [...(files[ind.id] || []), ...Array.from(e.target.files)] })} />
                    </label>
                    <input type="url" placeholder="Tambah tautan (Drive/YouTube/…)" value={urls[ind.id] || ''}
                      onChange={(e) => setUrls({ ...urls, [ind.id]: e.target.value })} style={{ flex: '1 1 200px' }} />
                    <button className="btn sm secondary" type="button" onClick={() => saveItem(ind.id)} disabled={busy}>Simpan</button>
                  </div>
                  {it?.berkas?.length > 0 && !sedangReview && it.statusReview !== 'DISETUJUI' && (
                    <label className="ganti-lampiran">
                      <input type="checkbox" checked={!!ganti[ind.id]}
                        onChange={(e) => setGanti({ ...ganti, [ind.id]: e.target.checked })} />
                      <span>Ganti lampiran — hapus {it.berkas.length} lampiran sebelumnya saat menyimpan, supaya dokumen/tautan tidak dobel</span>
                    </label>
                  )}
                  <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                    Boleh lebih dari satu berkas sekaligus. Format: PDF, Word, Excel, PowerPoint, JPG, JPEG, PNG, dan video (maks 100 MB per berkas) — serta tautan URL.
                    Tautan dikirim <b>per berkas sesuai indikator</b>, bukan tautan folder.
                  </div>
                  {files[ind.id]?.length > 0 && (
                    <div className="muted" style={{ fontSize: 11, marginTop: 3, color: 'var(--green)' }}>
                      Siap diunggah: {files[ind.id].map((f) => f.name).join(', ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        <div className="mt">
          <button className="btn" onClick={submit} disabled={busy || terisi < totalInd}>
            {adaRevisi ? 'Ajukan Ulang Setelah Perbaikan' : 'Ajukan Eviden untuk Review'}
          </button>
          {terisi < totalInd && <span className="muted" style={{ marginLeft: 10 }}>Lengkapi semua indikator dulu.</span>}
        </div>
      </div>
      {preview && <FilePreview {...preview} onClose={() => setPreview(null)} />}
    </>
  );
}
