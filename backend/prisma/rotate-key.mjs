// Rotasi kunci enkripsi audit log: re-enkripsi semua field sensitif dari
// OLD_ENCRYPTION_KEY -> NEW_ENCRYPTION_KEY. Aman & idempoten per baris.
//
// Jalankan (produksi):
//   docker exec -e OLD_ENCRYPTION_KEY='<lama>' -e NEW_ENCRYPTION_KEY='<baru>' \
//     simitra-backend-1 node prisma/rotate-key.mjs
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();
const SALT = 'simitra-audit-salt-v1';
const PREFIX = 'enc:v1:';
const FIELDS = ['aktor', 'username', 'ip', 'path', 'detail', 'userAgent'];

function keyOf(secret) { return crypto.scryptSync(secret, SALT, 32); }
function encWith(KEY, text) {
  if (text == null || text === '') return text;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
function decWith(KEY, text) {
  if (typeof text !== 'string' || !text.startsWith(PREFIX)) return text; // legacy plaintext
  const raw = Buffer.from(text.slice(PREFIX.length), 'base64');
  const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), ct = raw.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

async function main() {
  const OLD = process.env.OLD_ENCRYPTION_KEY;
  const NEW = process.env.NEW_ENCRYPTION_KEY;
  if (!OLD || !NEW) { console.error('❌ Set OLD_ENCRYPTION_KEY dan NEW_ENCRYPTION_KEY'); process.exit(1); }
  const oldKey = keyOf(OLD), newKey = keyOf(NEW);

  const total = await prisma.auditLog.count();
  console.log(`🔐 Rotasi kunci untuk ${total} baris AuditLog...`);
  let done = 0, failed = 0;
  const batch = 500;
  for (let skip = 0; skip < total; skip += batch) {
    const rows = await prisma.auditLog.findMany({ skip, take: batch, orderBy: { createdAt: 'asc' } });
    for (const row of rows) {
      const data = {};
      for (const f of FIELDS) {
        const v = row[f];
        if (v == null) continue;
        try { data[f] = encWith(newKey, decWith(oldKey, v)); }
        catch { failed++; /* baris tak bisa didekripsi dgn OLD (mungkin kunci lain) — dilewati */ }
      }
      if (Object.keys(data).length) await prisma.auditLog.update({ where: { id: row.id }, data });
      done++;
    }
    console.log(`   ...${Math.min(skip + batch, total)}/${total}`);
  }
  console.log(`✅ Selesai. ${done} baris diproses${failed ? `, ${failed} field gagal (dilewati)` : ''}.`);
  console.log('   Sekarang perbarui ENCRYPTION_KEY di compose ke kunci BARU lalu restart backend.');
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
