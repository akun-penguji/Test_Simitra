import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import masterRoutes from './routes/master.js';
import satuanRoutes from './routes/satuan.js';
import penilaianRoutes from './routes/penilaian.js';
import kecamatanRoutes from './routes/kecamatan.js';
import evidenRoutes from './routes/eviden.js';
import kabupatenRoutes from './routes/kabupaten.js';
import adminRoutes from './routes/admin.js';
import cetakRoutes from './routes/cetak.js';
import plenoRoutes from './routes/pleno.js';
import suratRoutes from './routes/surat.js';
import notifikasiRoutes from './routes/notifikasi.js';
import beritaRoutes from './routes/berita.js';
import { als } from './lib/context.js';
import { writeAccessLog } from './lib/audit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Konteks per-request + audit menyeluruh real-time (setiap request tercatat saat selesai)
app.use((req, res, next) => {
  const store = { req };
  als.run(store, () => {
    res.on('finish', () => { writeAccessLog(req, res, store); });
    next();
  });
});

// file eviden yang diupload
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
// Lampiran PDF berita hanya disajikan lewat endpoint (memeriksa status terbit), bukan folder terbuka.
app.use('/uploads/berita-pdf', (req, res) => res.status(404).json({ error: 'Tidak ditemukan' }));
app.use('/uploads', express.static(path.resolve(UPLOAD_DIR)));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'UKS/M Stratifikasi Kabupaten Bekasi' }));

app.use('/api/auth', authRoutes);
app.use('/api/berita', beritaRoutes); // publik — wajib sebelum router '/api' yang memakai authRequired
app.use('/api', masterRoutes);
app.use('/api', notifikasiRoutes);
app.use('/api/satuan', satuanRoutes);
app.use('/api/penilaian', penilaianRoutes);
app.use('/api/kecamatan', kecamatanRoutes);
app.use('/api/eviden', evidenRoutes);
app.use('/api/kabupaten', kabupatenRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cetak', cetakRoutes);
app.use('/api/pleno', plenoRoutes);
app.use('/api/surat-rekomendasi', suratRoutes);

// error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Kesalahan server' });
});

// Jaring pengaman: jangan pernah crash server karena satu request bermasalah
process.on('unhandledRejection', (err) => { console.error('⚠️ unhandledRejection:', err?.message || err); });
process.on('uncaughtException', (err) => { console.error('⚠️ uncaughtException:', err?.message || err); });

const PORT = process.env.PORT || 5020;
app.listen(PORT, () => {
  console.log(`\n🏫 API Stratifikasi UKS/M Kabupaten Bekasi berjalan di http://localhost:${PORT}`);
});
