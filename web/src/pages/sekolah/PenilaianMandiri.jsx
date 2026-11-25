import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useUI } from '../../ui.jsx';
import { Spinner, StrataBadge, STRATA_LABEL, konfirmasiFakta, TombolUnduhPdf, TEKS_PERNYATAAN_EVIDEN } from '../../lib.jsx';

const STRATA_LABEL_LOKAL = { DASAR: 'Dasar', MADYA: 'Madya', UTAMA: 'Utama', PARIPURNA: 'Paripurna' };
const STRATA_ORDER = ['DASAR', 'MADYA', 'UTAMA', 'PARIPURNA'];

const MAKS_TAUTAN = 2; // sama dengan batas di backend routes/penilaian.js

export default function PenilaianMandiri() {
  const { refresh } = useAuth();
  const { toast, confirm } = useUI();
  const [komponen, setKomponen] = useState([]);
  const [jenjang, setJenjang] = useState('');
  const [penilaian, setPenilaian] = useState(null);
  const [jawaban, setJawaban] = useState({}); // indikatorId -> 0/1
  const [eviden, setEviden] = useState({});   // indikatorId -> pernyataan bukti tersedia (wajib bila Ya)
  const [lampiran, setLampiran] = useState({}); // indikatorId -> daftar tautan bukti (opsional)
  const [tautan, setTautan] = useState({});     // indikatorId -> isi kotak tautan
  const [kirim, setKirim] = useState(null);     // indikatorId yang tautannya sedang dikirim
  const [busy, setBusy] = useState(false);
  const [larangan, setLarangan] = useState(null); // peraih juara 1/2/3 tak boleh menilai mandiri
  const [siap, setSiap] = useState(false);

  async function load() {
    const [inst, res] = await Promise.all([api.get('/instrumen'), api.get('/penilaian/mine')]);
    setKomponen(inst.komponen); setJenjang(inst.jenjang);
    if (res.larangan) { setLarangan(res.larangan); setPenilaian(null); setSiap(true); return; }
    const p = res.penilaian || res; // kompatibel dengan bentuk lama
    setLarangan(null);
    setPenilaian(p);
    const map = {}; const ev = {}; const lm = {};
    for (const j of p.jawaban || []) {
      map[j.indikatorId] = j.nilaiMandiri; ev[j.indikatorId] = !!j.pernyataanEviden;
      lm[j.indikatorId] = j.lampiran || [];
    }
    setJawaban(map); setEviden(ev); setLampiran(lm);
    setSiap(true);
  }
  useEffect(() => { load(); }, []);
  if (!siap) return <Spinner />;

  // Sekolah yang pernah meraih Juara 1/2/3 tingkat kabupaten tidak diperkenankan
  // melakukan penilaian mandiri kembali (notulen rapat Tim Pembina UKS/M).
  if (larangan) {
    return (
      <>
        <div className="page-head">
          <h2>Penilaian Mandiri Stratifikasi UKS/M</h2>
          <p>Instrumen jenjang <b>{jenjang}</b></p>
        </div>
        <div className="card">
          <div className="larangan-box">
            <h3>🏆 Penilaian mandiri tidak tersedia</h3>
            <p>{larangan.alasan}</p>
            {larangan.riwayat?.length > 0 && (
              <div className="riwayat">
                <b>Riwayat penghargaan:</b>
                <ul>
                  {larangan.riwayat.map((x, i) => (
                    <li key={i}>Juara {x.peringkat} — {x.periode} ({x.tahun})</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
              Sekolah tetap dapat memantau profil, infografis, dan dokumen yang telah diterbitkan.
              Untuk pembinaan lebih lanjut, silakan menghubungi Tim Pembina UKS/M Kecamatan.
            </p>
          </div>
        </div>
      </>
    );
  }
  if (!penilaian) return <Spinner />;

  const locked = penilaian.status !== 'DRAFT';
  const allInd = komponen.flatMap((k) => k.indikator);
  const totalInd = allInd.length;
  const terisi = allInd.filter((i) => jawaban[i.id] != null).length;
  // Jawaban Ya wajib disertai pernyataan bahwa bukti dukungnya tersedia
  const belumBerbukti = allInd.filter((i) => jawaban[i.id] === 1 && !eviden[i.id]);

  function setNilai(indId, n) {
    if (locked) return;
    setJawaban({ ...jawaban, [indId]: n });
    if (n === 0) setEviden({ ...eviden, [indId]: false }); // pernyataan hanya untuk jawaban Ya
  }
  function setEvidenInd(indId, v) { if (!locked) setEviden({ ...eviden, [indId]: v }); }

  // Bukti dukung pada tahap ini berupa TAUTAN per berkas sesuai indikator
  // (bukan tautan folder). Sifatnya opsional — tidak menghalangi pengiriman.
  async function tambahTautan(indId, url) {
    const bersih = (url || '').trim();
    if (!bersih) return;
    setKirim(indId);
    try {
      const jw = await api.post('/penilaian/mine/lampiran', { indikatorId: indId, tautan: bersih });
      setLampiran((l) => ({ ...l, [indId]: jw.lampiran || [] }));
      setTautan((t) => ({ ...t, [indId]: '' }));
      toast('Tautan bukti tersimpan.', 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setKirim(null); }
  }
  async function hapusLampiran(indId, id) {
    try {
      await api.del(`/penilaian/mine/lampiran/${id}`);
      setLampiran((l) => ({ ...l, [indId]: (l[indId] || []).filter((x) => x.id !== id) }));
      toast('Tautan bukti dihapus.', 'info');
    } catch (e) { toast(e.message, 'error'); }
  }
  const muatan = () => ({
    jawaban: Object.entries(jawaban).map(([indikatorId, nilaiMandiri]) => ({
      indikatorId, nilaiMandiri, pernyataanEviden: nilaiMandiri === 1 && !!eviden[indikatorId],
    })),
  });

  async function saveDraft() {
    setBusy(true);
    try {
      await api.put('/penilaian/mine', muatan());
      toast('Draft tersimpan.', 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  async function submit() {
    if (terisi < totalInd) { toast(`Isi semua indikator (${terisi}/${totalInd})`, 'error'); return; }
    if (belumBerbukti.length) {
      toast(`${belumBerbukti.length} indikator dijawab Ya belum dinyatakan memiliki bukti dukung.`, 'error');
      document.getElementById(`ind-${belumBerbukti[0].id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const jumlahYa = allInd.filter((i) => jawaban[i.id] === 1).length;
    const ok = await konfirmasiFakta(confirm, {
      title: 'Kirim Penilaian Mandiri',
      message: 'Penilaian dikirim ke TP UKS/M Kecamatan & Tim Stratifikasi dan tidak dapat diubah setelah dikirim.',
      pernyataan: `Saya menyatakan penilaian ini sesuai fakta di lapangan, dan seluruh ${jumlahYa} indikator yang saya jawab Ya memiliki bukti dukung yang tersedia serta dapat ditunjukkan saat verifikasi.`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.put('/penilaian/mine', muatan());
      const rr = await api.post('/penilaian/mine/submit', { pernyataanFakta: true });
      await refresh(); await load();
      toast(`Terkirim! Nilai ${rr.skorMandiri} — ${rr.strataMandiri ? STRATA_LABEL[rr.strataMandiri] : 'Belum Mencapai Dasar'}.`, 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="page-head">
        <h2>Penilaian Mandiri Stratifikasi UKS/M</h2>
        <p>Instrumen jenjang <b>{jenjang}</b> — tandai <b>Ya</b> bila indikator terpenuhi, <b>Tidak</b> bila belum. Bukti dukung boleh disertakan sekarang (opsional) berupa <b>tautan per berkas sesuai indikator</b> — bukan tautan folder.</p>
      </div>

      {locked && (
        <div className="card">
          <div className="row-between">
            <div>
              <span className="badge blue">{penilaian.status === 'DIVERIFIKASI' ? 'Sudah Diverifikasi' : 'Terkirim'}</span>
              <span style={{ marginLeft: 10 }}>Nilai: <b>{penilaian.skorMandiri}</b> / 100</span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {penilaian.strataMandiri ? <StrataBadge strata={penilaian.strataMandiri} /> : <span className="badge red">Belum Mencapai Dasar</span>}
              <TombolUnduhPdf path={`/cetak/penilaian/${penilaian.satuanId}.pdf`} nama="Hasil-Scoring-Penilaian-Mandiri.pdf" label="Unduh PDF Hasil" onError={(e) => toast(e.message, 'error')} />
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row-between mb">
          <span className="muted">
            Terisi {terisi} / {totalInd} indikator
            {belumBerbukti.length > 0 && <b className="perlu-bukti-info"> · {belumBerbukti.length} jawaban Ya menunggu pernyataan bukti</b>}
          </span>
          <span className="muted">Strata tercapai bila seluruh indikator strata itu (& strata di bawahnya) terpenuhi.</span>
        </div>

        {komponen.map((komp) => {
          const byStrata = {};
          for (const ind of komp.indikator) (byStrata[ind.strata] ||= []).push(ind);
          return (
            <div key={komp.id}>
              <div className="comp-title">{komp.kode}. {komp.nama}</div>
              {STRATA_ORDER.filter((lv) => byStrata[lv]).map((lv) => (
                <div key={lv} style={{ marginBottom: 8 }}>
                  <div className={`badge strata-${lv}`} style={{ marginBottom: 6 }}>Strata {STRATA_LABEL_LOKAL[lv]}</div>
                  {byStrata[lv].map((ind) => (
                    <div key={ind.id} id={`ind-${ind.id}`} className={`yn-row ${jawaban[ind.id] === 1 && !eviden[ind.id] && !locked ? 'perlu-bukti' : ''}`}>
                      <span className="yn-q">
                        {ind.pertanyaan}
                        {ind.bentukEviden && <span className="yn-eviden">📎 Bukti: {ind.bentukEviden}</span>}
                        {jawaban[ind.id] === 1 && (
                          locked
                            ? <span className="yn-pernyataan terkunci">✔ Dinyatakan memiliki bukti dukung</span>
                            : (
                              <label className={`yn-pernyataan ${eviden[ind.id] ? 'sudah' : 'belum'}`}>
                                <input type="checkbox" checked={!!eviden[ind.id]} onChange={(e) => setEvidenInd(ind.id, e.target.checked)} />
                                <span>{TEKS_PERNYATAAN_EVIDEN}</span>
                              </label>
                            )
                        )}
                        {jawaban[ind.id] === 1 && (
                          <div className="lampiran-mandiri">
                            {(lampiran[ind.id] || []).map((l) => (
                              <span key={l.id} className="lmp-cip" title={l.fileUrl || l.fileName}>
                                <span>🔗</span>
                                <a href={l.fileUrl || `/uploads/${l.filePath}`} target="_blank" rel="noreferrer">{l.fileUrl || l.fileName}</a>
                                {!locked && <button type="button" onClick={() => hapusLampiran(ind.id, l.id)} title="Hapus tautan bukti">✕</button>}
                              </span>
                            ))}
                            {!locked && (lampiran[ind.id] || []).length < MAKS_TAUTAN && (
                              <span className="lmp-alat">
                                <input className="lmp-tautan" placeholder="tempel tautan berkas bukti…"
                                  value={tautan[ind.id] || ''}
                                  onChange={(e) => setTautan({ ...tautan, [ind.id]: e.target.value })}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); tambahTautan(ind.id, tautan[ind.id]); } }} />
                                <button type="button" className="btn sm secondary" disabled={!(tautan[ind.id] || '').trim() || kirim === ind.id}
                                  onClick={() => tambahTautan(ind.id, tautan[ind.id])}>{kirim === ind.id ? 'Menyimpan…' : 'Tambah Tautan'}</button>
                                <span className="lmp-opsional">opsional · satu tautan per berkas · {(lampiran[ind.id] || []).length}/{MAKS_TAUTAN}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </span>
                      <div className="yn-btns">
                        <button type="button" className={`yn ${jawaban[ind.id] === 1 ? 'ya' : ''}`} onClick={() => setNilai(ind.id, 1)} disabled={locked}>Ya</button>
                        <button type="button" className={`yn ${jawaban[ind.id] === 0 ? 'tidak' : ''}`} onClick={() => setNilai(ind.id, 0)} disabled={locked}>Tidak</button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })}

        {!locked && (
          <div className="mt" style={{ display: 'flex', gap: 10 }}>
            <button className="btn secondary" onClick={saveDraft} disabled={busy}>Simpan Draft</button>
            <button className="btn" onClick={submit} disabled={busy}
              title={belumBerbukti.length ? `${belumBerbukti.length} jawaban Ya belum dinyatakan memiliki bukti` : ''}>
              Kirim ke Kecamatan & Kabupaten
            </button>
            {belumBerbukti.length > 0 && (
              <span className="muted" style={{ alignSelf: 'center', fontSize: 12.5 }}>
                {belumBerbukti.length} jawaban <b>Ya</b> belum dicentang pernyataan buktinya.
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
}
