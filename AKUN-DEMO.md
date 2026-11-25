# Akun Demo SIMITRA

Sistem Informasi Stratifikasi UKS/M Kabupaten Bekasi — <https://simitra.gokar.id>

Seluruh akun demo memakai kata sandi **`demo123`** dan username berawalan `demo_`
sehingga mudah dibedakan dari akun sungguhan.

```bash
# membuat / memperbarui (idempoten — aman dijalankan berulang)
node prisma/akun-demo.mjs
node prisma/akun-demo.mjs --sandi=rahasia123     # kata sandi lain

# menghapus kembali seluruh akun demo beserta datanya
node prisma/akun-demo.mjs --bersihkan
```

## 0. Tampil di halaman login

Panel **“Akun demo — klik salah satu untuk langsung masuk”** ada di bawah tombol
Masuk. Isinya dibaca langsung dari basis data lewat endpoint publik
`GET /api/auth/akun-demo` (hanya akun berawalan `demo_` dan berstatus aktif),
dikelompokkan Tim Kabupaten → Kecamatan → Satuan Pendidikan, dan satuan
pendidikan diurutkan mengikuti tahap alur. Sekali klik langsung mengisi
username + kata sandi lalu masuk.

Bila akun demo dihapus (`--bersihkan`), endpoint membalas `{ada:false}` dan
panelnya **hilang sendiri** dari halaman login — tidak ada yang perlu disunting.

Kata sandi yang ditampilkan mengikuti env `SANDI_DEMO` (bawaan `demo123`); bila
akun dibuat dengan `--sandi=xxx`, setel juga `SANDI_DEMO=xxx` pada backend.

## 1. Tim Kabupaten (7 akun)

Memperagakan **klasifikasi penilai**: seorang penilai hanya berwenang menilai
komponen yang ditugaskan kepadanya (review eviden, seleksi administrasi, dan
peninjauan lapangan). Koordinator berwenang atas seluruh komponen.

| Username | Wewenang | Nama |
|---|---|---|
| `demo_koordinator` | Koordinator — seluruh komponen + menu admin | Dr. Hendra Wijaya, M.Kes |
| `demo_penilai_a` | Komponen A — Pendidikan Kesehatan | Rina Kartika, S.Pd |
| `demo_penilai_b` | Komponen B — Pelayanan Kesehatan | dr. Anisa Rahmawati |
| `demo_penilai_c` | Komponen C — Pembinaan Lingkungan Sekolah Sehat | Ir. Bambang Setiawan |
| `demo_penilai_d` | Komponen D — Tata Kelola dan Kepemimpinan Sekolah | Dewi Lestari, M.M |
| `demo_penilai_ac` | Komponen A **dan** C (penilai lintas komponen) | Agus Priyanto, S.KM |
| `demo_penilai_baru` | Belum ditugaskan komponen apa pun | Sri Handayani |

> Menu **Master Instrumen · Periode · Akun · Data Sekolah · Log Audit** hanya
> tampil pada `demo_koordinator`; penilai biasa diarahkan kembali ke dasbor.

## 2. TP UKS/M Kecamatan (7 akun)

Satu kecamatan dapat diakses beberapa pengguna (notulen Sep 2026): seorang
**koordinator** dan **penilai per komponen**. Penilai hanya mengisi verifikasi
indikator pada komponennya; koordinator memfinalkan strata, merekomendasikan,
mendaftarkan seleksi, mengelola tim, dan mengatur lokasi puskesmas.

| Username | Peran | Kecamatan |
|---|---|---|
| `demo_kec_cikarangutara` | Koordinator | Cikarang Utara |
| `demo_kec_tambunselatan` | Koordinator | Tambun Selatan |
| `demo_kec_cibitung` | Koordinator | Cibitung |
| `demo_kec_cibitung_a` | Penilai komponen A | Cibitung |
| `demo_kec_cibitung_b` | Penilai komponen B | Cibitung |
| `demo_kec_cibitung_c` | Penilai komponen C | Cibitung |
| `demo_kec_cibitung_d` | Penilai komponen D | Cibitung |

`demo_smp_verifikasi` (SMP Negeri 2 Cibitung) sengaja berada di tengah proses:
komponen A & B sudah dinilai, C & D belum — masuk sebagai `demo_kec_cibitung_c`
untuk menilai komponen C, lalu sebagai `demo_kec_cibitung` untuk memfinalkan.

## 3. Satuan Pendidikan (14 akun)

Satu akun untuk **tiap tahap** pada alur 16 langkah, tersebar di seluruh grup
jenjang instrumen (TK · SD/MI · SMP/MTs · SMA/SMK/MA).

