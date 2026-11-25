// Jadwal program stratifikasi (notulen Sep 2026). Tanggal disimpan dalam WIB:
// "mulai" = 00:00 WIB, "selesai" = 23:59:59 WIB pada tanggal yang dipilih.
import { prisma } from './prisma.js';

const HARI = 86400000;
export const tglWIB = (tgl, akhir = false) => {
  if (!tgl) return null;
  const d = String(tgl).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return new Date(`${d}T${akhir ? '23:59:59.999' : '00:00:00.000'}+07:00`);
};
// sisa hari kalender (WIB) hingga tanggal target, minimal 0
const hariKe = (target, kini) => Math.max(0, Math.ceil((new Date(target).getTime() - kini.getTime()) / HARI));

export async function jadwalProgram() {
  const p = await prisma.periode.findFirst({
    where: { aktif: true },
    include: { jadwal: { orderBy: [{ urutan: 'asc' }, { mulai: 'asc' }] } },
  });
  if (!p) return null;
  const kini = new Date();
  const mulai = p.mulai || (p.jadwal.length ? new Date(Math.min(...p.jadwal.map((j) => +j.mulai))) : null);
  const selesai = p.selesai || (p.jadwal.length ? new Date(Math.max(...p.jadwal.map((j) => +j.selesai))) : null);

  let status = 'BELUM_DIATUR';
  if (mulai && selesai) status = kini < mulai ? 'BELUM_MULAI' : kini > selesai ? 'SELESAI' : 'BERJALAN';

  const jadwal = p.jadwal.map((j) => ({
    id: j.id, nama: j.nama, keterangan: j.keterangan, pelaksana: j.pelaksana, urutan: j.urutan,
    mulai: j.mulai, selesai: j.selesai,
    status: kini < j.mulai ? 'AKAN' : kini > j.selesai ? 'LEWAT' : 'BERJALAN',
    sisaHari: kini <= j.selesai ? hariKe(j.selesai, kini) : 0,
    mulaiDalamHari: kini < j.mulai ? hariKe(j.mulai, kini) : 0,
  }));
  const persen = mulai && selesai && selesai > mulai
    ? Math.round(Math.min(1, Math.max(0, (kini - mulai) / (selesai - mulai))) * 1000) / 10 : null;

  return {
    periode: { id: p.id, nama: p.nama, tahun: p.tahun, keterangan: p.keterangan },
    mulai, selesai, status, persen,
    sisaHari: status === 'BERJALAN' ? hariKe(selesai, kini) : null,
    mulaiDalamHari: status === 'BELUM_MULAI' ? hariKe(mulai, kini) : null,
    jadwal,
    berjalan: jadwal.filter((j) => j.status === 'BERJALAN'),
    berikutnya: jadwal.find((j) => j.status === 'AKAN') || null,
  };
}
