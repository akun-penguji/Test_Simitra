import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Spinner } from '../../lib.jsx';
import InfografisView from '../../components/InfografisView.jsx';

export default function Infografis() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get('/satuan/infografis').then(setD); }, []);
  if (!d) return <Spinner />;
  return <InfografisView d={d} />;
}
