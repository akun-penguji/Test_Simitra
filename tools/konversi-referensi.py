#!/usr/bin/env python3
"""Mengubah berkas Excel direktori sekolah/madrasah menjadi
backend/prisma/data/sekolah-referensi.json (sumber tabel SekolahReferensi).

Pemakaian:
    python3 tools/konversi-referensi.py "~/Downloads/Data Dapodik Disdik.xlsx"
    python3 tools/konversi-referensi.py "~/Downloads/Madrasah Kab Bekasi 2026.xlsx"
    node backend/prisma/import-referensi.mjs      # memuat hasilnya ke basis data

Hasil **digabung** dengan isi JSON yang sudah ada berdasarkan NPSN, sehingga
berkas Dapodik (Disdik) dan madrasah (EMIS/Kemenag) dapat diimpor bergantian
tanpa saling menghapus. Pakai --ganti bila memang ingin mengganti seluruhnya.

Tiga bentuk berkas dikenali:
 1. Satu lembar dengan kolom "Bentuk Pendidikan"  → berkas Dapodik Disdik.
 2. Beberapa lembar yang NAMA LEMBARNYA adalah bentuk pendidikan (RA/MI/MTs/MA)
    → berkas madrasah; status Negeri/Swasta disimpulkan dari awalan nama
    (MIN/MTsN/MAN = Negeri, selain itu Swasta).
 3. Satu lembar TANPA baris judul (baris pertama sudah data) → berkas SMA/SMK.
    Kolomnya dikenali dari ISINYA (bentuk, NPSN, status, nama), bukan dari
    urutan; kolom kecamatan biasanya tidak ada sehingga dibaca dari akhir nama
    sekolah ("SMAN 1 Tambun Selatan") — nama yang tak memuat kecamatan dibiarkan
    kosong, tidak ditebak.

Pembersihan yang dilakukan pada semua bentuk berkas:
 · NPSN berupa notasi ilmiah (2.0218356E7) dikembalikan jadi angka (20218356).
 · Akhiran " KABUPATEN BEKASI" / " KAB. BEKASI" pada nama dibuang.
 · Status diseragamkan: NEGERI/negeri → Negeri, SWASTA/swasta → Swasta.
 · NPSN kembar dengan nama yang SAMA → satu baris. NPSN kembar dengan nama
   BERBEDA → semuanya dikecualikan dan dilaporkan, karena tidak mungkin
   diketahui mana yang benar (NPSN adalah kunci unik satu sekolah).

Kolom dicocokkan longgar; urutan kolom boleh berbeda. Kolom jumlah peserta
didik & rombel bersifat opsional — bila tidak ada, nilai lama dipertahankan.
"""
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from baca_xlsx import baca, baris  # noqa: E402

AKAR = Path(__file__).resolve().parent.parent
KELUARAN = AKAR / 'backend' / 'prisma' / 'data' / 'sekolah-referensi.json'

KOLOM = {
    'nama': ['nama satuan pendidikan', 'nama madrasah', 'nama sekolah', 'nama'],
    'npsn': ['npsn'],
    'nsm': ['nsm', 'nomor statistik madrasah'],
    'bp': ['bentuk pendidikan', 'bentuk', 'jenjang'],
    'status': ['status sekolah', 'status'],
    'kecamatan': ['kecamatan', 'kec'],
    'alamat': ['alamat', 'alamat lengkap'],
    'pd': ['peserta didik', 'jumlah peserta didik', 'pd', 'jml siswa'],
    'rombel': ['rombel', 'jumlah rombel', 'rombongan belajar'],
}

# Nama lembar yang dianggap sebagai bentuk pendidikan (berkas madrasah)
BENTUK_LEMBAR = {'RA', 'BA', 'TA', 'MI', 'MTS', 'MTs', 'MA', 'MAK',
                 'TK', 'SD', 'SMP', 'SMA', 'SMK'}
