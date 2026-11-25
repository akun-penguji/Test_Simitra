// Pengaturan unggah berkas bersama (eviden stratifikasi & lampiran penilaian mandiri):
// satu tempat agar format, batas ukuran, dan pesan galatnya seragam.
import multer from 'multer';
import path from 'path';
import fs from 'fs';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Format yang diterima: dokumen (PDF/Word/Excel/PowerPoint), gambar, dan video.
export const ALLOWED_EXT = [
  '.pdf',
  '.doc', '.docx', '.rtf', '.odt',
  '.xls', '.xlsx', '.csv', '.ods',
  '.ppt', '.pptx', '.odp',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic',
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.3gp', '.m4v',
];
export const MAKS_BERKAS = 10;              // berkas per indikator dalam sekali unggah
export const MAKS_UKURAN = 100 * 1024 * 1024; // 100 MB per berkas (mendukung video)

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '_').slice(0, 40);
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

export const unggah = multer({
  storage,
  limits: { fileSize: MAKS_UKURAN, files: MAKS_BERKAS },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXT.includes(ext)) cb(null, true);
    else cb(new Error(`Format ${ext || 'berkas'} tidak didukung. Didukung: PDF, Word, Excel, PowerPoint, JPG, JPEG, PNG, dan video.`));
  },
});

// Bungkus multer agar galat format/ukuran menjadi 400, bukan 500
export function unggahBerkas(req, res, next) {
  unggah.array('file', MAKS_BERKAS)(req, res, (err) => {
    if (err) {
      const pesan = err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran berkas melebihi 100 MB.'
        : err.code === 'LIMIT_FILE_COUNT' ? `Maksimal ${MAKS_BERKAS} berkas dalam sekali unggah.`
        : err.message || 'Gagal mengunggah berkas';
      return res.status(400).json({ error: pesan });
    }
    next();
  });
}

// Menormalkan masukan tautan: bisa satu string, banyak field, atau JSON array
export function daftarTautan(body) {
  const mentah = body.tautan ?? body.fileUrl;
  if (mentah == null || mentah === '') return [];
  let arr = Array.isArray(mentah) ? mentah : [mentah];
  if (arr.length === 1 && typeof arr[0] === 'string' && arr[0].trim().startsWith('[')) {
    try { arr = JSON.parse(arr[0]); } catch { /* biarkan sebagai satu tautan */ }
  }
  return arr.map((u) => String(u).trim()).filter(Boolean);
}

// Hapus berkas fisik bila ada
export function hapusBerkasFisik(filePath) {
  if (!filePath) return;
  try { fs.unlinkSync(path.join(UPLOAD_DIR, filePath)); } catch { /* berkas mungkin sudah hilang */ }
}
