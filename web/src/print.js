// Utilitas cetak: membuka dokumen berkop resmi lalu print/simpan PDF.

const STYLE = `
  * { box-sizing: border-box; font-family: 'Times New Roman', Georgia, serif; }
  body { margin: 0; padding: 32px 40px; color: #111; font-size: 12pt; }
  .kop { display: flex; align-items: center; gap: 16px; border-bottom: 3px double #111; padding-bottom: 12px; margin-bottom: 6px; }
  .kop .kop-logo { width: 88px; height: 88px; object-fit: contain; }
  .kop .t { text-align: center; flex: 1; }
  .kop .t .l1 { font-size: 13pt; font-weight: bold; letter-spacing: .5px; }
  .kop .t .l2 { font-size: 16pt; font-weight: bold; }
  .kop .t .l3 { font-size: 10pt; }
  .doc-title { text-align: center; font-weight: bold; font-size: 13pt; margin: 22px 0 4px; text-transform: uppercase; text-decoration: underline; }
  .doc-no { text-align: center; font-size: 11pt; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11pt; }
  th, td { border: 1px solid #333; padding: 6px 8px; text-align: left; }
  th { background: #eee; }
  .meta td { border: none; padding: 2px 4px; }
  .meta td:first-child { width: 190px; }
  .right { text-align: right; } .center { text-align: center; }
  .ttd { margin-top: 40px; width: 300px; margin-left: auto; text-align: center; }
  .ttd .sp { height: 70px; }
  .badge { padding: 2px 8px; border: 1px solid #333; border-radius: 4px; font-size: 10pt; }
  .foot { margin-top: 24px; font-size: 9pt; color: #555; border-top: 1px solid #ccc; padding-top: 6px; }
  h3 { font-size: 12pt; margin: 18px 0 6px; }
  @media print { body { padding: 12px 18px; } .noprint { display: none; } }
`;

function kop() {
  const base = (typeof location !== 'undefined' ? location.origin : '');
  return `
    <div class="kop">
      <img class="kop-logo" src="${base}/logo-bekasi.png" alt="" />
      <div class="t">
        <div class="l1">PEMERINTAH KABUPATEN BEKASI</div>
        <div class="l2">TIM PEMBINA UKS/M KABUPATEN BEKASI</div>
        <div class="l3">Bagian Kesejahteraan Rakyat Sekretariat Daerah Kabupaten Bekasi</div>
        <div class="l3"><b>SIMITRA</b> — Sistem Informasi Stratifikasi UKS/M</div>
      </div>
      <img class="kop-logo" src="${base}/logo-uks.png" alt="" />
    </div>`;
}

// Mengembalikan false bila jendela cetak diblokir peramban, agar pemanggil
// menampilkan pesannya memakai toast aplikasi (bukan dialog bawaan peramban).
export const PESAN_POPUP_DIBLOKIR = 'Jendela cetak diblokir peramban. Izinkan popup untuk situs ini lalu coba lagi.';

export function cetak(title, contentHtml) {
  const w = window.open('', '_blank', 'width=980,height=760');
  if (!w) return false;
  const tgl = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${title}</title><style>${STYLE}</style></head>
    <body>${kop()}${contentHtml}
    <div class="foot">Dicetak dari Sistem Informasi Stratifikasi UKS/M Kabupaten Bekasi · ${tgl}</div>
    </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 400);
  return true;
}

// Cetak sekaligus menampilkan pesan lewat toast aplikasi bila popup diblokir.
export function cetakAtau(toast, title, contentHtml) {
  if (!cetak(title, contentHtml)) toast(PESAN_POPUP_DIBLOKIR, 'error');
}

export function ttd(kota = 'Cikarang', jabatan = 'Ketua Tim Pembina UKS/M Kabupaten Bekasi') {
  const tgl = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<div class="ttd">${kota}, ${tgl}<br/>${jabatan}<div class="sp"></div><b>_____________________</b></div>`;
}

export const STRATA_LABEL = { DASAR: 'Dasar', MADYA: 'Madya', UTAMA: 'Utama', PARIPURNA: 'Paripurna' };
