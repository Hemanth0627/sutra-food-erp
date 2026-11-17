import path from "node:path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const testDb = env.TEST_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
  return {
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
    test: {
      include: ["tests/**/*.test.ts"],
      environment: "node",
      // Integration tests run against the dedicated test database, never the main one.
      env: { ...env, MAIN_DATABASE_URL: env.DATABASE_URL ?? "", DATABASE_URL: testDb, SEED_DEMO_PASSWORD: env.SEED_DEMO_PASSWORD ?? "Demo@1234" },
      testTimeout: 60_000,
      hookTimeout: 180_000,
      fileParallelism: false,
    },
  };
});
