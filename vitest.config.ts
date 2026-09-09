import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "scripts-unit", include: ["scripts/tablecast-fixtures.test.ts"] } },
      {
        test: {
          name: "scripts-runtime",
          include: ["scripts/**/*.test.ts"],
          exclude: ["scripts/tablecast-fixtures.test.ts"],
        },
      },
    ],
  },
});
