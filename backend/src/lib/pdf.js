// Pembuat berkas PDF berkop surat resmi untuk hasil scoring.
// Memakai pdfkit (murni JavaScript, tanpa peramban) agar hasil dapat diunduh
// langsung sebagai PDF — bukan sekadar dialog cetak.
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ASET = path.join(DIR, '../../assets');
const logo = (n) => { const f = path.join(ASET, n); return fs.existsSync(f) ? f : null; };

const ABU = '#555555';
const GARIS = '#333333';

// Kop surat resmi Pemerintah Kabupaten Bekasi
export function kopSurat(doc) {
  const kiri = logo('logo-bekasi.png');
  const kanan = logo('logo-uks.png');
  const atas = doc.y;
  if (kiri) doc.image(kiri, 50, atas, { fit: [66, 66] });
  if (kanan) doc.image(kanan, doc.page.width - 116, atas, { fit: [66, 66] });

  doc.font('Times-Bold').fontSize(12).fillColor('#000')
    .text('PEMERINTAH KABUPATEN BEKASI', 123, atas + 2, { width: doc.page.width - 246, align: 'center' });
  doc.font('Times-Bold').fontSize(14)
    .text('TIM PEMBINA UKS/M KABUPATEN BEKASI', { width: doc.page.width - 246, align: 'center' });
  doc.font('Times-Roman').fontSize(9)
    .text('Bagian Kesejahteraan Rakyat Sekretariat Daerah Kabupaten Bekasi', { width: doc.page.width - 246, align: 'center' });
  doc.font('Times-Roman').fontSize(9)
    .text('SIMITRA — Sistem Informasi Stratifikasi UKS/M', { width: doc.page.width - 246, align: 'center' });

  const y = Math.max(doc.y, atas + 70) + 6;
  doc.moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(2).strokeColor('#000').stroke();
  doc.moveTo(50, y + 3).lineTo(doc.page.width - 50, y + 3).lineWidth(0.8).stroke();
  doc.y = y + 14;
  doc.x = 50;
}

// Kop surat Tim Pembina UKS/M KECAMATAN — dipakai pada laporan hasil penilaian
// yang diterbitkan kecamatan (bukan kabupaten).
export function kopSuratKecamatan(doc, namaKecamatan) {
  const kec = String(namaKecamatan || '').trim();
  const kiri = logo('logo-bekasi.png');
  const kanan = logo('logo-uks.png');
  const atas = doc.y;
  if (kiri) doc.image(kiri, 50, atas, { fit: [66, 66] });
  if (kanan) doc.image(kanan, doc.page.width - 116, atas, { fit: [66, 66] });

  const lebar = doc.page.width - 246;
  doc.font('Times-Bold').fontSize(11).fillColor('#000')
    .text('PEMERINTAH KABUPATEN BEKASI', 123, atas + 2, { width: lebar, align: 'center' });
  doc.font('Times-Bold').fontSize(12)
    .text(`KECAMATAN ${kec.toUpperCase()}`, { width: lebar, align: 'center' });
  doc.font('Times-Bold').fontSize(13)
    .text(`TIM PEMBINA UKS/M KECAMATAN ${kec.toUpperCase()}`, { width: lebar, align: 'center' });
  doc.font('Times-Roman').fontSize(9)
    .text('SIMITRA — Sistem Informasi Stratifikasi UKS/M Kabupaten Bekasi', { width: lebar, align: 'center' });

  const y = Math.max(doc.y, atas + 70) + 6;
  doc.moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(2).strokeColor('#000').stroke();
  doc.moveTo(50, y + 3).lineTo(doc.page.width - 50, y + 3).lineWidth(0.8).stroke();
  doc.y = y + 14;
  doc.x = 50;
}

// Judul bagian; posisi X selalu dikembalikan ke margin kiri agar tidak membungkus
export function subJudul(doc, teks) {
  doc.x = 50;
  doc.font('Times-Bold').fontSize(11).fillColor('#000').text(teks, 50, doc.y, { width: doc.page.width - 100 });
  doc.moveDown(0.25);
  doc.x = 50;
}

// Angka format Indonesia (pemisah desimal koma)
export const angka = (n, d = 2) =>
  (n == null || Number.isNaN(Number(n)))
    ? '-'
    : Number(n).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });

export function judul(doc, teks, subjudul) {
  doc.x = 50;
  doc.font('Times-Bold').fontSize(13).fillColor('#000')
    .text(teks.toUpperCase(), { align: 'center', underline: true });
  if (subjudul) doc.font('Times-Roman').fontSize(10).text(subjudul, { align: 'center' });
  doc.moveDown(0.8);
}

