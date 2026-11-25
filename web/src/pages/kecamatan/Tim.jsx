// Tim Penilai Kecamatan (notulen Sep 2026): satu kecamatan diakses beberapa pengguna —
// koordinator + penilai per komponen. Koordinator mengelola anggota tim.
import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useUI } from '../../ui.jsx';
import { Spinner, Alert } from '../../lib.jsx';

const kosong = { nama: '', email: '', username: '', password: '', komponenIds: [] };

export default function Tim() {
  const { user } = useAuth();
  const { toast, confirm } = useUI();
  const koordinator = !!user.isAdmin;
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [sibuk, setSibuk] = useState(false);

  async function load() { setD(await api.get('/kecamatan/tim')); }
  useEffect(() => { load(); }, []);
  if (!d) return <Spinner />;

  async function simpan() {
    setSibuk(true);
    try {
      if (form.id) await api.put(`/kecamatan/tim/${form.id}`, { nama: form.nama, email: form.email, password: form.password || undefined, komponenIds: form.komponenIds });
      else await api.post('/kecamatan/tim', form);
      toast(form.id ? 'Anggota tim diperbarui.' : 'Penilai ditambahkan.', 'success');
      setForm(null); await load();
    } catch (e) { toast(e.message, 'error'); } finally { setSibuk(false); }
  }
  async function aturAktif(a, aktif) {
    if (!aktif) {
      const ok = await confirm({ title: 'Nonaktifkan Penilai', message: `Nonaktifkan akun ${a.nama} (${a.username})? Penilai tidak dapat masuk lagi.`, confirmText: 'Ya, Nonaktifkan', variant: 'danger' });
      if (!ok) return;
    }
    try { await api.put(`/kecamatan/tim/${a.id}`, { aktif }); toast(aktif ? 'Akun diaktifkan.' : 'Akun dinonaktifkan.', 'info'); await load(); }
    catch (e) { toast(e.message, 'error'); }
  }
  const toggleKomp = (id, on) => setForm({ ...form, komponenIds: on ? [...form.komponenIds, id] : form.komponenIds.filter((x) => x !== id) });

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Tim Penilai Kecamatan</h2>
          <p>TP UKS/M Kecamatan {user.kecamatan?.nama} — penilai menilai komponen yang ditugaskan; koordinator memfinalkan verifikasi.</p>
        </div>
        {koordinator && <button className="btn" onClick={() => setForm({ ...kosong })}>+ Tambah Penilai</button>}
      </div>

      {d.komponenKosong.length > 0 && (
        <Alert type="info">
          Komponen <b>{d.komponenKosong.map((k) => k.kode).join(', ')}</b> belum memiliki penilai aktif —
          indikator komponen tersebut dinilai langsung oleh koordinator saat finalisasi.
        </Alert>
      )}

      <div className="grid cols-4" style={{ marginBottom: 18 }}>
        {d.komponen.map((k) => {
          const penilai = d.anggota.filter((a) => a.aktif && !a.koordinator && a.klasifikasi.some((x) => x.id === k.id));
          return (
            <div key={k.id} className="tim-komp">
              <div className="tim-komp-kode">{k.kode}</div>
              <div className="tim-komp-nama">{k.nama}</div>
              <div className="tim-komp-orang">{penilai.length ? penilai.map((p) => p.nama).join(', ') : <span className="muted">Koordinator</span>}</div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nama</th><th>Username</th><th>Peran</th><th>Komponen yang Dinilai</th><th>Status</th>{koordinator && <th></th>}</tr></thead>
            <tbody>
              {d.anggota.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.nama}</b>{a.id === user.id && <span className="muted"> (Anda)</span>}<div className="muted" style={{ fontSize: 12 }}>{a.email}</div></td>
                  <td>{a.username}</td>
                  <td>{a.koordinator ? <span className="badge green">Koordinator</span> : <span className="badge blue">Penilai</span>}</td>
                  <td>
                    {a.koordinator ? <span className="badge green">Seluruh komponen + finalisasi</span>
                      : a.klasifikasi.length ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{a.klasifikasi.map((k) => <span key={k.id} className="badge blue" title={k.nama}>{k.kode} · {k.nama}</span>)}</div>
                      : <span className="badge red">Belum ditugaskan</span>}
                  </td>
                  <td>{a.aktif ? <span className="badge green">Aktif</span> : <span className="badge red">Nonaktif</span>}</td>
                  {koordinator && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {(!a.koordinator || a.id === user.id) && <button className="btn sm secondary" onClick={() => setForm({ id: a.id, nama: a.nama, email: a.email || '', username: a.username, password: '', komponenIds: a.klasifikasi.map((k) => k.id), koordinator: a.koordinator })}>Edit</button>}
                      {!a.koordinator && (a.aktif
                        ? <button className="btn sm red" style={{ marginLeft: 6 }} onClick={() => aturAktif(a, false)}>Nonaktifkan</button>
                        : <button className="btn sm" style={{ marginLeft: 6 }} onClick={() => aturAktif(a, true)}>Aktifkan</button>)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!koordinator && <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Perubahan anggota tim dilakukan oleh koordinator kecamatan.</p>}
      </div>

      {form && (
        <div className="modal-bg" onClick={(e) => { if (e.target.className === 'modal-bg') setForm(null); }}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="row-between mb"><h3 style={{ margin: 0 }}>{form.id ? 'Edit Anggota Tim' : 'Tambah Penilai Komponen'}</h3><button className="btn sm secondary" onClick={() => setForm(null)}>Tutup</button></div>
            <div className="field"><label>Nama Lengkap</label><input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></div>
            <div className="field"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            {!form.id && <div className="field"><label>Username</label><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.trim() })} /></div>}
            <div className="field"><label>{form.id ? 'Kata Sandi Baru (kosongkan bila tetap)' : 'Kata Sandi (min. 6 karakter)'}</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            {!form.koordinator && (
              <div className="field">
                <label>Komponen yang dinilai</label>
                <div className="cek-grup">
                  {d.komponen.map((k) => (
                    <label key={k.id} className="cek"><input type="checkbox" checked={form.komponenIds.includes(k.id)} onChange={(e) => toggleKomp(k.id, e.target.checked)} /><span><b>{k.kode}</b> · {k.nama}</span></label>
                  ))}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Penilai hanya dapat mengubah indikator pada komponen yang dicentang.</div>
              </div>
            )}
            <button className="btn" onClick={simpan} disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
          </div>
        </div>
      )}
    </>
  );
}
