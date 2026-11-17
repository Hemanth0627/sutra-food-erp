// Prints the live factory digital-twin snapshot (one line per department). Usage: npx tsx scripts/print-factory.ts
try { process.loadEnvFile(".env"); } catch {}
(async () => {
  const { getFactorySnapshot } = await import("../src/server/queries/factory");
  const { prisma } = await import("../src/server/db");
  const s = await getFactorySnapshot();
  for (const d of Object.values(s.departments)) console.log(`${d.id.padEnd(16)} ${d.status.padEnd(8)} ${d.activity.padEnd(7)} ${d.statusText}`);
  await prisma.$disconnect();
})();