| Username | Jenjang | Tahap | Strata | Sekolah |
|---|---|---|---|---|
| `demo_tk_registrasi` | TK | Registrasi | — | TK Negeri Pembina Cikarang Utara |
| `demo_sd_mandiri` | SD | Penilaian mandiri (draft) | Dasar | SD Negeri Tambun Selatan 05 |
| `demo_smp_verifikasi` | SMP | Menunggu verifikasi | Madya | SMP Negeri 2 Cibitung |
| `demo_sma_hasil` | SMA | Hasil strata | Madya | SMA Negeri 1 Cikarang Utara |
| `demo_mi_rekomendasi` | MI | Direkomendasikan kecamatan | Utama | MI Al-Hidayah Tambun Selatan |
| `demo_sd_eviden` | SD | Pengisian eviden (separuh terisi) | Utama | SD Negeri Cibitung 03 |
| `demo_mts_review` | MTs | Review eviden | Utama | MTs Nurul Falah Cikarang Utara |
| `demo_smk_disetujui` | SMK | Eviden disetujui | Utama | SMK Negeri 1 Tambun Selatan |
| `demo_sd_sertifikat` | SD | Bersertifikat | Paripurna | SD Negeri Cikarang Utara 04 |
| `demo_smp_seleksi` | SMP | Terdaftar Seleksi Penghargaan | Paripurna | SMP Negeri 1 Tambun Selatan |
| `demo_ma_administrasi` | MA | Seleksi administrasi (lolos) | Paripurna | MA Darul Ulum Cibitung |
| `demo_sma_kunjungan` | SMA | Kunjungan lapangan (dijadwalkan) | Paripurna | SMA Negeri 1 Cibitung |
| `demo_sd_final` | SD | Final — Juara 1 + SK Bupati | Paripurna | SD Negeri Tambun Selatan 01 |
| `demo_sd_juara` | SD | Registrasi — **diblokir** | — | SD Negeri Cikarang Utara 02 |

## 4. Yang bisa langsung diperagakan

| Fitur | Akun | Cara |
|---|---|---|
| Larangan juara | `demo_sd_juara` | Buka **Penilaian Mandiri** → muncul larangan (pernah Juara 1 periode 2025) |
| Klasifikasi penilai | `demo_penilai_a` vs `demo_koordinator` | Buka **Review Eviden** → penilai A hanya melihat indikator komponen A |
| Penilai tanpa tugas | `demo_penilai_baru` | Tidak ada indikator yang boleh dinilai |
| Pop-up konfirmasi fakta | `demo_sd_mandiri` | Submit penilaian → centang pernyataan wajib |
| Unduh PDF berkop | `demo_koordinator` | **Data Awal / Seleksi / Final** → tombol Unduh PDF |
| Eviden multi-berkas & tautan | `demo_sd_final` | Halaman **Eviden** — tiap indikator punya 1–2 lampiran tautan |
| Submit hasil lapangan | `demo_koordinator` | **Kunjungan** → `demo_sma_kunjungan` belum disubmit, `demo_sd_final` sudah terkunci |
| Sertifikat & SK Bupati | `demo_sd_sertifikat`, `demo_sd_final` | Halaman **Dokumen** |
| Paginasi | `demo_koordinator` | Semua tabel — pemilih 10/25/50/100 |
| Verifikasi per komponen | `demo_kec_cibitung_c` → `demo_kec_cibitung` | **Verifikasi Penilaian** → SMP Negeri 2 Cibitung (progres 2/4) |
| Tim penilai kecamatan | `demo_kec_cibitung` | Menu **Tim Penilai** — tambah penilai & tetapkan komponen |
| Peta puskesmas binaan | `demo_kec_cibitung` | Menu **Peta Puskesmas Binaan** — atur lokasi puskesmas |
| Diagram hasil strata | `demo_kec_cibitung`, `demo_koordinator` | **Beranda / Dashboard** — bagian Diagram Hasil Strata |
| Informasi & Berita | `demo_koordinator` | Menu **Informasi & Berita** → Tulis Informasi (1 contoh terpasang) |
| Jadwal program | `demo_koordinator` | Menu **Periode** → 🗓️ Jadwal — tampil di login & atas setiap halaman |
| Peta & grafik | semua | **Peta Sebaran** — koordinat demo tersebar di Kabupaten Bekasi |

## 5. Uji asap rute

Setelah membuat akun demo, jalankan pemeriksa halaman:

```bash
node tools/cek-rute.mjs                          # localhost:5184
node tools/cek-rute.mjs https://simitra.gokar.id
```

Membuka seluruh rute dengan Chrome sungguhan dan melaporkan galat konsol atau
halaman kosong — `vite build` tidak menangkap identifier tak terdefinisi di JSX.
