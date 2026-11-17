/**
 * Seeds master data + opening stock and replays the mandatory benchmark scenario through the
 * service layer. Run via `npm run db:seed`, or `npm run benchmark:reset` to wipe and rebuild.
 * `--masters-only` (used by `npm run demo:fresh`) stops after master data and opening stock so the
 * scenario can be performed live in the UI. All seeded people, companies and GSTINs are fictional.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // Prisma CLI already loaded .env, or the variables come from the environment.
}

async function main() {
  const { prisma } = await import("../src/server/db");
  const { collectBenchmarkChecks, summarize } = await import("../src/server/benchmark");
  const { runBenchmarkScenario } = await import("./seed/benchmark-scenario");
  const { DEMO_USERS, seedMasterData } = await import("./seed/master-data");
  const mastersOnly = process.argv.includes("--masters-only");
  try {
    const existing = await prisma.companySettings.findUnique({ where: { id: 1 } });
    if (existing) {
      console.log("Database is already seeded. Run `npm run benchmark:reset` (or `npm run demo:fresh`) to wipe and rebuild it.");
      return;
    }
    const password = process.env.SEED_DEMO_PASSWORD || "Demo@1234";
    console.log("Seeding fictional master data and opening stock…");
    const actors = await seedMasterData(prisma, password);
    if (mastersOnly) {
      console.log("Masters only: the benchmark transactions were NOT posted. Follow DEMO_GUIDE.md to enter them live.");
    } else {
      console.log("Replaying the mandatory benchmark scenario:");
      await runBenchmarkScenario(prisma, actors, (m) => console.log("  " + m));
      const { checks } = await collectBenchmarkChecks(prisma);
      console.log("\nBenchmark verification (expected vs actual from posted records):");
      console.table(checks.map((c) => ({ check: c.check, expected: c.expected, actual: c.actual, result: c.pass ? "PASS" : "FAIL" })));
      const s = summarize(checks);
      console.log(`${s.passed}/${s.total} benchmark checks passed.`);
      if (!s.allPass) process.exitCode = 1;
    }
    console.log("\nDemo accounts (password: " + password + "):");
    for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(22)} ${u.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

export {};
