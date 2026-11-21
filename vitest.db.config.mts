import { defineConfig } from "vitest/config";
import path from "node:path";

// Database integration tests: run against a LOCAL PostgreSQL with the
// Supabase stub (supabase/tests/supabase_stub.sql). Never point at production.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
