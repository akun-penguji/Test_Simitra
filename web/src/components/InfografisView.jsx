import { Stepper, StrataBadge, TahapBadge, STRATA_LABEL } from '../lib.jsx';
import { StatCard, RadialProgress, BarList } from '../charts.jsx';
import { SebaranMap } from '../map.jsx';
import { useUI } from '../ui.jsx';
import { cetakAtau, ttd, STRATA_LABEL as P_STRATA } from '../print.js';

const STRATA_LIST = ['DASAR', 'MADYA', 'UTAMA', 'PARIPURNA'];
const STRATA_LABEL_LOKAL = { DASAR: 'Dasar', MADYA: 'Madya', UTAMA: 'Utama', PARIPURNA: 'Paripurna' };
const SC = { PARIPURNA: '#1a7a3c', UTAMA: '#1e5aa8', MADYA: '#b8860b', DASAR: '#c0392b' };

// Tampilan infografis profil sekolah — dipakai sekolah (sendiri) & kabupaten (per satuan)
export default function InfografisView({ d, title = 'Infografis Profil Sekolah', sub }) {
  const { toast } = useUI();
  const { satuan: s, rincian, dokumen } = d;
  const strata = rincian?.strata;
  const komponenData = (rincian?.perKomponen || []).map((k) => ({ label: `${k.kode}. ${k.nama}`, value: k.persen, color: '#1a7a3c' }));
  const rasio = s.jumlahSiswa && s.jumlahGuru ? Math.round(s.jumlahSiswa / s.jumlahGuru) : null;
  const points = (s.latitude != null && s.longitude != null) ? [{ id: 'me', nama: s.nama, jenjang: s.jenjang, lat: s.latitude, lng: s.longitude, strata }] : [];

  function cetakInfografis() {
    const komp = rincian ? `<table><thead><tr><th>Komponen</th><th class="center">Pemenuhan</th></tr></thead><tbody>${rincian.perKomponen.map((k) => `<tr><td>${k.kode}. ${k.nama}</td><td class="center">${k.persen}%</td></tr>`).join('')}</tbody></table>` : '';
    const lvl = rincian ? `<table><thead><tr><th>Strata</th><th class="center">Poin (maks 25)</th><th class="center">Status</th></tr></thead><tbody>${STRATA_LIST.map((l) => `<tr><td>${STRATA_LABEL_LOKAL[l]}</td><td class="center">${rincian.perStrata[l]}</td><td class="center">${rincian.perStrata[l] >= 25 ? 'Tercapai' : '-'}</td></tr>`).join('')}</tbody></table>` : '';
    cetakAtau(toast, 'Infografis Profil Sekolah', `
      <div class="doc-title">Profil & Infografis Pengelolaan UKS/M</div>
      <table class="meta">
        <tr><td>Nama Satuan Pendidikan</td><td>: ${s.nama}</td></tr>
        <tr><td>NPSN</td><td>: ${s.npsn || '-'}</td></tr>
        <tr><td>Jenjang</td><td>: ${s.jenjang}</td></tr>
        <tr><td>Kecamatan</td><td>: ${s.kecamatan || '-'}</td></tr>
        <tr><td>Puskesmas Binaan</td><td>: ${s.puskesmas || '-'}</td></tr>
        <tr><td>Kepala Sekolah</td><td>: ${s.kepalaSekolah || '-'}</td></tr>
        <tr><td>Pembina UKS/M</td><td>: ${s.pembinaUks || '-'}</td></tr>
        <tr><td>Jumlah Siswa / Guru</td><td>: ${s.jumlahSiswa ?? '-'} / ${s.jumlahGuru ?? '-'}</td></tr>
        ${rincian ? `<tr><td>Nilai & Strata</td><td>: ${rincian.nilai}/100 — <b>${rincian.strata ? P_STRATA[rincian.strata] : 'Belum Mencapai Dasar'}</b></td></tr>` : ''}
      </table>
      ${rincian ? `<h3>Pemenuhan per Komponen UKS/M</h3>${komp}<h3>Capaian per Strata</h3>${lvl}` : '<p>Belum ada penilaian mandiri.</p>'}
      ${ttd('Cikarang', 'Kepala ' + s.nama)}`);
  }

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>{title}</h2>
          <p>{sub || `Ringkasan visual identitas & pengelolaan UKS/M ${s.nama}.`}</p>
        </div>
        <button className="btn secondary" onClick={cetakInfografis}>🖨️ Cetak Infografis</button>
      </div>

      <div className="card" style={{ background: 'linear-gradient(120deg,#14612f,#1a7a3c)', color: '#fff', border: 'none' }}>
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{s.nama}</div>
            <div style={{ opacity: .9, fontSize: 13, marginTop: 2 }}>NPSN {s.npsn || '-'} · Jenjang {s.jenjang} · {s.kecamatan}</div>
            <div style={{ opacity: .85, fontSize: 12.5, marginTop: 6 }}>🏥 {s.puskesmas || 'Puskesmas belum ditentukan'} · 👤 {s.kepalaSekolah || '-'}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, opacity: .85 }}>Strata Saat Ini</div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{strata ? STRATA_LABEL[strata] : 'Belum Ada'}</div>
            <TahapBadge tahap={s.tahap} />
          </div>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 18 }}>
        <StatCard icon="🎓" value={s.jumlahSiswa || 0} label="Peserta Didik" color="#1a7a3c" />
        <StatCard icon="🧑‍🏫" value={s.jumlahGuru || 0} label="Guru" color="#1e5aa8" />
        <StatCard icon="⚖️" value={rasio || 0} label="Rasio Siswa : Guru" color="#7c3aed" suffix={rasio ? ':1' : ''} />
        <StatCard icon="📋" value={rincian?.nilai || 0} label="Nilai UKS/M" color="#b8860b" suffix="/100" />
      </div>

      <div className="grid cols-3" style={{ alignItems: 'stretch' }}>
        <div className="chartcard center">
          <h3 style={{ marginBottom: 12 }}>Capaian Nilai</h3>
          <RadialProgress value={rincian?.nilai || 0} label={strata ? STRATA_LABEL[strata] : 'Belum'} color={strata ? SC[strata] : '#1a7a3c'} />
        </div>
        <div className="chartcard" style={{ gridColumn: 'span 2' }}>
          <h3>Pemenuhan per Komponen UKS/M</h3>
          <div className="chart-sub">Persentase pemenuhan indikator tiap komponen (Trias UKS + Manajemen)</div>
          {komponenData.length ? <BarList data={komponenData} color="#1a7a3c" /> : <div className="muted center" style={{ padding: 20 }}>Belum ada penilaian mandiri.</div>}
        </div>
      </div>

      {rincian && (
        <div className="chartcard" style={{ marginTop: 18 }}>
          <h3>Capaian per Strata</h3>
          <div className="chart-sub">Sebuah strata tercapai bila seluruh indikator strata itu (& strata di bawahnya) terpenuhi</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
            {STRATA_LIST.map((l) => {
              const poin = rincian.perStrata[l]; const done = poin >= 25;
              return (
                <div key={l} style={{ flex: '1 1 150px', border: `2px solid ${done ? SC[l] : '#e2e8e6'}`, borderRadius: 10, padding: 12, background: done ? SC[l] + '12' : '#fff' }}>
                  <div className="row-between">
                    <b style={{ color: done ? SC[l] : 'var(--gray)' }}>{STRATA_LABEL_LOKAL[l]}</b>
                    <span>{done ? '✅' : '⬜'}</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: done ? SC[l] : 'var(--gray)' }}>{poin}<span style={{ fontSize: 12 }}>/25</span></div>
                  <div className="barrow-track" style={{ marginTop: 4 }}><div className="barrow-fill" style={{ width: `${(poin / 25) * 100}%`, background: SC[l] }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 18 }}>
        <h3>Perjalanan Stratifikasi (16 Langkah)</h3>
        <Stepper tahap={s.tahap} />
      </div>

      <div className="grid cols-2">
        <div className="chartcard">
          <h3>Status Dokumen & Proses</h3>
          <table><tbody>
            <tr><td className="muted">Rekomendasi Kecamatan</td><td>{dokumen.rekomendasi ? <span className="badge green">Ya</span> : <span className="badge gray">Belum</span>}</td></tr>
            <tr><td className="muted">Sertifikat Kepesertaan</td><td>{dokumen.sertifikat ? <span className="badge green">{dokumen.sertifikat.nomor}</span> : <span className="badge gray">-</span>}</td></tr>
            <tr><td className="muted">Terdaftar Seleksi</td><td>{dokumen.pendaftaranSeleksi ? <span className="badge blue">{dokumen.pendaftaranSeleksi.nomorDaftar}</span> : <span className="badge gray">-</span>}</td></tr>
            <tr><td className="muted">Kunjungan Lapangan</td><td>{dokumen.kunjungan?.selesai ? <span className="badge green">Selesai</span> : dokumen.kunjungan ? <span className="badge amber">Terjadwal</span> : <span className="badge gray">-</span>}</td></tr>
            <tr><td className="muted">Peraih Penghargaan</td><td>{dokumen.hasilFinal?.peraih ? <span className="badge purple">🏆 Peraih</span> : <span className="badge gray">-</span>}</td></tr>
          </tbody></table>
        </div>
        <div className="chartcard">
          <h3>Lokasi Sekolah</h3>
          <SebaranMap points={points} height={260} />
          {!points.length && (
            <div className="muted center" style={{ fontSize: 12.5, marginTop: 8 }}>
              Koordinat lokasi belum diisi — peta menampilkan wilayah Kabupaten Bekasi.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
