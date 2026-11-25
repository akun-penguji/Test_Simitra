import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useUI } from '../../ui.jsx';
import { Spinner, StrataBadge, TahapBadge, Paginasi, PilihCari, JENJANG_PILIHAN } from '../../lib.jsx';

const SUMBER_LABEL = { DAPODIK: 'Dapodik (Disdik)', EMIS: 'Madrasah (Kemenag)', SMA_SMK: 'SMA/SMK (Prov. Jabar)', LAINNYA: 'Lainnya' };

function ReferensiView({ ref_, refBp, setRefBp, refSumber, setRefSumber, refQ, setRefQ, kecamatan, kecamatanId, setKecamatanId, onDaftar, onPage, onPageSize }) {
  if (!ref_) return <Spinner />;
  const bps = Object.keys(ref_.perBp);
  const sumbers = Object.keys(ref_.perSumber || {});
  return (
    <>
      <div className="card" style={{ padding: '12px 16px' }}>
        {sumbers.length > 1 && (
          <div className="tab-saring">
            <button type="button" className={refSumber === '' ? 'aktif' : ''} onClick={() => setRefSumber('')}>Semua sumber</button>
            {sumbers.map((sm) => (
              <button key={sm} type="button" className={refSumber === sm ? 'aktif' : ''} onClick={() => setRefSumber(sm)}>
                {SUMBER_LABEL[sm] || sm}<span className="jml">({ref_.perSumber[sm]})</span>
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <button className={`btn sm ${refBp === '' ? '' : 'secondary'}`} onClick={() => setRefBp('')}>Semua ({ref_.total})</button>
          {bps.map((b) => <button key={b} className={`btn sm ${refBp === b ? '' : 'secondary'}`} onClick={() => setRefBp(b)}>{b} ({ref_.perBp[b]})</button>)}
        </div>
        <div className="form-row">
          <div className="field" style={{ margin: 0 }}><input placeholder="Cari nama / NPSN / NSM..." value={refQ} onChange={(e) => setRefQ(e.target.value)} /></div>
          <div className="field" style={{ margin: 0 }}>
            <select value={kecamatanId} onChange={(e) => setKecamatanId(e.target.value)}>
              <option value="">Semua Kecamatan</option>
              {kecamatan.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="muted mb" style={{ fontSize: 12.5 }}>Direktori resmi satuan pendidikan: Dapodik (Disdik Kabupaten Bekasi), madrasah (Kemenag), dan SMA/SMK (kewenangan Provinsi Jawa Barat). Klik "Daftarkan" untuk membuat akun sekolah dari data ini. Bentuk PAUD (KB, TPA, SPS) memakai instrumen TK, RA memakai instrumen TK, MI/MTs/MA memakai instrumen SD/SMP/SMA; PKBM dan SKB tidak memiliki instrumen stratifikasi UKS/M. Sebagian SMA/SMK belum memiliki data kecamatan karena daftar sumbernya tidak memuatnya.</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>NPSN</th><th>Nama Sekolah</th><th>Bentuk</th><th>Jenjang Instrumen</th><th>Status</th><th>Kecamatan &amp; Alamat</th><th>Siswa</th><th>Rombel</th><th></th></tr></thead>
            <tbody>
              {ref_.data.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.npsn}
                    {s.nsm && <div className="muted" style={{ fontSize: 10.5 }} title="Nomor Statistik Madrasah">NSM {s.nsm}</div>}
                  </td>
                  <td><b>{s.nama}</b></td>
                  <td><span className="badge blue">{s.bp}</span></td>
                  <td>
                    {s.jenjang
                      ? <span className="badge green">{s.jenjang}</span>
                      : <span className="badge gray" title="Bentuk nonformal — tidak ada instrumen stratifikasi UKS/M">tidak ada</span>}
                  </td>
                  <td><span className={`badge ${s.status === 'Negeri' ? 'green' : 'amber'}`}>{s.status}</span></td>
                  <td style={{ maxWidth: 240 }}>
                    {s.kecamatan || '-'}
                    {s.alamat && <div className="muted" style={{ fontSize: 10.5 }}>{s.alamat}</div>}
                  </td>
                  <td>{s.jmlSiswa ?? '-'}</td>
                  <td>{s.rombel ?? '-'}</td>
                  <td>
                    {s.terdaftar
                      ? <span className="badge green">Terdaftar</span>
                      : s.jenjang
                        ? <button className="btn sm" onClick={() => onDaftar(s)}>+ Daftarkan</button>
                        : <span className="muted" style={{ fontSize: 11.5 }}>tidak dapat didaftarkan</span>}
                  </td>
                </tr>
              ))}
              {!ref_.data.length && <tr><td colSpan={9} className="center muted">Tidak ada data.</td></tr>}
            </tbody>
          </table>
        </div>
        <Paginasi res={ref_} label="sekolah referensi" onPage={onPage} onPageSize={onPageSize} />
      </div>
    </>
  );
}

const JENJANG = JENJANG_PILIHAN;
const emptyForm = { nama: '', npsn: '', jenjang: 'SD', kecamatanId: '', puskesmasId: '', kepalaSekolah: '', username: '', password: '' };

export default function MasterSekolah() {
  const nav = useNavigate();
  const { toast, confirm } = useUI();
  const [res, setRes] = useState(null);
  const [jenjang, setJenjang] = useState('');
  const [kecamatanId, setKecamatanId] = useState('');
  const [q, setQ] = useState('');
  const [kecamatan, setKecamatan] = useState([]);
  const [puskesmas, setPuskesmas] = useState([]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('terdaftar'); // terdaftar | referensi
  const [ref, setRef] = useState(null);
  const [refBp, setRefBp] = useState('');
  const [refSumber, setRefSumber] = useState('');
  const [refQ, setRefQ] = useState('');
  const [hal, setHal] = useState({ page: 1, pageSize: 25 });     // sekolah terdaftar
  const [halRef, setHalRef] = useState({ page: 1, pageSize: 25 }); // direktori referensi

  async function loadRef() {
    const p = new URLSearchParams();
    if (refBp) p.set('bp', refBp);
    if (refSumber) p.set('sumber', refSumber);
    if (kecamatanId) p.set('kecamatanId', kecamatanId);
    if (refQ) p.set('q', refQ);
    p.set('page', halRef.page); p.set('pageSize', halRef.pageSize);
    setRef(await api.get(`/admin/referensi?${p}`));
  }
  useEffect(() => { if (view === 'referensi') { const t = setTimeout(loadRef, refQ ? 300 : 0); return () => clearTimeout(t); } }, [view, refBp, refSumber, refQ, kecamatanId, halRef.page, halRef.pageSize]);
  // penyaring berubah → kembali ke halaman pertama
  useEffect(() => { setHalRef((h) => ({ ...h, page: 1 })); }, [refBp, refSumber, refQ, kecamatanId]);

  useEffect(() => {
    api.get('/kabupaten/kecamatan').then(setKecamatan);
    api.get('/puskesmas').then(setPuskesmas);
  }, []);

  async function load() {
    setLoading(true);
    const p = new URLSearchParams();
    if (jenjang) p.set('jenjang', jenjang);
    if (kecamatanId) p.set('kecamatanId', kecamatanId);
    if (q) p.set('q', q);
    p.set('page', hal.page); p.set('pageSize', hal.pageSize);
    setRes(await api.get(`/admin/sekolah?${p}`));
    setLoading(false);
  }
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [jenjang, kecamatanId, q, hal.page, hal.pageSize]);
  useEffect(() => { setHal((h) => ({ ...h, page: 1 })); }, [jenjang, kecamatanId, q]);

  if (!res) return <Spinner />;

  async function save() {
    if (!form.nama || !form.kecamatanId || (!form.id && (!form.username || !form.password))) { toast('Lengkapi data wajib.', 'error'); return; }
    setBusy(true);
    try {
      if (form.id) await api.put(`/admin/sekolah/${form.id}`, form);
      else await api.post('/admin/sekolah', form);
      toast('Data sekolah tersimpan.', 'success'); setForm(null); await load();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }
  async function nonaktif(s) {
    const ok = await confirm({ title: 'Nonaktifkan Sekolah', message: `Nonaktifkan akun ${s.nama}?`, confirmText: 'Ya, Nonaktifkan', variant: 'danger' });
    if (!ok) return;
    try { await api.del(`/admin/sekolah/${s.id}`); toast('Akun sekolah dinonaktifkan.', 'info'); await load(); }
    catch (e) { toast(e.message, 'error'); }
  }

  const totalAll = Object.values(res.perJenjang).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Master Data Sekolah</h2>
          <p>Data satuan pendidikan per jenjang & referensi Dapodik.</p>
        </div>
        {view === 'terdaftar' && <button className="btn" onClick={() => setForm({ ...emptyForm })}>+ Tambah Sekolah</button>}
      </div>

      <div className="tabs" style={{ maxWidth: 420 }}>
        <button className={view === 'terdaftar' ? 'active' : ''} onClick={() => setView('terdaftar')}>Terdaftar Akun</button>
        <button className={view === 'referensi' ? 'active' : ''} onClick={() => setView('referensi')}>Referensi Dapodik</button>
      </div>

      {view === 'referensi' && (
        <ReferensiView onPage={(p) => setHalRef({ ...halRef, page: p })} onPageSize={(n) => setHalRef({ page: 1, pageSize: n })} ref_={ref} refBp={refBp} setRefBp={setRefBp} refSumber={refSumber} setRefSumber={setRefSumber} refQ={refQ} setRefQ={setRefQ} kecamatan={kecamatan} kecamatanId={kecamatanId} setKecamatanId={setKecamatanId}
          onDaftar={(rs) => setForm({
            ...emptyForm, nama: rs.nama, npsn: rs.npsn,
            // jenjang instrumen hasil pemetaan server, bukan bentuk Dapodik mentah
            jenjang: rs.jenjang || 'SD',
            kecamatanId: rs.kecamatanId || kecamatan.find((k) => k.nama === rs.kecamatan)?.id || '',
            username: rs.npsn,
          })} />
      )}

      {view === 'terdaftar' && <>


      <div className="card" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <button className={`btn sm ${jenjang === '' ? '' : 'secondary'}`} onClick={() => setJenjang('')}>Semua ({totalAll})</button>
          {JENJANG.map((j) => (
            <button key={j} className={`btn sm ${jenjang === j ? '' : 'secondary'}`} onClick={() => setJenjang(j)}>{j} ({res.perJenjang[j] || 0})</button>
          ))}
        </div>
        <div className="form-row">
          <div className="field" style={{ margin: 0 }}><input placeholder="Cari nama / NPSN..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="field" style={{ margin: 0 }}>
            <select value={kecamatanId} onChange={(e) => setKecamatanId(e.target.value)}>
              <option value="">Semua Kecamatan</option>
              {kecamatan.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap" style={{ opacity: loading ? 0.5 : 1 }}>
          <table>
            <thead><tr><th>Satuan Pendidikan</th><th>NPSN</th><th>Jenjang</th><th>Kecamatan</th><th>Strata</th><th>Akun</th><th>Tahap</th><th></th></tr></thead>
            <tbody>
              {res.data.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.nama}</b><div className="muted" style={{ fontSize: 11 }}>{s.puskesmas || '-'}</div></td>
                  <td>{s.npsn || '-'}</td>
                  <td><span className="badge blue">{s.jenjang}</span></td>
                  <td>{s.kecamatan}</td>
                  <td><StrataBadge strata={s.strata} /></td>
                  <td>{s.username} {s.aktif ? <span className="badge green">Aktif</span> : <span className="badge red">Nonaktif</span>}</td>
                  <td><TahapBadge tahap={s.tahap} /></td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn sm secondary" onClick={() => nav(`/infografis/${s.id}`)}>📊</button>
                    <button className="btn sm secondary" onClick={() => setForm({ id: s.id, nama: s.nama, npsn: s.npsn || '', jenjang: s.jenjang, kecamatanId: s.kecamatanId, puskesmasId: s.puskesmasId || '', kepalaSekolah: s.kepalaSekolah || '', password: '' })}>Edit</button>
                    {s.aktif && <button className="btn sm red" onClick={() => nonaktif(s)}>Nonaktif</button>}
                  </td>
                </tr>
              ))}
              {!res.data.length && <tr><td colSpan={8} className="center muted">Tidak ada data.</td></tr>}
            </tbody>
          </table>
        </div>
        <Paginasi res={res} label="sekolah" onPage={(p) => setHal({ ...hal, page: p })} onPageSize={(n) => setHal({ page: 1, pageSize: n })} />
        <div className="muted mt" style={{ fontSize: 12 }}>Menampilkan {res.data.length} sekolah{res.total >= 500 ? ' (maks 500 — perhalus filter)' : ''}.</div>
      </div>
      </>}

      {form && (
        <div className="modal-bg" onClick={(e) => { if (e.target.className === 'modal-bg') setForm(null); }}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="row-between mb"><h3 style={{ margin: 0 }}>{form.id ? 'Edit' : 'Tambah'} Sekolah</h3><button className="btn sm secondary" onClick={() => setForm(null)}>Tutup</button></div>
            <div className="form-row">
              <div className="field"><label>Nama Satuan Pendidikan *</label><input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></div>
              <div className="field"><label>NPSN</label><input value={form.npsn} onChange={(e) => setForm({ ...form, npsn: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="field"><label>Jenjang *</label><select value={form.jenjang} onChange={(e) => setForm({ ...form, jenjang: e.target.value })}>{JENJANG.map((j) => <option key={j}>{j}</option>)}</select></div>
              <div className="field"><label>Kecamatan *</label><select value={form.kecamatanId} onChange={(e) => setForm({ ...form, kecamatanId: e.target.value, puskesmasId: '' })}><option value="">-- pilih --</option>{kecamatan.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}</select></div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Puskesmas Binaan</label>
                {/* Pilihan tersaring sesuai kecamatan sekolah & dapat dicari */}
                <PilihCari
                  pilihan={puskesmas.filter((p) => !form.kecamatanId || p.kecamatanId === form.kecamatanId)
                    .map((p) => ({ id: p.id, nama: p.nama, keterangan: p.alamat || undefined }))}
                  nilai={form.puskesmasId}
                  onChange={(v) => setForm({ ...form, puskesmasId: v })}
                  placeholder="-- pilih puskesmas binaan --"
                  kosong={form.kecamatanId ? 'Belum ada puskesmas terdata di kecamatan ini.' : 'Pilih kecamatan terlebih dahulu.'}
                />
              </div>
              <div className="field"><label>Kepala Sekolah</label><input value={form.kepalaSekolah} onChange={(e) => setForm({ ...form, kepalaSekolah: e.target.value })} /></div>
            </div>
            {!form.id && (
              <div className="form-row">
                <div className="field"><label>Username *</label><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
                <div className="field"><label>Password *</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              </div>
            )}
            {form.id && <div className="field"><label>Reset Password (opsional)</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="kosongkan bila tetap" /></div>}
            <button className="btn" onClick={save} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</button>
          </div>
        </div>
      )}
    </>
  );
}
