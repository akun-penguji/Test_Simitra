import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useUI } from '../../ui.jsx';
import { Spinner, fmtDate } from '../../lib.jsx';

const empty = { nama: '', tahun: new Date().getFullYear(), keterangan: '', mulai: '', selesai: '', aktif: false };

// Tanggal tersimpan dalam WIB → nilai <input type="date"> (YYYY-MM-DD) tanpa bergeser hari
const keInput = (d) => (d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) : '');

// Tahapan baku alur Stratifikasi UKS/M — pengisi awal jadwal (tanggal diisi admin)
const TAHAPAN_BAKU = [
  { nama: 'Registrasi & Penilaian Mandiri', pelaksana: 'Satuan Pendidikan' },
  { nama: 'Verifikasi Penilaian oleh Kecamatan', pelaksana: 'TP Kecamatan' },
  { nama: 'Rekomendasi Peserta Seleksi Penghargaan Stratifikasi', pelaksana: 'TP Kecamatan' },
  { nama: 'Pengisian Eviden Stratifikasi', pelaksana: 'Satuan Pendidikan' },
  { nama: 'Review Eviden', pelaksana: 'Tim Stratifikasi' },
  { nama: 'Seleksi Administrasi & Rekomendasi Kunjungan Lapangan', pelaksana: 'Tim Stratifikasi' },
  { nama: 'Kunjungan Lapangan', pelaksana: 'Tim Stratifikasi' },
  { nama: 'Hasil Pleno & Finalisasi Strata Akhir', pelaksana: 'Tim Stratifikasi' },
  { nama: 'Penerbitan Sertifikat Peserta dan Sertifikat Penghargaan', pelaksana: 'Tim Stratifikasi' },
];
const PELAKSANA = ['Satuan Pendidikan', 'TP Kecamatan', 'Tim Stratifikasi', 'Seluruh pihak'];

