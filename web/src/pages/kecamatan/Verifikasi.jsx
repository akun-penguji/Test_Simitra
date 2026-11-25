import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useUI } from '../../ui.jsx';
import { Spinner, StrataBadge, konfirmasiFakta, Paginasi } from '../../lib.jsx';

const STRATA_LABEL_LOKAL = { DASAR: 'Dasar', MADYA: 'Madya', UTAMA: 'Utama', PARIPURNA: 'Paripurna' };
const jam = (d) => new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

// Verifikasi penilaian mandiri oleh Tim Penilai Kecamatan (notulen Sep 2026):
// penilai menilai komponen yang ditugaskan; koordinator memfinalkan & mengirim ke sekolah.
export default function Verifikasi() {
  const { user } = useAuth();
  const koordinator = !!user.isAdmin;
  const { toast, confirm } = useUI();
  const [list, setList] = useState(null);
  const [klas, setKlas] = useState(null);
  const [sel, setSel] = useState(null);       // { satuan, penilaian, klasifikasi }
  const [koreksi, setKoreksi] = useState({});  // indikatorId -> nilai
  const [catatan, setCatatan] = useState('');
  const [busy, setBusy] = useState(false);
  const [pilih, setPilih] = useState({});
  const [hal, setHal] = useState({ page: 1, pageSize: 25 });

  async function load() {
    setList(await api.get(`/kecamatan/satuan?status=SUBMITTED,DIVERIFIKASI&page=${hal.page}&pageSize=${hal.pageSize}`));
  }
  useEffect(() => { load(); }, [hal.page, hal.pageSize]);
  useEffect(() => { api.get('/kecamatan/klasifikasi-saya').then(setKlas).catch(() => {}); }, []);

  const bolehKomp = (komponenId) => koordinator || !!klas?.komponen.some((k) => k.id === komponenId);

  async function open(satuanId) {
    const d = await api.get(`/kecamatan/satuan/${satuanId}/penilaian`);
    setSel(d);
    const k = {};
    for (const j of d.penilaian?.jawaban || []) k[j.indikatorId] = j.nilaiVerifikasi ?? j.nilaiMandiri;
    setKoreksi(k);
    setCatatan(d.penilaian?.catatanVerifikasi || '');
  }

  // Kelompokkan indikator per komponen + status penilaian tiap komponen
  const grupKomponen = () => {
    const g = new Map();
    for (const j of sel?.penilaian?.jawaban || []) {
      const k = j.indikator.komponen;
      if (!g.has(k.id)) g.set(k.id, { komponen: k, jawaban: [], vk: sel.penilaian.verifikasiKomponen.find((v) => v.komponenId === k.id) });
      g.get(k.id).jawaban.push(j);
    }
    return [...g.values()].sort((a, b) => a.komponen.urutan - b.komponen.urutan);
  };

  async function simpanKomponen() {
    const kode = klas.komponen.map((k) => k.kode).join(' & ');
    const ok = await konfirmasiFakta(confirm, {
      title: `Simpan Penilaian Komponen ${kode}`,
      message: 'Hasil penilaian komponen Anda dicatat atas nama Anda. Strata dihitung setelah koordinator kecamatan memfinalkan verifikasi.',
      confirmText: 'Ya, Simpan',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const milik = (sel.penilaian.jawaban || []).filter((j) => bolehKomp(j.indikator.komponenId));
      const r = await api.post(`/kecamatan/satuan/${sel.satuan.id}/verifikasi-komponen`, {
        catatan, pernyataanFakta: true,
        koreksi: milik.map((j) => ({ indikatorId: j.indikatorId, nilaiVerifikasi: koreksi[j.indikatorId] })),
      });
      toast(`Komponen ${r.komponen.join(', ')} tersimpan — ${r.selesai}/${r.jumlahKomponen} komponen selesai dinilai.`, 'success');
      await open(sel.satuan.id); await load();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  async function finalkan() {
    const belum = grupKomponen().filter((g) => !g.vk).map((g) => g.komponen.kode);
    const ok = await konfirmasiFakta(confirm, {
      title: 'Finalkan Verifikasi',
      message: (belum.length ? `Komponen ${belum.join(', ')} belum dinilai penilai — nilai yang tampil saat ini akan dipakai dan dicatat atas nama Anda. ` : 'Seluruh komponen sudah dinilai. ')
        + 'Strata dihitung dan hasilnya dikirim ke sekolah.',
      confirmText: 'Ya, Finalkan & Kirim',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.post(`/kecamatan/satuan/${sel.satuan.id}/verifikasi`, {
        catatan, pernyataanFakta: true,
        koreksi: Object.entries(koreksi).map(([indikatorId, nilaiVerifikasi]) => ({ indikatorId, nilaiVerifikasi })),
      });
      toast(`Terverifikasi — Strata ${r.strataVerifikasi ? STRATA_LABEL_LOKAL[r.strataVerifikasi] : 'Belum Mencapai Dasar'} (nilai ${r.skorVerifikasi}).`, 'success');
      setSel(null); await load();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  if (!list) return <Spinner />;

  const submitted = list.data;
  const perluVerif = submitted.filter((s) => s.penilaian[0]?.status === 'SUBMITTED');
  const toggle = (id) => setPilih((p) => ({ ...p, [id]: !p[id] }));
  const terpilih = Object.keys(pilih).filter((k) => pilih[k]);
  const jmlKomp = klas?.jumlahKomponen || 4;

  async function verifikasiMassal() {
    const ok = await konfirmasiFakta(confirm, { title: 'Verifikasi Massal', message: `Verifikasi ${terpilih.length} satuan sekaligus (memakai nilai mandiri apa adanya). Strata dihitung otomatis & dikirim ke sekolah.`, confirmText: 'Ya, Verifikasi Semua' });
    if (!ok) return;
    setBusy(true);
    try { const r = await api.post('/kecamatan/verifikasi-massal', { satuanIds: terpilih, pernyataanFakta: true }); toast(`${r.jumlah} satuan diverifikasi.`, 'success'); setPilih({}); await load(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  const final = sel?.penilaian?.status === 'DIVERIFIKASI';
  const kunciPenilai = !koordinator && final;
  const grup = sel ? grupKomponen() : [];

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Verifikasi & Validasi Penilaian Mandiri</h2>
          <p>{koordinator
            ? 'Langkah 4 — Penilai menilai komponen masing-masing; Anda sebagai koordinator memfinalkan strata dan mengirimnya ke sekolah.'
            : 'Langkah 4 — Nilai indikator pada komponen yang ditugaskan kepada Anda. Koordinator kecamatan memfinalkan hasilnya.'}</p>
        </div>
        {koordinator && terpilih.length > 0 && <button className="btn" onClick={verifikasiMassal} disabled={busy}>✅ Verifikasi {terpilih.length} Terpilih</button>}
      </div>

      {klas && !koordinator && (
        <div className="klasifikasi-bar" style={{ marginBottom: 14 }}>
          <span className="kb-label">Komponen yang Anda nilai:</span>
          {klas.komponen.length
            ? klas.komponen.map((k) => <span key={k.id} className="badge blue">{k.kode} · {k.nama}</span>)
            : <span className="badge red">Belum ditugaskan — hubungi koordinator kecamatan</span>}
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr>
              {koordinator && <th style={{ width: 30 }}><input type="checkbox" checked={perluVerif.length > 0 && terpilih.length === perluVerif.length} onChange={(e) => setPilih(e.target.checked ? Object.fromEntries(perluVerif.map((s) => [s.id, true])) : {})} /></th>}
              <th>Satuan Pendidikan</th><th>Jenjang</th><th>Skor Mandiri</th><th>Komponen Dinilai</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {submitted.map((s) => {
                const p = s.penilaian[0];
                const dinilai = p._count?.verifikasiKomponen || 0;
                return (
                  <tr key={s.id}>
                    {koordinator && <td>{p.status === 'SUBMITTED' && <input type="checkbox" checked={!!pilih[s.id]} onChange={() => toggle(s.id)} />}</td>}
                    <td><b>{s.nama}</b></td>
                    <td>{s.jenjang}</td>
                    <td>{p.skorMandiri} <StrataBadge strata={p.strataMandiri} /></td>
                    <td>
                      <div className="komp-progres" title={`${dinilai} dari ${jmlKomp} komponen sudah dinilai`}>
                        {Array.from({ length: jmlKomp }).map((_, i) => <i key={i} className={i < dinilai ? 'isi' : ''} />)}
                        <span>{dinilai}/{jmlKomp}</span>
                      </div>
                    </td>
                    <td>{p.status === 'DIVERIFIKASI' ? <span className="badge green">Sudah Difinalkan</span> : dinilai >= jmlKomp ? <span className="badge blue">Siap Difinalkan</span> : <span className="badge amber">Perlu Verifikasi</span>}</td>
                    <td><button className="btn sm" onClick={() => open(s.id)}>{p.status === 'DIVERIFIKASI' ? (koordinator ? 'Lihat / Ubah' : 'Lihat') : (koordinator ? 'Verifikasi' : 'Nilai Komponen')}</button></td>
                  </tr>
                );
              })}
              {!submitted.length && <tr><td colSpan={7} className="center muted">Belum ada penilaian mandiri yang disubmit.</td></tr>}
            </tbody>
          </table>
        </div>
        <Paginasi res={list} label="satuan" onPage={(p) => setHal({ ...hal, page: p })} onPageSize={(n) => setHal({ page: 1, pageSize: n })} />
      </div>

      {sel && (
        <div className="modal-bg" onClick={(e) => { if (e.target.className === 'modal-bg') setSel(null); }}>
          <div className="modal" style={{ maxWidth: 780 }}>
            <div className="row-between mb">
              <h3 style={{ margin: 0 }}>Verifikasi — {sel.satuan.nama}</h3>
              <button className="btn sm secondary" onClick={() => setSel(null)}>Tutup</button>
            </div>

            <div className="komp-status-grid">
              {grup.map((g) => (
                <div key={g.komponen.id} className={`komp-status ${g.vk ? 'selesai' : ''} ${bolehKomp(g.komponen.id) ? 'milik' : ''}`}>
                  <b>{g.komponen.kode}</b> {g.komponen.nama}
                  <div className="komp-status-oleh">{g.vk ? <>✓ {g.vk.namaPenilai} · {jam(g.vk.selesaiPada)}</> : 'Belum dinilai'}</div>
                </div>
              ))}
            </div>

            {kunciPenilai && <div className="alert info">Verifikasi sudah difinalkan koordinator — hasil hanya dapat dilihat.</div>}
            {!koordinator && !kunciPenilai && <p className="muted" style={{ marginTop: 0 }}>Nilai awal = nilai mandiri sekolah. Indikator komponen lain hanya dapat dilihat.</p>}
            {koordinator && <p className="muted" style={{ marginTop: 0 }}>Nilai yang tampil sudah memuat hasil penilai komponen. Anda dapat mengoreksi indikator mana pun sebelum memfinalkan.</p>}

            {grup.map((g) => {
              const boleh = bolehKomp(g.komponen.id) && !kunciPenilai;
              return (
                <div key={g.komponen.id} className="komp-blok">
                  <div className="komp-blok-judul">{g.komponen.kode} · {g.komponen.nama}{!boleh && <span className="muted"> — hanya lihat</span>}</div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Strata</th><th>Indikator</th><th>Mandiri</th><th>Hasil Verifikasi</th></tr></thead>
                      <tbody>
                        {g.jawaban.map((j) => {
                          const cur = koreksi[j.indikatorId] ?? j.nilaiMandiri;
                          return (
                            <tr key={j.id} className={boleh ? '' : 'row-luar'}>
                              <td><span className={`badge strata-${j.indikator.strata}`} style={{ fontSize: 10 }}>{STRATA_LABEL_LOKAL[j.indikator.strata]}</span></td>
                              <td style={{ maxWidth: 320 }}>
                                {j.indikator.pertanyaan}
                                {(j.lampiran || []).length > 0 && (
                                  <div className="lampiran-verif">
                                    {j.lampiran.map((l) => (
                                      <a key={l.id} href={l.jenis === 'TAUTAN' ? l.fileUrl : `/uploads/${l.filePath}`}
                                        target="_blank" rel="noreferrer" title={l.fileName || l.fileUrl}>
                                        {l.jenis === 'TAUTAN' ? '🔗' : '📄'} {(l.fileName || l.fileUrl || '').slice(0, 28)}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td>
                                {j.nilaiMandiri === 1 ? 'Ya' : 'Tidak'}
                                {j.nilaiMandiri === 1 && (
                                  <span className={`tanda-bukti ${j.pernyataanEviden ? 'ada' : 'belum'}`}
                                    title={j.pernyataanEviden ? 'Sekolah menyatakan bukti dukung tersedia' : 'Sekolah belum menyatakan bukti dukung'}>
                                    {j.pernyataanEviden ? '📎 bukti dinyatakan' : '⚠ tanpa pernyataan bukti'}
                                  </span>
                                )}
                              </td>
                              <td>
                                {boleh ? (
                                  <div className="yn-btns">
                                    <button type="button" className={`yn ${cur === 1 ? 'ya' : ''}`} onClick={() => setKoreksi({ ...koreksi, [j.indikatorId]: 1 })}>Ya</button>
                                    <button type="button" className={`yn ${cur === 0 ? 'tidak' : ''}`} onClick={() => setKoreksi({ ...koreksi, [j.indikatorId]: 0 })}>Tidak</button>
                                  </div>
                                ) : <b>{cur === 1 ? 'Ya' : 'Tidak'}</b>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {!kunciPenilai && (
              <>
                <div className="field mt"><label>{koordinator ? 'Catatan Verifikasi (dikirim ke sekolah)' : 'Catatan penilaian komponen'}</label><textarea rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} /></div>
                {koordinator
                  ? <button className="btn" onClick={finalkan} disabled={busy}>{busy ? 'Menyimpan...' : 'Finalkan & Kirim ke Sekolah'}</button>
                  : <button className="btn" onClick={simpanKomponen} disabled={busy || !klas?.komponen.length}>{busy ? 'Menyimpan...' : `Simpan Penilaian Komponen ${klas?.komponen.map((k) => k.kode).join(' & ') || ''}`}</button>}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
