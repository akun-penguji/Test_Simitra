import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useUI } from '../../ui.jsx';
import { Spinner, Alert } from '../../lib.jsx';

// Penomoran dokumen SIMITRA dikelola di sini agar formatnya dapat disesuaikan
// tata naskah dinas tanpa mengubah kode aplikasi.
const KETERANGAN_PENANDA = [
  ['{tahun}', 'tahun berjalan, mis. 2026'],
  ['{bulan}', 'bulan dua angka, mis. 10'],
  ['{bulanRomawi}', 'bulan angka romawi, mis. X'],
  ['{urut}', 'nomor urut dokumen (wajib ada)'],
];

export default function PengaturanNomor() {
  const { toast } = useUI();
  const [list, setList] = useState(null);
  const [form, setForm] = useState({}); // jenis -> { pola, urutMulai, digit }
  const [busy, setBusy] = useState(null);

  async function load() {
    const data = await api.get('/kabupaten/pengaturan-nomor');
    setList(data);
    const f = {};
    for (const p of data) f[p.jenis] = { pola: p.pola, urutMulai: p.urutMulai, digit: p.digit };
    setForm(f);
  }
  useEffect(() => { load(); }, []);

  function ubah(jenis, k, v) { setForm((f) => ({ ...f, [jenis]: { ...f[jenis], [k]: v } })); }

  // Pratinjau dihitung di sisi peramban agar perubahan langsung terlihat
  function pratinjau(jenis) {
    const f = form[jenis]; if (!f) return '-';
    const kini = new Date();
    const romawi = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    const digit = Math.max(1, Math.min(8, Number(f.digit) || 1));
    return String(f.pola || '')
      .replaceAll('{tahun}', String(kini.getFullYear()))
      .replaceAll('{bulan}', String(kini.getMonth() + 1).padStart(2, '0'))
      .replaceAll('{bulanRomawi}', romawi[kini.getMonth()])
      .replaceAll('{urut}', String(Math.max(1, Number(f.urutMulai) || 1)).padStart(digit, '0'));
  }

  async function simpan(jenis) {
    const f = form[jenis];
    if (!f?.pola?.includes('{urut}')) { toast('Pola wajib memuat {urut} agar nomor tidak kembar.', 'error'); return; }
    setBusy(jenis);
    try {
      await api.put(`/kabupaten/pengaturan-nomor/${jenis}`, {
        pola: f.pola, urutMulai: Number(f.urutMulai) || 1, digit: Number(f.digit) || 4,
      });
      toast('Pengaturan nomor tersimpan.', 'success');
      await load();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  }

  if (!list) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <h2>Pengaturan Nomor Surat</h2>
        <p>Atur format penomoran sertifikat dan pendaftaran peserta seleksi.</p>
      </div>

      <Alert type="info">
        Penanda yang tersedia:{' '}
        {KETERANGAN_PENANDA.map(([k, v], i) => (
          <span key={k}>{i > 0 && ' · '}<b>{k}</b> = {v}</span>
        ))}
      </Alert>

      {list.map((p) => (
        <div className="card" key={p.jenis}>
          <div className="row-between mb">
            <h3 style={{ margin: 0 }}>{p.nama}</h3>
            <span className="badge gray">{p.jenis}</span>
          </div>
          <div className="form-row">
            <div className="field" style={{ flex: 2 }}>
              <label>Pola Nomor *</label>
              <input value={form[p.jenis]?.pola || ''} onChange={(e) => ubah(p.jenis, 'pola', e.target.value)}
                placeholder="SRT/UKSM-BKS/{tahun}/{urut}" />
            </div>
            <div className="field">
              <label>Mulai dari Nomor</label>
              <input type="number" min="1" value={form[p.jenis]?.urutMulai ?? 1}
                onChange={(e) => ubah(p.jenis, 'urutMulai', e.target.value)} />
            </div>
            <div className="field">
              <label>Jumlah Digit</label>
              <input type="number" min="1" max="8" value={form[p.jenis]?.digit ?? 4}
                onChange={(e) => ubah(p.jenis, 'digit', e.target.value)} />
            </div>
          </div>
          <div className="row-between" style={{ gap: 10, flexWrap: 'wrap' }}>
            <span className="muted">
              Contoh hasil: <b style={{ color: 'var(--green-dark)' }}>{pratinjau(p.jenis)}</b>
              {p.diubahOleh && <> · terakhir diubah oleh {p.diubahOleh}</>}
            </span>
            <button className="btn" disabled={busy === p.jenis} onClick={() => simpan(p.jenis)}>
              {busy === p.jenis ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      ))}

      <div className="card">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Perubahan pola hanya berlaku untuk dokumen yang diterbitkan setelah pengaturan disimpan.
          Nomor dokumen yang sudah terbit tidak berubah. Bila nomor hasil pola sudah terpakai,
          sistem otomatis memakai nomor urut berikutnya agar tidak kembar.
        </p>
      </div>
    </>
  );
}