AWALAN_NEGERI = {'MIN', 'MTSN', 'MAN', 'RAN'}


def petaKolom(header):
    peta = {}
    for i, sel in enumerate(header):
        nama = re.sub(r'\s+', ' ', str(sel or '')).strip().lower()
        for kunci, calon in KOLOM.items():
            if kunci not in peta and nama in calon:
                peta[kunci] = i
    return peta


ALUR_NPSN_ILMIAH = re.compile(r'^\d(?:\.\d+)?[Ee]\+?\d+$')
AKHIRAN_WILAYAH = re.compile(r'\s+(?:KABUPATEN|KAB\.?)\s*BEKASI\s*$', re.I)
BENTUK_SEKOLAH = {'SMA', 'SMK', 'SMLB', 'SLB', 'MAK', 'SMAK'}


def npsnBersih(v):
    """Mengembalikan NPSN sebagai teks angka.

    Excel/pustaka tertentu menulis 20218356 sebagai "2.0218356E7". Untuk bilangan
    bulat 8 digit hasil konversinya tepat tanpa kehilangan presisi. ID yang
    memang bukan angka (mis. "NP582477", "P2970516") dibiarkan apa adanya.
    """
    t = rapikan(v)
    if ALUR_NPSN_ILMIAH.match(t):
        f = float(t)
        if f == int(f):
            return str(int(f))
    if re.fullmatch(r'\d+\.0+', t):
        return t.split('.')[0]
    return t


def rapikanStatus(v):
    t = rapikan(v).lower()
    if t in ('negeri', 'swasta'):
        return t.capitalize()
    return rapikan(v) or None


def bersihkanNama(v):
    """Membuang SATU akhiran wilayah yang ditambahkan sumber.

    Akhiran tidak dibuang bila sisa namanya tinggal satu kata: "SKB KABUPATEN
    BEKASI" adalah nama lembaga yang sebenarnya (Sanggar Kegiatan Belajar
    Kabupaten Bekasi), dan membuangnya menyisakan "SKB" saja. Bila nama aslinya
    sendiri memuat "KAB BEKASI" ("SMAS BHAKTI NEGARA KAB BEKASI") dan sumber
    menambahkan akhiran lagi, hanya akhiran tambahan itu yang dibuang.
    """
    nama = rapikan(v)
    sisa = AKHIRAN_WILAYAH.sub('', nama).strip()
    return sisa if len(sisa.split(' ')) >= 2 else nama


def kamusKecamatan(daftar):
    """Nama kecamatan baku, dikumpulkan dari JSON yang sudah ada (sudah
    memuat ke-23 kecamatan). Diurutkan terpanjang dulu."""
    return sorted({x['kecamatan'] for x in daftar if isinstance(x, dict) and x.get('kecamatan')},
                  key=lambda k: -len(k))


def kecamatanDariNama(nama, kamus):
    """Kecamatan dari AKHIR nama sekolah; None bila tidak ada yang cocok.

    Hanya akhir nama yang diperiksa ("SMAN 1 CIKARANG UTARA"). Nama yang memuat
    kawasan non-kecamatan ("...KOTA JABABEKA") atau tak memuat wilayah sama
    sekali sengaja dibiarkan None. Spasi diabaikan agar "Taruma Jaya" dan
    "Tarumajaya" dianggap sama.
    """
    kunci = lambda t: re.sub(r'\s+', '', t).lower()
    kata = rapikan(nama).split(' ')
    for k in kamus:
        n = len(k.split(' '))
        for ambil in {n, n + 1, max(1, n - 1)}:
            if ambil <= len(kata) and kunci(' '.join(kata[-ambil:])) == kunci(k):
                return k
    return None


