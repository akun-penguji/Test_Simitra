import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useUI } from '../../ui.jsx';
import { Spinner, Paginasi, Alert, TombolUnduhPdf, fmtDate } from '../../lib.jsx';

// Unggah surat rekomendasi satuan pendidikan dari kecamatan ke Tim Kabupaten
// (rapat akhir Okt 2026). Hanya Koordinator TP UKS/M Kecamatan yang dapat mengunggah/menghapus.
const ukuranBaca = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const FORM_KOSONG = { nomorSurat: '', tanggalSurat: '', perihal: '' };

export default function SuratRekomendasi() {
  const { user } = useAuth();
  const { toast, confirm } = useUI();
  const koordinator = !!user?.isAdmin;
  const [res, setRes] = useState(null);
  const [hal, setHal] = useState({ page: 1, pageSize: 25 });
  const [form, setForm] = useState(FORM_KOSONG);
  const [berkas, setBerkas] = useState(null);
  const [kunciInput, setKunciInput] = useState(0); // mengosongkan <input type="file"> setelah unggah
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setRes(await api.get(`/surat-rekomendasi?page=${hal.page}&pageSize=${hal.pageSize}`)); } catch (e) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, [hal.page, hal.pageSize]);

  async function unggah(e) {
    e.preventDefault();
    if (!berkas) { toast('Pilih berkas surat (PDF, JPG, atau PNG) terlebih dahulu.', 'error'); return; }
    setBusy(true);
    try {
      const f = new FormData();
      f.append('file', berkas);
      for (const [k, v] of Object.entries(form)) if (v) f.append(k, v);
      await api.postForm('/surat-rekomendasi', f);
      toast('Surat rekomendasi terunggah dan diteruskan ke Tim Kabupaten.', 'success');
      setForm(FORM_KOSONG); setBerkas(null); setKunciInput((n) => n + 1);
      setHal({ ...hal, page: 1 }); await load();
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  }

  async function hapus(s) {
    const ok = await confirm({
      title: 'Hapus Surat Rekomendasi', message: `Surat "${s.nomorSurat || s.namaBerkas}" akan dihapus dan tidak lagi terlihat oleh Tim Kabupaten.`,
      confirmText: 'Ya, Hapus', variant: 'danger',
    });
    if (!ok) return;
    try { await api.del(`/surat-rekomendasi/${s.id}`); toast('Surat dihapus.', 'info'); await load(); }
    catch (err) { toast(err.message, 'error'); }
  }

  if (!res) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <h2>Surat Rekomendasi</h2>
        <p>Unggah surat rekomendasi satuan pendidikan dari kecamatan. Surat tampil di akun Tim Kabupaten pada menu Surat Rekomendasi Kecamatan.</p>
      </div>

      {!koordinator && <Alert type="info">Hanya <b>Koordinator TP UKS/M Kecamatan</b> yang dapat mengunggah atau menghapus surat. Anda dapat melihat daftar surat kecamatan.</Alert>}

      {koordinator && (
        <form className="card" style={{ maxWidth: 760 }} onSubmit={unggah}>
          <h3 style={{ marginTop: 0 }}>Unggah Surat</h3>
          <div className="form-row">
            <div className="field"><label>Nomor Surat</label><input value={form.nomorSurat} onChange={(e) => setForm({ ...form, nomorSurat: e.target.value })} placeholder="mis. 421/123/Kec.Cibitung/2026" /></div>
            <div className="field"><label>Tanggal Surat</label><input type="date" value={form.tanggalSurat} onChange={(e) => setForm({ ...form, tanggalSurat: e.target.value })} /></div>
          </div>
          <div className="field"><label>Perihal</label><input value={form.perihal} onChange={(e) => setForm({ ...form, perihal: e.target.value })} placeholder="Rekomendasi Satuan Pendidikan Peserta Seleksi Penghargaan Stratifikasi UKS/M" /></div>
          <div className="field">
            <label>Berkas Surat *</label>
            <input key={kunciInput} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setBerkas(e.target.files?.[0] || null)} />
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
              {berkas ? `${berkas.name} · ${ukuranBaca(berkas.size)}` : 'Format PDF, JPG, atau PNG — maksimal 10 MB.'}
            </p>
          </div>
          <button className="btn" disabled={busy}>{busy ? 'Mengunggah...' : 'Unggah Surat'}</button>
        </form>
      )}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nomor Surat</th><th>Tanggal Surat</th><th>Perihal</th><th>Berkas</th><th>Diunggah</th><th></th></tr></thead>
            <tbody>
              {res.data.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.nomorSurat || '-'}</b></td>
                  <td>{s.tanggalSurat ? fmtDate(s.tanggalSurat) : '-'}</td>
                  <td style={{ maxWidth: 260 }}>{s.perihal || '-'}</td>
                  <td>{s.namaBerkas}<div className="muted" style={{ fontSize: 11 }}>{ukuranBaca(s.ukuran)}</div></td>
                  <td>{fmtDate(s.createdAt)}<div className="muted" style={{ fontSize: 11 }}>{s.diunggahOleh}</div></td>
                  <td className="aksi-baris">
                    <TombolUnduhPdf path={`/surat-rekomendasi/${s.id}/berkas`} nama={s.namaBerkas} label="Unduh" onError={(e) => toast(e.message, 'error')} />
                    {koordinator && <button className="btn sm red" onClick={() => hapus(s)}>Hapus</button>}
                  </td>
                </tr>
              ))}
              {!res.data.length && <tr><td colSpan={6} className="center muted">Belum ada surat rekomendasi yang diunggah.</td></tr>}
            </tbody>
          </table>
        </div>
        <Paginasi res={res} label="surat" onPage={(p) => setHal({ ...hal, page: p })} onPageSize={(n) => setHal({ page: 1, pageSize: n })} />
      </div>
    </>
  );
}
