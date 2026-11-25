import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { useUI } from './ui.jsx';
import { api } from './api.js';
import { Spinner } from './lib.jsx';
import Login from './pages/Login.jsx';
import PetaSebaran from './pages/PetaSebaran.jsx';
import Riwayat from './pages/Riwayat.jsx';
import NotifBell from './components/NotifBell.jsx';
import UbahPassword from './components/UbahPassword.jsx';
import JadwalProgram from './components/JadwalProgram.jsx';
import Berita from './pages/Berita.jsx';
import PetaPuskesmas from './pages/PetaPuskesmas.jsx';

// Sekolah
import SekolahDashboard from './pages/sekolah/Dashboard.jsx';
import Profil from './pages/sekolah/Profil.jsx';
import PenilaianMandiri from './pages/sekolah/PenilaianMandiri.jsx';
import HasilStrata from './pages/sekolah/HasilStrata.jsx';
import EvidenSekolah from './pages/sekolah/Eviden.jsx';
import DokumenSekolah from './pages/sekolah/Dokumen.jsx';
import InfografisSekolah from './pages/sekolah/Infografis.jsx';

// Kecamatan
import KecDashboard from './pages/kecamatan/Dashboard.jsx';
import KecVerifikasi from './pages/kecamatan/Verifikasi.jsx';
import KecRekomendasi from './pages/kecamatan/Rekomendasi.jsx';
import KecSuratRekomendasi from './pages/kecamatan/SuratRekomendasi.jsx';
import KecTim from './pages/kecamatan/Tim.jsx';

// Kabupaten
import KabDashboard from './pages/kabupaten/Dashboard.jsx';
import KabPenilaian from './pages/kabupaten/DataAwal.jsx';
import KabReview from './pages/kabupaten/ReviewEviden.jsx';
import KabSeleksi from './pages/kabupaten/Seleksi.jsx';
import KabKunjungan from './pages/kabupaten/Kunjungan.jsx';
import KabFinal from './pages/kabupaten/Final.jsx';
import KabStrataAkhir from './pages/kabupaten/StrataAkhir.jsx';
import KabSuratRekomendasi from './pages/kabupaten/SuratRekomendasi.jsx';
import KabPengaturanSertifikat from './pages/kabupaten/PengaturanSertifikat.jsx';
import KabRekap from './pages/kabupaten/RekapLaporan.jsx';
import KabAkun from './pages/kabupaten/ManajemenAkun.jsx';
import KabInstrumen from './pages/kabupaten/MasterInstrumen.jsx';
import KabPeriode from './pages/kabupaten/Periode.jsx';
import KabSekolah from './pages/kabupaten/MasterSekolah.jsx';
import KabPeraih from './pages/kabupaten/PeraihPenghargaan.jsx';
import KabLogAudit from './pages/kabupaten/LogAudit.jsx';
import KabNomor from './pages/kabupaten/PengaturanNomor.jsx';
import KabInfografisSekolah from './pages/kabupaten/InfografisSekolah.jsx';

