import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useUI } from '../../ui.jsx';
import { Spinner, Alert, fmtDate } from '../../lib.jsx';

// Penandatangan & templat sertifikat (Penghargaan & Peserta). Setiap perubahan membuat VERSI baru;
// sertifikat yang sudah terbit tetap memakai versi saat diterbitkan (pejabat berganti).
const JABATAN_BAWAAN = 'Asisten Pemerintahan dan Kesejahteraan Rakyat Sekretariat Daerah Kabupaten Bekasi';

function Pratinjau({ versiId, jenis, alt }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url; let batal = false;
    setSrc(null);
    api.blobUrl(`/pleno/pengaturan-sertifikat/${versiId}/${jenis}`)
      .then((u) => { url = u; if (!batal) setSrc(u); }).catch(() => {});
    return () => { batal = true; if (url) URL.revokeObjectURL(url); };
  }, [versiId, jenis]);
  if (!src) return <span className="muted" style={{ fontSize: 12 }}>Memuat pratinjau...</span>;
  return <img src={src} alt={alt} style={{ maxWidth: 220, maxHeight: 120, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)' }} />;
}

export default function PengaturanSertifikat() {
  const { toast } = useUI();
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ namaPejabat: '', jabatan: '', nip: '', kota: '' });
  const [ttd, setTtd] = useState(null);
  const [templat, setTemplat] = useState(null);
  const [hapusTemplat, setHapusTemplat] = useState(false);
  const [templatPeserta, setTemplatPeserta] = useState(null);
  const [hapusTemplatPeserta, setHapusTemplatPeserta] = useState(false);
  const [kunci, setKunci] = useState(0);
  const [busy, setBusy] = useState(false);

  async function load() {
    const d = await api.get('/pleno/pengaturan-sertifikat');
    setData(d);
    const a = d.aktif;
    // bawaan = pejabat penandatangan pada templat Kesra; tetap dapat diubah saat pejabat berganti
    setForm({
      namaPejabat: a?.namaPejabat || '', jabatan: a?.jabatan || JABATAN_BAWAAN, nip: a?.nip || '', kota: a?.kota || 'Cikarang Pusat',
    });
  }
  useEffect(() => { load().catch((e) => toast(e.message, 'error')); }, []);

  async function simpan(e) {
    e.preventDefault();
    if (!form.namaPejabat.trim()) { toast('Nama pejabat penandatangan wajib diisi.', 'error'); return; }
    setBusy(true);
    try {
      const f = new FormData();
      for (const [k, v] of Object.entries(form)) f.append(k, v);
      if (ttd) f.append('ttd', ttd);
      if (templat) f.append('templat', templat);
      if (hapusTemplat) f.append('hapusTemplat', '1');
      if (templatPeserta) f.append('templatPeserta', templatPeserta);
      if (hapusTemplatPeserta) f.append('hapusTemplatPeserta', '1');
      const r = await api.putForm('/pleno/pengaturan-sertifikat', f);
      toast(r.berubah === false ? 'Tidak ada perubahan.' : 'Pengaturan tersimpan sebagai versi baru. Sertifikat yang sudah terbit tidak berubah.', r.berubah === false ? 'info' : 'success');
      setTtd(null); setTemplat(null); setHapusTemplat(false); setTemplatPeserta(null); setHapusTemplatPeserta(false); setKunci((n) => n + 1);
      await load();
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  }

  if (!data) return <Spinner />;
  const a = data.aktif;

  return (
    <>
      <div className="page-head">
        <h2>Pengaturan Sertifikat</h2>
        <p>Pejabat penandatangan (nama, jabatan, NIP, pindaian tanda tangan) pada Sertifikat Penghargaan dan Sertifikat Peserta. Templat Kesra sudah terpasang; unggah gambar baru hanya bila desainnya berubah.</p>
      </div>

      {!a?.adaTtd && <Alert type="warn">Pindaian tanda tangan belum diunggah. Sertifikat baru dapat digenerate setelah nama dan tanda tangan diisi.</Alert>}

      <form className="card" style={{ maxWidth: 760 }} onSubmit={simpan}>
        <div className="form-row">
          <div className="field"><label>Nama Pejabat Penandatangan *</label><input value={form.namaPejabat} onChange={(e) => setForm({ ...form, namaPejabat: e.target.value })} /></div>
          <div className="field"><label>NIP</label><input value={form.nip} onChange={(e) => setForm({ ...form, nip: e.target.value })} /></div>
        </div>
        <div className="form-row">
          <div className="field"><label>Jabatan</label><input value={form.jabatan} onChange={(e) => setForm({ ...form, jabatan: e.target.value })} placeholder={JABATAN_BAWAAN} /></div>
          <div className="field"><label>Kota penerbitan</label><input value={form.kota} onChange={(e) => setForm({ ...form, kota: e.target.value })} placeholder="Cikarang Pusat" /></div>
        </div>
        <div className="form-row">
          <div className="field">
            <label>Pindaian Tanda Tangan (PNG/JPG, maks 2 MB)</label>
            <input key={`t${kunci}`} type="file" accept=".png,.jpg,.jpeg" onChange={(e) => setTtd(e.target.files?.[0] || null)} />
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>PNG berlatar transparan memberi hasil terbaik.</p>
            {a?.adaTtd && !ttd && <div style={{ marginTop: 8 }}><Pratinjau versiId={a.id} jenis="ttd" alt="Tanda tangan saat ini" /></div>}
          </div>
          <div className="field">
            <label>Templat Sertifikat Penghargaan — hasil Kunjungan & Pleno (PNG/JPG, maks 5 MB)</label>
            <input key={`p${kunci}`} type="file" accept=".png,.jpg,.jpeg" onChange={(e) => { setTemplat(e.target.files?.[0] || null); setHapusTemplat(false); }} />
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Kosong = templat Kesra bawaan. Gambar latar saja (tanpa nomor, nama, tanggal, dan pejabat — itu dicetak sistem).</p>
            {a?.adaTemplat && !templat && !hapusTemplat && (
              <div style={{ marginTop: 8 }}>
                <Pratinjau versiId={a.id} jenis="templat" alt="Templat saat ini" />
                <div style={{ marginTop: 6 }}><button type="button" className="btn sm red" onClick={() => setHapusTemplat(true)}>Hapus templat</button></div>
              </div>
            )}
            {hapusTemplat && <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Templat akan dihapus saat disimpan; templat bawaan dipakai kembali.</p>}
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label>Templat Sertifikat Peserta — hasil Rekomendasi Kecamatan (PNG/JPG, maks 5 MB)</label>
            <input key={`q${kunci}`} type="file" accept=".png,.jpg,.jpeg" onChange={(e) => { setTemplatPeserta(e.target.files?.[0] || null); setHapusTemplatPeserta(false); }} />
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Kosong = templat Kesra bawaan.</p>
            {a?.adaTemplatPeserta && !templatPeserta && !hapusTemplatPeserta && (
              <div style={{ marginTop: 8 }}>
                <Pratinjau versiId={a.id} jenis="templatPeserta" alt="Templat peserta saat ini" />
                <div style={{ marginTop: 6 }}><button type="button" className="btn sm red" onClick={() => setHapusTemplatPeserta(true)}>Hapus templat</button></div>
              </div>
            )}
            {hapusTemplatPeserta && <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Templat akan dihapus saat disimpan; templat bawaan dipakai kembali.</p>}
          </div>
        </div>
        <button className="btn" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan sebagai Versi Baru'}</button>
      </form>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Riwayat Versi</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Dibuat</th><th>Pejabat</th><th>Jabatan</th><th>Tanda Tangan</th><th>Templat</th><th>Oleh</th><th>Status</th></tr></thead>
            <tbody>
              {data.riwayat.map((v) => (
                <tr key={v.id}>
                  <td>{fmtDate(v.createdAt)}</td>
                  <td><b>{v.namaPejabat}</b>{v.nip && <div className="muted" style={{ fontSize: 11 }}>NIP {v.nip}</div>}</td>
                  <td>{v.jabatan}</td>
                  <td>{v.adaTtd ? 'Ada' : '-'}</td>
                  <td>{v.adaTemplat ? 'Ada' : '-'}</td>
                  <td>{v.dibuatOleh}</td>
                  <td>{v.aktif ? <span className="badge green">Aktif</span> : <span className="badge gray">Lama</span>}</td>
                </tr>
              ))}
              {!data.riwayat.length && <tr><td colSpan={7} className="center muted">Belum ada pengaturan sertifikat.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
