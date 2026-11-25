#!/bin/bash
# Deploy SIMITRA ke VPS (backend + web HARUS bersamaan). Berhenti di langkah yang gagal.
#   bash tools/deploy-simitra.sh <nama-cadangan>     # contoh: sebelum-rapat-final
# Cadangan database dibuat dulu di /root/simitra-<nama>.sql.gz sebelum apa pun diubah.
K=${SIMITRA_KUNCI:-$HOME/.ssh/gokar_prod}; H=${SIMITRA_HOST:-root@76.13.197.249}
SSH="ssh -i $K -o ConnectTimeout=15 -o BatchMode=yes -o ServerAliveInterval=15 $H"
NAMA=${1:-sebelum-deploy-$(date +%Y%m%d-%H%M)}
cd "$(dirname "$0")/.." || exit 1
disk=$($SSH "df --output=pcent / | tail -1 | tr -dc 0-9"); echo "[0] disk VPS ${disk}%"
[ "${disk:-100}" -ge 95 ] && { echo "GAGAL: disk hampir penuh"; exit 1; }
$SSH "docker exec \$(docker ps -qf name=simitra-db) pg_dump -U simitra simitra_db | gzip > /root/simitra-$NAMA.sql.gz && ls -la /root/simitra-$NAMA.sql.gz" || { echo "GAGAL cadangan"; exit 1; }
echo "[1] cadangan: /root/simitra-$NAMA.sql.gz"
rsync -az --delete --exclude node_modules --exclude dist --exclude .env --exclude uploads -e "ssh -i $K" backend/ $H:/root/simitra/backend/ || { echo "GAGAL rsync backend"; exit 1; }
rsync -az --delete --exclude node_modules --exclude dist -e "ssh -i $K" web/ $H:/root/simitra/web/ || { echo "GAGAL rsync web"; exit 1; }
rsync -az --delete -e "ssh -i $K" tools/ $H:/root/simitra/tools/ || { echo "GAGAL rsync tools"; exit 1; }
echo "[2] kode tersinkron"
$SSH "cd /root/simitra/deploy && docker compose -p simitra build backend web" > /tmp/simitra-build.log 2>&1 || { echo "GAGAL build:"; tail -15 /tmp/simitra-build.log; exit 1; }
$SSH "cd /root/simitra/deploy && docker compose -p simitra up -d backend web" >> /tmp/simitra-build.log 2>&1 || { echo "GAGAL up:"; tail -10 /tmp/simitra-build.log; exit 1; }
echo "[3] image dibangun, kontainer dijalankan ulang (skema basis data diterapkan otomatis saat backend start)"
sleep 20
code=$(curl -s -o /dev/null -w "%{http_code}" https://simitra.gokar.id/); echo "[4] web: HTTP $code"
echo "SELESAI. Periksa: node tools/cek-rute.mjs https://simitra.gokar.id"
