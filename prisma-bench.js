require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');

async function main() {
  const adapter = new PrismaMariaDb({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB,
    allowPublicKeyRetrieval: true,
    connectionLimit: 120,
    minimumIdle: 10,
  });
  const prisma = new PrismaClient({ adapter, log: [] });

  // warm up
  await Promise.all(Array.from({length: 20}, () => prisma.user.findFirst()));

  const N = 100;
  const t0 = Date.now();
  const results = await Promise.all(
    Array.from({ length: N }, () => {
      const t = Date.now();
      return prisma.user.findFirst().then(() => Date.now() - t);
    })
  );
  const total = Date.now() - t0;
  results.sort((a,b)=>a-b);
  console.log('total_ms=', total, 'min=', results[0], 'p50=', results[Math.floor(N*0.5)], 'p90=', results[Math.floor(N*0.9)], 'max=', results[N-1]);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