const NAV = {
  SATUAN_PENDIDIKAN: [
    { group: 'Utama', items: [
      { to: '/', label: 'Beranda', icon: '🏠', end: true },
      { to: '/infografis', label: 'Infografis Profil', icon: '📊' },
      { to: '/profil', label: 'Profil Sekolah', icon: '🏫' },
    ] },
    { group: 'Proses Stratifikasi', items: [
      { to: '/penilaian', label: 'Penilaian Mandiri', icon: '📝' },
      { to: '/hasil-strata', label: 'Hasil Strata', icon: '🏅' },
      { to: '/eviden', label: 'Eviden Stratifikasi', icon: '📎' },
      { to: '/dokumen', label: 'Sertifikat', icon: '📜' },
    ] },
    { group: 'Lainnya', items: [
      { to: '/informasi', label: 'Informasi & Berita', icon: '📰' },
      { to: '/riwayat', label: 'Riwayat Progres', icon: '🕒' },
    ] },
  ],
  TP_KECAMATAN: [
    { group: 'Utama', items: [
      { to: '/', label: 'Beranda', icon: '🏠', end: true },
      { to: '/tim', label: 'Tim Penilai', icon: '👥' },
      { to: '/informasi', label: 'Informasi & Berita', icon: '📰' },
    ] },
    { group: 'Sertifikasi Strata', items: [
      { to: '/verifikasi', label: 'Verifikasi Penilaian', icon: '✅' },
      { to: '/rekomendasi', label: 'Rekomendasi Sertifikasi', icon: '📤' },
    ] },
    { group: 'Seleksi Penghargaan', items: [
      { to: '/surat-rekomendasi', label: 'Surat Rekomendasi', icon: '📨' },
    ] },
    { group: 'Monitoring', items: [
      { to: '/peta', label: 'Peta Sebaran', icon: '🗺️' },
      { to: '/peta-puskesmas', label: 'Peta Puskesmas Binaan', icon: '🏥' },
      { to: '/riwayat', label: 'Riwayat Progres', icon: '🕒' },
    ] },
  ],
  TIM_KABUPATEN: [
    { group: 'Utama', items: [
      { to: '/', label: 'Dashboard', icon: '📊', end: true },
      { to: '/data-awal', label: 'Data Awal Strata', icon: '🗂️' },
      { to: '/informasi', label: 'Informasi & Berita', icon: '📰' },
    ] },
    { group: 'Sertifikasi Strata', items: [
      { to: '/review', label: 'Review Eviden', icon: '🔍' },
      { to: '/surat-rekomendasi', label: 'Surat Rekomendasi Kecamatan', icon: '📨' },
    ] },
    { group: 'Seleksi Penghargaan', items: [
      { to: '/seleksi', label: 'Seleksi Administrasi', icon: '📋' },
      { to: '/kunjungan', label: 'Kunjungan Lapangan', icon: '📍' },
      { to: '/final', label: 'Hasil Pleno', icon: '🏆', admin: true },
      { to: '/strata-akhir', label: 'Finalisasi Strata Akhir', icon: '🎯' },
    ] },
    { group: 'Laporan & Monitoring', items: [
      { to: '/rekap', label: 'Rekap & Laporan', icon: '📈' },
      { to: '/peta', label: 'Peta Sebaran', icon: '🗺️' },
      { to: '/peta-puskesmas', label: 'Peta Puskesmas', icon: '🏥' },
      { to: '/riwayat', label: 'Riwayat & Log', icon: '🕒' },
    ] },
    { group: 'Master & Pengaturan', admin: true, items: [
      { to: '/sekolah', label: 'Master Sekolah', icon: '🏫' },
      { to: '/peraih', label: 'Peraih Penghargaan', icon: '🏆' },
      { to: '/instrumen', label: 'Master Instrumen', icon: '📚' },
      { to: '/periode', label: 'Periode', icon: '🗓️' },
      { to: '/nomor-surat', label: 'Nomor Surat', icon: '🔢' },
      { to: '/pengaturan-sertifikat', label: 'Pengaturan Sertifikat', icon: '🖋️' },
      { to: '/akun', label: 'Manajemen Akun', icon: '👥' },
      { to: '/log-audit', label: 'Log Audit Keamanan', icon: '🛡️' },
    ] },
  ],
};

// Menu master & pengaturan hanya untuk Admin/Koordinator Kabupaten
const ADMIN_PATHS = ['/sekolah', '/peraih', '/instrumen', '/periode', '/nomor-surat', '/pengaturan-sertifikat', '/akun', '/log-audit'];

const ROLE_LABEL = {
  SATUAN_PENDIDIKAN: 'Satuan Pendidikan',
  TP_KECAMATAN: 'TP UKS/M Kecamatan',
  TIM_KABUPATEN: 'Tim Stratifikasi Kabupaten',
};

