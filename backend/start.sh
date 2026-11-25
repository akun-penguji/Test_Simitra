#!/bin/sh
set -e
echo "⏳ Menunggu database..."
until node prisma/wait-db.mjs; do sleep 2; done
echo "✅ Database siap."

echo "🔧 Sinkronisasi skema database..."
npx prisma db push --accept-data-loss --skip-generate

CNT=$(node prisma/count-komponen.mjs)
if [ "$CNT" -eq 0 ]; then
  echo "🌱 Database kosong — menjalankan seed awal (instrumen, puskesmas, akun)..."
  node prisma/seed.js
else
  echo "✅ Database sudah berisi ($CNT komponen) — lewati seed."
fi

echo "🚀 Menjalankan API SIMITRA..."
exec node src/index.js
