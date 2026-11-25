import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useUI } from '../../ui.jsx';
import {
  Spinner, StrataBadge, Alert, fmtDate, konfirmasiFakta, TombolUnduhPdf, Paginasi,
  LegendaSkor, PilihSkor, TEKS_PERNYATAAN,
} from '../../lib.jsx';

// Hasil Pleno (dulu "Hasil Final & SK Bupati"): hitung → review ulang → proses →
// generate Sertifikat. SK Bupati dibuat di luar sistem.
const nilaiAwal = (it) => (it.skorLapangan != null ? it.skorLapangan : (it.skor ?? 0));
const StrataAkhirBadge = ({ strata }) => (strata ? <StrataBadge strata={strata} /> : <span className="badge red">Belum Mencapai Dasar</span>);

export default function HasilPleno() {
  const { toast, confirm } = useUI();
  const [res, setRes] = useState(null);
  const [hal, setHal] = useState({ page: 1, pageSize: 25 });
  const [busy, setBusy] = useState(false);
  // dialog Review Ulang: nilai eviden 0-3 yang sudah diberikan dapat dikoreksi
  const [ru, setRu] = useState(null);       // { hasil, items }
  const [ruSkor, setRuSkor] = useState({}); // itemId -> nilai lapangan
  const [ruCatatan, setRuCatatan] = useState({});
  const [ruAlasan, setRuAlasan] = useState('');
  const [ruSetuju, setRuSetuju] = useState(false);
  // dialog Buka Kembali
  const [bk, setBk] = useState(null);       // { alasan }
  // dialog Generate: nomor rubrikasi, tanggal penerbitan, dan tahun DIISI admin sebelum generate
  const [gen, setGen] = useState(null);     // { jenis: 'HASIL'|'PESERTA', nomorRubrikasi, tanggalTerbit, tahun, terbitkanUlang }
  const [ruGalat, setRuGalat] = useState('');
  const refAlasan = useRef(null);

  async function load() { setRes(await api.get(`/pleno?page=${hal.page}&pageSize=${hal.pageSize}`)); }
  useEffect(() => { load(); }, [hal.page, hal.pageSize]);

  async function jalankan(aksi, pesanSukses) {
    setBusy(true);
    try { const r = await aksi(); toast(pesanSukses(r), 'success'); await load(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  async function hitung() {
    const ok = await confirm({
      title: 'Hitung Hasil Pleno',
      message: 'Sistem menghitung nilai pleno seluruh satdik yang telah dikunjungi, menentukan strata akhir (dihitung otomatis dari nilai pleno), peringkat, dan 12 peraih. Lanjutkan?',
      confirmText: 'Ya, Hitung',
    });
    if (!ok) return;
    await jalankan(() => api.post('/pleno/hitung'), (r) => `${r.total} satdik dihitung, ${r.peraih} peraih.`);
  }

  async function proses() {
    const ok = await konfirmasiFakta(confirm, {
      title: 'Proses Hasil Pleno',
      message: 'Hasil Pleno akan DIKUNCI: nilai, peringkat, dan strata akhir tidak dapat diubah, satdik berstatus Hasil Pleno, dan sekolah serta kecamatan diberi tahu. Pembukaan kembali hanya lewat tombol Buka Kembali.',
      confirmText: 'Ya, Proses',
      pernyataan: 'Saya menyatakan seluruh Hasil Pleno telah direview dan siap diproses.',
    });
    if (!ok) return;
    await jalankan(() => api.post('/pleno/proses', { pernyataanFakta: true }), (r) => `Hasil Pleno diproses: ${r.jumlahSatdik} satdik, ${r.jumlahPeraih} peraih.`);
  }

  function bukaGenerate(jenis, ulang = false) {
    const hariIni = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    setGen({
      jenis, nomorRubrikasi: res.isianSertifikat?.nomorRubrikasi || '', tanggalTerbit: hariIni,
      tahun: String(res.isianSertifikat?.tahun || new Date().getFullYear()), terbitkanUlang: ulang,
    });
  }
  // contoh nomor pertama dari pola yang diketik admin
  const contohNomor = (g) => String(g.nomorRubrikasi || '')
    .replaceAll('{urut}', '001').replaceAll('{tahun}', String(g.tahun || '')).replaceAll('{bulan}', (g.tanggalTerbit || '').slice(5, 7))
    .replaceAll('{bulanRomawi}', ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][Number((g.tanggalTerbit || '').slice(5, 7)) - 1] || '');
  async function generate() {
    if (!gen.nomorRubrikasi.trim()) { toast('Isi nomor rubrikasi terlebih dahulu.', 'error'); return; }
    if (!gen.nomorRubrikasi.includes('{urut}')) { toast('Nomor rubrikasi harus memuat {urut} agar setiap sertifikat bernomor berbeda.', 'error'); return; }
    if (!gen.tanggalTerbit) { toast('Isi tanggal penerbitan terlebih dahulu.', 'error'); return; }
    if (!/^\d{4}$/.test(String(gen.tahun))) { toast('Isi tahun sertifikat dengan 4 angka, mis. 2026.', 'error'); return; }
    const peserta = gen.jenis === 'PESERTA';
    setBusy(true);
    try {
      const r = await api.post(peserta ? '/pleno/piagam-peserta/generate' : '/pleno/sertifikat/generate', {
        nomorRubrikasi: gen.nomorRubrikasi.trim(), tanggalTerbit: gen.tanggalTerbit, tahun: Number(gen.tahun), terbitkanUlang: !!gen.terbitkanUlang,
      });
      toast(`${r.dibuat} ${peserta ? 'sertifikat peserta' : 'sertifikat penghargaan'} baru digenerate${r.diperbarui ? `, ${r.diperbarui} diterbitkan ulang` : ''} (total ${r.total}).`, 'success');
      setGen(null); await load();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  async function bukaKembali() {
    if (!bk.alasan.trim()) { toast('Alasan membuka kembali Hasil Pleno wajib diisi.', 'error'); return; }
    setBusy(true);
    try {
      await api.post('/pleno/buka-kembali', { alasan: bk.alasan.trim() });
      toast('Hasil Pleno dibuka kembali. Sertifikat yang sudah terbit tetap berlaku.', 'success');
      setBk(null); await load();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  async function bukaReviewUlang(h) {
    try {
      const ev = await api.get(`/kabupaten/eviden/${h.satuanId}`);
      const sk = {}; const ct = {};
      for (const it of ev.items) { sk[it.id] = nilaiAwal(it); ct[it.id] = it.catatanLapangan || ''; }
      setRuSkor(sk); setRuCatatan(ct); setRuAlasan(''); setRuSetuju(false);
      setRu({ hasil: h, items: ev.items });
    } catch (e) { toast(e.message, 'error'); }
  }
  function tutupReviewUlang() { setRuGalat(''); setRu(null); setRuSkor({}); setRuCatatan({}); setRuAlasan(''); setRuSetuju(false); }
  const ruBerubah = () => (ru?.items || []).filter((it) => Number(ruSkor[it.id]) !== Number(nilaiAwal(it)) || (ruCatatan[it.id] || '') !== (it.catatanLapangan || ''));

  async function simpanReviewUlang() {
    // tombol tidak dinonaktifkan diam-diam: kekurangan isian dijelaskan dan kolomnya disorot
    if (!ruAlasan.trim()) {
      setRuGalat('Isi dulu "Alasan Review Ulang" di bagian atas dialog, lalu tekan Simpan lagi.');
      toast('Alasan review ulang wajib diisi.', 'error');
      refAlasan.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); refAlasan.current?.focus();
      return;
    }
    if (!ruSetuju) { setRuGalat('Centang pernyataan sesuai fakta terlebih dahulu.'); toast('Centang pernyataan terlebih dahulu.', 'error'); return; }
    setRuGalat('');
    setBusy(true);
    try {
      const r = await api.post(`/pleno/review-ulang/${ru.hasil.satuanId}`, {
        alasan: ruAlasan.trim(), pernyataanFakta: true,
        skorLapangan: ru.items.map((it) => ({ itemId: it.id, skor: Number(ruSkor[it.id]), catatan: ruCatatan[it.id] || '' })),
      });
      toast(`Review ulang ${ru.hasil.satuan.nama} tersimpan — ${r.diubah} nilai diubah, skor ${r.skorFinal}%, `
        + `strata akhir ${r.strataFinal ? r.strataFinal : 'belum mencapai Dasar'}, peringkat ${r.peringkat}.`, 'success');
      tutupReviewUlang(); await load();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  if (!res) return <Spinner />;
  const baris = res.data;
  const diproses = !!res.proses;
  const adaHasil = res.jumlahHasil > 0;
  const sertifikatLengkap = diproses && res.jumlahSertifikat >= res.jumlahHasil;
  // status langkah: Hitung → Review Ulang → Proses → Sertifikat
  const langkah = [
    { k: 'Hitung', selesai: adaHasil },
    { k: 'Review Ulang', selesai: diproses },
    { k: 'Proses', selesai: diproses },
    { k: 'Sertifikat', selesai: sertifikatLengkap },
  ];
  const saatIni = langkah.findIndex((l) => !l.selesai);

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Hasil Pleno</h2>
          <p>Seluruh satdik yang dikunjungi Tim Stratifikasi. Hitung, review ulang bila perlu, proses, lalu generate Sertifikat Penghargaan.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <TombolUnduhPdf path="/kabupaten/export/final.csv" nama="hasil-pleno-uksm.csv" label="Unduh CSV Rekap" onError={(e) => toast(e.message, 'error')} />
          <TombolUnduhPdf path="/cetak/final.pdf" nama="Rekap-Hasil-Pleno.pdf" label="Unduh PDF Rekap" onError={(e) => toast(e.message, 'error')} />
        </div>
      </div>

      <div className="card">
        <div className="stepper">
          {langkah.map((l, i) => (
            <div key={l.k} className={`step ${l.selesai ? 'done' : i === saatIni ? 'current' : ''}`}>
              <span className="dot">{l.selesai ? '✓' : i + 1}</span>{l.k}
            </div>
          ))}
        </div>
        <div className="row-between mt" style={{ gap: 10, flexWrap: 'wrap' }}>
          <span className="muted">
            {diproses
              ? <>Diproses oleh <b>{res.proses.diprosesOleh}</b> pada {fmtDate(res.proses.diprosesPada)} — {res.proses.jumlahSatdik} satdik, {res.proses.jumlahPeraih} peraih. Hasil terkunci.</>
              : adaHasil
                ? <>{res.jumlahHasil} satdik di Hasil Pleno. Strata akhir dihitung sistem: indikator terpenuhi bila nilai pleno ≥ {res.ambang}.</>
                : 'Belum ada Hasil Pleno. Klik Hitung Hasil Pleno setelah kunjungan lapangan selesai.'}
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!diproses && <button className={`btn ${adaHasil ? 'secondary' : ''}`} onClick={hitung} disabled={busy}>Hitung Hasil Pleno</button>}
            {!diproses && adaHasil && <button className="btn" onClick={proses} disabled={busy}>Proses Hasil Pleno</button>}
            {diproses && !sertifikatLengkap && <button className="btn blue" onClick={() => bukaGenerate('HASIL')} disabled={busy}>Generate Sertifikat Penghargaan</button>}
            {sertifikatLengkap && <button className="btn sm secondary" onClick={() => bukaGenerate('HASIL', true)} disabled={busy}>Terbitkan Ulang</button>}
            {sertifikatLengkap && <TombolUnduhPdf path="/cetak/sertifikat-semua.pdf" nama="Sertifikat-Penghargaan-Semua.pdf" label="Unduh Semua Sertifikat Penghargaan" kelas="btn blue" onError={(e) => toast(e.message, 'error')} />}
            {diproses && <button className="btn sm secondary" onClick={() => setBk({ alasan: '' })} disabled={busy}>Buka Kembali</button>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row-between" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0 }}>Sertifikat Peserta (hasil Rekomendasi Kecamatan)</h3>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 12.5 }}>
              {res.jumlahRekomendasi} satdik direkomendasikan kecamatan · {res.jumlahPiagamPeserta} sertifikat peserta sudah digenerate.
              Dapat digenerate kapan saja, tidak menunggu Hasil Pleno.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {res.jumlahPiagamPeserta < res.jumlahRekomendasi && (
              <button className="btn blue" onClick={() => bukaGenerate('PESERTA')} disabled={busy}>Generate Sertifikat Peserta</button>
            )}
            {res.jumlahPiagamPeserta > 0 && (
              <button className="btn sm secondary" onClick={() => bukaGenerate('PESERTA', true)} disabled={busy}>Terbitkan Ulang</button>
            )}
            {res.jumlahPiagamPeserta > 0 && (
              <TombolUnduhPdf path="/cetak/piagam-peserta-semua.pdf" nama="Sertifikat-Peserta-Semua.pdf" label="Unduh Semua Sertifikat Peserta" onError={(e) => toast(e.message, 'error')} />
            )}
          </div>
        </div>
      </div>

      {!res.penandatanganSiap && (res.jumlahRekomendasi > 0 || diproses) && (
        <Alert type="warn">
          Penandatangan sertifikat belum lengkap. Atur nama pejabat dan unggah pindaian tanda tangan di <Link to="/pengaturan-sertifikat">Pengaturan Sertifikat</Link> sebelum menggenerate.
        </Alert>
      )}
      {res.jumlahNilaiSama > 0 && !diproses && (
        <Alert type="warn">Ada nilai pleno yang sama pada {res.jumlahNilaiSama} kelompok nilai (baris bertanda kuning). Tinjau lewat Review Ulang sebelum diproses.</Alert>
      )}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>#</th><th>Satuan Pendidikan</th><th>Kecamatan</th><th>Skor Pleno</th>
              <th>Strata Awal</th><th>Strata Akhir</th><th>Peraih</th><th>Sertifikat</th><th></th>
            </tr></thead>
            <tbody>
              {baris.map((h) => {
                const kj = h.satuan.kunjungan;
                return (
                  <tr key={h.id} className={h.nilaiSama ? 'nilai-sama' : ''}>
                    <td>{h.peringkat}</td>
                    <td>
                      <b>{h.satuan.nama}</b>
                      {(kj?.jumlahReviewUlang > 0 || kj?.jumlahRevisi > 0) && (
                        <div className="muted" style={{ fontSize: 11 }}>
                          {kj.jumlahReviewUlang > 0 && <>review ulang {kj.jumlahReviewUlang}× ({kj.reviewUlangOleh}) </>}
                          {kj.jumlahRevisi > 0 && <>· revisi nilai {kj.jumlahRevisi}× ({kj.revisiOleh})</>}
                        </div>
                      )}
                    </td>
                    <td>{h.satuan.kecamatan?.nama}</td>
                    <td><b>{h.skorFinal}%</b>{h.nilaiSama && <span className="badge amber" style={{ marginLeft: 6 }}>nilai sama</span>}</td>
                    <td>{kj?.strataAwal ? <StrataBadge strata={kj.strataAwal} /> : '-'}</td>
                    <td><StrataAkhirBadge strata={h.strataFinal} /></td>
                    <td>{h.peraih ? <span className="badge purple">🏆 Peraih</span> : '-'}</td>
                    <td>
                      {h.satuan.sertifikat
                        ? <TombolUnduhPdf path={`/cetak/sertifikat/${h.satuanId}.pdf`} nama={`Sertifikat-Penghargaan-${h.satuan.nama}.pdf`} label={h.satuan.sertifikat.nomor} onError={(e) => toast(e.message, 'error')} />
                        : '-'}
                    </td>
                    <td><button className="btn sm amber" disabled={busy || diproses} onClick={() => bukaReviewUlang(h)}>Review Ulang</button></td>
                  </tr>
                );
              })}
              {!baris.length && <tr><td colSpan={9} className="center muted">Belum ada Hasil Pleno.</td></tr>}
            </tbody>
          </table>
        </div>
        <Paginasi res={res} label="satdik" onPage={(p) => setHal({ ...hal, page: p })} onPageSize={(n) => setHal({ page: 1, pageSize: n })} />
      </div>

      {ru && (
        <div className="modal-bg" onClick={(e) => { if (e.target.className === 'modal-bg') tutupReviewUlang(); }}>
          <div className="modal" style={{ maxWidth: 1000 }}>
            <div className="row-between mb">
              <div>
                <h3 style={{ margin: 0 }}>Review Ulang — {ru.hasil.satuan.nama}</h3>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 12.5 }}>
                  {ru.hasil.satuan.kecamatan?.nama} · skor pleno saat ini <b>{ru.hasil.skorFinal}%</b>
                  {ru.hasil.nilaiSama && ' · nilai sama dengan satdik lain'}
                </p>
              </div>
              <button className="btn sm secondary" onClick={tutupReviewUlang}>Tutup</button>
            </div>
            <div className="field">
              <label>Alasan Review Ulang *</label>
              <textarea ref={refAlasan} rows={2} value={ruAlasan} onChange={(e) => { setRuAlasan(e.target.value); setRuGalat(''); }} placeholder="mis. bukti komponen B ditinjau kembali saat pleno" style={ruGalat && !ruAlasan.trim() ? { borderColor: 'var(--red)' } : undefined} />
            </div>
            <div className="comp-title">Nilai Eviden Hasil Lapangan — dapat dikoreksi</div>
            <LegendaSkor judul="Legenda nilai" />
            <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table>
                <thead><tr>
                  <th style={{ width: 60 }}>Kode</th><th>Indikator</th><th style={{ width: 70 }}>Skor Adm.</th>
                  <th style={{ width: 230 }}>Nilai Lapangan</th><th style={{ minWidth: 220 }}>Catatan Temuan</th>
                </tr></thead>
                <tbody>
                  {ru.items.map((it) => {
                    const diubah = Number(ruSkor[it.id]) !== Number(nilaiAwal(it));
                    return (
                      <tr key={it.id} className={diubah ? 'nilai-sama' : ''}>
                        <td>{it.indikator.kode}</td>
                        <td style={{ maxWidth: 300 }}>{it.indikator.pertanyaan}</td>
                        <td className="center">{it.skor ?? '-'}</td>
                        <td>
                          <PilihSkor nilai={ruSkor[it.id]} onChange={(v) => setRuSkor({ ...ruSkor, [it.id]: v })} />
                          {diubah && <div className="muted" style={{ fontSize: 11 }}>semula {nilaiAwal(it)}</div>}
                        </td>
                        <td>
                          <textarea className="catatan-lapangan" rows={2} value={ruCatatan[it.id] || ''} placeholder="Catatan temuan untuk indikator ini…"
                            onChange={(e) => setRuCatatan({ ...ruCatatan, [it.id]: e.target.value })} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <label className="pernyataan-kotak" style={ruGalat && !ruSetuju && ruAlasan.trim() ? { borderColor: 'var(--red)' } : undefined}>
              <input type="checkbox" aria-invalid={ruGalat && !ruSetuju ? true : undefined} checked={ruSetuju} onChange={(e) => { setRuSetuju(e.target.checked); setRuGalat(''); }} />
              <span>{TEKS_PERNYATAAN}</span>
            </label>
            <div className="row-between mt" style={{ gap: 10, flexWrap: 'wrap' }}>
              <span role={ruGalat ? 'alert' : undefined} className="muted" style={{ fontSize: 12.5, ...(ruGalat ? { color: 'var(--red)', fontWeight: 600 } : {}) }}>
                {ruGalat || (ruBerubah().length ? `${ruBerubah().length} indikator akan diubah. Nilai lama tetap tercatat pada log audit.` : 'Belum ada nilai yang diubah. Alasan dan pernyataan tetap wajib diisi.')}
              </span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn secondary" onClick={tutupReviewUlang} disabled={busy}>Batal</button>
                <button className="btn" onClick={simpanReviewUlang} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Review Ulang'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {gen && (
        <div className="modal-bg" onClick={(e) => { if (e.target.className === 'modal-bg') setGen(null); }}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="row-between mb">
              <h3 style={{ margin: 0 }}>Generate Sertifikat {gen.jenis === 'PESERTA' ? 'Peserta' : 'Penghargaan'}</h3>
              <button className="btn sm secondary" onClick={() => setGen(null)}>Tutup</button>
            </div>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              {gen.jenis === 'PESERTA'
                ? `Untuk ${res.jumlahRekomendasi - res.jumlahPiagamPeserta} satdik hasil Rekomendasi Kecamatan yang belum memiliki sertifikat peserta.`
                : `Untuk ${res.jumlahHasil} satdik hasil Kunjungan Tim Kabupaten dan Hasil Pleno.`}
              {' '}Isi data berikut; sertifikat yang sudah terbit tidak diubah kecuali Anda memilih menerbitkan ulang.
            </p>
            <div className="field">
              <label>Nomor Rubrikasi *</label>
              <input value={gen.nomorRubrikasi} onChange={(e) => setGen({ ...gen, nomorRubrikasi: e.target.value })} placeholder="100.3.3.2/KEP.{urut}-KESRA/2026" autoFocus />
              <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
                Tulis <b>{'{urut}'}</b> pada tempat nomor urut (001, 002, …). Contoh hasil: <b>{contohNomor(gen) || '-'}</b>
              </p>
            </div>
            <div className="form-row">
              <div className="field"><label>Tanggal Penerbitan *</label><input type="date" value={gen.tanggalTerbit} onChange={(e) => setGen({ ...gen, tanggalTerbit: e.target.value })} /></div>
              <div className="field"><label>Tahun Sertifikat *</label><input type="number" min="2000" max="2100" value={gen.tahun} onChange={(e) => setGen({ ...gen, tahun: e.target.value })} /></div>
            </div>
            {(gen.jenis === 'PESERTA' ? res.jumlahPiagamPeserta : res.jumlahSertifikat) > 0 && (
              <label className="cek" style={{ marginBottom: 12 }}>
                <input type="checkbox" checked={!!gen.terbitkanUlang} onChange={(e) => setGen({ ...gen, terbitkanUlang: e.target.checked })} />
                Terbitkan ulang yang sudah ada ({gen.jenis === 'PESERTA' ? res.jumlahPiagamPeserta : res.jumlahSertifikat} sertifikat) — nomor, tanggal, dan tahunnya diganti sesuai isian di atas
              </label>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn secondary" onClick={() => setGen(null)} disabled={busy}>Batal</button>
              <button className="btn blue" onClick={generate} disabled={busy}>{busy ? 'Menggenerate...' : 'Generate Sekarang'}</button>
            </div>
          </div>
        </div>
      )}

      {bk && (
        <div className="modal-bg" onClick={(e) => { if (e.target.className === 'modal-bg') setBk(null); }}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="row-between mb">
              <h3 style={{ margin: 0 }}>Buka Kembali Hasil Pleno</h3>
              <button className="btn sm secondary" onClick={() => setBk(null)}>Tutup</button>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>
              Hasil Pleno dibuka agar nilai dapat dikoreksi dan dihitung ulang. Satdik kembali ke tahap Kunjungan Lapangan dan hasilnya disembunyikan dari sekolah sampai diproses lagi. Sertifikat yang sudah terbit tetap berlaku.
            </p>
            <div className="field">
              <label>Alasan *</label>
              <textarea rows={3} value={bk.alasan} onChange={(e) => setBk({ alasan: e.target.value })} placeholder="mis. koreksi nilai komponen C setelah rapat" />
            </div>
            <div className="row-between mt">
              <span />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn secondary" onClick={() => setBk(null)} disabled={busy}>Batal</button>
                <button className="btn amber" onClick={bukaKembali} disabled={busy}>{busy ? 'Membuka...' : 'Buka Kembali'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