def petaKolomDariIsi(rows):
    """Mengenali kolom pada berkas TANPA baris judul lewat isinya."""
    if not rows:
        return {}
    lebar = max(len(r) for r in rows)
    nilaiKolom = [[rapikan(r[i]) for r in rows if i < len(r) and rapikan(r[i])] for i in range(lebar)]
    porsi = lambda vs, uji: (sum(1 for v in vs if uji(v)) / len(vs)) if vs else 0
    uji = {
        'bp': lambda v: v.upper() in BENTUK_SEKOLAH | {'TK', 'SD', 'SMP', 'RA', 'MI', 'MTS', 'MA'},
        'status': lambda v: v.lower() in ('negeri', 'swasta'),
        'npsn': lambda v: bool(ALUR_NPSN_ILMIAH.match(v) or re.fullmatch(r'\d{6,10}', v)
                              or re.fullmatch(r'[A-Za-z]{1,3}\d{5,8}', v)),
    }
    peta = {}
    for kunci, fn in uji.items():
        calon = [(porsi(vs, fn), i) for i, vs in enumerate(nilaiKolom) if i not in peta.values()]
        calon = [c for c in calon if c[0] >= 0.95]
        if calon:
            peta[kunci] = max(calon)[1]
    sisa = [(sum(len(v) for v in vs) / len(vs), i) for i, vs in enumerate(nilaiKolom)
            if vs and i not in peta.values() and len(set(vs)) > 1]
    if sisa:
        peta['nama'] = max(sisa)[1]
    return peta


def angka(v):
    try:
        return int(float(str(v).replace(',', '.')))
    except (TypeError, ValueError):
        return None


def rapikan(v):
    return re.sub(r'\s+', ' ', str(v or '')).strip()


def rapikanKecamatan(v):
    """Nama kecamatan diseragamkan jadi Huruf Kapital Awal.

    Berkas madrasah menulisnya kapital seluruhnya (SETU) sedangkan berkas
    Dapodik tidak (Setu); tanpa penyeragaman satu kecamatan terhitung dua kali
    di dalam JSON. Pencocokan ke basis data tetap dilakukan import-referensi.mjs
    yang mengabaikan spasi & huruf besar-kecil.
    """
    v = rapikan(v)
    if not v:
        return None
    return ' '.join(k.capitalize() for k in v.split(' '))


def statusDariNama(nama):
    """MIN/MTsN/MAN → Negeri; madrasah lainnya Swasta.

    Hanya kata pertama yang diperiksa, sehingga nama seperti "MINHAJUL ULUM"
    tidak ikut terbaca sebagai negeri.
    """
    kata = rapikan(nama).split(' ')
    if not kata:
        return None
    return 'Negeri' if kata[0].upper() in AWALAN_NEGERI else 'Swasta'


def bacaLembar(z, sst, target, bentukLembar, kamus):
    rows = list(baris(z, sst, target))
    if not rows:
        return [], ['lembar kosong'], False
    peta = petaKolom(rows[0])
    tanpaJudul = 'npsn' not in peta
    if tanpaJudul:
        # baris pertama sudah data → kenali kolom dari isinya
        peta = petaKolomDariIsi(rows)
        data = rows
    else:
        data = rows[1:]
    if 'npsn' not in peta or 'nama' not in peta:
        return [], [f'kolom NPSN/nama tidak dikenali (baris pertama: {rows[0]})'], tanpaJudul

    ambil = lambda r, k: (r[peta[k]] if k in peta and peta[k] < len(r) else None)
    hasil, dilewati = [], []
    for r in data:
        npsn = npsnBersih(ambil(r, 'npsn'))
        nama = bersihkanNama(ambil(r, 'nama'))
        if not npsn or not nama:
            dilewati.append('baris tanpa NPSN/nama')
            continue
        bentuk = rapikan(ambil(r, 'bp')) or bentukLembar
        status = rapikanStatus(ambil(r, 'status')) or (statusDariNama(nama) if bentukLembar else None)
        kec = rapikanKecamatan(ambil(r, 'kecamatan'))
        asalKec = 'berkas' if kec else None
        if not kec and kamus:
            kec = kecamatanDariNama(nama, kamus)
            asalKec = 'nama' if kec else None
        b = {
            'npsn': npsn,
            'nama': nama,
            'bp': bentuk or None,
            'status': status or None,
            'kecamatan': kec,
            '_asalKec': asalKec,
        }
        for kunci in ('nsm', 'alamat'):
            nilai = rapikan(ambil(r, kunci))
            if nilai:
                b[kunci] = nilai
        for kunci in ('pd', 'rombel'):
            nilai = angka(ambil(r, kunci))
            if nilai is not None:
                b[kunci] = nilai
        hasil.append(b)
    return hasil, dilewati, tanpaJudul


