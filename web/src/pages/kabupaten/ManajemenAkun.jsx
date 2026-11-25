import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useUI } from '../../ui.jsx';
import { Spinner, Paginasi } from '../../lib.jsx';

const ROLE_LABEL = { TP_KECAMATAN: 'TP Kecamatan', TIM_KABUPATEN: 'Tim Stratifikasi' };
const empty = { username: '', password: '', nama: '', email: '', role: 'TP_KECAMATAN', kecamatanId: '', isAdmin: false, komponenIds: [] };

export default function ManajemenAkun() {
  const { toast, confirm } = useUI();
  const [users, setUsers] = useState(null);
  const [hal, setHal] = useState({ page: 1, pageSize: 25 });
  const [kecamatan, setKecamatan] = useState([]);
  const [komponen, setKomponen] = useState([]); // untuk klasifikasi penilai kabupaten
  const [form, setForm] = useState(null); // null=closed, {..}=open
  const [busy, setBusy] = useState(false);
  const [saring, setSaring] = useState({ role: '', kecamatanId: '', q: '' });
  const [q, setQ] = useState('');

  async function load() {
    const qs = new URLSearchParams({ page: hal.page, pageSize: hal.pageSize, ...Object.fromEntries(Object.entries(saring).filter(([, v]) => v)) });
    setUsers(await api.get(`/kabupaten/users?${qs}`));
  }
  useEffect(() => { load(); }, [hal.page, hal.pageSize, saring]);
  useEffect(() => {
    api.get('/kabupaten/kecamatan').then(setKecamatan);
    api.get('/kabupaten/komponen').then(setKomponen).catch(() => {});
  }, []);
  if (!users) return <Spinner />;

  function openNew() { setForm({ ...empty }); }
  function openEdit(u) { setForm({ id: u.id, username: u.username, password: '', nama: u.nama, email: u.email || '', role: u.role, kecamatanId: u.kecamatan?.id || '', isAdmin: !!u.isAdmin, komponenIds: (u.klasifikasi || []).map((k) => k.id) }); }

  async function save() {
    setBusy(true);
    try {
      if (form.id) {
        await api.put(`/kabupaten/users/${form.id}`, { nama: form.nama, email: form.email, kecamatanId: form.kecamatanId, password: form.password || undefined, isAdmin: !!form.isAdmin, komponenIds: form.isAdmin ? [] : form.komponenIds });
        toast('Akun diperbarui.', 'success');
      } else {
        await api.post('/kabupaten/users', form);
        toast('Akun berhasil dibuat.', 'success');
      }
      setForm(null);
      await load();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  async function nonaktif(u) {
    const ok = await confirm({ title: 'Nonaktifkan Akun', message: `Nonaktifkan akun ${u.nama} (${u.username})?`, confirmText: 'Ya, Nonaktifkan', variant: 'danger' });
    if (!ok) return;
    try { await api.del(`/kabupaten/users/${u.id}`); toast('Akun dinonaktifkan.', 'info'); await load(); }
    catch (e) { toast(e.message, 'error'); }
  }

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Manajemen Akun TP UKS/M</h2>
          <p>Kelola akun Tim Pembina UKS/M Kecamatan & Kabupaten. Satu kecamatan dapat memiliki beberapa akun: seorang koordinator dan penilai per komponen.</p>
        </div>
        <button className="btn" onClick={openNew}>+ Tambah Akun</button>
      </div>

      <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '12px 16px' }}>
        <select value={saring.role} onChange={(e) => { setSaring({ ...saring, role: e.target.value }); setHal({ ...hal, page: 1 }); }} style={{ width: 'auto' }}>
          <option value="">Semua peran</option><option value="TP_KECAMATAN">TP Kecamatan</option><option value="TIM_KABUPATEN">Tim Stratifikasi</option>
        </select>
        <select value={saring.kecamatanId} onChange={(e) => { setSaring({ ...saring, kecamatanId: e.target.value }); setHal({ ...hal, page: 1 }); }} style={{ width: 'auto' }}>
          <option value="">Semua kecamatan</option>{kecamatan.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
        </select>
        <form onSubmit={(e) => { e.preventDefault(); setSaring({ ...saring, q: q.trim() }); setHal({ ...hal, page: 1 }); }} style={{ display: 'flex', gap: 6 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / username…" /><button className="btn sm secondary">Cari</button>
        </form>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nama</th><th>Username</th><th>Role</th><th>Kecamatan</th><th>Klasifikasi Penilaian</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.nama}</b><div className="muted" style={{ fontSize: 12 }}>{u.email}</div></td>
                  <td>{u.username}</td>
                  <td>
                    <span className={`badge ${u.role === 'TIM_KABUPATEN' ? 'purple' : 'blue'}`}>{ROLE_LABEL[u.role]}</span>
                    <span className={`badge ${u.isAdmin ? 'green' : 'blue'}`} style={{ marginLeft: 4 }}>
                      {u.role === 'TIM_KABUPATEN' ? (u.isAdmin ? 'Admin' : 'Petugas') : (u.isAdmin ? 'Koordinator' : 'Penilai')}
                    </span>
                  </td>
                  <td>{u.kecamatan?.nama || '-'}</td>
                  <td>
                    {u.isAdmin ? <span className="badge green">Seluruh komponen</span>
                      : u.klasifikasi?.length
                        ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{u.klasifikasi.map((k) => <span key={k.id} className="badge blue" title={k.nama}>{k.kode}</span>)}</div>
                        : <span className="badge red">Belum ditetapkan</span>}
                  </td>
                  <td>{u.aktif ? <span className="badge green">Aktif</span> : <span className="badge red">Nonaktif</span>}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn sm secondary" onClick={() => openEdit(u)}>Edit</button>
                    {u.aktif && <button className="btn sm red" onClick={() => nonaktif(u)}>Nonaktifkan</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginasi res={users} label="akun" onPage={(p) => setHal({ ...hal, page: p })} onPageSize={(n) => setHal({ page: 1, pageSize: n })} />
      </div>

      {form && (
        <div className="modal-bg" onClick={(e) => { if (e.target.className === 'modal-bg') setForm(null); }}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="row-between mb">
              <h3 style={{ margin: 0 }}>{form.id ? 'Edit Akun' : 'Tambah Akun'}</h3>
              <button className="btn sm secondary" onClick={() => setForm(null)}>Tutup</button>
            </div>
            <div className="field"><label>Nama Lengkap</label><input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></div>
            <div className="field"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            {!form.id && (
              <>
                <div className="field"><label>Username</label><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
                <div className="field">
                  <label>Role</label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option value="TP_KECAMATAN">TP Kecamatan</option>
                    <option value="TIM_KABUPATEN">Tim Stratifikasi</option>
                  </select>
                </div>
              </>
            )}
            {form.role === 'TP_KECAMATAN' && (
              <div className="field">
                <label>Kecamatan</label>
                <select value={form.kecamatanId} onChange={(e) => setForm({ ...form, kecamatanId: e.target.value })}>
                  <option value="">-- pilih --</option>
                  {kecamatan.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
                </select>
              </div>
            )}
            {form.role === 'TIM_KABUPATEN' && (
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={!!form.isAdmin} onChange={(e) => setForm({ ...form, isAdmin: e.target.checked })} />
                  Admin / Koordinator Kabupaten
                </label>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {form.isAdmin
                    ? 'Akses penuh: Master Sekolah, Master Instrumen, Periode, Manajemen Akun, & Log Audit.'
                    : 'Petugas: hanya menu operasional (review eviden, seleksi, kunjungan, rekap). Tanpa akses pengaturan master & akun.'}
                </div>
              </div>
            )}
            {form.role === 'TP_KECAMATAN' && (
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={!!form.isAdmin} onChange={(e) => setForm({ ...form, isAdmin: e.target.checked })} />
                  Koordinator TP UKS/M Kecamatan
                </label>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {form.isAdmin
                    ? 'Menilai seluruh komponen, memfinalkan verifikasi, rekomendasi & pendaftaran seleksi, serta mengelola tim penilai kecamatan.'
                    : 'Penilai komponen: hanya menilai indikator pada komponen yang dicentang di bawah. Hasilnya difinalkan koordinator kecamatan.'}
                </div>
              </div>
            )}
            {!form.isAdmin && (
              <div className="field">
                <label>Klasifikasi Penilaian (komponen yang boleh dinilai)</label>
                <div style={{ display: 'grid', gap: 6, border: '1px solid #e3e6ea', borderRadius: 8, padding: '10px 12px' }}>
                  {komponen.map((k) => (
                    <label key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 400 }}>
                      <input
                        type="checkbox"
                        style={{ width: 'auto' }}
                        checked={form.komponenIds?.includes(k.id) || false}
                        onChange={(e) => setForm({
                          ...form,
                          komponenIds: e.target.checked
                            ? [...(form.komponenIds || []), k.id]
                            : (form.komponenIds || []).filter((x) => x !== k.id),
                        })}
                      />
                      <span><b>{k.kode}</b> · {k.nama}</span>
                    </label>
                  ))}
                  {!komponen.length && <span className="muted">Belum ada komponen instrumen.</span>}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {form.role === 'TIM_KABUPATEN'
                    ? 'Penilai hanya dapat menilai indikator pada komponen yang dicentang — berlaku untuk review eviden, seleksi administrasi, dan peninjauan lapangan.'
                    : 'Penilai kecamatan hanya dapat mengisi verifikasi indikator pada komponen yang dicentang.'} Bila kosong, akun tidak dapat menilai apa pun.
                </div>
              </div>
            )}
            <div className="field"><label>{form.id ? 'Password Baru (kosongkan bila tetap)' : 'Password'}</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <button className="btn" onClick={save} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</button>
          </div>
        </div>
      )}
    </>
  );
}
