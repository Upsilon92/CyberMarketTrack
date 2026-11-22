// Vitest: resolve the "@/..." path alias used across the app (same as tsconfig).
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: { include: ["lib/**/*.test.ts"] },
});
