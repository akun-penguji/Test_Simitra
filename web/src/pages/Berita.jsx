// Menu Informasi & Berita seputar Stratifikasi UKS/M Kabupaten Bekasi (notulen Sep 2026).
// Seluruh peran membaca; Admin/Koordinator Kabupaten menulis, menyunting, menerbitkan.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useUI } from '../ui.jsx';
import { Spinner, Paginasi, TombolUnduhPdf } from '../lib.jsx';
import { fmtTgl } from '../components/JadwalProgram.jsx';

export const KATEGORI = {
  INFORMASI: { label: 'Informasi', ikon: 'ℹ️' },
  BERITA: { label: 'Berita', ikon: '📰' },
  KEGIATAN: { label: 'Kegiatan', ikon: '📸' },
  PENGUMUMAN: { label: 'Pengumuman', ikon: '📢' },
};

// Isi berupa teks biasa: baris kosong = paragraf baru (aman dari HTML sisipan)
export function IsiBerita({ isi }) {
  return (
    <div className="berita-isi">
      {String(isi || '').split(/\n\s*\n/).map((par, i) => (
        <p key={i}>{par.split('\n').map((b, j, arr) => <span key={j}>{b}{j < arr.length - 1 && <br />}</span>)}</p>
      ))}
    </div>
  );
}