function EditorJadwal({ periode, onTutup, onSimpan }) {
  const { toast } = useUI();
  const [baris, setBaris] = useState(null);
  const [sibuk, setSibuk] = useState(false);
  useEffect(() => {
    api.get(`/admin/periode/${periode.id}/jadwal`).then((l) => setBaris(l.map((j) => ({
      nama: j.nama, pelaksana: j.pelaksana || '', keterangan: j.keterangan || '', mulai: keInput(j.mulai), selesai: keInput(j.selesai),
    }))));
  }, []);
  if (!baris) return null;
  const set = (i, k, v) => setBaris(baris.map((b, j) => (j === i ? { ...b, [k]: v } : b)));
  const pindah = (i, arah) => { const b = [...baris]; const t = b[i]; b[i] = b[i + arah]; b[i + arah] = t; setBaris(b); };

  async function simpan() {
    setSibuk(true);
    try {
      await api.put(`/admin/periode/${periode.id}/jadwal`, { items: baris });
      toast('Jadwal tersimpan dan langsung tampil bagi seluruh pengguna.', 'success'); onSimpan();
    } catch (e) { toast(e.message, 'error'); } finally { setSibuk(false); }
  }

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target.className === 'modal-bg') onTutup(); }}>
      <div className="modal" style={{ maxWidth: 940 }}>
        <div className="row-between mb">
          <h3 style={{ margin: 0 }}>Jadwal Program — {periode.nama}</h3>
          <button className="btn sm secondary" onClick={onTutup}>Tutup</button>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Jadwal tampil di halaman login dan di atas setiap halaman aplikasi ketika periode aktif sedang berjalan,
          lengkap dengan tahap yang berjalan dan sisa hari. Jadwal bersifat informasi — tidak mengunci proses.
        </p>
        {!baris.length && (
          <div className="chart-kosong" style={{ marginBottom: 12 }}>
            Belum ada tahapan. <button className="btn sm" onClick={() => setBaris(TAHAPAN_BAKU.map((t) => ({ ...t, keterangan: '', mulai: '', selesai: '' })))}>Isi dengan tahapan baku</button>
          </div>
        )}
        {baris.length > 0 && (
          <div className="table-wrap">
            <table className="jadwal-editor">
              <thead><tr><th>#</th><th>Tahapan</th><th>Pelaksana</th><th>Mulai</th><th>Selesai</th><th>Keterangan</th><th></th></tr></thead>
              <tbody>
                {baris.map((b, i) => (
                  <tr key={i}>
                    <td className="muted">{i + 1}</td>
                    <td><input value={b.nama} onChange={(e) => set(i, 'nama', e.target.value)} /></td>
                    <td><select value={b.pelaksana} onChange={(e) => set(i, 'pelaksana', e.target.value)}><option value="">-</option>{PELAKSANA.map((x) => <option key={x}>{x}</option>)}</select></td>
                    <td><input type="date" value={b.mulai} onChange={(e) => set(i, 'mulai', e.target.value)} /></td>
                    <td><input type="date" value={b.selesai} min={b.mulai || undefined} onChange={(e) => set(i, 'selesai', e.target.value)} /></td>
                    <td><input value={b.keterangan} onChange={(e) => set(i, 'keterangan', e.target.value)} placeholder="opsional" /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm secondary" disabled={i === 0} onClick={() => pindah(i, -1)} title="Naikkan">↑</button>
                      <button className="btn sm secondary" disabled={i === baris.length - 1} onClick={() => pindah(i, 1)} title="Turunkan" style={{ marginLeft: 3 }}>↓</button>
                      <button className="btn sm red" onClick={() => setBaris(baris.filter((_, j) => j !== i))} title="Hapus" style={{ marginLeft: 3 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn secondary" onClick={() => setBaris([...baris, { nama: '', pelaksana: '', keterangan: '', mulai: baris.at(-1)?.selesai || '', selesai: '' }])}>+ Tambah tahapan</button>
          <button className="btn" onClick={simpan} disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan Jadwal'}</button>
        </div>
      </div>
    </div>
  );
}

export default function Periode() {
  const { toast, confirm } = useUI();
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [jadwal, setJadwal] = useState(null); // periode yang jadwalnya disunting

  async function load() { setList(await api.get('/admin/periode')); }
  useEffect(() => { load(); }, []);
  if (!list) return <Spinner />;

  async function save() {
    if (!form.nama || !form.tahun) { toast('Nama & tahun wajib diisi.', 'error'); return; }
    setBusy(true);
    try {
      if (form.id) await api.put(`/admin/periode/${form.id}`, form);
      else await api.post('/admin/periode', form);
      toast('Periode tersimpan.', 'success'); setForm(null); await load();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }
  async function aktifkan(p) {
    const ok = await confirm({ title: 'Aktifkan Periode', message: `Jadikan "${p.nama}" sebagai periode aktif? Penilaian baru akan tercatat di periode ini.`, confirmText: 'Ya, Aktifkan', variant: 'success' });
    if (!ok) return;
    try { await api.post(`/admin/periode/${p.id}/aktifkan`); toast('Periode diaktifkan.', 'success'); await load(); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function hapus(p) {
    const ok = await confirm({ title: 'Hapus Periode', message: `Hapus periode "${p.nama}"?`, confirmText: 'Ya, Hapus', variant: 'danger' });
    if (!ok) return;
    try { await api.del(`/admin/periode/${p.id}`); toast('Periode dihapus.', 'info'); await load(); }
    catch (e) { toast(e.message, 'error'); }
  }

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Periode Stratifikasi</h2>
          <p>Kelola periode/tahun pelaksanaan stratifikasi. Satu periode aktif menjadi acuan penilaian berjalan.</p>
        </div>
        <button className="btn" onClick={() => setForm({ ...empty })}>+ Tambah Periode</button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Periode</th><th>Tahun</th><th>Rentang</th><th>Jadwal</th><th>Data</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.nama}</b>{p.keterangan && <div className="muted" style={{ fontSize: 12 }}>{p.keterangan}</div>}</td>
                  <td>{p.tahun}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{p.mulai ? `${fmtDate(p.mulai)} – ${fmtDate(p.selesai)}` : (p._count?.jadwal ? 'Mengikuti jadwal' : '-')}</td>
                  <td>{p._count?.jadwal ? <span className="badge green">{p._count.jadwal} tahapan</span> : <span className="badge amber">Belum diatur</span>}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{p._count?.penilaian || 0} penilaian · {p._count?.sertifikat || 0} sertifikat</td>
                  <td>{p.aktif ? <span className="badge green">● Aktif</span> : <span className="badge gray">Nonaktif</span>}</td>
                  <td className="aksi-baris">
                    {!p.aktif && <button className="btn sm" onClick={() => aktifkan(p)}>Aktifkan</button>}
                    <button className="btn sm" onClick={() => setJadwal(p)}>🗓️ Jadwal</button>
                    <button className="btn sm secondary" onClick={() => setForm({ id: p.id, nama: p.nama, tahun: p.tahun, keterangan: p.keterangan || '', mulai: keInput(p.mulai), selesai: keInput(p.selesai) })}>Edit</button>
                    {!p.aktif && <button className="btn sm red" onClick={() => hapus(p)}>Hapus</button>}
                  </td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={7} className="center muted">Belum ada periode.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {jadwal && <EditorJadwal periode={jadwal} onTutup={() => setJadwal(null)} onSimpan={() => { setJadwal(null); load(); }} />}

      {form && (
        <div className="modal-bg" onClick={(e) => { if (e.target.className === 'modal-bg') setForm(null); }}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="row-between mb"><h3 style={{ margin: 0 }}>{form.id ? 'Edit' : 'Tambah'} Periode</h3><button className="btn sm secondary" onClick={() => setForm(null)}>Tutup</button></div>
            <div className="field"><label>Nama Periode</label><input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="mis. Stratifikasi UKS/M 2027" /></div>
            <div className="field"><label>Tahun</label><input type="number" value={form.tahun} onChange={(e) => setForm({ ...form, tahun: e.target.value })} /></div>
            <div className="form-row">
              <div className="field"><label>Mulai</label><input type="date" value={form.mulai} onChange={(e) => setForm({ ...form, mulai: e.target.value })} /></div>
              <div className="field"><label>Selesai</label><input type="date" value={form.selesai} onChange={(e) => setForm({ ...form, selesai: e.target.value })} /></div>
            </div>
            <div className="field"><label>Keterangan</label><input value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} /></div>
            {!form.id && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 500 }}><input type="checkbox" style={{ width: 'auto' }} checked={form.aktif} onChange={(e) => setForm({ ...form, aktif: e.target.checked })} /> Jadikan periode aktif</label>}
            <button className="btn mt" onClick={save} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</button>
          </div>
        </div>
      )}
    </>
  );
}
