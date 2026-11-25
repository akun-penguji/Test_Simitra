// ============================================================================
// Uji asap rute SIMITRA — membuka setiap halaman dengan peramban sungguhan
// (Chrome via CDP), lalu melaporkan galat konsol dan halaman kosong.
//
//   node tools/cek-rute.mjs                        # localhost:5184
//   node tools/cek-rute.mjs https://simitra.gokar.id
//   node tools/cek-rute.mjs <url> --sandi=demo123 --akun=demo_koordinator,demo_sd_final
//
// Diperlukan karena `vite build` LULUS meski ada identifier tak terdefinisi di
// JSX — halaman baru ketahuan mati saat dijalankan (kasus /seleksi blank putih).
// ============================================================================
import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const argv = process.argv.slice(2);
const BASIS = (argv.find((a) => !a.startsWith('--')) || 'http://localhost:5184').replace(/\/$/, '');
const arg = (n, b) => (argv.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${b}`).split('=').slice(1).join('=');
const SANDI = arg('sandi', 'demo123');

const RUTE = {
  SATUAN_PENDIDIKAN: ['/', '/infografis', '/profil', '/penilaian', '/hasil-strata', '/eviden', '/dokumen', '/riwayat', '/informasi'],
  TP_KECAMATAN: ['/', '/tim', '/verifikasi', '/rekomendasi', '/surat-rekomendasi', '/peta', '/peta-puskesmas', '/riwayat', '/informasi'],
  TIM_KABUPATEN: ['/', '/data-awal', '/review', '/seleksi', '/kunjungan', '/strata-akhir', '/final', '/rekap', '/peta', '/peta-puskesmas',
    '/instrumen', '/periode', '/nomor-surat', '/pengaturan-sertifikat', '/surat-rekomendasi', '/akun', '/sekolah', '/peraih', '/log-audit', '/riwayat', '/informasi'],
};

const AKUN_BAWAAN = ['demo_koordinator', 'demo_penilai_a', 'demo_kec_cikarangutara', 'demo_kec_cibitung_a',
  'demo_sd_final', 'demo_sd_eviden', 'demo_sd_juara', 'demo_tk_registrasi'];
const AKUN = arg('akun', AKUN_BAWAAN.join(',')).split(',').filter(Boolean);

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9222 + Math.floor(Math.random() * 400);
const profil = mkdtempSync(path.join(tmpdir(), 'cek-rute-'));
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });

async function targetWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const l = await r.json();
      const p = l.find((x) => x.type === 'page');
      if (p) return p.webSocketDebuggerUrl;
    } catch (_) {}
    await tidur(250);
  }
  throw new Error('Chrome tidak siap');
}

function sambung(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const tunggu = new Map();
    const peristiwa = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); }
      else if (m.method) peristiwa.push(m);
    };
    ws.onerror = reject;
    ws.onopen = () => resolve({
      kirim: (method, params = {}) => new Promise((res) => { const i = ++id; tunggu.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }),
      peristiwa, tutup: () => ws.close(),
    });
  });
}

const galatKonsol = [];
function pasangPendengar(cdp) {
  cdp.kirim('Runtime.enable'); cdp.kirim('Page.enable'); cdp.kirim('Log.enable');
}
function panenGalat(cdp) {
  const keluar = [];
  for (const p of cdp.peristiwa.splice(0)) {
    if (p.method === 'Runtime.exceptionThrown') {
      const d = p.params.exceptionDetails;
      keluar.push(d.exception?.description || d.text);
    } else if (p.method === 'Runtime.consoleAPICalled' && p.params.type === 'error') {
      keluar.push(p.params.args.map((a) => a.description || a.value).join(' '));
    } else if (p.method === 'Log.entryAdded' && p.params.entry.level === 'error') {
      const t = p.params.entry.text || '';
      if (!/favicon|manifest/i.test(t)) keluar.push(t);
    }
  }
  return keluar;
}

async function evaluasi(cdp, ekspresi) {
  const r = await cdp.kirim('Runtime.evaluate', { expression: ekspresi, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
}

async function main() {
  const cdp = await sambung(await targetWs());
  pasangPendengar(cdp);
  await tidur(300);

  let masalah = 0, diperiksa = 0;
  for (const username of AKUN) {
    // Login lewat API lalu tanam token ke localStorage
    const login = await fetch(`${BASIS}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: SANDI }),
    });
    if (!login.ok) { console.log(`❌ login ${username} → ${login.status}`); masalah++; continue; }
    const { token, user } = await login.json();

    await cdp.kirim('Page.navigate', { url: BASIS });
    await tidur(900);
    await evaluasi(cdp, `localStorage.setItem('uksm_token', ${JSON.stringify(token)})`);
    console.log(`\n🔑 ${username} (${user.role})`);

    for (const rute of RUTE[user.role]) {
      await cdp.kirim('Page.navigate', { url: BASIS + rute });
      await tidur(1200);
      panenGalat(cdp); // buang galat saat pemuatan ulang
      // Tunggu sampai isi halaman benar-benar muncul (maks 12 dtk) — jeda tetap
      // terlalu singkat untuk peladen jauh dan menimbulkan "halaman kosong" palsu.
      let teks = 0;
      for (let i = 0; i < 24; i++) {
        teks = await evaluasi(cdp, `(document.getElementById('root')?.innerText || '').trim().length`);
        if (teks >= 30) break;
        await tidur(500);
      }
      await tidur(600);
      const galat = panenGalat(cdp);
      diperiksa++;
      const kosong = !teks || teks < 30;
      if (galat.length || kosong) {
        masalah++;
        console.log(`   ❌ ${rute.padEnd(22)} ${kosong ? 'HALAMAN KOSONG' : ''}`);
        for (const g of galat.slice(0, 3)) console.log(`      ↳ ${String(g).split('\n')[0].slice(0, 160)}`);
      } else {
        console.log(`   ✅ ${rute.padEnd(22)} ${teks} karakter`);
      }
    }
  }
  cdp.tutup();
  console.log(`\n${masalah ? '❌' : '✅'} ${diperiksa - masalah}/${diperiksa} rute bersih${masalah ? ` — ${masalah} bermasalah` : ''}`);
  return masalah;
}

main().then((m) => { chrome.kill(); try { rmSync(profil, { recursive: true, force: true, maxRetries: 3 }); } catch (_) {}; process.exit(m ? 1 : 0); })
  .catch((e) => { console.error(e); chrome.kill(); try { rmSync(profil, { recursive: true, force: true, maxRetries: 3 }); } catch (_) {}; process.exit(1); });
