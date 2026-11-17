/**
 * Prints the benchmark expected-vs-actual table from the current database and exits non-zero on any
 * mismatch. Usage: npm run benchmark:verify
 */
try {
  process.loadEnvFile(".env");
} catch {
  // .env is optional when DATABASE_URL is already set in the environment
}

async function main() {
  const { prisma } = await import("../src/server/db");
  const { collectBenchmarkChecks, summarize } = await import("../src/server/benchmark");
  try {
    const { ready, checks } = await collectBenchmarkChecks(prisma);
    if (!ready) {
      console.error("Benchmark data not found. Run `npm run benchmark:reset` first.");
      process.exitCode = 1;
      return;
    }
    console.table(checks.map((c) => ({ group: c.group, check: c.check, expected: c.expected, actual: c.actual, result: c.pass ? "PASS" : "FAIL" })));
    const s = summarize(checks);
    console.log(`${s.passed}/${s.total} benchmark checks passed.`);
    if (!s.allPass) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

export {};
