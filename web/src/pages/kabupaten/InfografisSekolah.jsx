import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { Spinner, Alert } from '../../lib.jsx';
import InfografisView from '../../components/InfografisView.jsx';

export default function InfografisSekolah() {
  const { satuanId } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.get(`/kabupaten/infografis/${satuanId}`).then(setD).catch((e) => setErr(e.message)); }, [satuanId]);

  if (err) return (<><div className="page-head"><h2>Infografis Sekolah</h2></div><Alert type="error">{err}</Alert></>);
  if (!d) return <Spinner />;
  return (
    <>
      <button className="btn sm secondary" style={{ marginBottom: 12 }} onClick={() => nav(-1)}>← Kembali</button>
      <InfografisView d={d} title="Infografis Profil Sekolah" sub={`Profil & pengelolaan UKS/M ${d.satuan.nama} (${d.satuan.kecamatan || '-'})`} />
    </>
  );
}
