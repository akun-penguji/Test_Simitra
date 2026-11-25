import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
try {
  await p.$queryRaw`SELECT 1`;
  process.exit(0);
} catch (e) {
  process.exit(1);
} finally {
  await p.$disconnect();
}
