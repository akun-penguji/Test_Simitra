import crypto from 'crypto';

// Enkripsi field sensitif "at rest" dengan AES-256-GCM.
// Kunci diturunkan dari ENCRYPTION_KEY (atau JWT_SECRET) via scrypt.
const SECRET = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'simitra-default-key';
const KEY = crypto.scryptSync(SECRET, 'simitra-audit-salt-v1', 32);
const PREFIX = 'enc:v1:';

export function enc(text) {
  if (text == null || text === '') return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

export function dec(text) {
  if (typeof text !== 'string' || !text.startsWith(PREFIX)) return text;
  try {
    const raw = Buffer.from(text.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), ct = raw.subarray(28);
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  } catch {
    return '***';
  }
}
