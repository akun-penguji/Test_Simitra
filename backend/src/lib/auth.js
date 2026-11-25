import jwt from 'jsonwebtoken';
import { prisma } from './prisma.js';
import { setAudit } from './audit.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret';

export function sign(user) {
  return jwt.sign(
    { id: user.id, role: user.role, username: user.username, nama: user.nama },
    SECRET,
    { expiresIn: '12h' }
  );
}

export async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token tidak ada' });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      include: { satuanPendidikan: true, kecamatan: true },
    });
    if (!user || !user.aktif) return res.status(401).json({ error: 'User tidak valid' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token tidak valid' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Akses ditolak untuk role ini' });
    }
    next();
  };
}

// Khusus Admin/Koordinator Kabupaten (TIM_KABUPATEN + isAdmin)
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'TIM_KABUPATEN' || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Khusus Admin/Koordinator Kabupaten' });
  }
  next();
}

// Memperkaya log request berjalan (aksi & detail domain). Penulisan aktual
// dilakukan middleware saat response selesai → satu baris komprehensif per request.
export async function audit(aktor, aksi, opts = {}) {
  setAudit({ aktor, aksi, entitas: opts.entitas, satuanId: opts.satuanId, detail: opts.detail });
}