const ukuranBaca = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`);

// Lampiran PDF berita (mis. buku panduan). Berita terbit dibuka langsung; draf hanya lewat admin.
export function LampiranBerita({ b, admin = false }) {
  const { toast } = useUI();
  if (!b.lampiranNama) return null;
  return (
    <div className="card" style={{ background: 'var(--bg)', marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
      <div>
        <b>📄 {b.lampiranNama}</b>
        <div className="muted" style={{ fontSize: 12 }}>Lampiran PDF · {ukuranBaca(b.lampiranUkuran)}</div>
      </div>
      {admin && !b.terbit
        ? <TombolUnduhPdf path={`/berita/kelola/${b.id}/lampiran`} nama={b.lampiranNama} label="Unduh Lampiran" onError={(e) => toast(e.message, 'error')} />
        : <a className="btn sm" href={`/api/berita/${b.id}/lampiran`} target="_blank" rel="noreferrer">Buka / Unduh PDF</a>}
    </div>
  );
}

function Sampul({ b, besar = false }) {
  if (b.gambarUrl) return <img className={besar ? 'berita-sampul-besar' : 'berita-sampul'} src={b.gambarUrl} alt="" />;
  return <div className={`${besar ? 'berita-sampul-besar' : 'berita-sampul'} kosong k-${b.kategori}`}><span>{KATEGORI[b.kategori]?.ikon || '📰'}</span></div>;
}

function FormBerita({ awal, onTutup, onSimpan }) {
  const { toast } = useUI();
  const [f, setF] = useState(awal || { judul: '', kategori: 'INFORMASI', ringkasan: '', isi: '', terbit: true, disematkan: false });
  const [gambar, setGambar] = useState(null);
  const [hapusGambar, setHapusGambar] = useState(false);
  const [lampiran, setLampiran] = useState(null);
  const [hapusLampiran, setHapusLampiran] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const pratinjau = gambar ? URL.createObjectURL(gambar) : (!hapusGambar && awal?.gambarUrl) || null;

  async function simpan() {
    if (!f.judul.trim() || !f.isi.trim()) { toast('Judul dan isi wajib diisi.', 'error'); return; }
    setSibuk(true);
    try {
      const fd = new FormData();
      for (const k of ['judul', 'kategori', 'ringkasan', 'isi']) fd.append(k, f[k] || '');
      fd.append('terbit', String(!!f.terbit)); fd.append('disematkan', String(!!f.disematkan));
      if (gambar) fd.append('gambar', gambar);
      if (hapusGambar) fd.append('hapusGambar', 'true');
      if (lampiran) fd.append('lampiran', lampiran);
      if (hapusLampiran) fd.append('hapusLampiran', 'true');
      const b = awal?.id ? await api.putForm(`/berita/kelola/${awal.id}`, fd) : await api.postForm('/berita/kelola', fd);
      toast(f.terbit ? 'Informasi diterbitkan.' : 'Draf tersimpan.', 'success');
      onSimpan(b);
    } catch (e) { toast(e.message, 'error'); } finally { setSibuk(false); }
  }

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target.className === 'modal-bg') onTutup(); }}>
      <div className="modal" style={{ maxWidth: 680 }}>
        <div className="row-between mb"><h3 style={{ margin: 0 }}>{awal?.id ? 'Sunting' : 'Tulis'} Informasi / Berita</h3><button className="btn sm secondary" onClick={onTutup}>Tutup</button></div>
        <div className="field"><label>Judul</label><input value={f.judul} onChange={(e) => setF({ ...f, judul: e.target.value })} maxLength={200} /></div>
        <div className="form-row">
          <div className="field"><label>Kategori</label>
            <select value={f.kategori} onChange={(e) => setF({ ...f, kategori: e.target.value })}>
              {Object.entries(KATEGORI).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="field"><label>Gambar sampul (JPG/PNG/WEBP, maks 5 MB)</label>
            <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(e) => { setGambar(e.target.files?.[0] || null); setHapusGambar(false); }} />
          </div>
        </div>
        {pratinjau && (
          <div className="berita-pratinjau">
            <img src={pratinjau} alt="" />
            <button type="button" className="btn sm red" onClick={() => { setGambar(null); setHapusGambar(true); }}>Hapus gambar</button>
          </div>
        )}
        <div className="field">
          <label>Lampiran PDF (opsional, maks 30 MB — mis. buku panduan)</label>
          <input type="file" accept=".pdf,application/pdf" onChange={(e) => { setLampiran(e.target.files?.[0] || null); setHapusLampiran(false); }} />
          {awal?.lampiranNama && !lampiran && !hapusLampiran && (
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
              Saat ini: <b>{awal.lampiranNama}</b> ({ukuranBaca(awal.lampiranUkuran)}).{' '}
              <button type="button" className="btn sm red" onClick={() => setHapusLampiran(true)}>Hapus lampiran</button>
            </p>
          )}
          {hapusLampiran && <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Lampiran akan dihapus saat disimpan.</p>}
          {lampiran && <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>{lampiran.name} · {ukuranBaca(lampiran.size)}</p>}
        </div>
        <div className="field"><label>Ringkasan (opsional — tampil di daftar)</label><input value={f.ringkasan || ''} onChange={(e) => setF({ ...f, ringkasan: e.target.value })} maxLength={300} /></div>
        <div className="field"><label>Isi</label>
          <textarea rows={10} value={f.isi} onChange={(e) => setF({ ...f, isi: e.target.value })} placeholder="Pisahkan paragraf dengan baris kosong." />
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 12 }}>
          <label className="cek"><input type="checkbox" checked={!!f.terbit} onChange={(e) => setF({ ...f, terbit: e.target.checked })} /> Terbitkan (tampil untuk semua pengguna & halaman login)</label>
          <label className="cek"><input type="checkbox" checked={!!f.disematkan} onChange={(e) => setF({ ...f, disematkan: e.target.checked })} /> Sematkan di urutan teratas</label>
        </div>
        <button className="btn" onClick={simpan} disabled={sibuk}>{sibuk ? 'Menyimpan...' : (f.terbit ? 'Simpan & Terbitkan' : 'Simpan sebagai Draf')}</button>
      </div>
    </div>
  );
}

function Daftar() {
  const { user } = useAuth();
  const admin = user.role === 'TIM_KABUPATEN' && user.isAdmin;
  const [res, setRes] = useState(null);
  const [hal, setHal] = useState({ page: 1, pageSize: 9 });
  const [kategori, setKategori] = useState('');
  const [q, setQ] = useState('');
  const [cari, setCari] = useState('');
  const [form, setForm] = useState(null);

  async function load() {
    const qs = new URLSearchParams({ page: hal.page, pageSize: hal.pageSize, ...(kategori ? { kategori } : {}), ...(cari ? { q: cari } : {}) });
    setRes(await api.get(`${admin ? '/berita/kelola/daftar' : '/berita'}?${qs}`));
  }
  useEffect(() => { load(); }, [hal.page, hal.pageSize, kategori, cari]);

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Informasi & Berita</h2>
          <p>Informasi, pengumuman, dan kegiatan seputar Stratifikasi UKS/M Kabupaten Bekasi.</p>
        </div>
        {admin && <button className="btn" onClick={() => setForm({})}>+ Tulis Informasi</button>}
      </div>

      <div className="card berita-saring">
        <div className="berita-chip-baris">
          <button className={`btn sm ${!kategori ? '' : 'secondary'}`} onClick={() => { setKategori(''); setHal({ ...hal, page: 1 }); }}>Semua</button>
          {Object.entries(KATEGORI).map(([k, v]) => (
            <button key={k} className={`btn sm ${kategori === k ? '' : 'secondary'}`} onClick={() => { setKategori(k); setHal({ ...hal, page: 1 }); }}>{v.ikon} {v.label}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setCari(q.trim()); setHal({ ...hal, page: 1 }); }} style={{ display: 'flex', gap: 6 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul atau isi…" style={{ minWidth: 220 }} />
          <button className="btn sm secondary">Cari</button>
        </form>
      </div>

      {!res ? <Spinner /> : (
        <>
          {res.data.length === 0 && (
            <div className="card center muted" style={{ padding: 40 }}>
              {cari || kategori ? 'Tidak ada informasi yang cocok dengan saringan.' : 'Belum ada informasi yang diterbitkan.'}
              {admin && !cari && !kategori && <div style={{ marginTop: 12 }}><button className="btn" onClick={() => setForm({})}>+ Tulis informasi pertama</button></div>}
            </div>
          )}
          <div className="berita-grid">
            {res.data.map((b) => (
              <Link key={b.id} to={`/informasi/${b.id}`} className="berita-kartu">
                <Sampul b={b} />
                <div className="berita-badan">
                  <div className="berita-meta">
                    <span className={`badge k-${b.kategori}`}>{KATEGORI[b.kategori]?.label}</span>
                    {b.disematkan && <span className="badge amber">📌 Disematkan</span>}
                    {b.lampiranNama && <span className="badge blue">📄 PDF</span>}
                    {!b.terbit && <span className="badge gray">Draf</span>}
                  </div>
                  <h3>{b.judul}</h3>
                  <p>{b.ringkasan}</p>
                  <div className="berita-tgl">{fmtTgl(b.terbitPada || b.createdAt)}{b.penulis ? ` · ${b.penulis}` : ''}</div>
                </div>
              </Link>
            ))}
          </div>
          {res.total > 0 && <div className="card" style={{ padding: '6px 16px' }}><Paginasi res={res} label="informasi" onPage={(p) => setHal({ ...hal, page: p })} /></div>}
        </>
      )}
      {form && <FormBerita awal={null} onTutup={() => setForm(null)} onSimpan={() => { setForm(null); load(); }} />}
    </>
  );
}

function Detail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { toast, confirm } = useUI();
  const admin = user.role === 'TIM_KABUPATEN' && user.isAdmin;
  const [b, setB] = useState(null);
  const [err, setErr] = useState('');
  const [sunting, setSunting] = useState(false);

  async function load() {
    try { setB(await api.get(admin ? `/berita/kelola/${id}` : `/berita/${id}`)); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, [id]);

  async function hapus() {
    const ok = await confirm({ title: 'Hapus Informasi', message: `Hapus "${b.judul}"? Tindakan ini tidak dapat dibatalkan.`, confirmText: 'Ya, Hapus', variant: 'danger' });
    if (!ok) return;
    try { await api.del(`/berita/kelola/${b.id}`); toast('Informasi dihapus.', 'info'); nav('/informasi'); } catch (e) { toast(e.message, 'error'); }
  }

  if (err) return <div className="card center muted" style={{ padding: 40 }}>{err}<div style={{ marginTop: 12 }}><Link to="/informasi"><button className="btn secondary">← Kembali</button></Link></div></div>;
  if (!b) return <Spinner />;
  return (
    <>
      <div className="row-between mb" style={{ paddingRight: 56 }}>
        <Link to="/informasi"><button className="btn sm secondary">← Semua informasi</button></Link>
        {admin && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn sm secondary" onClick={() => setSunting(true)}>Sunting</button>
            <button className="btn sm red" onClick={hapus}>Hapus</button>
          </div>
        )}
      </div>
      <article className="card berita-artikel">
        <Sampul b={b} besar />
        <div className="berita-meta" style={{ marginTop: 16 }}>
          <span className={`badge k-${b.kategori}`}>{KATEGORI[b.kategori]?.label}</span>
          {b.disematkan && <span className="badge amber">📌 Disematkan</span>}
          {!b.terbit && <span className="badge gray">Draf — belum terlihat pengguna lain</span>}
        </div>
        <h1>{b.judul}</h1>
        <div className="berita-tgl">{fmtTgl(b.terbitPada || b.createdAt, { weekday: 'long' })}{b.penulis ? ` · ${b.penulis}` : ''}</div>
        <IsiBerita isi={b.isi} />
        <LampiranBerita b={b} admin={admin} />
      </article>
      {sunting && <FormBerita awal={{ ...b, ringkasan: b.ringkasanAsli || '' }} onTutup={() => setSunting(false)} onSimpan={(nb) => { setSunting(false); setB(nb); }} />}
    </>
  );
}

export default function Berita() {
  const { id } = useParams();
  return id ? <Detail /> : <Daftar />;
}
