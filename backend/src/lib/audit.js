import { prisma } from './prisma.js';
import { ctx } from './context.js';
import { enc } from './crypto.js';

// Path yang tidak dicatat (polling/berisik)
const SKIP = new Set(['/api/health', '/api/notifikasi', '/api/periode/aktif', '/api/auth/me']);
function skip(path, method) {
  if (method === 'OPTIONS') return true;
  const clean = path.split('?')[0];
  if (SKIP.has(clean)) return true;
  if (clean.startsWith('/uploads')) return true;
  if (clean === '/api/riwayat' || clean.startsWith('/api/kabupaten/audit')) return true; // hindari log saat membaca log
  return false;
}

// Label aksi manusiawi bila tidak diisi handler
function labelAksi(method, path, status) {
  const p = path.split('?')[0];
  if (p === '/api/auth/login') return status < 400 ? 'Login berhasil' : 'Login GAGAL';
  if (p === '/api/auth/register') return 'Registrasi akun';
  if (p === '/api/auth/ubah-password') return 'Ubah password';
  const map = { GET: 'Lihat', POST: 'Tambah/Proses', PUT: 'Ubah', DELETE: 'Hapus' };
  return `${map[method] || method} ${p.replace('/api/', '')}`;
}

// Dipanggil handler untuk memperkaya log request berjalan (aksi/entitas/satuanId/detail)
export function setAudit(opts = {}) {
  const store = ctx();
  if (store) store.audit = { ...(store.audit || {}), ...opts };
}

// Ditulis oleh middleware saat response selesai — satu baris komprehensif per request
export async function writeAccessLog(req, res, store) {
  try {
    if (skip(req.originalUrl || req.path, req.method)) return;
    const o = (store && store.audit) || (ctx().audit) || {};
    const status = res.statusCode;
    const user = req.user || null;
    const usernameAttempt = user?.username || req.body?.username || null;
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || req.socket?.remoteAddress || null;

    await prisma.auditLog.create({
      data: {
        aktor: enc(o.aktor || user?.nama || null),
        username: enc(usernameAttempt),
        role: user?.role || 'ANONIM',
        ip: enc(ip),
        method: req.method,
        path: enc(req.originalUrl || req.path),
        aksi: o.aksi || labelAksi(req.method, req.originalUrl || req.path, status),
        entitas: o.entitas || null,
        satuanId: o.satuanId || null,
        detail: enc(o.detail || null),
        statusCode: status,
        userAgent: enc(req.headers['user-agent'] || null),
      },
    });
  } catch (_) { /* jangan pernah gagalkan request karena audit */ }
}
