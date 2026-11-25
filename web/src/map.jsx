import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { useEffect } from 'react';

// Pusat default: Kabupaten Bekasi
export const BEKASI_CENTER = [-6.2417, 107.1517];

export const STRATA_COLOR = { PARIPURNA: '#1a7a3c', UTAMA: '#1e5aa8', MADYA: '#b8860b', DASAR: '#c0392b' };
export const STRATA_LABEL = { PARIPURNA: 'Paripurna', UTAMA: 'Utama', MADYA: 'Madya', DASAR: 'Dasar' };

// Pin berwarna (divIcon) tanpa aset gambar leaflet default
export function pinIcon(color = '#1a7a3c') {
  return L.divIcon({
    className: 'strata-pin',
    html: `<div style="background:${color};width:20px;height:20px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [20, 20], iconAnchor: [10, 20], popupAnchor: [0, -18],
  });
}

// Penanda puskesmas: kotak gelap berpalang putih — sengaja tidak memakai warna
// strata agar tidak tertukar dengan titik sekolah.
// Titik sekolah ringkas untuk Peta Puskesmas Binaan: jejaknya kecil sehingga
// tidak bersinggungan dengan penanda puskesmas yang letaknya berdekatan, dan
// hubungan binaan tetap terbaca lewat garis penghubung.
export function titikIcon(warna = '#64748b') {
  return L.divIcon({
    className: 'titik-sekolah',
    html: `<div style="width:12px;height:12px;border-radius:50%;background:${warna};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45)"></div>`,
    iconSize: [12, 12], iconAnchor: [6, 6], popupAnchor: [0, -8],
  });
}

// Penanda puskesmas digambar DI BAWAH titik lokasinya, sedangkan penanda sekolah
// digambar DI ATAS titiknya. Dengan begitu, puskesmas dan sekolah binaan yang
// koordinatnya nyaris sama tetap menunjuk tempat yang benar tanpa saling menimpa.
export function puskesmasIcon(aktif = false) {
  const uk = aktif ? 30 : 24;
  return L.divIcon({
    className: 'pusk-pin',
    html: `<div style="width:${uk}px;height:${uk}px;border-radius:6px;background:${aktif ? '#0f172a' : '#334155'};border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#fff;font:700 ${aktif ? 19 : 16}px/1 system-ui">+</div>`,
    iconSize: [uk, uk], iconAnchor: [uk / 2, -3], popupAnchor: [0, -4],
  });
}

// Penanda yang berdekatan digabung menjadi satu lingkaran berangka agar titik
// tidak saling menimpa; angkanya = jumlah sekolah di dalamnya. Klik untuk
// memperbesar, dan pada perbesaran maksimum titik dikembangkan (spiderfy).
export function ikonKelompok(cluster) {
  const n = cluster.getChildCount();
  const uk = n < 10 ? 34 : n < 100 ? 40 : 46;
  return L.divIcon({
    html: `<div class="gugus-isi">${n}</div>`,
    className: `gugus ${n < 10 ? 'kecil' : n < 100 ? 'sedang' : 'besar'}`,
    iconSize: L.point(uk, uk, true),
    iconAnchor: L.point(uk / 2, uk + 2, true),   // badan gugus di atas titiknya
  });
}

// Gugus khusus penanda puskesmas — bentuk persegi gelap agar tetap terbaca
// berbeda dari gugus sekolah yang berbentuk lingkaran hijau.
export function ikonGugusPuskesmas(cluster) {
  const n = cluster.getChildCount();
  const uk = n < 10 ? 32 : 38;
  return L.divIcon({
    html: `<div class="gugus-pusk-isi">${n}</div>`,
    className: 'gugus-pusk',
    iconSize: L.point(uk, uk, true),
    iconAnchor: L.point(uk / 2, -3, true),       // badan gugus puskesmas di bawah titiknya
  });
}

export const OPSI_GUGUS = {
  iconCreateFunction: ikonKelompok,
  maxClusterRadius: 48,
  showCoverageOnHover: false,
  spiderfyOnMaxZoom: true,
  spiderfyDistanceMultiplier: 1.6,
  disableClusteringAtZoom: 17,
  chunkedLoading: true,
};

// Menyesuaikan tampilan agar seluruh titik terlihat; bila belum ada titik,
// peta tetap memperlihatkan wilayah Kabupaten Bekasi.
export function FitBounds({ points }) {
  const map = useMap();
  const kunci = points.map((p) => p.id).join(',');
  useEffect(() => {
    if (!points.length) { map.setView(BEKASI_CENTER, 11); return; }
    if (points.length === 1) { map.setView([points[0].lat, points[0].lng], 14); return; }
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 15 });
  }, [kunci]);
  return null;
}

// Recenter peta bila posisi berubah
function Recenter({ pos }) {
  const map = useMap();
  useEffect(() => { if (pos) map.setView(pos, Math.max(map.getZoom(), 15)); }, [pos && pos[0], pos && pos[1]]);
  return null;
}

function ClickHandler({ onPick }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

// Pemilih lokasi (profil sekolah): klik peta / drag marker
export function MapPicker({ lat, lng, onChange, height = 300 }) {
  const pos = (lat != null && lng != null) ? [Number(lat), Number(lng)] : null;
  return (
    <MapContainer center={pos || BEKASI_CENTER} zoom={pos ? 15 : 11} style={{ height, borderRadius: 10 }} scrollWheelZoom>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
      <ClickHandler onPick={onChange} />
      <Recenter pos={pos} />
      {pos && (
        <Marker position={pos} icon={pinIcon('#1a7a3c')} draggable
          eventHandlers={{ dragend: (e) => { const m = e.target.getLatLng(); onChange(m.lat, m.lng); } }}>
          <Popup>Lokasi sekolah</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}

// Peta sebaran sekolah
export function SebaranMap({ points, height = 560 }) {
  const valid = points.filter((p) => p.lat != null && p.lng != null);
  return (
    <MapContainer center={BEKASI_CENTER} zoom={11} style={{ height, borderRadius: 12 }} scrollWheelZoom>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
      <FitBounds points={valid} />
      <MarkerClusterGroup {...OPSI_GUGUS}>
        {valid.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={pinIcon(STRATA_COLOR[p.strata] || '#64748b')}>
            <Popup>
              <b>{p.nama}</b><br />
              {p.jenjang}{p.kecamatan ? ` · ${p.kecamatan}` : ''}<br />
              {p.puskesmas ? <>Puskesmas: {p.puskesmas}<br /></> : null}
              Strata: <b style={{ color: STRATA_COLOR[p.strata] || '#64748b' }}>{p.strata ? STRATA_LABEL[p.strata] : 'Belum ada'}</b>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
