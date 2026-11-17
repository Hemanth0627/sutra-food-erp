// Adds the non-benchmark demo data (an open purchase order) to an already-seeded database.
// Usage: npm run demo:extras   (safe to re-run: skipped when any purchase order exists)
try {
  process.loadEnvFile(".env");
} catch {
  // variables come from the environment
}
(async () => {
  const { prisma } = await import("../src/server/db");
  const { seedDemoExtras } = await import("../prisma/seed/demo-extras");
  try {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@sutra-erp.test" } });
    await seedDemoExtras(prisma, { admin: { id: admin.id, name: admin.name, role: admin.role } } as never, console.log);
    console.log("Demo extras done.");
  } finally {
    await prisma.$disconnect();
  }
})();
