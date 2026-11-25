import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Spinner, Alert } from '../lib.jsx';
import { SebaranMap, STRATA_COLOR, STRATA_LABEL } from '../map.jsx';

const STRATA = ['PARIPURNA', 'UTAMA', 'MADYA', 'DASAR'];

export default function PetaSebaran() {
  const { user } = useAuth();
  const [points, setPoints] = useState(null);
  const [filter, setFilter] = useState('ALL');

  const endpoint = user.role === 'TP_KECAMATAN' ? '/kecamatan/peta' : '/kabupaten/peta';
  useEffect(() => { api.get(endpoint).then(setPoints); }, []);
  if (!points) return <Spinner />;

  const shown = filter === 'ALL' ? points : points.filter((p) => (filter === 'NONE' ? !p.strata : p.strata === filter));
  const count = {};
  for (const p of points) count[p.strata || 'NONE'] = (count[p.strata || 'NONE'] || 0) + 1;

  return (
    <>
      <div className="page-head">
        <h2>Peta Sebaran Sekolah</h2>
        <p>{user.role === 'TP_KECAMATAN' ? `Sebaran satuan pendidikan di kecamatan ${user.kecamatan?.nama}` : 'Sebaran satuan pendidikan se-Kabupaten Bekasi'} berdasarkan koordinat & strata.</p>
      </div>

      {!points.length && (
        <Alert type="info">
          Peta menampilkan wilayah Kabupaten Bekasi. Titik sekolah akan muncul setelah satuan
          pendidikan mengisi koordinat lokasi (GPS/manual) pada menu <b>Profil Sekolah</b>.
        </Alert>
      )}

      {points.length > 0 && (
          <div className="card" style={{ padding: '12px 16px' }}>
            <div className="row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className={`btn sm ${filter === 'ALL' ? '' : 'secondary'}`} onClick={() => setFilter('ALL')}>Semua ({points.length})</button>
                {STRATA.map((s) => (
                  <button key={s} className={`btn sm ${filter === s ? '' : 'secondary'}`} onClick={() => setFilter(s)}
                    style={filter === s ? { background: STRATA_COLOR[s], borderColor: STRATA_COLOR[s] } : {}}>
                    <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: STRATA_COLOR[s], marginRight: 5 }} />
                    {STRATA_LABEL[s]} ({count[s] || 0})
                  </button>
                ))}
                {count.NONE > 0 && <button className={`btn sm ${filter === 'NONE' ? '' : 'secondary'}`} onClick={() => setFilter('NONE')}>Belum ada strata ({count.NONE})</button>}
              </div>
              <span className="muted" style={{ fontSize: 12.5 }}>Menampilkan {shown.length} sekolah</span>
            </div>
          </div>
      )}

      <div className="card" style={{ padding: 8 }}>
        <SebaranMap points={shown} height={560} />
      </div>
    </>
  );
}
