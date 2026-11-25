import { useState, useEffect } from 'react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { Alert, JENJANG_PILIHAN } from '../lib.jsx';
import { JadwalLogin, fmtTgl } from '../components/JadwalProgram.jsx';
import { IsiBerita, KATEGORI, LampiranBerita } from './Berita.jsx';

export default function Login() {
  const { login, register } = useAuth();
  const [tab, setTab] = useState('login');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // login form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // register form
  const [reg, setReg] = useState({ username: '', password: '', nama: '', email: '', namaSekolah: '', jenjang: 'SD', kecamatanId: '', npsn: '' });
  const [kecamatan, setKecamatan] = useState([]);
  const [cariNpsn, setCariNpsn] = useState(false);

  // daftar akun demo (dari basis data) — panel hilang sendiri bila tidak ada
  const [demo, setDemo] = useState(null);
  const [demoBuka, setDemoBuka] = useState(false);

  // informasi & berita terbaru (publik) — dapat dibaca tanpa masuk
  const [berita, setBerita] = useState([]);
  const [baca, setBaca] = useState(null);

  async function lookupNpsn() {
    if (!reg.npsn) return;
    setCariNpsn(true);
    try {
      const d = await api.get(`/auth/referensi-npsn?npsn=${encodeURIComponent(reg.npsn)}`);
      if (d) {
        setReg((r) => ({ ...r, namaSekolah: d.nama, jenjang: d.jenjang || r.jenjang, kecamatanId: d.kecamatanId || r.kecamatanId }));
        // Bentuk nonformal (PKBM/SKB) tidak punya instrumen UKS/M → jenjang diisi sendiri
        setErr(d.jenjang ? '' : `Sekolah ditemukan (${d.bentuk || 'bentuk tidak dikenali'}), tetapi jenjangnya perlu Anda pilih sendiri.`);
      } else setErr('NPSN tidak ditemukan di referensi Dapodik — isi manual.');
    } catch (_) {} finally { setCariNpsn(false); }
  }

  useEffect(() => {
    api.get('/kecamatan').then(setKecamatan).catch(() => {});
    api.get('/auth/akun-demo').then((d) => { if (d?.ada) setDemo(d); }).catch(() => {});
    api.get('/berita?pageSize=3').then((d) => setBerita(d?.data || [])).catch(() => {});
  }, []);

  // klik satu baris akun demo → isi otomatis dan langsung masuk
  async function pakaiDemo(username) {
    setUsername(username); setPassword(demo.sandi);
    setErr(''); setBusy(true);
    try { await login(username, demo.sandi); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function doLogin(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await login(username, password); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function doRegister(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await register(reg); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  // ikon kesehatan mengambang (posisi & durasi acak namun deterministik)
  const floatIcons = ['🩺', '🏫', '💊', '🧼', '🏅', '📋', '🍎', '💉', '🧴', '🩹', '📝', '🏆'];
  const icons = floatIcons.map((ic, i) => ({
    ic,
    left: (i * 8.3 + 4) % 96,
    dur: 14 + (i % 5) * 3,
    delay: (i * 1.7) % 12,
    size: 22 + (i % 4) * 6,
  }));

  return (
    <div className="login-wrap">
      <div className="login-blob b1" />
      <div className="login-blob b2" />
      <div className="login-blob b3" />
      <div className="login-icons">
        {icons.map((it, i) => (
          <span key={i} style={{ left: `${it.left}%`, animationDuration: `${it.dur}s`, animationDelay: `${it.delay}s`, fontSize: it.size }}>{it.ic}</span>
        ))}
      </div>

      <div className="login-shell">
        <div className="login-brand">
          <h1>SIMITRA</h1>
          <div className="tag" style={{ marginBottom: 8, opacity: .95, fontWeight: 600 }}>Sistem Informasi Stratifikasi UKS/M</div>
          <div className="tag">Pemerintah Kabupaten Bekasi — Penilaian & Penghargaan Usaha Kesehatan Sekolah/Madrasah</div>
          <ul>
            <li><span className="ic">📝</span> Penilaian mandiri & scoring strata otomatis</li>
            <li><span className="ic">✅</span> Verifikasi kecamatan & rekomendasi peserta</li>
            <li><span className="ic">📎</span> Eviden stratifikasi & review kesesuaian</li>
            <li><span className="ic">🏆</span> Seleksi, kunjungan lapangan & sertifikat penghargaan</li>
          </ul>
          <JadwalLogin />
          {berita.length > 0 && (
            <div className="login-berita">
              <div className="lb-judul">📰 Informasi terbaru</div>
              {berita.map((b) => (
                <button type="button" key={b.id} className="lb-item" onClick={async () => setBaca(await api.get(`/berita/${b.id}`))}>
                  <span className="lb-kat">{KATEGORI[b.kategori]?.label}</span>
                  <span className="lb-teks">{b.judul}</span>
                  <span className="lb-tgl">{fmtTgl(b.terbitPada || b.createdAt, { month: 'short' })}</span>
                </button>
              ))}
            </div>
          )}
          <div className="foot">Alur resmi 16 langkah · Dasar · Madya · Utama · Paripurna</div>
        </div>

        <div className="login-card">
        <div className="logo">
          <div className="card-logos">
            <img src="/logo-bekasi.png" alt="Kabupaten Bekasi" />
            <img src="/logo-uks.png" alt="UKS" />
          </div>
          <h1>SIMITRA</h1>
          <div className="sub">Sistem Informasi Stratifikasi UKS/M · Kabupaten Bekasi</div>
        </div>

        <div className="tabs">
          <button className={tab === 'login' ? 'active' : ''} onClick={() => { setTab('login'); setErr(''); }}>Masuk</button>
          <button className={tab === 'register' ? 'active' : ''} onClick={() => { setTab('register'); setErr(''); }}>Daftar Sekolah</button>
        </div>

        <Alert type="error">{err}</Alert>

        {tab === 'login' ? (
          <form onSubmit={doLogin}>
            <div className="field">
              <label>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" required />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" required />
            </div>
            <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'Memproses...' : 'Masuk'}</button>
            {demo && (
              <div className="demo-accts">
                <button type="button" className="demo-kepala" onClick={() => setDemoBuka((v) => !v)}>
                  <span><b>Akun demo</b> — klik salah satu untuk langsung masuk</span>
                  <span className="demo-panah">{demoBuka ? '▲' : '▼'}</span>
                </button>
                <div className="demo-sandi">Kata sandi seluruh akun demo: <code>{demo.sandi}</code></div>
                {demoBuka && (
                  <div className="demo-daftar">
                    {demo.grup.map((g) => (
                      <div className="demo-grup" key={g.judul}>
                        <div className="demo-judul">{g.judul}</div>
                        {g.akun.map((a) => (
                          <button type="button" key={a.username} className="demo-baris" disabled={busy}
                            onClick={() => pakaiDemo(a.username)} title={a.nama}>
                            <code>{a.username}</code>
                            <span className="demo-ket">{a.ket}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </form>
        ) : (
          <form onSubmit={doRegister}>
            <div className="field">
              <label>NPSN (cari otomatis dari Dapodik)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={reg.npsn} onChange={(e) => setReg({ ...reg, npsn: e.target.value })} placeholder="mis. 20218936" style={{ flex: 1 }} />
                <button type="button" className="btn secondary" onClick={lookupNpsn} disabled={cariNpsn}>{cariNpsn ? '...' : '🔍 Cari'}</button>
              </div>
            </div>
            <div className="field">
              <label>Nama Satuan Pendidikan</label>
              <input value={reg.namaSekolah} onChange={(e) => setReg({ ...reg, namaSekolah: e.target.value })} placeholder="mis. SDN Cikarang 01" required />
            </div>
            <div className="form-row">
              <div className="field">
                <label>Jenjang</label>
                <select value={reg.jenjang} onChange={(e) => setReg({ ...reg, jenjang: e.target.value })}>
                  {JENJANG_PILIHAN.map((j) => <option key={j}>{j}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Kecamatan</label>
                <select value={reg.kecamatanId} onChange={(e) => setReg({ ...reg, kecamatanId: e.target.value })} required>
                  <option value="">-- pilih --</option>
                  {kecamatan.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Nama Operator / Kepala</label>
              <input value={reg.nama} onChange={(e) => setReg({ ...reg, nama: e.target.value })} placeholder="nama lengkap" />
            </div>
            <div className="form-row">
              <div className="field">
                <label>Username</label>
                <input value={reg.username} onChange={(e) => setReg({ ...reg, username: e.target.value })} required />
              </div>
              <div className="field">
                <label>Password</label>
                <input type="password" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} required />
              </div>
            </div>
            <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'Memproses...' : 'Daftar & Masuk'}</button>
          </form>
        )}
        </div>
      </div>
      {baca && (
        <div className="modal-bg" onClick={(e) => { if (e.target.className === 'modal-bg') setBaca(null); }}>
          <div className="modal" style={{ maxWidth: 680 }}>
            <div className="row-between mb">
              <span className={`badge k-${baca.kategori}`}>{KATEGORI[baca.kategori]?.label}</span>
              <button className="btn sm secondary" onClick={() => setBaca(null)}>Tutup</button>
            </div>
            {baca.gambarUrl && <img className="berita-sampul-besar" src={baca.gambarUrl} alt="" />}
            <h2 style={{ margin: '12px 0 4px' }}>{baca.judul}</h2>
            <div className="berita-tgl">{fmtTgl(baca.terbitPada || baca.createdAt, { weekday: 'long' })}{baca.penulis ? ` · ${baca.penulis}` : ''}</div>
            <IsiBerita isi={baca.isi} />
            <LampiranBerita b={baca} />
          </div>
        </div>
      )}
    </div>
  );
}