// Tabel identitas dua kolom (tanpa garis)
export function meta(doc, baris) {
  doc.x = 50;
  doc.font('Times-Roman').fontSize(10.5).fillColor('#000');
  for (const [k, v] of baris) {
    const y = doc.y;
    doc.text(k, 50, y, { width: 160, continued: false });
    doc.text(': ' + (v ?? '-'), 210, y, { width: doc.page.width - 260 });
    doc.moveDown(0.15);
  }
  doc.moveDown(0.6);
}

// Tabel bergaris dengan lebar kolom relatif
export function tabel(doc, kolom, baris, opsi = {}) {
  const kiri = 50;
  const lebarTotal = doc.page.width - 100;
  const lebar = kolom.map((k) => (k.lebar / 100) * lebarTotal);
  const pad = 4;
  const fs1 = opsi.fontSize || 9.5;

  const tinggiBaris = (sel) => {
    let t = 0;
    sel.forEach((teks, i) => {
      doc.font('Times-Roman').fontSize(fs1);
      const h = doc.heightOfString(String(teks ?? ''), { width: lebar[i] - pad * 2 });
      if (h > t) t = h;
    });
    return t + pad * 2;
  };

  const gambarBaris = (sel, { tebal = false, latar = null } = {}) => {
    const h = tinggiBaris(sel);
    if (doc.y + h > doc.page.height - 70) { doc.addPage(); doc.y = 50; }
    const y = doc.y;
    let x = kiri;
    sel.forEach((teks, i) => {
      if (latar) doc.rect(x, y, lebar[i], h).fillColor(latar).fill();
      doc.rect(x, y, lebar[i], h).lineWidth(0.7).strokeColor(GARIS).stroke();
      doc.font(tebal ? 'Times-Bold' : 'Times-Roman').fontSize(fs1).fillColor('#000')
        .text(String(teks ?? ''), x + pad, y + pad, { width: lebar[i] - pad * 2, align: kolom[i].align || 'left' });
      x += lebar[i];
    });
    doc.y = y + h;
  };

  gambarBaris(kolom.map((k) => k.judul), { tebal: true, latar: '#e9e9e9' });
  for (const b of baris) gambarBaris(b.sel || b, { tebal: b.tebal, latar: b.latar });
  doc.x = 50;
  doc.moveDown(0.6);
}

// Blok tanda tangan di kanan bawah
export function tandaTangan(doc, jabatan = 'Ketua Tim Pembina UKS/M Kabupaten Bekasi', kota = 'Cikarang') {
  const tgl = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  if (doc.y > doc.page.height - 170) { doc.addPage(); doc.y = 50; }
  doc.moveDown(1);
  const x = doc.page.width - 260;
  doc.font('Times-Roman').fontSize(10.5).fillColor('#000');
  doc.text(`${kota}, ${tgl}`, x, doc.y, { width: 210, align: 'center' });
  doc.text(jabatan, { width: 210, align: 'center' });
  doc.moveDown(3.5);
  doc.text('_________________________', x, doc.y, { width: 210, align: 'center' });
}

