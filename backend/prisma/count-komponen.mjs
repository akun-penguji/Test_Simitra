import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
try {
  process.stdout.write(String(await p.komponen.count()));
} catch (e) {
  process.stdout.write('0');
} finally {
  await p.$disconnect();
}
