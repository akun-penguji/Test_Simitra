import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const ICON = { success: '✅', warning: '⚠️', info: 'ℹ️' };

function waktuLalu(d) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return 'baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

export default function NotifBell() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], unread: 0 });
  const ref = useRef(null);

  async function load() {
    try { setData(await api.get('/notifikasi?page=1&pageSize=20')); } catch (_) {}
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => { clearInterval(t); document.removeEventListener('mousedown', onClick); };
  }, []);

  async function buka(n) {
    if (!n.dibaca) { await api.post(`/notifikasi/${n.id}/baca`); load(); }
    setOpen(false);
    if (n.link) nav(n.link);
  }
  async function bacaSemua() { await api.post('/notifikasi/baca-semua'); load(); }

  return (
    <div className="notif-wrap" ref={ref}>
      <button className="notif-bell" onClick={() => { setOpen((o) => !o); if (!open) load(); }} title="Notifikasi">
        🔔{data.unread > 0 && <span className="notif-badge">{data.unread > 99 ? '99+' : data.unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <b>Notifikasi</b>
            {data.unread > 0 && <button onClick={bacaSemua}>Tandai semua dibaca</button>}
          </div>
          <div className="notif-list">
            {data.items.length === 0 && <div className="notif-empty">Belum ada notifikasi.</div>}
            {data.items.map((n) => (
              <div key={n.id} className={`notif-item ${n.dibaca ? '' : 'unread'}`} onClick={() => buka(n)}>
                <span className="notif-ic">{ICON[n.tipe] || 'ℹ️'}</span>
                <div className="notif-body">
                  <div className="notif-title">{n.judul}</div>
                  <div className="notif-msg">{n.pesan}</div>
                  <div className="notif-time">{waktuLalu(n.createdAt)}</div>
                </div>
                {!n.dibaca && <span className="notif-dot" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
