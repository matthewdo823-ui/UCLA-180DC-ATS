import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@images": fileURLToPath(new URL("../images", import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{js,jsx}"],
    passWithNoTests: true,
    restoreMocks: true,
    clearMocks: true,
  },
});