// Tanda tangan pejabat dengan pindaian tanda tangan (gambar) — dipakai sertifikat.
// Diletakkan di kanan pada ketinggian `y` supaya posisinya tetap & tidak menyeberang
// halaman. `gambar` adalah Buffer PNG/JPG; bila kosong disisakan ruang untuk tanda tangan basah.
export function tandaTanganPejabat(doc, { kota = 'Cikarang', tanggal = new Date(), jabatan, nama, nip, gambar, y, lebar = 250 }) {
  const tgl = new Date(tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const x = doc.page.width - lebar - 60;
  let yy = y ?? doc.y;
  doc.font('Times-Roman').fontSize(11).fillColor('#000');
  doc.text(`${kota}, ${tgl}`, x, yy, { width: lebar, align: 'center' });
  doc.text(jabatan, x, doc.y, { width: lebar, align: 'center' });
  const yGambar = doc.y + 4;
  const tinggiGambar = 58;
  if (gambar) {
    try { doc.image(gambar, x + (lebar - 150) / 2, yGambar, { fit: [150, tinggiGambar], align: 'center', valign: 'center' }); }
    catch { /* gambar rusak: biarkan ruang kosong untuk tanda tangan basah */ }
  }
  const yNama = yGambar + tinggiGambar + 4;
  doc.font('Times-Bold').fontSize(11).text(nama || '_________________________', x, yNama, { width: lebar, align: 'center', underline: !!nama });
  if (nip) doc.font('Times-Roman').fontSize(10).text(`NIP. ${nip}`, x, doc.y, { width: lebar, align: 'center' });
  doc.x = 50;
}

// Dua blok tanda tangan berdampingan (mis. Ketua Tim Stratifikasi Kabupaten
// dan Ketua Tim Pembina UKS/M Kecamatan).
export function tandaTanganGanda(doc, kiri, kanan, kota = 'Cikarang') {
  const tgl = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  if (doc.y > doc.page.height - 200) { doc.addPage(); doc.y = 50; }
  doc.moveDown(1);
  const lebar = (doc.page.width - 100) / 2 - 10;
  const xKiri = 50;
  const xKanan = 50 + lebar + 20;

  doc.font('Times-Roman').fontSize(10.5).fillColor('#000');
  doc.text(`${kota}, ${tgl}`, xKanan, doc.y, { width: lebar, align: 'center' });
  const yJabatan = doc.y;
  doc.text(kiri.jabatan, xKiri, yJabatan, { width: lebar, align: 'center' });
  const yKiriAkhir = doc.y;
  doc.text(kanan.jabatan, xKanan, yJabatan, { width: lebar, align: 'center' });
  const y = Math.max(yKiriAkhir, doc.y) + 54;

  doc.font('Times-Bold').fontSize(10.5);
  doc.text(kiri.nama || '_________________________', xKiri, y, { width: lebar, align: 'center', underline: !!kiri.nama });
  doc.text(kanan.nama || '_________________________', xKanan, y, { width: lebar, align: 'center', underline: !!kanan.nama });
  doc.font('Times-Roman').fontSize(9).fillColor(ABU);
  const yNip = Math.max(doc.y, y + 14);
  if (kiri.ket) doc.text(kiri.ket, xKiri, yNip, { width: lebar, align: 'center' });
  if (kanan.ket) doc.text(kanan.ket, xKanan, yNip, { width: lebar, align: 'center' });
  doc.fillColor('#000');
  doc.x = 50;
  doc.y = Math.max(doc.y, yNip) + 6;
}

// Legenda nilai skoring eviden (skala 0–3) sesuai keputusan Tim Pembina
export const LEGENDA_SKOR = [
  ['0', 'Eviden Tidak Ada / Tidak Sesuai'],
  ['1', 'Eviden Ada, Kurang Sesuai'],
  ['2', 'Eviden Ada, Cukup Sesuai'],
  ['3', 'Eviden Ada, Sangat Sesuai'],
];

export function legendaSkor(doc, judulTeks = 'Legenda Nilai Skoring Eviden') {
  subJudul(doc, judulTeks);
  tabel(doc,
    [{ judul: 'Nilai', lebar: 14, align: 'center' }, { judul: 'Keterangan', lebar: 86 }],
    LEGENDA_SKOR.map(([n, k]) => [n, k]), { fontSize: 9.5 });
}

// Legenda satu baris untuk lembar isian yang ruangnya sempit (kertas kerja lapangan)
export function legendaSkorRingkas(doc) {
  doc.x = 50;
  doc.font('Times-Bold').fontSize(9).fillColor('#000').text('Legenda nilai: ', 40, doc.y, { continued: true, width: doc.page.width - 80 });
  doc.font('Times-Roman').text(LEGENDA_SKOR.map(([n, k]) => `${n} = ${k}`).join('   ·   '), { width: doc.page.width - 80 });
  doc.moveDown(0.5);
  doc.x = 50;
}

export function kakiHalaman(doc) {
  const tgl = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
  const rentang = doc.bufferedPageRange();
  for (let i = 0; i < rentang.count; i++) {
    doc.switchToPage(rentang.start + i);
    // Kaki halaman ditulis DI BAWAH margin bawah. Tanpa menihilkannya sementara,
    // pdfkit menganggap teks meluap dan membuat halaman baru (dua halaman kosong per
    // halaman isi). Margin dikembalikan setelah kaki halaman selesai ditulis.
    const margeBawah = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 48;
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(0.5).strokeColor('#bbbbbb').stroke();
    doc.font('Times-Roman').fontSize(8).fillColor(ABU)
      .text(`Dicetak dari SIMITRA — Sistem Informasi Stratifikasi UKS/M Kabupaten Bekasi · ${tgl}`, 50, y + 5, {
        width: doc.page.width - 100, align: 'left', lineBreak: false,
      })
      .text(`Halaman ${i + 1} dari ${rentang.count}`, 50, y + 5, {
        width: doc.page.width - 100, align: 'right', lineBreak: false,
      });
    doc.page.margins.bottom = margeBawah;
  }
}

// Membuka dokumen PDF baru dan mengalirkannya sebagai unduhan
export function mulaiPdf(res, namaBerkas, opsi = {}) {
  const doc = new PDFDocument({
    size: opsi.size || 'A4', layout: opsi.size ? undefined : (opsi.layout || 'portrait'),
    margins: opsi.margins || { top: 50, bottom: 60, left: 50, right: 50 },
    bufferPages: true,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${namaBerkas}"`);
  doc.pipe(res);
  return doc;
}

export function selesaiPdf(doc) {
  kakiHalaman(doc);
  doc.end();
}

export const fmtTgl = (d) => (d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-');