def tentukanSumber(hasil, madrasah):
    if madrasah:
        return 'EMIS'
    bentuk = {(b.get('bp') or '').upper() for b in hasil}
    if bentuk and bentuk <= {'SMA', 'SMK', 'SMLB', 'SLB'}:
        return 'SMA_SMK'
    return 'DAPODIK'


def main():
    argumen = [a for a in sys.argv[1:] if not a.startswith('--')]
    ganti = '--ganti' in sys.argv
    if not argumen:
        print(__doc__)
        sys.exit(1)
    sumberBerkas = Path(os.path.expanduser(argumen[0]))
    if not sumberBerkas.exists():
        print(f'Berkas tidak ditemukan: {sumberBerkas}')
        sys.exit(1)

    # Isi JSON yang sudah ada dibaca lebih dulu: dipakai sebagai kamus nama
    # kecamatan dan sebagai dasar penggabungan.
    sudahAda = []
    if KELUARAN.exists():
        try:
            sudahAda = json.loads(KELUARAN.read_text())
        except json.JSONDecodeError:
            sudahAda = []
    kamus = kamusKecamatan(sudahAda)

    z, sst, lembar = baca(str(sumberBerkas))
    namaLembar = [n for n, _ in lembar]
    madrasah = sum(1 for n in namaLembar if n.strip().upper() in {x.upper() for x in BENTUK_LEMBAR}) >= 2

    baru, dilewati, tanpaJudul = [], [], False
    for nama, tgt in lembar:
        bentukLembar = nama.strip() if madrasah else None
        isi, lewat, tj = bacaLembar(z, sst, tgt, bentukLembar, kamus)
        if isi:
            print(f'  · lembar {nama}: {len(isi)} baris')
        baru.extend(isi)
        dilewati.extend(lewat)
        tanpaJudul = tanpaJudul or tj
        if not madrasah:
            break  # berkas satu-lembar: lembar pertama saja

    if not baru:
        print('Tidak ada baris yang dapat dibaca.')
        for l in dilewati[:3]:
            print('  ·', l)
        sys.exit(1)

    sumber = tentukanSumber(baru, madrasah)
    for b in baru:
        b['sumber'] = sumber
    print(f'Berkas   : {sumberBerkas.name}')
    jenisBerkas = ('beberapa lembar per bentuk (madrasah)' if madrasah
                   else 'satu lembar TANPA baris judul, kolom dikenali dari isi' if tanpaJudul
                   else 'satu lembar berkolom bentuk')
    print(f'Bentuk   : {jenisBerkas} · sumber {sumber}')

    # NPSN kembar di dalam berkas.
    #  · nama sama      → satu baris saja (sekadar baris ganda)
    #  · nama BERBEDA   → semua dikecualikan: NPSN adalah kunci unik satu sekolah,
    #                     jadi salah satunya pasti keliru dan tak bisa diketahui
    #                     dari data ini. Menebak berarti sekolah bisa terisi
    #                     dengan nama yang salah saat pendaftaran.
    kelompok = {}
    for b in baru:
        kelompok.setdefault(b['npsn'], []).append(b)
    bersih, konflik = [], []
    for npsn, grup in kelompok.items():
        namaUnik = {re.sub(r'\s+', '', g['nama']).lower() for g in grup}
        if len(grup) == 1:
            bersih.append(grup[0])
        elif len(namaUnik) == 1:
            dilewati.append(f'baris ganda {npsn}')
            bersih.append(grup[0])
        else:
            konflik.append((npsn, grup))
    baru = bersih

    lama = [] if ganti else sudahAda
    petaLama = {x['npsn']: x for x in lama if isinstance(x, dict) and x.get('npsn')}
    diperbarui = 0
    for b in baru:
        l = petaLama.get(b['npsn'])
        if l:
            diperbarui += 1
            # nilai yang tidak dibawa berkas baru (kosong/None) dipertahankan
            for k, v in l.items():
                if b.get(k) is None and v is not None:
                    b[k] = v
        petaLama[b['npsn']] = b

    # penanda asal kecamatan hanya untuk laporan, tidak ikut disimpan
    asalKec = Counter(b.pop('_asalKec', None) for b in baru)

    gabungan = sorted(petaLama.values(), key=lambda x: (x.get('bp') or '', x['nama']))
    KELUARAN.write_text(json.dumps(gabungan, ensure_ascii=False, indent=1))

    ditambah = len(baru) - diperbarui
    print()
    print(f'✓ {len(gabungan)} sekolah di {KELUARAN.relative_to(AKAR)}'
          + ('' if ganti else f' ({ditambah} baru, {diperbarui} diperbarui, {len(lama)} sudah ada sebelumnya)'))
    if dilewati:
        print(f'  · {len(dilewati)} baris dilewati: {", ".join(dilewati[:5])}'
              + ('…' if len(dilewati) > 5 else ''))

    # Hal-hal yang perlu keputusan manusia ditampilkan menonjol
    if konflik:
        print()
        print(f'⚠️  {sum(len(g) for _, g in konflik)} baris DIKECUALIKAN — {len(konflik)} NPSN dipakai lebih dari satu sekolah:')
        for npsn, grup in konflik:
            for g in grup:
                print(f'     NPSN {npsn}  ←  {g["nama"]}')
            print()
        print('     Perbaiki NPSN yang keliru di berkas sumber, lalu jalankan ulang.')
    nonAngka = [b for b in baru if not re.fullmatch(r'\d{8}', b['npsn'])]
    if nonAngka:
        print(f'ℹ️  {len(nonAngka)} ID bukan 8 digit angka (tetap dimasukkan apa adanya): '
              + ', '.join(f'{b["npsn"]} ({b["nama"]})' for b in nonAngka[:6]))
    if tanpaJudul or asalKec.get('nama'):
        print(f'ℹ️  kecamatan pada berkas ini: {asalKec.get("berkas", 0)} dari kolom berkas, '
              f'{asalKec.get("nama", 0)} dibaca dari akhir nama sekolah, '
              f'{asalKec.get(None, 0)} tidak diketahui (dibiarkan kosong)')

    bp = Counter(b.get('bp') or '(kosong)' for b in gabungan)
    print('  · bentuk: ' + ', '.join(f'{k} {v}' for k, v in bp.most_common()))
    # Dihitung tanpa memperhatikan spasi/huruf besar-kecil, karena "Taruma Jaya"
    # dan "Tarumajaya" adalah kecamatan yang sama (pencocokan sebenarnya
    # dilakukan import-referensi.mjs terhadap daftar kecamatan di basis data).
    kunciKec = lambda b: re.sub(r'\s+', '', (b.get('kecamatan') or '')).lower() or '(kosong)'
    kec = Counter(kunciKec(b) for b in gabungan)
    print(f'  · {len([k for k in kec if k != "(kosong)"])} kecamatan'
          + (f" · {kec['(kosong)']} tanpa kecamatan" if '(kosong)' in kec else ''))
    sm = Counter(b.get('sumber') or '(tidak dicatat)' for b in gabungan)
    print('  · sumber: ' + ', '.join(f'{k} {v}' for k, v in sm.most_common()))


if __name__ == '__main__':
    main()
