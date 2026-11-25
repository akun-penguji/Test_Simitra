const BASE = '/api';

function token() {
  return localStorage.getItem('uksm_token');
}

async function req(method, path, body, isForm = false) {
  const headers = {};
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  let payload;
  if (isForm) {
    payload = body; // FormData
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new Error((data && data.error) || `Error ${res.status}`);
  }
  return data;
}

async function download(path, filename) {
  const t = token();
  const res = await fetch(BASE + path, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
  if (!res.ok) throw new Error('Gagal mengunduh');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}

// Ambil berkas berotorisasi sebagai object URL (untuk <img>/pratinjau) — berkas pribadi
// seperti pindaian tanda tangan tidak disajikan lewat folder /uploads yang terbuka.
async function blobUrl(path) {
  const t = token();
  const res = await fetch(BASE + path, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
  if (!res.ok) throw new Error('Gagal memuat berkas');
  return URL.createObjectURL(await res.blob());
}

// Unduh data array sebagai CSV (client-side) — untuk tabel kecil
function downloadCsvRows(filename, headers, rows) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const content = '﻿' + headers.map((h) => esc(h.label)).join(',') + '\n' +
    rows.map((r) => headers.map((h) => esc(h.get(r))).join(',')).join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}

export const api = {
  get: (p) => req('GET', p),
  post: (p, b) => req('POST', p, b),
  put: (p, b) => req('PUT', p, b),
  del: (p) => req('DELETE', p),
  postForm: (p, form) => req('POST', p, form, true),
  putForm: (p, form) => req('PUT', p, form, true),
  download,
  blobUrl,
  downloadCsvRows,
};