function Layout({ children }) {
  const { user, logout } = useAuth();
  const { confirm, toast } = useUI();
  const nav = useNavigate();
  const groups = (NAV[user.role] || [])
    .filter((g) => !g.admin || user.isAdmin)
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.admin || user.isAdmin) }));
  const [periode, setPeriode] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  useEffect(() => { api.get('/periode/aktif').then(setPeriode).catch(() => {}); }, []);

  async function doLogout() {
    const ok = await confirm({
      title: 'Keluar dari Aplikasi',
      message: `Anda akan keluar sebagai ${user.nama}. Lanjutkan?`,
      confirmText: 'Ya, Keluar',
      cancelText: 'Batal',
      variant: 'warning',
    });
    if (!ok) return;
    logout();
    nav('/');
    toast('Anda telah keluar dari aplikasi.', 'info');
  }
  return (
    <div className="app">
      <div className="mobile-topbar">
        <button className="hamburger" onClick={() => setMobileNav(true)}>☰</button>
        <img src="/logo-uks.png" alt="" className="mtb-logo" />
        <b>SIMITRA</b>
      </div>
      {mobileNav && <div className="nav-overlay" onClick={() => setMobileNav(false)} />}
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`} onClick={(e) => { if (e.target.closest('a')) setMobileNav(false); }}>
        <div className="brand">
          <div className="brand-logos-row">
            <img src="/logo-bekasi.png" alt="Kabupaten Bekasi" className="brand-logo" />
            <img src="/logo-uks.png" alt="UKS" className="brand-logo" />
          </div>
          <h1>SIMITRA</h1>
          <p>Sistem Informasi Stratifikasi UKS/M</p>
          <span className="brand-sub">Kabupaten Bekasi</span>
        </div>
        <div className="role-tag">
          {ROLE_LABEL[user.role]}
          {user.role === 'TIM_KABUPATEN' ? (user.isAdmin ? ' · Admin' : ' · Petugas') : ''}
          {user.role === 'TP_KECAMATAN' ? (user.isAdmin ? ' · Koordinator' : ` · Penilai ${user.klasifikasi?.length ? `Komponen ${user.klasifikasi.join(', ')}` : '(belum ditugaskan)'}`) : ''}
        </div>
        {periode && <div style={{ padding: '0 16px 8px', fontSize: 11.5 }}><span className="badge" style={{ background: 'rgba(255,255,255,.15)', color: '#ffe27a' }}>🗓️ {periode.nama}</span></div>}
        <nav>
          {groups.map((g) => (
            <div key={g.group} className="nav-group">
              <div className="nav-group-label">{g.group}</div>
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                  <span>{it.icon}</span> {it.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="userbox">
          <b>{user.nama}</b>
          <span className="muted">
            {user.satuanPendidikan?.nama || user.kecamatan?.nama || 'Kabupaten Bekasi'}
          </span>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button style={{ flex: 1 }} onClick={() => setShowPw(true)}>🔑 Password</button>
            <button style={{ flex: 1 }} onClick={doLogout}>⏻ Keluar</button>
          </div>
        </div>
      </aside>
      {showPw && <UbahPassword onClose={() => setShowPw(false)} />}
      <main className="main">
        <NotifBell />
        <JadwalProgram isAdmin={user.role === 'TIM_KABUPATEN' && user.isAdmin} />
        {children}
      </main>
    </div>
  );
}

function RoleRoutes({ role }) {
  const { user } = useAuth();
  const adminOnly = (el) => (user?.isAdmin ? el : <Navigate to="/" replace />);
  if (role === 'SATUAN_PENDIDIKAN') {
    return (
      <Routes>
        <Route path="/" element={<SekolahDashboard />} />
        <Route path="/infografis" element={<InfografisSekolah />} />
        <Route path="/profil" element={<Profil />} />
        <Route path="/penilaian" element={<PenilaianMandiri />} />
        <Route path="/hasil-strata" element={<HasilStrata />} />
        <Route path="/eviden" element={<EvidenSekolah />} />
        <Route path="/dokumen" element={<DokumenSekolah />} />
        <Route path="/riwayat" element={<Riwayat />} />
        <Route path="/informasi" element={<Berita />} />
        <Route path="/informasi/:id" element={<Berita />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    );
  }
  if (role === 'TP_KECAMATAN') {
    return (
      <Routes>
        <Route path="/" element={<KecDashboard />} />
        <Route path="/verifikasi" element={<KecVerifikasi />} />
        <Route path="/rekomendasi" element={<KecRekomendasi />} />
        <Route path="/surat-rekomendasi" element={<KecSuratRekomendasi />} />
        <Route path="/peta" element={<PetaSebaran />} />
        <Route path="/peta-puskesmas" element={<PetaPuskesmas />} />
        <Route path="/tim" element={<KecTim />} />
        <Route path="/riwayat" element={<Riwayat />} />
        <Route path="/informasi" element={<Berita />} />
        <Route path="/informasi/:id" element={<Berita />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/" element={<KabDashboard />} />
      <Route path="/data-awal" element={<KabPenilaian />} />
      <Route path="/review" element={<KabReview />} />
      <Route path="/seleksi" element={<KabSeleksi />} />
      <Route path="/kunjungan" element={<KabKunjungan />} />
      <Route path="/strata-akhir" element={<KabStrataAkhir />} />
      <Route path="/final" element={adminOnly(<KabFinal />)} />
      <Route path="/surat-rekomendasi" element={<KabSuratRekomendasi />} />
      <Route path="/pengaturan-sertifikat" element={adminOnly(<KabPengaturanSertifikat />)} />
      <Route path="/rekap" element={<KabRekap />} />
      <Route path="/peta" element={<PetaSebaran />} />
      <Route path="/peta-puskesmas" element={<PetaPuskesmas />} />
      <Route path="/informasi" element={<Berita />} />
      <Route path="/informasi/:id" element={<Berita />} />
      <Route path="/instrumen" element={adminOnly(<KabInstrumen />)} />
      <Route path="/periode" element={adminOnly(<KabPeriode />)} />
      <Route path="/nomor-surat" element={adminOnly(<KabNomor />)} />
      <Route path="/akun" element={adminOnly(<KabAkun />)} />
      <Route path="/sekolah" element={adminOnly(<KabSekolah />)} />
      <Route path="/peraih" element={adminOnly(<KabPeraih />)} />
      <Route path="/log-audit" element={adminOnly(<KabLogAudit />)} />
      <Route path="/infografis/:satuanId" element={<KabInfografisSekolah />} />
      <Route path="/riwayat" element={<Riwayat />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="login-wrap"><Spinner text="Memuat aplikasi..." /></div>;
  if (!user) return <Login />;
  return (
    <Layout>
      <RoleRoutes role={user.role} />
    </Layout>
  );
}
