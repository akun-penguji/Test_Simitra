import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useUI } from '../../ui.jsx';
import { Spinner, PilihCari, JENJANG_PILIHAN } from '../../lib.jsx';
import { MapPicker } from '../../map.jsx';

export default function Profil() {
  const { refresh } = useAuth();
  const { toast } = useUI();
  const setMsg = (o) => { if (o) toast(o.m, o.t); };
  const [s, setS] = useState(null);
  const [kecamatan, setKecamatan] = useState([]);
  const [puskesmas, setPuskesmas] = useState([]);
  const [busy, setBusy] = useState(false);
  const [gps, setGps] = useState(false);

  function setLatLng(lat, lng) {
    setS((prev) => ({ ...prev, latitude: Math.round(lat * 1e6) / 1e6, longitude: Math.round(lng * 1e6) / 1e6 }));
  }
  function ambilGPS() {
    if (!navigator.geolocation) { toast('Perangkat tidak mendukung GPS.', 'error'); return; }
    setGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLatLng(pos.coords.latitude, pos.coords.longitude); setGps(false); toast('Lokasi GPS berhasil diambil.', 'success'); },
      (err) => { setGps(false); toast('Gagal mengambil GPS: ' + err.message, 'error'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  useEffect(() => {
    api.get('/satuan/me').then(setS);
    api.get('/kecamatan').then(setKecamatan);
  }, []);

  // Daftar puskesmas binaan mengikuti kecamatan yang dipilih supaya pilihannya
  // tidak bercampur antar wilayah.
  useEffect(() => {
    if (!s?.kecamatanId) { setPuskesmas([]); return; }
    api.get(`/puskesmas?kecamatanId=${s.kecamatanId}`).then(setPuskesmas).catch(() => setPuskesmas([]));
  }, [s?.kecamatanId]);

  if (!s) return <Spinner />;

  function set(k, v) {
    // Berpindah kecamatan mengosongkan puskesmas binaan agar tidak salah wilayah
    if (k === 'kecamatanId' && v !== s.kecamatanId) { setS({ ...s, kecamatanId: v, puskesmasId: '' }); return; }
    setS({ ...s, [k]: v });
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const updated = await api.put('/satuan/me', s);
      setS(updated);
      await refresh();
      setMsg({ t: 'success', m: updated.profilLengkap ? 'Profil tersimpan & lengkap. Anda dapat melanjutkan ke penilaian mandiri.' : 'Profil tersimpan. Lengkapi field wajib (NPSN, alamat, kepala sekolah) untuk melanjutkan.' });
    } catch (err) { setMsg({ t: 'error', m: err.message }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="page-head">
        <h2>Profil Satuan Pendidikan</h2>
        <p>Langkah 1 — Lengkapi data profil sekolah/madrasah Anda.</p>
      </div>

      <form onSubmit={save} className="card" style={{ maxWidth: 760 }}>
        <div className="form-row">
          <div className="field"><label>Nama Satuan Pendidikan *</label><input value={s.nama || ''} onChange={(e) => set('nama', e.target.value)} required /></div>
          <div className="field"><label>NPSN *</label><input value={s.npsn || ''} onChange={(e) => set('npsn', e.target.value)} placeholder="8 digit" /></div>
        </div>
        <div className="form-row">
          <div className="field">
            <label>Jenjang *</label>
            <select value={s.jenjang} onChange={(e) => set('jenjang', e.target.value)}>
              {JENJANG_PILIHAN.map((j) => <option key={j}>{j}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Kecamatan *</label>
            <select value={s.kecamatanId} onChange={(e) => set('kecamatanId', e.target.value)}>
              {kecamatan.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Puskesmas Binaan</label>
          <PilihCari
            pilihan={puskesmas.map((p) => ({ id: p.id, nama: p.nama, keterangan: p.alamat || undefined }))}
            nilai={s.puskesmasId || ''}
            onChange={(v) => set('puskesmasId', v)}
            placeholder="-- pilih puskesmas binaan --"
            kosong={s.kecamatanId ? 'Belum ada puskesmas terdata di kecamatan ini.' : 'Pilih kecamatan terlebih dahulu.'}
          />
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
            Pilihan hanya memuat puskesmas di kecamatan {kecamatan.find((k) => k.id === s.kecamatanId)?.nama || 'yang dipilih'} — ketik untuk mencari.
          </p>
        </div>

        {/* Lokasi Sekolah (koordinat) */}
        <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0 16px', paddingTop: 14 }}>
          <div className="row-between mb">
            <label style={{ margin: 0, fontSize: 14 }}>📍 Lokasi Sekolah (Koordinat)</label>
            <button type="button" className="btn sm blue" onClick={ambilGPS} disabled={gps}>{gps ? 'Mengambil...' : '📡 Ambil Lokasi GPS'}</button>
          </div>
          <div className="form-row">
            <div className="field"><label>Latitude</label><input value={s.latitude ?? ''} onChange={(e) => set('latitude', e.target.value)} placeholder="-6.2417" /></div>
            <div className="field"><label>Longitude</label><input value={s.longitude ?? ''} onChange={(e) => set('longitude', e.target.value)} placeholder="107.1517" /></div>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>Isi otomatis via tombol GPS, atau klik / geser penanda pada peta di bawah untuk menentukan lokasi.</p>
          <MapPicker lat={s.latitude} lng={s.longitude} onChange={setLatLng} height={300} />
        </div>
        <div className="field"><label>Alamat *</label><textarea rows={2} value={s.alamat || ''} onChange={(e) => set('alamat', e.target.value)} /></div>
        <div className="form-row">
          <div className="field"><label>Kepala Sekolah *</label><input value={s.kepalaSekolah || ''} onChange={(e) => set('kepalaSekolah', e.target.value)} /></div>
          <div className="field"><label>Pembina UKS/M</label><input value={s.pembinaUks || ''} onChange={(e) => set('pembinaUks', e.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="field"><label>Telepon</label><input value={s.telepon || ''} onChange={(e) => set('telepon', e.target.value)} /></div>
          <div className="field"><label>Email Sekolah</label><input value={s.emailSekolah || ''} onChange={(e) => set('emailSekolah', e.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="field"><label>Jumlah Siswa</label><input type="number" value={s.jumlahSiswa || ''} onChange={(e) => set('jumlahSiswa', e.target.value)} /></div>
          <div className="field"><label>Jumlah Guru</label><input type="number" value={s.jumlahGuru || ''} onChange={(e) => set('jumlahGuru', e.target.value)} /></div>
        </div>
        <button className="btn" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Profil'}</button>
      </form>
    </>
  );
}
