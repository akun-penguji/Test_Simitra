// Peta Puskesmas Binaan (notulen Sep 2026) — permintaan pihak Puskesmas:
// lokasi tiap puskesmas, sekolah binaannya, dan capaian strata sekolah tersebut.
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useUI } from '../ui.jsx';
import { Spinner, Alert } from '../lib.jsx';
import { BEKASI_CENTER, STRATA_COLOR, STRATA_LABEL, titikIcon, puskesmasIcon, FitBounds, MapPicker, OPSI_GUGUS, ikonGugusPuskesmas } from '../map.jsx';

// Pada tampilan jauh, titik sekolah disembunyikan: jaraknya dengan penanda
// puskesmas belum cukup sehingga keduanya saling bersinggungan. Titik sekolah
// muncul saat peta diperbesar (zoom ≥ 14) atau saat sebuah puskesmas dipilih —
// pada kedua keadaan itu peta sudah cukup renggang.
const ZOOM_SEKOLAH = 14;

const URUT = ['PARIPURNA', 'UTAMA', 'MADYA', 'DASAR'];
const namaPusk = (n) => (/^puskesmas\b/i.test(n || '') ? n : `Puskesmas ${n}`);

// Penanda puskesmas ditempatkan pada lapisan (pane) tersendiri di atas lapisan
// penanda sekolah, sehingga tidak pernah tertutup pin maupun gugus sekolah.
function LapisanPuskesmas() {
  const map = useMap();
  useEffect(() => {
    if (!map.getPane('puskesmas')) {
      const pane = map.createPane('puskesmas');
      pane.style.zIndex = 650;
    }
  }, [map]);
  return null;
}

// Bila titik sekolah jatuh tepat di penanda puskesmasnya (koordinat nyaris sama),
// titik itu digeser mendatar secukupnya agar keduanya tetap terbaca. Pergeseran
// hanya tampilan — beberapa belas piksel — dan dihitung ulang tiap peta bergerak.
function HindariTumpang({ kunci }) {
  const map = useMap();
  useEffect(() => {
    const rapikan = () => {
      const puskesmas = [...document.querySelectorAll('.pusk-pin, .gugus-pusk')];
      const sekolah = [...document.querySelectorAll('.titik-sekolah, .gugus')];
      for (const e of sekolah) e.style.marginLeft = '';
      if (!puskesmas.length) return;
      for (const e of sekolah) {
        let geser = 0;
        for (let putaran = 0; putaran < 3; putaran++) {
          const rs = e.getBoundingClientRect();
          const bentrok = puskesmas.find((p) => {
            const rp = p.getBoundingClientRect();
            return Math.min(rs.right, rp.right) - Math.max(rs.left, rp.left) > 0
              && Math.min(rs.bottom, rp.bottom) - Math.max(rs.top, rp.top) > 0;
          });
          if (!bentrok) break;
          const rp = bentrok.getBoundingClientRect();
          const lebar = Math.min(rs.right, rp.right) - Math.max(rs.left, rp.left);
          const arah = (rs.left + rs.right) / 2 <= (rp.left + rp.right) / 2 ? -1 : 1;
          geser += arah * (lebar + 5);
          e.style.marginLeft = `${geser}px`;
        }
      }
    };
    const jadwal = () => setTimeout(rapikan, 220);
    const id = jadwal();
    map.on('zoomend', jadwal); map.on('moveend', jadwal); map.on('layeradd', jadwal);
    return () => { clearTimeout(id); map.off('zoomend', jadwal); map.off('moveend', jadwal); map.off('layeradd', jadwal); };
  }, [map, kunci]);
  return null;
}

function PantauZoom({ onUbah }) {
  const map = useMap();
  useEffect(() => { onUbah(map.getZoom()); }, []);
  useMapEvents({ zoomend: (e) => onUbah(e.target.getZoom()) });
  return null;
}

function Fokus({ titik }) {
  const map = useMap();
  useEffect(() => { if (titik) map.flyTo(titik, Math.max(map.getZoom(), 14), { duration: 0.6 }); }, [titik && titik[0], titik && titik[1]]);
  return null;
}

function MiniStrata({ strata, terverifikasi }) {
  if (!terverifikasi) return <span className="muted" style={{ fontSize: 11.5 }}>Belum ada sekolah terverifikasi</span>;
  return (
    <div className="mini-strata" title={URUT.map((k) => `${STRATA_LABEL[k]}: ${strata[k]}`).join(' · ')}>
      {URUT.filter((k) => strata[k] > 0).map((k) => <i key={k} style={{ flexGrow: strata[k], background: STRATA_COLOR[k] }} />)}
    </div>
  );
}

