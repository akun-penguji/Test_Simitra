import { useState } from 'react';
import { api } from '../api.js';
import { useUI } from '../ui.jsx';

export default function UbahPassword({ onClose }) {
  const { toast } = useUI();
  const [lama, setLama] = useState('');
  const [baru, setBaru] = useState('');
  const [konf, setKonf] = useState('');
  const [busy, setBusy] = useState(false);

  async function simpan() {
    if (baru.length < 6) { toast('Password baru minimal 6 karakter.', 'error'); return; }
    if (baru !== konf) { toast('Konfirmasi password tidak cocok.', 'error'); return; }
    setBusy(true);
    try {
      await api.post('/auth/ubah-password', { lama, baru });
      toast('Password berhasil diubah.', 'success');
      onClose();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target.className === 'modal-bg') onClose(); }}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="row-between mb"><h3 style={{ margin: 0 }}>Ubah Password</h3><button className="btn sm secondary" onClick={onClose}>Tutup</button></div>
        <div className="field"><label>Password Lama</label><input type="password" value={lama} onChange={(e) => setLama(e.target.value)} /></div>
        <div className="field"><label>Password Baru (min. 6 karakter)</label><input type="password" value={baru} onChange={(e) => setBaru(e.target.value)} /></div>
        <div className="field"><label>Konfirmasi Password Baru</label><input type="password" value={konf} onChange={(e) => setKonf(e.target.value)} /></div>
        <button className="btn" onClick={simpan} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </div>
  );
}
