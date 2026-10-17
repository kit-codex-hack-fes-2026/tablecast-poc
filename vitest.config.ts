import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: 2,
    projects: [
      {
        test: {
          name: "scripts-unit",
          include: [
            "scripts/tablecast-fixtures.test.ts",
            "scripts/tablecast-catalog*.test.ts",
            "scripts/tablecast-seed-template.test.ts",
            "scripts/tablecast-preview-comment.test.ts",
            "scripts/tablecast-test-selection.test.ts",
          ],
        },
      },
      {
        test: {
          name: "scripts-runtime",
          include: ["scripts/**/*.test.ts"],
          exclude: [
            "scripts/tablecast-fixtures.test.ts",
            "scripts/tablecast-catalog*.test.ts",
            "scripts/tablecast-seed-template.test.ts",
            "scripts/tablecast-preview-comment.test.ts",
            "scripts/tablecast-test-selection.test.ts",
          ],
        },
      },
    ],
  },
});