export default function PetaPuskesmas() {
  const { user } = useAuth();
  const { toast } = useUI();
  const kab = user.role === 'TIM_KABUPATEN';
  const bolehUbah = user.isAdmin; // koordinator kecamatan / admin kabupaten
  const [kecamatan, setKecamatan] = useState([]);
  const [kecId, setKecId] = useState('');
  const [d, setD] = useState(null);
  const [pilih, setPilih] = useState(null); // id puskesmas terpilih
  const [ubah, setUbah] = useState(null);   // {id,nama,lat,lng,alamat}
  const [sibuk, setSibuk] = useState(false);
  const [zoom, setZoom] = useState(11);

  const path = kab ? `/kabupaten/puskesmas-binaan${kecId ? `?kecamatanId=${kecId}` : ''}` : '/kecamatan/puskesmas-binaan';
  async function load() { setD(await api.get(path)); }
  useEffect(() => { if (kab) api.get('/kabupaten/kecamatan').then(setKecamatan).catch(() => {}); }, []);
  useEffect(() => { setD(null); setPilih(null); load(); }, [path]);

  const puskMap = useMemo(() => Object.fromEntries((d?.puskesmas || []).map((p) => [p.id, p])), [d]);
  if (!d) return <Spinner />;

  const sekolahDekat = zoom >= ZOOM_SEKOLAH || !!pilih; // tampil saat diperbesar / puskesmas dipilih
  const sekolahTampil = sekolahDekat ? d.sekolah.filter((s) => s.lat != null && (!pilih || s.puskesmasId === pilih)) : [];
  const puskTampil = d.puskesmas.filter((p) => p.lat != null && (!pilih || p.id === pilih));
  const garis = sekolahTampil
    .filter((s) => s.puskesmasId && puskMap[s.puskesmasId]?.lat != null)
    .map((s) => ({ id: s.id, pos: [[puskMap[s.puskesmasId].lat, puskMap[s.puskesmasId].lng], [s.lat, s.lng]] }));
  const titikFit = [...puskTampil.map((p) => ({ id: `p${p.id}`, lat: p.lat, lng: p.lng })), ...sekolahTampil.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng }))];
  const terpilih = pilih ? puskMap[pilih] : null;
  const tanpaLokasi = d.puskesmas.filter((p) => p.lat == null);

  async function simpanLokasi() {
    setSibuk(true);
    try {
      await api.put(`${kab ? '/kabupaten' : '/kecamatan'}/puskesmas/${ubah.id}/lokasi`, { lat: ubah.lat, lng: ubah.lng, alamat: ubah.alamat });
      toast('Lokasi puskesmas tersimpan.', 'success'); setUbah(null); await load();
    } catch (e) { toast(e.message, 'error'); } finally { setSibuk(false); }
  }

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Peta Puskesmas Binaan</h2>
          <p>{kab ? 'Puskesmas se-Kabupaten Bekasi' : `Puskesmas di Kecamatan ${user.kecamatan?.nama}`} beserta sekolah binaan dan capaian strata terverifikasi.</p>
        </div>
        {kab && (
          <select value={kecId} onChange={(e) => setKecId(e.target.value)} style={{ minWidth: 220 }}>
            <option value="">Semua kecamatan</option>
            {kecamatan.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
          </select>
        )}
      </div>

      {tanpaLokasi.length > 0 && (
        <Alert type="info">
          {tanpaLokasi.length} dari {d.puskesmas.length} puskesmas belum memiliki titik lokasi di peta
          {bolehUbah ? ' — klik "Atur lokasi" pada daftar di bawah peta untuk menandainya.' : ' — koordinator kecamatan dapat menandainya.'}
          {d.tanpaPuskesmas > 0 && <> · {d.tanpaPuskesmas} sekolah belum memilih puskesmas binaan pada profilnya.</>}
        </Alert>
      )}

      <div className="card" style={{ padding: 8 }}>
        <div className="peta-legenda">
          <span><i className="lg-pusk">+</i> Puskesmas</span>
          {URUT.map((k) => <span key={k}><i className="lg-dot" style={{ background: STRATA_COLOR[k] }} />{STRATA_LABEL[k]}</span>)}
          <span><i className="lg-dot" style={{ background: '#64748b' }} />Belum terverifikasi</span>
          <span><i className="lg-garis" />Hubungan binaan</span>
          {!sekolahDekat && <span className="muted">Titik sekolah tampil saat peta diperbesar atau puskesmas dipilih</span>}
          {terpilih && <button className="btn sm secondary" onClick={() => setPilih(null)}>Tampilkan semua puskesmas</button>}
        </div>
        <MapContainer center={BEKASI_CENTER} zoom={11} style={{ height: 520, borderRadius: 10 }} scrollWheelZoom>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
          <FitBounds points={titikFit} />
          <LapisanPuskesmas />
          <PantauZoom onUbah={setZoom} />
          <HindariTumpang kunci={`${sekolahTampil.length}-${puskTampil.length}-${pilih || ''}`} />
          <Fokus titik={terpilih?.lat != null ? [terpilih.lat, terpilih.lng] : null} />
          {garis.map((g) => <Polyline key={g.id} positions={g.pos} pathOptions={{ color: '#334155', weight: 1.5, opacity: 0.35 }} />)}
          <MarkerClusterGroup {...OPSI_GUGUS}>
          {sekolahTampil.map((s) => (
            <Marker key={s.id} position={[s.lat, s.lng]} icon={titikIcon(s.strata ? STRATA_COLOR[s.strata] : '#64748b')}>
              <Popup>
                <b>{s.nama}</b><br />{s.jenjang}{kab && s.kecamatan ? ` · ${s.kecamatan}` : ''}<br />
                Puskesmas: {puskMap[s.puskesmasId]?.nama || <i>belum dipilih</i>}<br />
                Strata: <b style={{ color: s.strata ? STRATA_COLOR[s.strata] : '#64748b' }}>{s.strata ? STRATA_LABEL[s.strata] : (s.terverifikasi ? 'Belum mencapai Dasar' : 'Belum terverifikasi')}</b>
              </Popup>
            </Marker>
          ))}
          </MarkerClusterGroup>
          <MarkerClusterGroup {...OPSI_GUGUS} iconCreateFunction={ikonGugusPuskesmas} clusterPane="puskesmas" maxClusterRadius={40}>
          {puskTampil.map((p) => (
            <Marker key={p.id} position={[p.lat, p.lng]} icon={puskesmasIcon(p.id === pilih)} pane="puskesmas"
              eventHandlers={{ click: () => setPilih(p.id) }}>
              <Popup>
                <b>{namaPusk(p.nama)}</b><br />{p.alamat || (kab ? `Kec. ${p.kecamatan}` : '')}{(p.alamat || kab) && <br />}
                {p.jumlahSekolah} sekolah binaan · {p.terverifikasi} terverifikasi
              </Popup>
            </Marker>
          ))}
          </MarkerClusterGroup>
        </MapContainer>
      </div>

      <div className="pusk-grid">
        {d.puskesmas.map((p) => (
          <div key={p.id} className={`pusk-kartu ${p.id === pilih ? 'aktif' : ''}`}>
            <button type="button" className="pusk-kepala" onClick={() => setPilih(p.id === pilih ? null : p.id)}>
              <i className="lg-pusk">+</i>
              <span><b>{namaPusk(p.nama)}</b>{kab && !kecId && <span className="muted"> · {p.kecamatan}</span>}</span>
            </button>
            <div className="pusk-angka">
              <span><b>{p.jumlahSekolah}</b> sekolah binaan</span>
              <span><b>{p.terverifikasi}</b> terverifikasi</span>
              {p.jumlahSekolah > p.berkoordinat && <span className="muted">{p.jumlahSekolah - p.berkoordinat} tanpa titik</span>}
            </div>
            <MiniStrata strata={p.strata} terverifikasi={p.terverifikasi} />
            <div className="pusk-kaki">
              {p.lat != null
                ? <span className="muted" title={p.sumberLokasi || ''}>📍 {p.alamat || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}</span>
                : <span className="badge amber">Lokasi belum diatur</span>}
              {bolehUbah && <button className="btn sm secondary" onClick={() => setUbah({ id: p.id, nama: p.nama, lat: p.lat, lng: p.lng, alamat: p.alamat || '' })}>{p.lat != null ? 'Ubah lokasi' : 'Atur lokasi'}</button>}
            </div>
          </div>
        ))}
        {!d.puskesmas.length && <div className="card center muted">Belum ada data puskesmas untuk wilayah ini.</div>}
      </div>

      {ubah && (
        <div className="modal-bg" onClick={(e) => { if (e.target.className === 'modal-bg') setUbah(null); }}>
          <div className="modal" style={{ maxWidth: 620 }}>
            <div className="row-between mb"><h3 style={{ margin: 0 }}>Lokasi {namaPusk(ubah.nama)}</h3><button className="btn sm secondary" onClick={() => setUbah(null)}>Tutup</button></div>
            <p className="muted" style={{ marginTop: 0 }}>Klik peta atau geser penanda ke lokasi puskesmas.</p>
            <MapPicker lat={ubah.lat} lng={ubah.lng} onChange={(lat, lng) => setUbah({ ...ubah, lat, lng })} height={320} />
            <div className="form-row mt">
              <div className="field"><label>Lintang</label><input value={ubah.lat ?? ''} onChange={(e) => setUbah({ ...ubah, lat: e.target.value })} /></div>
              <div className="field"><label>Bujur</label><input value={ubah.lng ?? ''} onChange={(e) => setUbah({ ...ubah, lng: e.target.value })} /></div>
            </div>
            <div className="field"><label>Alamat (opsional)</label><input value={ubah.alamat} onChange={(e) => setUbah({ ...ubah, alamat: e.target.value })} /></div>
            <button className="btn" onClick={simpanLokasi} disabled={sibuk || ubah.lat == null || ubah.lat === ''}>{sibuk ? 'Menyimpan...' : 'Simpan Lokasi'}</button>
          </div>
        </div>
      )}
    </>
  );
}
