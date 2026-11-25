// Daftar peraih penghargaan Stratifikasi UKS/M (sumber: berkas Bagian Kesra).
// Menjadi dasar larangan penilaian mandiri — termasuk untuk sekolah yang belum
// memiliki akun; barisnya tertaut otomatis saat sekolah tersebut mendaftar.
import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useUI } from '../../ui.jsx';
import { Spinner, Paginasi, STRATA_LABEL } from '../../lib.jsx';

const JENJANG = ['TK/RA', 'SD/MI', 'SMP/MTs', 'SMA/SMK/MA'];
const PERINGKAT = { 1: ['I', 'green'], 2: ['II', 'blue'], 3: ['III', 'amber'] };
const STRATA_PILIHAN = ['PARIPURNA', 'UTAMA', 'MADYA', 'DASAR'];
const kosong = { nama: '', jenjang: 'SD/MI', tahun: new Date().getFullYear(), peringkat: 1, kecamatanId: '', strataAkhir: '', catatan: '' };

export default function PeraihPenghargaan() {
  const { toast, confirm } = useUI();
  const [res, setRes] = useState(null);
  const [hal, setHal] = useState({ page: 1, pageSize: 25 });
  const [saring, setSaring] = useState({ tahun: '', jenjang: '', tertaut: '', q: '' });
  const [q, setQ] = useState('');
  const [kecamatan, setKecamatan] = useState([]);
  const [form, setForm] = useState(null);
  const [taut, setTaut] = useState(null); // baris yang sedang ditautkan manual
  const [cari, setCari] = useState({ teks: '', hasil: [] });
  const [busy, setBusy] = useState(false);

  async function load() {
    const qs = new URLSearchParams({ page: hal.page, pageSize: hal.pageSize, ...Object.fromEntries(Object.entries(saring).filter(([, v]) => v)) });
    setRes(await api.get(`/admin/peraih?${qs}`));
  }
  useEffect(() => { load(); }, [hal.page, hal.pageSize, saring]);
  useEffect(() => { api.get('/kabupaten/kecamatan').then(setKecamatan).catch(() => {}); }, []);
  if (!res) return <Spinner />;

  const ubahSaring = (k, v) => { setSaring({ ...saring, [k]: v }); setHal({ ...hal, page: 1 }); };

  async function simpan() {
    if (!form.nama.trim()) { toast('Nama sekolah wajib diisi.', 'error'); return; }
    setBusy(true);
    try {
      if (form.id) await api.put(`/admin/peraih/${form.id}`, form);
      else await api.post('/admin/peraih', form);
      toast('Data peraih tersimpan.', 'success'); setForm(null); await load();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }
  async function ubahLarangan(p) {
    const cabut = p.berlakuLarangan;
    const ok = await confirm({
      title: cabut ? 'Cabut Larangan' : 'Berlakukan Kembali',
      message: cabut
        ? `Cabut larangan penilaian mandiri untuk ${p.nama}? Sekolah ini akan dapat mengisi penilaian mandiri kembali.`
        : `Berlakukan kembali larangan penilaian mandiri untuk ${p.nama}?`,
      confirmText: cabut ? 'Ya, Cabut' : 'Ya, Berlakukan', variant: cabut ? 'danger' : 'success',
    });
    if (!ok) return;
    try { await api.put(`/admin/peraih/${p.id}`, { berlakuLarangan: !p.berlakuLarangan }); toast('Pengaturan larangan diperbarui.', 'info'); await load(); }
    catch (e) { toast(e.message, 'error'); }
  }
  // Strata akhir peraih dipilih manual oleh Admin Kabupaten, langsung dari tabel
  async function ubahStrata(p, strataAkhir) {
    try { await api.put(`/admin/peraih/${p.id}`, { strataAkhir }); toast(`Strata akhir ${p.nama} ${strataAkhir ? `ditetapkan ${STRATA_LABEL[strataAkhir]}` : 'dikosongkan'}.`, 'success'); await load(); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function hapus(p) {
    const ok = await confirm({ title: 'Hapus Data Peraih', message: `Hapus "${p.nama}" (Peringkat ${p.peringkat} tahun ${p.tahun}) dari daftar?`, confirmText: 'Ya, Hapus', variant: 'danger' });
    if (!ok) return;
    try { await api.del(`/admin/peraih/${p.id}`); toast('Data dihapus.', 'info'); await load(); } catch (e) { toast(e.message, 'error'); }
  }
  async function cariSekolah(teks) {
    setCari({ teks, hasil: teks.trim().length < 2 ? [] : await api.get(`/admin/peraih-sekolah?q=${encodeURIComponent(teks)}`) });
  }
  async function tautkan(satuanId) {
    try { await api.put(`/admin/peraih/${taut.id}`, { satuanId }); toast(satuanId ? 'Tertaut ke sekolah terdaftar.' : 'Tautan dilepas.', 'success'); setTaut(null); setCari({ teks: '', hasil: [] }); await load(); }
    catch (e) { toast(e.message, 'error'); }
  }

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Peraih Penghargaan Stratifikasi UKS/M</h2>
          <p>Daftar penerima Peringkat I–III tingkat kabupaten. Sekolah pada daftar ini tidak diperkenankan mengisi penilaian mandiri kembali.</p>
        </div>
        <button className="btn" onClick={() => setForm({ ...kosong })}>+ Tambah Peraih</button>
      </div>

      <div className="cakupan-ringkas">
        <div><span className="ck-n">{res.ringkas.semua}</span><span className="ck-l">Total peraih terdata</span></div>
        <div><span className="ck-n">{res.ringkas.tertaut}</span><span className="ck-l">Tertaut ke akun sekolah</span></div>
        <div><span className="ck-n">{res.ringkas.belumTerdaftar}</span><span className="ck-l">Belum terdaftar di aplikasi</span></div>
        <div><span className="ck-n">{res.ringkas.dikecualikan}</span><span className="ck-l">Larangan dicabut</span></div>
      </div>

      <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '12px 16px' }}>
        <select value={saring.tahun} onChange={(e) => ubahSaring('tahun', e.target.value)} style={{ width: 'auto' }}>
          <option value="">Semua tahun</option>
          {res.tahun.map((t) => <option key={t.tahun} value={t.tahun}>{t.tahun} ({t.jumlah})</option>)}
        </select>
        <select value={saring.jenjang} onChange={(e) => ubahSaring('jenjang', e.target.value)} style={{ width: 'auto' }}>
          <option value="">Semua jenjang</option>{JENJANG.map((j) => <option key={j}>{j}</option>)}
        </select>
        <select value={saring.tertaut} onChange={(e) => ubahSaring('tertaut', e.target.value)} style={{ width: 'auto' }}>
          <option value="">Semua status</option><option value="1">Tertaut ke akun</option><option value="0">Belum terdaftar</option>
        </select>
        <form onSubmit={(e) => { e.preventDefault(); ubahSaring('q', q.trim()); }} style={{ display: 'flex', gap: 6 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama sekolah…" /><button className="btn sm secondary">Cari</button>
        </form>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Tahun</th><th>Peringkat</th><th>Jenjang</th><th>Sekolah</th><th>Kecamatan</th><th>Strata Akhir</th><th>Status di Aplikasi</th><th>Larangan</th><th></th></tr></thead>
            <tbody>
              {res.data.map((p) => {
                const [rom, warna] = PERINGKAT[p.peringkat] || ['-', 'gray'];
                return (
                  <tr key={p.id}>
                    <td>{p.tahun}</td>
                    <td><span className={`badge ${warna}`}>Peringkat {rom}</span></td>
                    <td>{p.jenjang}</td>
                    <td><b>{p.nama}</b>{p.catatan && <div className="muted" style={{ fontSize: 12 }}>{p.catatan}</div>}</td>
                    <td>{p.kecamatan || <span className="muted">-</span>}</td>
                    <td>
                      <select value={p.strataAkhir || ''} onChange={(e) => ubahStrata(p, e.target.value)} style={{ width: 'auto', minWidth: 130 }} aria-label={`Strata akhir ${p.nama}`}>
                        <option value="">— belum dipilih —</option>
                        {STRATA_PILIHAN.map((st) => <option key={st} value={st}>{STRATA_LABEL[st]}</option>)}
                      </select>
                    </td>
                    <td>
                      {p.satuan
                        ? <><span className="badge green">Tertaut</span><div className="muted" style={{ fontSize: 12 }}>{p.satuan.nama}</div></>
                        : <span className="badge gray">Belum terdaftar</span>}
                    </td>
                    <td>{p.berlakuLarangan ? <span className="badge red">Berlaku</span> : <span className="badge gray">Dicabut</span>}</td>
                    <td className="aksi-baris">
                      <button className="btn sm secondary" onClick={() => { setTaut(p); setCari({ teks: '', hasil: [] }); }}>{p.satuan ? 'Ubah tautan' : 'Tautkan'}</button>
                      <button className="btn sm secondary" onClick={() => setForm({ id: p.id, nama: p.nama, jenjang: p.jenjang, tahun: p.tahun, peringkat: p.peringkat, kecamatanId: p.kecamatanId || '', strataAkhir: p.strataAkhir || '', catatan: p.catatan || '' })}>Edit</button>
                      <button className={`btn sm ${p.berlakuLarangan ? 'red' : ''}`} onClick={() => ubahLarangan(p)}>{p.berlakuLarangan ? 'Cabut larangan' : 'Berlakukan'}</button>
                      <button className="btn sm red" onClick={() => hapus(p)}>Hapus</button>
                    </td>
                  </tr>
                );
              })}
              {!res.data.length && <tr><td colSpan={9} className="center muted">Tidak ada data yang cocok dengan saringan.</td></tr>}
            </tbody>
          </table>
        </div>
        <Paginasi res={res} label="peraih" onPage={(p) => setHal({ ...hal, page: p })} onPageSize={(n) => setHal({ page: 1, pageSize: n })} />
      </div>

      {form && (
        <div className="modal-bg" onClick={(e) => { if (e.target.className === 'modal-bg') setForm(null); }}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="row-between mb"><h3 style={{ margin: 0 }}>{form.id ? 'Edit' : 'Tambah'} Peraih Penghargaan</h3><button className="btn sm secondary" onClick={() => setForm(null)}>Tutup</button></div>
            <div className="field"><label>Nama Sekolah</label><input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="mis. SDN CIBUNTU 01 CIBITUNG" /></div>
            <div className="form-row">
              <div className="field"><label>Jenjang</label><select value={form.jenjang} onChange={(e) => setForm({ ...form, jenjang: e.target.value })}>{JENJANG.map((j) => <option key={j}>{j}</option>)}</select></div>
              <div className="field"><label>Kecamatan</label><select value={form.kecamatanId} onChange={(e) => setForm({ ...form, kecamatanId: e.target.value })}><option value="">-- pilih --</option>{kecamatan.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}</select></div>
            </div>
            <div className="form-row">
              <div className="field"><label>Tahun</label><input type="number" value={form.tahun} onChange={(e) => setForm({ ...form, tahun: e.target.value })} /></div>
              <div className="field"><label>Peringkat</label><select value={form.peringkat} onChange={(e) => setForm({ ...form, peringkat: Number(e.target.value) })}><option value={1}>I</option><option value={2}>II</option><option value={3}>III</option></select></div>
            </div>
            <div className="field">
              <label>Strata Akhir (dipilih manual)</label>
              <select value={form.strataAkhir || ''} onChange={(e) => setForm({ ...form, strataAkhir: e.target.value })}>
                <option value="">— belum dipilih —</option>
                {STRATA_PILIHAN.map((st) => <option key={st} value={st}>{STRATA_LABEL[st]}</option>)}
              </select>
            </div>
            <div className="field"><label>Catatan (opsional)</label><input value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} /></div>
            <button className="btn" onClick={simpan} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</button>
          </div>
        </div>
      )}

      {taut && (
        <div className="modal-bg" onClick={(e) => { if (e.target.className === 'modal-bg') setTaut(null); }}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="row-between mb"><h3 style={{ margin: 0 }}>Tautkan ke Sekolah Terdaftar</h3><button className="btn sm secondary" onClick={() => setTaut(null)}>Tutup</button></div>
            <p className="muted" style={{ marginTop: 0 }}>
              <b>{taut.nama}</b> — Peringkat {taut.peringkat} tahun {taut.tahun}.
              Penautan dilakukan otomatis saat nama & kecamatan cocok; gunakan pencarian ini bila penulisan namanya berbeda.
            </p>
            {taut.satuan && (
              <div className="alert info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>Saat ini tertaut ke <b>{taut.satuan.nama}</b></span>
                <button className="btn sm secondary" onClick={() => tautkan(null)}>Lepas tautan</button>
              </div>
            )}
            <div className="field"><label>Cari sekolah terdaftar</label><input autoFocus value={cari.teks} onChange={(e) => cariSekolah(e.target.value)} placeholder="ketik minimal 2 huruf…" /></div>
            <div className="demo-daftar">
              {cari.hasil.map((s) => (
                <button type="button" key={s.id} className="demo-baris" onClick={() => tautkan(s.id)}>
                  <code>{s.jenjang}</code><span className="demo-ket">{s.nama}{s.kecamatan ? ` · ${s.kecamatan}` : ''}</span>
                </button>
              ))}
              {cari.teks.trim().length >= 2 && !cari.hasil.length && <div className="muted" style={{ fontSize: 12.5 }}>Tidak ada sekolah terdaftar yang cocok.</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
